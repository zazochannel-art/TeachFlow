import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/push/server";
import { sendEmail } from "@/lib/reminders/email";
import { isLang, makeT, type Lang, type T } from "@/lib/i18n/core";
import { formatDate, formatMoney } from "@/lib/time";
import { buildInvoicePdf, invoiceFileName, invoiceNumber, type InvoiceData } from "./pdf";

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Invoice e-mails need Resend and the Supabase secret key (same env as the reminders). */
export function invoiceEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.REMINDER_FROM && process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** Same fields as invoice_data(), read with the secret key (no signed-in user here). */
export async function invoiceDataAdmin(db: SupabaseClient, paymentId: string): Promise<(InvoiceData & { teacher_id: string; student_id: string; invoice_email: boolean; teacher_lang: Lang; parent_email: string | null }) | null> {
  const { data: p } = await db.from("payments").select("id, teacher_id, student_id, course_id, amount, currency, status, due_date, paid_at, method, note, created_at, invoice_no, invoice_at").eq("id", paymentId).maybeSingle();
  if (!p) return null;
  const [s, c, prof, tp, user] = await Promise.all([
    db.from("students").select("full_name, parent_name, parent_email").eq("id", p.student_id).maybeSingle(),
    p.course_id ? db.from("courses").select("title").eq("id", p.course_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("profiles").select("full_name, timezone, preferred_language").eq("id", p.teacher_id).maybeSingle(),
    db.from("teacher_profiles").select("invoice_name, invoice_code, invoice_address, invoice_bank, invoice_iban, invoice_note, invoice_email").eq("user_id", p.teacher_id).maybeSingle(),
    db.auth.admin.getUserById(p.teacher_id)
  ]);
  if (!s.data || tp.error) return null;
  const lang = prof.data?.preferred_language;
  return {
    ...(p as unknown as InvoiceData),
    amount: Number(p.amount),
    teacher_id: p.teacher_id, student_id: p.student_id,
    student_name: s.data.full_name, parent_name: s.data.parent_name ?? null, parent_email: s.data.parent_email ?? null,
    course_title: (c.data as { title: string } | null)?.title ?? null,
    teacher_name: prof.data?.full_name ?? "", teacher_email: user.data.user?.email ?? null,
    timezone: prof.data?.timezone || "Europe/Chisinau", teacher_lang: isLang(lang) ? lang : "ro",
    invoice_name: tp.data?.invoice_name ?? null, invoice_code: tp.data?.invoice_code ?? null, invoice_address: tp.data?.invoice_address ?? null,
    invoice_bank: tp.data?.invoice_bank ?? null, invoice_iban: tp.data?.invoice_iban ?? null, invoice_note: tp.data?.invoice_note ?? null,
    invoice_email: tp.data?.invoice_email !== false
  };
}

/** Subject, HTML and text of the e-mail that carries the PDF. */
export function renderInvoiceEmail(d: InvoiceData, t: T, opts: { appUrl: string; hasAccount: boolean }) {
  const no = invoiceNumber(d);
  const from = d.invoice_name || d.teacher_name || t("Profesorul");
  const amount = formatMoney(d.amount, d.currency, t.locale);
  const paid = d.status === "paid";
  const subject = paid ? t("Factura {no} · achitată · {student}", { no, student: d.student_name }) : t("Factura {no} · {amount} de achitat · {student}", { no, amount, student: d.student_name });
  const lines = [
    paid
      ? t("Plata de {amount} pentru {student} a fost înregistrată. Mulțumim!", { amount, student: d.student_name })
      : t("{teacher} v-a trimis o factură de {amount} pentru {student}.", { teacher: from, amount, student: d.student_name }),
    !paid && d.due_date ? t("Termen de plată: {date}", { date: formatDate(`${d.due_date}T12:00:00Z`, "UTC", t.locale) }) : null,
    t("Factura este atașată în format PDF.")
  ].filter(Boolean) as string[];
  const link = opts.hasAccount && opts.appUrl ? `${opts.appUrl}/parent` : null;
  const html = `<!doctype html><html lang="${t.lang}"><body style="margin:0;background:#f1f2ff;font-family:Arial,Helvetica,sans-serif;color:#1d1b4b">
<div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#ffffff;border-radius:20px;padding:28px">
<p style="margin:0 0 4px;font-size:13px;color:#6b6f93">${esc(t("Factura {no}", { no }))}</p>
<p style="margin:0 0 16px;font-size:22px;font-weight:bold">${esc(amount)}</p>
${lines.map(l => `<p style="margin:0 0 10px;font-size:14px;line-height:1.5">${esc(l)}</p>`).join("\n")}
${link ? `<p style="margin:16px 0 0;font-size:13px"><a href="${esc(link)}" style="color:#5269e8;font-weight:bold">${esc(t("Deschide în TeachFlow"))}</a></p>` : ""}
</div><p style="margin:16px 8px 0;font-size:11px;color:#8a8fb3">${esc(t("Trimis automat de TeachFlow în numele lui {teacher}.", { teacher: from }))}</p></div></body></html>`;
  const text = [t("Factura {no}", { no }), amount, "", ...lines, ...(link ? ["", link] : [])].join("\n");
  return { subject, html, text };
}

/**
 * E-mails the invoice PDF to the student's parents (parent accounts in their language and the
 * parent e-mail on the student card), after the response is sent. `issued` for a new payment,
 * `paid` when it is paid. Does nothing when the teacher turned it off or e-mail is not set up;
 * invoice_email_log keeps each e-mail to one send.
 */
export function emailInvoice(paymentId: string, kind: "issued" | "paid", origin?: string | null) {
  if (!invoiceEmailConfigured()) return;
  const db = serviceClient();
  if (!db) return;
  const run = async () => {
    const d = await invoiceDataAdmin(db, paymentId);
    if (!d || !d.invoice_email) return;
    if (kind === "paid" && d.status !== "paid") return;

    const recipients = new Map<string, { lang: Lang; hasAccount: boolean }>();
    const { data: links } = await db.from("parent_links").select("user_id").eq("student_id", d.student_id);
    for (const l of links ?? []) {
      const [{ data: u }, { data: pp }] = await Promise.all([db.auth.admin.getUserById(l.user_id), db.from("profiles").select("preferred_language").eq("id", l.user_id).maybeSingle()]);
      const email = u.user?.email?.toLowerCase();
      if (email) recipients.set(email, { lang: isLang(pp?.preferred_language) ? pp.preferred_language : d.teacher_lang, hasAccount: true });
    }
    const card = d.parent_email?.trim().toLowerCase();
    if (card && EMAIL_RE.test(card) && !recipients.has(card)) recipients.set(card, { lang: d.teacher_lang, hasAccount: false });

    const appUrl = (process.env.APP_URL || origin || "").replace(/\/$/, "");
    for (const [to, r] of recipients) {
      const { data: sent } = await db.from("invoice_email_log").select("payment_id").eq("payment_id", paymentId).eq("recipient", to).eq("kind", kind).maybeSingle();
      if (sent) continue;
      const t = makeT(r.lang);
      const pdf = await buildInvoicePdf(d, t);
      await sendEmail({
        to, replyTo: d.teacher_email ?? undefined,
        ...renderInvoiceEmail(d, t, { appUrl, hasAccount: r.hasAccount }),
        attachments: [{ filename: invoiceFileName(d, t), content: Buffer.from(pdf).toString("base64") }]
      }, { apiKey: process.env.RESEND_API_KEY!, from: process.env.REMINDER_FROM! });
      await db.from("invoice_email_log").insert({ payment_id: paymentId, recipient: to, kind });
    }
  };
  const job = () => run().catch(e => console.error("invoice e-mail failed", e instanceof Error ? e.message : e));
  try { after(job); } catch { void job(); }
}
