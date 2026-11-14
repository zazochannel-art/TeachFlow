"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { DEMO_STATE, type FormState, currency, money, optId, optText, parseForm, refresh, teacherCtx } from "./common";

const paymentSchema = z.object({
  id: optId,
  student_id: z.string().min(1, "Alege elevul."),
  course_id: optId,
  amount: money,
  currency,
  status: z.enum(["paid", "pending"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Alege data."),
  method: z.enum(["cash", "card", "transfer", "other", ""]).optional().transform(v => (v ? v : null)),
  note: optText(500)
});

export async function savePayment(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(paymentSchema, formData);
  if ("error" in parsed) return parsed;
  const { id, date, ...v } = parsed.data;
  const fields = {
    ...v,
    paid_at: v.status === "paid" ? new Date(`${date}T12:00:00Z`).toISOString() : null,
    due_date: v.status === "pending" ? date : null
  };
  const { error } = id
    ? await ctx.supabase.from("payments").update(fields).eq("id", id).eq("teacher_id", ctx.userId)
    : await ctx.supabase.from("payments").insert({ ...fields, teacher_id: ctx.userId });
  if (error) return { error: error.message };
  refresh();
  redirect("/payments");
}

export async function markPaymentPaid(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}

export async function deletePayment(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("payments").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
  redirect("/payments");
}
