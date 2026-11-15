"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AVATARS_BUCKET } from "@/lib/avatars";

/**
 * Saves (or clears) a profile picture already uploaded to the public avatars bucket.
 * `studentId` empty = the signed-in user's own photo; otherwise a student of this teacher (RLS).
 * Only URLs inside the caller's own folder are accepted.
 */
export async function saveAvatar(studentId: string, url: string | null): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Mod demonstrativ: pozele nu se pot salva." };
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return { error: "Sesiunea a expirat. Intră din nou în cont." };

  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${AVATARS_BUCKET}/${uid}/`;
  if (url !== null && (!url.startsWith(prefix) || url.length > 500 || url.includes(".."))) return { error: "Poza nu a putut fi salvată." };

  const { error } = studentId
    ? await supabase.from("students").update({ avatar_url: url }).eq("id", studentId).eq("teacher_id", uid)
    : await supabase.from("profiles").update({ avatar_url: url }).eq("id", uid);
  if (error) return { error: /avatar_url/.test(error.message) ? "Pozele de profil nu sunt activate încă (lipsește migrarea 0011)." : error.message };

  revalidatePath("/", "layout");
  return {};
}
