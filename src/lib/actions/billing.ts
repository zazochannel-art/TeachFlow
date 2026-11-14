"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTeacher } from "@/lib/data/workspace";
import { DEMO_STATE, type FormState, parseForm } from "./common";

const MIGRATION_MSG = "Aplică migrarea 0005_manual_billing.sql în Supabase pentru abonamente.";

const requestSchema = z.object({
  plan_code: z.enum(["starter", "pro", "premium"]),
  billing_period: z.enum(["month", "year"]),
  note: z.string().trim().max(500).optional().transform(v => (v ? v : null))
});

/** Teacher asks for a paid plan; an admin confirms it after the payment arrives. */
export async function requestPlan(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, userId } = await requireTeacher();
  if (!supabase || !userId) return DEMO_STATE;
  const parsed = parseForm(requestSchema, formData);
  if ("error" in parsed) return parsed;
  const { error } = await supabase.from("plan_requests").insert(parsed.data);
  if (error) {
    if (error.code === "23505") return { error: "Ai deja o cerere în așteptare." };
    if (error.code === "42P01" || /plan_requests/.test(error.message)) return { error: MIGRATION_MSG };
    return { error: error.message };
  }
  revalidatePath("/billing");
  return { ok: "Cererea a fost trimisă. Te contactăm cu detaliile de plată." };
}

export async function cancelPlanRequest(formData: FormData) {
  const { supabase, userId } = await requireTeacher();
  const id = String(formData.get("id") ?? "");
  if (!supabase || !userId || !id) return;
  await supabase.from("plan_requests").delete().eq("id", id).eq("teacher_id", userId).eq("status", "pending");
  revalidatePath("/billing");
}

const setSchema = z.object({
  teacher_id: z.string().uuid(),
  plan_code: z.enum(["free", "starter", "pro", "premium"]),
  status: z.enum(["trialing", "active", "past_due", "cancelled", "expired"]),
  paid_until: z.string().optional().transform(v => (v ? v : null)).refine(v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Dată invalidă.")
});

/** Admin only (checked again in the database function): set a teacher's plan by hand. */
export async function adminSetSubscription(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, isAdmin } = await requireTeacher();
  if (!supabase) return DEMO_STATE;
  if (!isAdmin) return { error: "Doar administratorul poate modifica abonamentele." };
  const parsed = parseForm(setSchema, formData);
  if ("error" in parsed) return parsed;
  const v = parsed.data;
  const { error } = await supabase.rpc("admin_set_subscription", {
    p_teacher: v.teacher_id, p_plan: v.plan_code, p_status: v.status,
    p_period_end: v.paid_until ? new Date(`${v.paid_until}T23:59:59Z`).toISOString() : null
  });
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { ok: "Abonament actualizat." };
}

export async function adminCloseRequest(formData: FormData) {
  const { supabase, isAdmin } = await requireTeacher();
  const id = String(formData.get("id") ?? "");
  if (!supabase || !isAdmin || !id) return;
  await supabase.rpc("admin_close_request", { p_request: id });
  revalidatePath("/admin");
}
