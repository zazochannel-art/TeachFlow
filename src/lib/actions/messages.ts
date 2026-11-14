"use server";

import { z } from "zod";
import { DEMO_STATE, type FormState, parseForm, refresh, teacherCtx } from "./common";

const messageSchema = z.object({
  student_id: z.string().min(1),
  direction: z.enum(["outgoing", "incoming"]).default("outgoing"),
  body: z.string().trim().min(1, "Scrie un mesaj.").max(4000)
});

export async function addMessage(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(messageSchema, formData);
  if ("error" in parsed) return parsed;
  const v = parsed.data;
  const { error } = await ctx.supabase.from("messages").insert({
    ...v, teacher_id: ctx.userId, read_at: v.direction === "outgoing" ? new Date().toISOString() : null
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: "sent" };
}

/** Marks a student's incoming messages as read when the conversation is opened. */
export async function markConversationRead(studentId: string) {
  const ctx = await teacherCtx();
  if (!ctx || !studentId) return;
  await ctx.supabase.from("messages").update({ read_at: new Date().toISOString() })
    .eq("teacher_id", ctx.userId).eq("student_id", studentId).eq("direction", "incoming").is("read_at", null);
}
