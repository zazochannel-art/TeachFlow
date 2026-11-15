"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { pushConfigured, pushToUsers, serviceClient, clip } from "@/lib/push/server";
import { sendEmail } from "@/lib/reminders/email";
import { isLang, makeT } from "@/lib/i18n/core";
import { SLUG_RE } from "@/lib/slug";
import { DEMO_STATE, type FormState, optText, parseForm, refresh, teacherCtx } from "./common";

// Public teacher page (migration 0015): the teacher's settings, the visitors' sign-up form and
// the teacher's handling of the requests.

const pageSchema = z.object({
  public_slug: z.string().trim().toLowerCase().min(3, "Adresa paginii are cel puțin 3 caractere.").max(40).refine(v => SLUG_RE.test(v), "Adresa poate avea doar litere mici fără diacritice, cifre și cratime (ex. ana-popescu)."),
  public_enabled: z.literal("on").optional(),
  public_prices: z.literal("on").optional(),
  public_city: optText(80),
  public_phone: optText(40)
});

export async function savePublicPage(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(pageSchema, formData);
  if ("error" in parsed) return parsed;
  const v = parsed.data;
  const { error } = await ctx.supabase.from("teacher_profiles").update({
    public_slug: v.public_slug, public_enabled: v.public_enabled === "on", public_prices: v.public_prices === "on",
    public_city: v.public_city, public_phone: v.public_phone
  }).eq("user_id", ctx.userId);
  if (error) {
    if (/public_slug_idx|duplicate key/.test(error.message)) return { error: "Adresa aceasta este deja folosită de alt profesor. Alege alta." };
    if (/public_/.test(error.message)) return { error: "Pagina publică nu este activată încă (lipsește migrarea 0015)." };
    return { error: error.message };
  }
  // Courses shown on the page: the checked ones among the teacher's courses.
  const shown = new Set(formData.getAll("course").map(String));
  const all = formData.getAll("course_all").map(String);
  if (all.length) {
    const on = all.filter(id => shown.has(id));
    const off = all.filter(id => !shown.has(id));
    await Promise.all([
      on.length ? ctx.supabase.from("courses").update({ is_public: true }).in("id", on).eq("teacher_id", ctx.userId) : null,
      off.length ? ctx.supabase.from("courses").update({ is_public: false }).in("id", off).eq("teacher_id", ctx.userId) : null
    ]);
  }
  refresh();
  return { ok: "Pagina publică a fost salvată." };
}

const signupSchema = z.object({
  slug: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2, "Scrie numele tău.").max(120),
  student_name: optText(120),
  email: z.string().trim().max(200).optional().transform(v => (v ? v : null)).refine(v => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Email invalid."),
  phone: z.string().trim().max(40).optional().transform(v => (v ? v : null)).refine(v => !v || /^[0-9+() .-]{6,40}$/.test(v), "Telefon invalid."),
  course_id: z.string().trim().optional().transform(v => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null)),
  message: optText(1000),
  website: z.string().optional()
}).refine(v => v.email || v.phone, { message: "Lasă un email sau un număr de telefon, ca profesorul să te poată contacta." });

const SIGNUP_ERRORS: Record<string, string> = {
  page_not_found: "Pagina nu mai este disponibilă.",
  too_many: "Ai trimis deja câteva cereri. Profesorul te va contacta în curând.",
  invalid_course: "Cursul ales nu mai este disponibil.",
  invalid_email: "Email invalid.",
  invalid_phone: "Telefon invalid.",
  contact_required: "Lasă un email sau un număr de telefon, ca profesorul să te poată contacta.",
  invalid_name: "Scrie numele tău."
};

/** A visitor of /p/<slug> asks to join (no account needed). */
export async function publicSignup(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(signupSchema, formData);
  if ("error" in parsed) return parsed;
  const v = parsed.data;
  // Honeypot: people never see this field, bots fill it in. Pretend it worked.
  if (v.website) return { ok: "sent" };
  const supabase = await createClient();
  if (!supabase) return { ok: "sent" };
  const { data: teacherId, error } = await supabase.rpc("public_signup", {
    p_slug: v.slug, p_name: v.name, p_email: v.email, p_phone: v.phone, p_course_id: v.course_id, p_student_name: v.student_name, p_message: v.message
  });
  if (error) {
    const code = Object.keys(SIGNUP_ERRORS).find(k => error.message.includes(k));
    return { error: code ? SIGNUP_ERRORS[code] : "Cererea nu a putut fi trimisă. Încearcă din nou." };
  }
  if (typeof teacherId === "string") notifyTeacher(teacherId, v, (await headers()).get("origin"));
  return { ok: "sent" };
}

