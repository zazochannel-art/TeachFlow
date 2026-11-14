"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { DEMO_STATE, type FormState, parseForm, refresh, teacherCtx } from "./common";
import { newInviteToken } from "@/lib/invite-token";

const MIGRATION_MSG = "Aplică migrarea 0003_student_portal.sql în Supabase ca să poți invita elevi.";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Creates a fresh invite link for a student (older pending links stop working). */
export async function createStudentInvite(_: FormState, formData: FormData): Promise<FormState & { link?: string }> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(z.object({ student_id: z.string().uuid("Elev invalid.") }), formData);
  if ("error" in parsed) return parsed;
  const studentId = parsed.data.student_id;

  const { data: student } = await ctx.supabase.from("students").select("id").eq("id", studentId).eq("teacher_id", ctx.userId).maybeSingle();
  if (!student) return { error: "Elevul nu a fost găsit." };

  const old = await ctx.supabase.from("student_invites").delete().eq("student_id", studentId).is("accepted_at", null);
  if (old.error) return { error: MIGRATION_MSG };

  const { token, hash } = newInviteToken();
  const { error } = await ctx.supabase.from("student_invites").insert({ teacher_id: ctx.userId, student_id: studentId, token_hash: hash });
  if (error) return { error: error.message };
  return { ok: "Link creat. Valabil 14 zile, o singură folosire.", link: `${await origin()}/invite/${token}` };
}

/** Removes the student's portal access. Their account stays, but it no longer sees this teacher's data. */
export async function unlinkStudentAccount(formData: FormData) {
  const ctx = await teacherCtx();
  if (!ctx) return;
  const id = String(formData.get("student_id") ?? "");
  await ctx.supabase.from("students").update({ user_id: null }).eq("id", id).eq("teacher_id", ctx.userId);
  await ctx.supabase.from("student_invites").delete().eq("student_id", id);
  refresh();
}
