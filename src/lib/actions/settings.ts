"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTeacher } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";

import type { FormState } from "@/lib/actions/common";
import { rememberLang } from "@/lib/i18n/server";

const DEMO_MSG = "Mod demonstrativ: configurează Supabase pentru a salva date.";

const settingsSchema = z.object({
  full_name: z.string().trim().max(120),
  preferred_language: z.enum(["ro", "ru", "en"]),
  timezone: z.string().trim().min(1).max(64),
  headline: z.string().trim().max(160).optional(),
  bio: z.string().trim().max(2000).optional(),
  hourly_rate: z.string().trim().optional(),
  currency: z.enum(["MDL", "EUR", "RON", "USD"]),
  email_reminders: z.literal("on").optional(),
  has_reminders: z.literal("1").optional()
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

  const teacherFields = { headline: v.headline || null, bio: v.bio || null, hourly_rate: rate, currency: v.currency };
  const [p, t] = await Promise.all([
    supabase.from("profiles").update({ full_name: v.full_name, preferred_language: v.preferred_language, timezone: v.timezone }).eq("id", userId),
    // The reminders switch only exists once migration 0004 is applied (has_reminders marks it in the form).
    supabase.from("teacher_profiles").update(v.has_reminders ? { ...teacherFields, email_reminders: v.email_reminders === "on" } : teacherFields).eq("user_id", userId)
  ]);
  if (p.error || t.error) return { error: (p.error ?? t.error)!.message };
  await rememberLang(v.preferred_language);

  revalidatePath("/", "layout");
  return { ok: "Modificările au fost salvate." };
}

export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
