"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { addDays, dateKey, formatDate, formatTime, zonedToUtc } from "@/lib/time";
import { getT } from "@/lib/i18n/server";
import { safeNext } from "@/lib/auth-errors";
import { notifyLessons } from "@/lib/push/notify";
import { DEMO_STATE, type FormState, optId, optText, optUrl, parseForm, refresh, teacherCtx, teacherTimezone, dbError } from "./common";

const lessonSchema = z.object({
  id: optId,
  title: optText(160),
  course_id: optId,
  student_id: optId,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Alege data."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Alege ora."),
  duration: z.coerce.number().int().min(15, "Durata minimă este 15 minute.").max(480),
  meeting_url: optUrl,
  description: optText(2000),
  repeat: z.coerce.number().int().min(1).max(52).default(1),
  /** Editing a lesson of a weekly series: only this one, or this one and the later ones. */
  scope: z.enum(["one", "following"]).optional().default("one"),
  /** "1" when the teacher ticked "save anyway" on the overlap warning. */
  confirm: z.string().optional(),
  back: z.string().optional()
});

type Row = { id?: string; title: string; course_id: string | null; student_id: string | null; meeting_url: string | null; description: string | null; starts_at: string; ends_at: string };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export async function saveLesson(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(lessonSchema, formData);
  if ("error" in parsed) return parsed;
  const v = parsed.data;
  if (!v.course_id && !v.student_id) return { error: "Alege un curs sau un elev." };
  const t = await getT();

  let title = v.title;
  if (!title && v.course_id) {
    const { data } = await ctx.supabase.from("courses").select("title").eq("id", v.course_id).maybeSingle();
    title = data?.title ?? null;
  }
  if (!title && v.student_id) {
    const { data } = await ctx.supabase.from("students").select("full_name").eq("id", v.student_id).maybeSingle();
    title = data ? t("Lecție · {name}", { name: data.full_name }) : null;
  }
  if (!title) return { error: "Adaugă un titlu lecției." };

  const tz = await teacherTimezone(ctx);
  const [hh, mm] = v.time.split(":").map(Number);
  const rowOn = (day: string): Row => {
    const [y, m, d] = day.split("-").map(Number);
    const start = zonedToUtc(y, m, d, hh, mm, tz);
    return {
      title: title!, course_id: v.course_id, student_id: v.student_id, meeting_url: v.meeting_url, description: v.description,
      starts_at: start.toISOString(), ends_at: new Date(start.getTime() + v.duration * 60000).toISOString()
    };
  };

  // Which lessons this save writes: new ones (weekly repeats), one lesson, or the rest of its series.
  let rows: Row[];
  let seriesId: string | null = null;
  if (v.id) {
    let cur = (await ctx.supabase.from("lessons").select("id, starts_at, series_id").eq("id", v.id).eq("teacher_id", ctx.userId).maybeSingle()).data as { id: string; starts_at: string; series_id?: string | null } | null;
    // Before migration 0017 there is no series_id column.
    if (!cur) cur = (await ctx.supabase.from("lessons").select("id, starts_at").eq("id", v.id).eq("teacher_id", ctx.userId).maybeSingle()).data;
    if (!cur) return { error: "Lecția nu a fost găsită." };
    rows = [{ id: cur.id, ...rowOn(v.date) }];
    if (v.scope === "following" && cur.series_id) {
      const shift = daysBetween(dateKey(new Date(cur.starts_at), tz), v.date);
      const { data: later } = await ctx.supabase.from("lessons").select("id, starts_at")
        .eq("series_id", cur.series_id).eq("teacher_id", ctx.userId).eq("status", "scheduled").gt("starts_at", cur.starts_at).order("starts_at");
      for (const l of later ?? []) rows.push({ id: l.id as string, ...rowOn(addDays(dateKey(new Date(l.starts_at as string), tz), shift)) });
    }
  } else {
    rows = Array.from({ length: v.repeat }, (_, i) => rowOn(addDays(v.date, i * 7)));
    if (rows.length > 1) seriesId = crypto.randomUUID();
  }

  // Warn about another scheduled lesson at the same time, unless the teacher confirmed.
  if (v.confirm !== "1") {
    const from = rows[0].starts_at;
    const to = rows[rows.length - 1].ends_at;
    const { data: others } = await ctx.supabase.from("lessons").select("id, title, starts_at, ends_at")
      .eq("teacher_id", ctx.userId).eq("status", "scheduled").lt("starts_at", to).gt("ends_at", from).limit(1000);
    const own = new Set(rows.map(r => r.id).filter(Boolean));
    const ms = (iso: string) => new Date(iso).getTime();
    const clash = (others ?? []).find(o => !own.has(o.id as string) && rows.some(r => ms(o.starts_at as string) < ms(r.ends_at) && ms(o.ends_at as string) > ms(r.starts_at)));
    if (clash) {
      return { warn: t("Se suprapune cu „{title}” ({date}, {time}). Bifează „Salvează oricum” dacă vrei totuși două lecții în același timp.", {
        title: clash.title as string, date: formatDate(clash.starts_at as string, tz, t.locale), time: formatTime(clash.starts_at as string, tz, t.locale)
      }) };
    }
  }

  let saved: Array<{ id: string }> = [];
  if (v.id) {
    const results = await Promise.all(rows.map(({ id, ...r }) => ctx.supabase.from("lessons").update(r).eq("id", id!).eq("teacher_id", ctx.userId)));
    const failed = results.find(r => r.error);
    if (failed?.error) return { error: dbError(failed.error) };
  } else {
    const insert = (withSeries: boolean) => ctx.supabase.from("lessons")
      .insert(rows.map(r => ({ ...r, teacher_id: ctx.userId, ...(withSeries && seriesId ? { series_id: seriesId } : {}) }))).select("id");
    let res = await insert(true);
    if (res.error && seriesId && /series_id/.test(res.error.message)) res = await insert(false);
    if (res.error) return { error: dbError(res.error) };
    saved = (res.data ?? []) as Array<{ id: string }>;
    notifyLessons(saved.map(r => r.id), "new");
  }

  refresh();
  redirect(safeNext(v.back, `/calendar?date=${v.date}`));
}

