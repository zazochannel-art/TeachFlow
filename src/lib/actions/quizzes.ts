"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { zonedToUtc } from "@/lib/time";
import { answersFromForm, parseQuestions, storedQuestions } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";
import { notifyQuizAssigned, notifyQuizSubmitted } from "@/lib/push/notify";
import { DEMO_STATE, type FormState, optId, optText, parseForm, refresh, teacherCtx, teacherTimezone } from "./common";

const quizSchema = z.object({
  id: optId,
  title: z.string().trim().min(1, "Adaugă un titlu.").max(160),
  description: optText(2000),
  course_id: optId
});

export async function saveQuiz(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(quizSchema, formData);
  if ("error" in parsed) return parsed;
  const qs = parseQuestions(formData.get("questions"));
  if ("error" in qs) return { error: qs.error };
  const v = parsed.data;
  const fields = { title: v.title, description: v.description, course_id: v.course_id, questions: qs.questions, updated_at: new Date().toISOString() };

  if (v.id) {
    const { error } = await ctx.supabase.from("quizzes").update(fields).eq("id", v.id).eq("teacher_id", ctx.userId);
    if (error) return { error: error.message };
    // Students who have not answered yet see the new title.
    await ctx.supabase.from("quiz_assignments").update({ title: v.title }).eq("quiz_id", v.id).eq("teacher_id", ctx.userId).eq("status", "assigned");
    refresh();
    redirect(`/quizzes?view=${v.id}`);
  }
  const { data, error } = await ctx.supabase.from("quizzes").insert({ ...fields, teacher_id: ctx.userId }).select("id").single();
  if (error) return { error: error.message };
  refresh();
  redirect(`/quizzes?assign=${data.id}${v.course_id ? `&course=${v.course_id}` : ""}`);
}

export async function deleteQuiz(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("quizzes").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
  redirect("/quizzes");
}

const assignSchema = z.object({
  quiz_id: z.string().uuid(),
  course_id: optId,
  student_id: optId,
  due: z.string().optional().transform(v => (v ? v : null)).refine(v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Dată invalidă.")
});

/** Gives the quiz to one student or to every active student of a course (each student once). */
export async function assignQuiz(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(assignSchema, formData);
  if ("error" in parsed) return parsed;
  const v = parsed.data;
  const { data: quiz } = await ctx.supabase.from("quizzes").select("id, title, course_id").eq("id", v.quiz_id).eq("teacher_id", ctx.userId).maybeSingle();
  if (!quiz) return { error: "Testul nu a fost găsit." };

  let studentIds: string[] = [];
  if (v.student_id) studentIds = [v.student_id];
  else if (v.course_id) {
    const { data } = await ctx.supabase.from("course_enrollments").select("student_id").eq("course_id", v.course_id).eq("status", "active");
    studentIds = (data ?? []).map(r => r.student_id as string);
  }
  if (!studentIds.length) return { error: "Alege un elev sau un curs cu elevi înscriși." };

  let due_at: string | null = null;
  if (v.due) {
    const tz = await teacherTimezone(ctx);
    const [y, m, d] = v.due.split("-").map(Number);
    due_at = zonedToUtc(y, m, d, 23, 59, tz).toISOString();
  }
  const { data: existing } = await ctx.supabase.from("quiz_assignments").select("student_id").eq("quiz_id", quiz.id).in("student_id", studentIds);
  const have = new Set((existing ?? []).map(r => r.student_id as string));
  const fresh = studentIds.filter(id => !have.has(id));
  if (!fresh.length) return { error: "Testul a fost deja dat acestor elevi." };
  const { error } = await ctx.supabase.from("quiz_assignments").insert(fresh.map(student_id => ({
    quiz_id: quiz.id, teacher_id: ctx.userId, student_id, course_id: v.course_id ?? quiz.course_id, title: quiz.title, due_at
  })));
  if (error) return { error: error.message };
  notifyQuizAssigned(fresh, quiz.title);
  refresh();
  redirect(`/quizzes?view=${quiz.id}`);
}

/** Lets the student take the quiz again (the previous answers are discarded). */
export async function resetQuizAssignment(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("quiz_assignments")
    .update({ status: "assigned", answers: null, questions: null, correct_ids: null, score: null, max_score: null, submitted_at: null })
    .eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}

export async function removeQuizAssignment(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("quiz_assignments").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}

const QUIZ_ERRORS: Record<string, string> = {
  quiz_not_found: "Testul nu a fost găsit.",
  quiz_already_submitted: "Ai trimis deja acest test.",
  answers_too_long: "Răspunsurile sunt prea lungi."
};

/** Student hands in a quiz; the database grades it and the result page opens. */
export async function submitQuiz(_: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("assignment_id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { error: "Date invalide." };
  const supabase = await createClient();
  if (!supabase) return { error: "Mod demonstrativ: testul nu se poate trimite." };
  const { data: rows, error: loadErr } = await supabase.rpc("quiz_for_student", { p_assignment_id: id });
  const quiz = Array.isArray(rows) ? rows[0] : null;
  if (loadErr || !quiz) return { error: QUIZ_ERRORS.quiz_not_found };
  const answers = answersFromForm(storedQuestions(quiz.questions), formData);
  const { error } = await supabase.rpc("submit_quiz", { p_assignment_id: id, p_answers: answers });
  if (error) {
    const key = Object.keys(QUIZ_ERRORS).find(k => error.message.includes(k));
    return { error: key ? QUIZ_ERRORS[key] : error.message };
  }
  notifyQuizSubmitted(id);
  refresh();
  redirect(`/student/quizzes/${id}`);
}
