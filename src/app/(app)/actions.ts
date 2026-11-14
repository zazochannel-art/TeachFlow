"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTeacher } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";

export interface FormState { error?: string; ok?: string }

const DEMO_MSG = "Mod demonstrativ: configurează Supabase pentru a salva date.";

const courseSchema = z.object({
  title: z.string().trim().min(2, "Numele cursului este prea scurt.").max(120),
  subject: z.string().trim().max(80).optional(),
  level: z.string().trim().max(60).optional(),
  format: z.enum(["individual", "group"]),
  price: z.string().trim().optional(),
  currency: z.enum(["MDL", "EUR", "RON", "USD"]),
  description: z.string().trim().max(1000).optional()
});

export async function createCourse(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, userId } = await requireTeacher();
  if (!supabase || !userId) return { error: DEMO_MSG };

  const parsed = courseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const v = parsed.data;
  const price = v.price ? Number(v.price.replace(",", ".")) : null;
  if (price != null && (Number.isNaN(price) || price < 0)) return { error: "Prețul trebuie să fie un număr pozitiv." };

  const { error } = await supabase.from("courses").insert({
    teacher_id: userId, title: v.title, subject: v.subject || null, level: v.level || null,
    format: v.format, price, currency: v.currency, description: v.description || null
  });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/courses");
}

const settingsSchema = z.object({
  full_name: z.string().trim().max(120),
  preferred_language: z.enum(["ro", "ru", "en"]),
  timezone: z.string().trim().min(1).max(64),
  headline: z.string().trim().max(160).optional(),
  bio: z.string().trim().max(2000).optional(),
  hourly_rate: z.string().trim().optional(),
  currency: z.enum(["MDL", "EUR", "RON", "USD"])
});

export async function updateSettings(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, userId } = await requireTeacher();
  if (!supabase || !userId) return { error: DEMO_MSG };

  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const v = parsed.data;
  try {
    new Intl.DateTimeFormat("en", { timeZone: v.timezone });
  } catch {
    return { error: "Fus orar invalid." };
  }
  const rate = v.hourly_rate ? Number(v.hourly_rate.replace(",", ".")) : null;
  if (rate != null && (Number.isNaN(rate) || rate < 0)) return { error: "Tariful trebuie să fie un număr pozitiv." };

  const [p, t] = await Promise.all([
    supabase.from("profiles").update({ full_name: v.full_name, preferred_language: v.preferred_language, timezone: v.timezone }).eq("id", userId),
    supabase.from("teacher_profiles").update({ headline: v.headline || null, bio: v.bio || null, hourly_rate: rate, currency: v.currency }).eq("user_id", userId)
  ]);
  if (p.error || t.error) return { error: (p.error ?? t.error)!.message };

  revalidatePath("/", "layout");
  return { ok: "Modificările au fost salvate." };
}

const statusSchema = z.object({ id: z.string().min(1), status: z.enum(["completed", "cancelled", "no_show"]) });

export async function setLessonStatus(formData: FormData) {
  const { supabase, userId } = await requireTeacher();
  if (!supabase || !userId) return;
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await supabase.from("lessons").update({ status: parsed.data.status }).eq("id", parsed.data.id).eq("teacher_id", userId);
  revalidatePath("/", "layout");
}

export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
