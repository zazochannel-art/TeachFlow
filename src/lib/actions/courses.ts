"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { DEMO_STATE, type FormState, currency, optId, optMoney, optText, parseForm, refresh, teacherCtx } from "./common";

const courseSchema = z.object({
  id: optId,
  title: z.string().trim().min(2, "Numele cursului este prea scurt.").max(120),
  subject: optText(80),
  level: optText(60),
  format: z.enum(["individual", "group"]),
  price: optMoney,
  currency,
  description: optText(1000),
  color: z.string().trim().optional().transform(v => (v ? v.toLowerCase() : null)).refine(v => v == null || /^#[0-9a-f]{6}$/.test(v), "Culoare invalidă.")
});

export async function saveCourse(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(courseSchema, formData);
  if ("error" in parsed) return parsed;
  const { id, color, ...rest } = parsed.data;
  // The colour column exists from migration 0011; the form only sends it when it does.
  const fields = formData.has("color") ? { ...rest, color } : rest;

  const { error } = id
    ? await ctx.supabase.from("courses").update(fields).eq("id", id).eq("teacher_id", ctx.userId)
    : await ctx.supabase.from("courses").insert({ ...fields, teacher_id: ctx.userId });
  if (error) return { error: error.message };

  refresh();
  redirect(id ? `/courses#${id}` : "/courses");
}

export async function setCourseActive(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("courses").update({ is_active: formData.get("active") === "true" }).eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}

export async function deleteCourse(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("courses").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
  redirect("/courses");
}
