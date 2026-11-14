"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getT } from "@/lib/i18n/server";
import { DEMO_STATE, type FormState, optId, optText, parseForm, refresh, teacherCtx } from "./common";

const studentSchema = z.object({
  id: optId,
  full_name: z.string().trim().min(2, "Numele este prea scurt.").max(120),
  email: z.string().trim().max(200).optional().transform(v => (v ? v : null)).refine(v => !v || /^\S+@\S+\.\S+$/.test(v), "Email invalid."),
  phone: optText(40),
  notes: optText(1000),
  status: z.enum(["active", "inactive"]).default("active"),
  course_id: optId
});

export async function saveStudent(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(studentSchema, formData);
  if ("error" in parsed) return parsed;
  const { id, course_id, ...fields } = parsed.data;

  if (id) {
    const { error } = await ctx.supabase.from("students").update(fields).eq("id", id).eq("teacher_id", ctx.userId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await ctx.supabase.from("students").insert({ ...fields, teacher_id: ctx.userId }).select("id").single();
    if (error) return { error: error.message };
    if (course_id) {
      const enr = await ctx.supabase.from("course_enrollments").insert({ teacher_id: ctx.userId, course_id, student_id: data.id });
      if (enr.error) return { error: (await getT())("Elevul a fost adăugat, dar nu și înscris: {reason}", { reason: enr.error.message }) };
    }
  }
  refresh();
  redirect("/students");
}

export async function deleteStudent(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("students").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
  redirect("/students");
}

export async function enrollStudent(formData: FormData) {
  const ctx = await teacherCtx();
  const student_id = String(formData.get("student_id") ?? "");
  const course_id = String(formData.get("course_id") ?? "");
  if (!ctx || !student_id || !course_id) return;
  // Re-activate an existing enrollment instead of failing on the unique constraint.
  const { data: existing } = await ctx.supabase.from("course_enrollments").select("id").eq("course_id", course_id).eq("student_id", student_id).maybeSingle();
  if (existing) await ctx.supabase.from("course_enrollments").update({ status: "active" }).eq("id", existing.id);
  else await ctx.supabase.from("course_enrollments").insert({ teacher_id: ctx.userId, course_id, student_id });
  refresh();
}

export async function setEnrollmentStatus(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  const status = z.enum(["active", "completed", "paused"]).safeParse(formData.get("status"));
  if (!ctx || !id || !status.success) return;
  await ctx.supabase.from("course_enrollments").update({ status: status.data }).eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}

export async function removeEnrollment(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("course_enrollments").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}
