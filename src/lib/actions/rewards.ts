"use server";

import { z } from "zod";
import { DEMO_STATE, type FormState, parseForm, refresh, teacherCtx } from "./common";

const rewardSchema = z.object({
  student_id: z.string().uuid(),
  points: z.string().trim().transform(v => Number(v)).refine(v => Number.isInteger(v) && v !== 0 && v >= -100 && v <= 100, "Punctele trebuie să fie între -100 și 100 (fără 0)."),
  reason: z.string().trim().min(1, "Scrie pentru ce sunt punctele.").max(120)
});

/** Bonus (or minus) points the teacher gives a student by hand (migration 0015). */
export async function giveReward(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(rewardSchema, formData);
  if ("error" in parsed) return parsed;
  const { error } = await ctx.supabase.from("student_rewards").insert({ ...parsed.data, teacher_id: ctx.userId });
  if (error) return { error: /student_rewards/.test(error.message) ? "Punctele nu sunt activate încă (lipsește migrarea 0015)." : error.message };
  refresh();
  return { ok: "Punctele au fost adăugate." };
}

export async function deleteReward(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("student_rewards").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}
