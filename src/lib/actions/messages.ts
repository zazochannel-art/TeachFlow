"use server";

import { z } from "zod";
import { DEMO_STATE, type FormState, parseForm, refresh, teacherCtx } from "./common";

const messageSchema = z.object({
  student_id: z.string().min(1),
  direction: z.enum(["outgoing", "incoming"]).default("outgoing"),
  channel: z.enum(["student", "parent"]).default("student"),
  body: z.string().trim().min(1, "Scrie un mesaj.").max(4000)
});

export async function addMessage(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(messageSchema, formData);
  if ("error" in parsed) return parsed;
  const { channel, ...v } = parsed.data;
  const { error } = await ctx.supabase.from("messages").insert({
    // The column exists only after migration 0012; the student channel is its default.
    ...(channel === "parent" ? { channel } : {}),
    // read_at of an outgoing message means "read by the student" (student portal badge), so it starts empty.
    // An incoming message the teacher logs by hand is already read by the teacher.
    ...v, teacher_id: ctx.userId, read_at: v.direction === "incoming" ? new Date().toISOString() : null
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: "sent" };
}

/** Marks incoming messages as read when the conversation is opened (student or parents channel, migration 0012). */
export async function markConversationRead(studentId: string, channel?: "student" | "parent") {
  const ctx = await teacherCtx();
  if (!ctx || !studentId) return;
  const q = ctx.supabase.from("messages").update({ read_at: new Date().toISOString() })
    .eq("teacher_id", ctx.userId).eq("student_id", studentId).eq("direction", "incoming").is("read_at", null);
  await (channel ? q.eq("channel", channel) : q);
}
