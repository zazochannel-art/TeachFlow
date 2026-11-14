"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isInviteToken } from "@/lib/invite-token";
import type { FormState } from "./common";

const ERRORS: Record<string, string> = {
  invite_invalid: "Linkul de invitație nu mai este valabil. Cere profesorului unul nou.",
  invite_used: "Invitația a fost deja folosită de alt cont.",
  own_invite: "Ești autentificat cu contul de profesor. Deschide linkul cu contul elevului.",
  teacher_account: "Acest cont este folosit ca profesor. Creează un cont separat pentru elev.",
  homework_not_found: "Tema nu mai poate fi predată (poate a fost deja verificată).",
  empty_submission: "Scrie răspunsul înainte să predai tema.",
  submission_too_long: "Răspunsul este prea lung (maximum 8000 de caractere).",
  empty_message: "Scrie un mesaj.",
  message_too_long: "Mesajul este prea lung.",
  student_not_found: "Conversația nu a fost găsită."
};

function friendly(message: string) {
  const key = Object.keys(ERRORS).find(k => message.includes(k));
  if (key) return ERRORS[key];
  if (/function .* does not exist|schema cache/i.test(message)) return "Portalul elevilor nu este activat încă (lipsește migrarea 0003).";
  return message;
}

async function client() {
  const supabase = await createClient();
  if (!supabase) return null;
  return supabase;
}

export async function acceptInvite(_: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  if (!isInviteToken(token)) return { error: ERRORS.invite_invalid };
  const supabase = await client();
  if (!supabase) return { error: "Configurează Supabase pentru a folosi invitațiile." };
  const { error } = await supabase.rpc("accept_student_invite", { p_token: token });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  redirect("/student");
}

const submitSchema = z.object({
  homework_id: z.string().uuid(),
  submission: z.string().trim().min(1, ERRORS.empty_submission).max(8000, ERRORS.submission_too_long)
});

export async function submitHomework(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = submitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const supabase = await client();
  if (!supabase) return { error: "Mod demonstrativ: tema nu se poate preda." };
  const { error } = await supabase.rpc("submit_homework", { p_homework_id: parsed.data.homework_id, p_submission: parsed.data.submission });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/student", "layout");
  return { ok: "Tema a fost predată. Profesorul a primit-o." };
}

const messageSchema = z.object({
  student_id: z.string().uuid(),
  body: z.string().trim().min(1, ERRORS.empty_message).max(4000, ERRORS.message_too_long)
});

export async function sendStudentMessage(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = messageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const supabase = await client();
  if (!supabase) return { error: "Mod demonstrativ: mesajul nu se poate trimite." };
  const { error } = await supabase.rpc("send_student_message", { p_student_id: parsed.data.student_id, p_body: parsed.data.body });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/student", "layout");
  return { ok: "sent" };
}

export async function markMessagesRead() {
  const supabase = await client();
  if (!supabase) return;
  await supabase.rpc("mark_student_messages_read");
}

export async function studentSignOut() {
  const supabase = await client();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