/** Push and e-mail to the teacher about a new request, after the response is sent. */
function notifyTeacher(teacherId: string, v: { name: string; student_name: string | null; course_id: string | null; email: string | null; phone: string | null; message: string | null }, origin: string | null) {
  const db = serviceClient();
  if (!db) return;
  const job = async () => {
    const course = v.course_id ? (await db.from("courses").select("title").eq("id", v.course_id).maybeSingle()).data?.title : null;
    const who = v.student_name ? `${v.name} (${v.student_name})` : v.name;
    if (pushConfigured()) {
      await pushToUsers(db, [teacherId], t => ({ title: t("Cerere nouă de înscriere"), body: clip([who, course].filter(Boolean).join(" · ")), url: "/public-page", tag: "signup" }));
    }
    const apiKey = process.env.RESEND_API_KEY, from = process.env.REMINDER_FROM;
    if (!apiKey || !from) return;
    const [{ data: u }, { data: prof }] = await Promise.all([db.auth.admin.getUserById(teacherId), db.from("profiles").select("preferred_language").eq("id", teacherId).maybeSingle()]);
    const to = u.user?.email;
    if (!to) return;
    const t = makeT(isLang(prof?.preferred_language) ? prof.preferred_language : "ro");
    const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const rows = [
      [t("Nume"), who], [t("Curs"), course ?? "—"], [t("Email"), v.email ?? "—"], [t("Telefon"), v.phone ?? "—"], [t("Mesaj"), v.message ?? "—"]
    ];
    const appUrl = (process.env.APP_URL || origin || "").replace(/\/$/, "");
    await sendEmail({
      to, replyTo: v.email ?? undefined,
      subject: t("Cerere nouă de înscriere: {name}", { name: who }),
      html: `<!doctype html><body style="font-family:Arial,sans-serif;color:#1d1b4b;background:#f1f2ff;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:20px;padding:28px">
<p style="font-size:18px;font-weight:bold;margin:0 0 14px">${esc(t("Cerere nouă de înscriere"))}</p>
<table style="font-size:14px;line-height:1.6">${rows.map(([a, b]) => `<tr><td style="color:#6b6f93;padding-right:14px;vertical-align:top">${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</table>
${appUrl ? `<p style="margin-top:18px"><a href="${esc(appUrl)}/public-page" style="color:#5269e8;font-weight:bold">${esc(t("Deschide în TeachFlow"))}</a></p>` : ""}</div></body>`,
      text: [t("Cerere nouă de înscriere"), ...rows.map(([a, b]) => `${a}: ${b}`), ...(appUrl ? [`${appUrl}/public-page`] : [])].join("\n")
    }, { apiKey, from });
  };
  const run = () => job().catch(e => console.error("signup notify failed", e instanceof Error ? e.message : e));
  try { after(run); } catch { void run(); }
}

/** Turns a request into a student (and enrolls them in the chosen course). */
export async function acceptSignup(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const id = String(formData.get("id") ?? "");
  const { data: r } = await ctx.supabase.from("signup_requests").select("id, name, student_name, email, phone, message, course_id, status").eq("id", id).eq("teacher_id", ctx.userId).maybeSingle();
  if (!r) return { error: "Cererea nu a fost găsită." };
  if (r.status === "accepted") return { ok: "Elevul a fost deja adăugat." };

  const child = Boolean(r.student_name);
  const fields: Record<string, unknown> = {
    teacher_id: ctx.userId,
    full_name: child ? r.student_name : r.name,
    email: child ? null : r.email,
    phone: child ? null : r.phone,
    notes: r.message ? r.message.slice(0, 1000) : null
  };
  if (child) Object.assign(fields, { parent_name: r.name, parent_email: r.email, parent_phone: r.phone });
  let ins = await ctx.supabase.from("students").insert(fields).select("id").single();
  // Before migration 0012 the parent fields do not exist: keep the parent contact in the notes.
  if (ins.error && child && /parent_/.test(ins.error.message)) {
    ins = await ctx.supabase.from("students").insert({ teacher_id: ctx.userId, full_name: r.student_name, notes: [`${r.name}: ${[r.email, r.phone].filter(Boolean).join(", ")}`, r.message].filter(Boolean).join("\n").slice(0, 1000) }).select("id").single();
  }
  if (ins.error) {
    return { error: ins.error.message.includes("student_limit_reached") ? "Ai atins limita de elevi activi a planului. Treci la un plan superior din pagina Abonament sau marchează un elev ca inactiv." : ins.error.message };
  }
  if (r.course_id) await ctx.supabase.from("course_enrollments").insert({ teacher_id: ctx.userId, course_id: r.course_id, student_id: ins.data.id });
  await ctx.supabase.from("signup_requests").update({ status: "accepted", student_id: ins.data.id }).eq("id", r.id).eq("teacher_id", ctx.userId);
  refresh();
  return { ok: "Elevul a fost adăugat. Îl găsești în pagina Elevi." };
}

export async function declineSignup(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("signup_requests").update({ status: "declined" }).eq("id", id).eq("teacher_id", ctx.userId).eq("status", "new");
  refresh();
}

export async function deleteSignup(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("signup_requests").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}
