"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { addDays, zonedToUtc } from "@/lib/time";
import { getT } from "@/lib/i18n/server";
import { DEMO_STATE, type FormState, optId, optText, optUrl, parseForm, refresh, teacherCtx, teacherTimezone } from "./common";

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
  repeat: z.coerce.number().int().min(1).max(12).default(1),
  back: z.string().optional()
});

export async function saveLesson(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(lessonSchema, formData);
  if ("error" in parsed) return parsed;
  const v = parsed.data;
  if (!v.course_id && !v.student_id) return { error: "Alege un curs sau un elev." };

  let title = v.title;
  if (!title && v.course_id) {
    const { data } = await ctx.supabase.from("courses").select("title").eq("id", v.course_id).maybeSingle();
    title = data?.title ?? null;
  }
  if (!title && v.student_id) {
    const { data } = await ctx.supabase.from("students").select("full_name").eq("id", v.student_id).maybeSingle();
    title = data ? (await getT())("Lecție · {name}", { name: data.full_name }) : null;
  }
  if (!title) return { error: "Adaugă un titlu lecției." };

  const tz = await teacherTimezone(ctx);
  const [hh, mm] = v.time.split(":").map(Number);
  const rows = Array.from({ length: v.id ? 1 : v.repeat }, (_, i) => {
    const [y, m, d] = addDays(v.date, i * 7).split("-").map(Number);
    const start = zonedToUtc(y, m, d, hh, mm, tz);
    return {
      title, course_id: v.course_id, student_id: v.student_id, meeting_url: v.meeting_url, description: v.description,
      starts_at: start.toISOString(), ends_at: new Date(start.getTime() + v.duration * 60000).toISOString()
    };
  });

  const { error } = v.id
    ? await ctx.supabase.from("lessons").update(rows[0]).eq("id", v.id).eq("teacher_id", ctx.userId)
    : await ctx.supabase.from("lessons").insert(rows.map(r => ({ ...r, teacher_id: ctx.userId })));
  if (error) return { error: error.message };

  refresh();
  redirect(v.back?.startsWith("/") ? v.back : `/calendar?date=${v.date}`);
}

const statusSchema = z.object({ id: z.string().min(1), status: z.enum(["scheduled", "completed", "cancelled", "no_show"]) });

export async function setLessonStatus(formData: FormData) {
  const ctx = await teacherCtx();
  if (!ctx) return;
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await ctx.supabase.from("lessons").update({ status: parsed.data.status }).eq("id", parsed.data.id).eq("teacher_id", ctx.userId);
  refresh();
}

export async function setMeetingUrl(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(z.object({ id: z.string().min(1), meeting_url: optUrl }), formData);
  if ("error" in parsed) return parsed;
  const { error } = await ctx.supabase.from("lessons").update({ meeting_url: parsed.data.meeting_url }).eq("id", parsed.data.id).eq("teacher_id", ctx.userId);
  if (error) return { error: error.message };
  refresh();
  return { ok: "Link salvat." };
}

export async function deleteLesson(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("lessons").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
  redirect("/calendar");
}
