"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/push/server";
import { removeUserFiles } from "@/lib/account";
import { readAll } from "@/lib/data/paged";
import type { FormState } from "./common";

/**
 * Deletes the signed-in account for good. The user confirms by typing their email.
 * Every table references auth.users with on delete cascade, so removing the auth user removes
 * the teacher's school (students, lessons, payments…) or the student's / parent's own rows;
 * uploaded files are removed first. Admin accounts can't delete themselves here.
 */
export async function deleteAccount(_: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  if (!supabase) return { error: "Modul demo: nu există cont de șters." };
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const email = typeof data?.claims?.email === "string" ? data.claims.email : "";
  if (!userId) redirect("/login");

  const typed = String(formData.get("confirm_email") ?? "").trim().toLowerCase();
  if (!email || typed !== email.toLowerCase()) return { error: "Scrie exact adresa de email a contului ca să confirmi." };

  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (role?.role === "admin") return { error: "Contul de administrator nu se poate șterge din aplicație." };

  const admin = serviceClient();
  if (!admin) return { error: "Ștergerea contului nu este configurată pe server. Scrie-ne și o facem noi." };

  // Every lesson (the Data API answers at most 1000 rows per request, so page through them).
  const { data: lessons } = await readAll<{ id: string }>((from, to) => admin.from("lessons").select("id").eq("teacher_id", userId).order("id").range(from, to), 500_000);
  await removeUserFiles(admin, userId, (lessons ?? []).map(l => l.id));

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("account delete failed", userId, error.message);
    return { error: "Nu am putut șterge contul. Încearcă din nou." };
  }
  await supabase.auth.signOut().catch(() => {});
  redirect("/login?deleted=1");
}
