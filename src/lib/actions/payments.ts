"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { emailInvoice } from "@/lib/invoices/notify";
import { z } from "zod";
import { DEMO_STATE, type FormState, currency, money, optId, optText, parseForm, refresh, teacherCtx, dbError } from "./common";

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
  const before = id ? (await ctx.supabase.from("payments").select("status").eq("id", id).eq("teacher_id", ctx.userId).maybeSingle()).data : null;
  const { data, error } = id
    ? await ctx.supabase.from("payments").update(fields).eq("id", id).eq("teacher_id", ctx.userId).in("status", ["paid", "pending"]).select("id").maybeSingle()
    : await ctx.supabase.from("payments").insert({ ...fields, teacher_id: ctx.userId }).select("id").single();
  if (error) return { error: dbError(error) };
  // Invoice e-mail to the parents: for every new payment, and when a pending one becomes paid.
  const origin = (await headers()).get("origin");
  if (data && !id) emailInvoice(data.id, "issued", origin);
  if (data && id && before?.status === "pending" && v.status === "paid") emailInvoice(data.id, "paid", origin);
  refresh();
  redirect("/payments");
}

export async function markPaymentPaid(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  const { data } = await ctx.supabase.from("payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id).eq("teacher_id", ctx.userId).eq("status", "pending").select("id").maybeSingle();
  if (data) emailInvoice(data.id, "paid", (await headers()).get("origin"));
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
