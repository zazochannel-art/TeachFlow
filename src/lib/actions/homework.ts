"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { zonedToUtc } from "@/lib/time";
import { DEMO_STATE, type FormState, optId, optText, parseForm, refresh, teacherCtx, teacherTimezone } from "./common";

const homeworkSchema = z.object({
  id: optId,
  title: z.string().trim().min(1, "Adaugă un titlu.").max(160),
  description: optText(4000),
  course_id: optId,
  student_id: optId,
  lesson_id: optId,
  due: z.string().optional().transform(v => (v ? v : null)).refine(v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Dată invalidă.")
});

/** Creates one row per student: for a course, every active student enrolled in it. */
export async function saveHomework(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(homeworkSchema, formData);
  if ("error" in parsed) return parsed;
  const v = parsed.data;

  let due_at: string | null = null;
  if (v.due) {
    const tz = await teacherTimezone(ctx);
    const [y, m, d] = v.due.split("-").map(Number);
    due_at = zonedToUtc(y, m, d, 23, 59, tz).toISOString();
  }
  const fields = { title: v.title, description: v.description, course_id: v.course_id, lesson_id: v.lesson_id, due_at };

  if (v.id) {
    const { error } = await ctx.supabase.from("homework").update(fields).eq("id", v.id).eq("teacher_id", ctx.userId);
    if (error) return { error: error.message };
  } else {
    let studentIds: string[] = [];
    if (v.student_id) studentIds = [v.student_id];
    else if (v.course_id) {
      const { data } = await ctx.supabase.from("course_enrollments").select("student_id").eq("course_id", v.course_id).eq("status", "active");
      studentIds = (data ?? []).map(r => r.student_id as string);
    }
    if (!studentIds.length) return { error: "Alege un elev sau un curs cu elevi înscriși." };
    const { error } = await ctx.supabase.from("homework").insert(studentIds.map(student_id => ({ ...fields, student_id, teacher_id: ctx.userId })));
    if (error) return { error: error.message };
  }
  refresh();
  redirect("/homework");
}

const reviewSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["assigned", "submitted", "reviewed"]),
  grade: optText(20),
  feedback: optText(4000)
});

export async function reviewHomework(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(reviewSchema, formData);
  if ("error" in parsed) return parsed;
  const { id, ...fields } = parsed.data;
  const { error } = await ctx.supabase.from("homework").update(fields).eq("id", id).eq("teacher_id", ctx.userId);
  if (error) return { error: error.message };
  refresh();
  redirect("/homework");
}

export async function markHomeworkSubmitted(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("homework").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}

export async function deleteHomework(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("homework").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
  redirect("/homework");
}
