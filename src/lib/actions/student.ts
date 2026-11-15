"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseFileRefs } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";
import { isInviteToken } from "@/lib/invite-token";
import type { FormState } from "./common";
import { notifyHomeworkSubmitted, notifyMessage } from "@/lib/push/notify";

const ERRORS: Record<string, string> = {
  invite_invalid: "Linkul de invitație nu mai este valabil. Cere profesorului unul nou.",
  invite_used: "Invitația a fost deja folosită de alt cont.",
  own_invite: "Ești autentificat cu contul de profesor. Deschide linkul cu contul elevului.",
  teacher_account: "Acest cont este folosit ca profesor. Creează un cont separat pentru elev.",
  homework_not_found: "Tema nu mai poate fi predată (poate a fost deja verificată).",
  empty_submission: "Scrie răspunsul sau atașează un fișier înainte să predai tema.",
  too_many_files: "Cel mult 10 fișiere.",
  bad_file: "Un fișier nu a putut fi atașat. Încarcă-l din nou.",
  submission_too_long: "Răspunsul este prea lung (maximum 8000 de caractere).",
  empty_message: "Scrie un mesaj.",
  message_too_long: "Mesajul este prea lung.",
  student_not_found: "Conversația nu a fost găsită.",
  student_account: "Acest cont este folosit de un elev. Creează un cont separat pentru părinte.",
  phone_too_long: "Numărul de telefon este prea lung."
};

function friendly(message: string) {
  const key = Object.keys(ERRORS).find(k => message.includes(k));
  if (key) return ERRORS[key];
  if (/submit_homework_files/.test(message)) return "Predarea cu fișiere nu este activată încă (lipsește migrarea 0010).";
  if (/parent|update_my_phone/.test(message) && /function .* does not exist|schema cache/i.test(message)) return "Funcția nu este activată încă (lipsește migrarea 0012).";
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
  submission: z.string().trim().max(8000, ERRORS.submission_too_long).optional().default("")
});

export async function submitHomework(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = submitSchema.safeParse({ homework_id: formData.get("homework_id"), submission: formData.get("submission") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const supabase = await client();
  if (!supabase) return { error: "Mod demonstrativ: tema nu se poate preda." };
  const { homework_id, submission } = parsed.data;

  if (formData.has("files")) {
    // With the file picker (migration 0010): text, files or both; only files from the student's own folder.
    const { data } = await supabase.auth.getClaims();
    const uid = data?.claims?.sub;
    if (!uid) return { error: "Date invalide." };
    const files = parseFileRefs(formData.get("files"), `sub/${uid}/${homework_id}/`);
    if (!submission && !files.length) return { error: ERRORS.empty_submission };
    const { error } = await supabase.rpc("submit_homework_files", { p_homework_id: homework_id, p_submission: submission, p_files: files });
    if (error) return { error: friendly(error.message) };
  } else {
    if (!submission) return { error: ERRORS.empty_submission };
    const { error } = await supabase.rpc("submit_homework", { p_homework_id: homework_id, p_submission: submission });
    if (error) return { error: friendly(error.message) };
  }
  notifyHomeworkSubmitted(homework_id);
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
  notifyMessage({ studentId: parsed.data.student_id, from: "student", channel: "student", body: parsed.data.body });
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

export async function acceptParentInvite(_: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  if (!isInviteToken(token)) return { error: ERRORS.invite_invalid };
  const supabase = await client();
  if (!supabase) return { error: "Configurează Supabase pentru a folosi invitațiile." };
  const { error } = await supabase.rpc("accept_parent_invite", { p_token: token });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  redirect("/parent");
}

export async function sendParentMessage(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = messageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const supabase = await client();
  if (!supabase) return { error: "Mod demonstrativ: mesajul nu se poate trimite." };
  const { error } = await supabase.rpc("send_parent_message", { p_student_id: parsed.data.student_id, p_body: parsed.data.body });
  if (error) return { error: friendly(error.message) };
  notifyMessage({ studentId: parsed.data.student_id, from: "parent", channel: "parent", body: parsed.data.body });
  revalidatePath("/parent", "layout");
  return { ok: "sent" };
}

export async function markParentMessagesRead() {
  const supabase = await client();
  if (!supabase) return;
  await supabase.rpc("mark_parent_messages_read");
}

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Numele este prea scurt.").max(120),
  phone: z.string().trim().max(40, ERRORS.phone_too_long).optional().default("")
});

/** "Profilul meu" (students and parents): own name, and for students the phone on the teachers' cards. */
export async function updateMyProfile(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const supabase = await client();
  if (!supabase) return { error: "Mod demonstrativ: modificările nu se salvează." };
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return { error: "Date invalide." };
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.full_name }).eq("id", uid);
  if (error) return { error: friendly(error.message) };
  if (formData.has("phone")) {
    const res = await supabase.rpc("update_my_phone", { p_phone: parsed.data.phone });
    if (res.error) return { error: friendly(res.error.message) };
  }
  revalidatePath("/", "layout");
  return { ok: "Profil salvat." };
}
