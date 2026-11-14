"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isLang } from "@/lib/i18n/core";
import { rememberLang } from "@/lib/i18n/server";

/** Switches the UI language on this device and, when signed in, in the user's profile. */
export async function setLanguage(formData: FormData) {
  const lang = formData.get("lang");
  if (!isLang(lang)) return;
  await rememberLang(lang);
  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (userId) await supabase.from("profiles").update({ preferred_language: lang }).eq("id", userId);
  }
  revalidatePath("/", "layout");
}
