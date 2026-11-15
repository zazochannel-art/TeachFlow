"use server";

import { createClient } from "@/lib/supabase/server";
import { pushConfigured, pushToUsers, serviceClient } from "@/lib/push/server";

/** Sends a test notification to every device of the signed-in user. */
export async function sendTestPush(): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Mod demonstrativ: notificările nu funcționează." };
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  const db = serviceClient();
  if (!uid || !db || !pushConfigured()) return { error: "Notificările nu sunt configurate pe server." };
  const { sent } = await pushToUsers(db, [uid], t => ({ title: "TeachFlow", body: t("Notificările funcționează pe acest dispozitiv."), url: "/", tag: "test" }));
  return sent ? { ok: true } : { error: "Nu am găsit niciun dispozitiv activ. Apasă din nou „Activează”." };
}