const statusSchema = z.object({ id: z.string().min(1), status: z.enum(["scheduled", "completed", "cancelled", "no_show"]) });

export async function setLessonStatus(formData: FormData) {
  const ctx = await teacherCtx();
  if (!ctx) return;
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { error } = await ctx.supabase.from("lessons").update({ status: parsed.data.status }).eq("id", parsed.data.id).eq("teacher_id", ctx.userId);
  if (!error && parsed.data.status === "cancelled") notifyLessons([parsed.data.id], "cancelled");
  refresh();
}

export async function setMeetingUrl(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(z.object({ id: z.string().min(1), meeting_url: optUrl }), formData);
  if ("error" in parsed) return parsed;
  const { error } = await ctx.supabase.from("lessons").update({ meeting_url: parsed.data.meeting_url }).eq("id", parsed.data.id).eq("teacher_id", ctx.userId);
  if (error) return { error: dbError(error) };
  refresh();
  return { ok: "Link salvat." };
}

export async function deleteLesson(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  if (formData.get("scope") === "following") {
    // This lesson and the later scheduled lessons of its weekly series (migration 0017).
    const { data: cur } = await ctx.supabase.from("lessons").select("starts_at, series_id").eq("id", id).eq("teacher_id", ctx.userId).maybeSingle();
    if (cur?.series_id) {
      await ctx.supabase.from("lessons").delete().eq("series_id", cur.series_id).eq("teacher_id", ctx.userId).eq("status", "scheduled").gt("starts_at", cur.starts_at);
    }
  }
  await ctx.supabase.from("lessons").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
  redirect("/calendar");
}
