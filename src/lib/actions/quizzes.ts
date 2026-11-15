"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { zonedToUtc } from "@/lib/time";
import { QUIZ_TYPES, cleanAnswers, parseQuestions, publicQuestions } from "@/lib/quiz";
import { createClient } from "@/lib/supabase/server";
import { notifyQuizAssigned, notifyQuizSubmitted } from "@/lib/push/notify";
import { DEMO_STATE, type FormState, optId, parseForm, refresh, teacherCtx, teacherTimezone } from "./common";

// Tests (migrations 0013 + 0014): the teacher saves, publishes and marks; students start,
// auto-save and hand in through database functions that never expose the answer key early.

const settingsSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  /** The builder picks the id of a new test up front (images are stored under it). */
  is_new: z.boolean().default(false),
  /** Saves the questions as a new version of this test (AI variant). */
  variant_of: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, "Adaugă un titlu.").max(160, "Titlul e prea lung."),
  description: z.string().trim().max(2000).nullable().optional(),
  course_id: z.string().uuid().nullable().optional(),
  subject: z.string().trim().max(80).nullable().optional(),
  level: z.string().trim().max(80).nullable().optional(),
  language: z.string().trim().max(40).nullable().optional(),
  topic: z.string().trim().max(200).nullable().optional(),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).nullable().optional(),
  time_limit_min: z.number().int().min(1).max(240).nullable().optional(),
  pass_percent: z.number().int().min(0).max(100).default(50),
  question_types: z.array(z.enum(QUIZ_TYPES as [string, ...string[]])).max(9).default([]),
  ai_prompt: z.string().trim().max(4000).nullable().optional(),
  max_attempts: z.number().int().min(1).max(20).default(1),
  shuffle: z.boolean().default(false),
  show_answers: z.enum(["after_submit", "after_due", "never"]).default("after_submit"),
  questions: z.unknown()
});

const empty = (v: string | null | undefined) => (v ? v : null);

/** Saves the test from the builder (draft or update). Returns the id so the page can move on. */
export async function saveQuizDraft(input: unknown): Promise<{ id?: string; error?: string }> {
  const ctx = await teacherCtx();
  if (!ctx) return { error: DEMO_STATE.error };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const v = parsed.data;
  const qs = parseQuestions(v.questions);
  if ("error" in qs) return { error: qs.error };
  const fields = {
    title: v.title, description: empty(v.description), course_id: v.course_id ?? null, subject: empty(v.subject), level: empty(v.level),
    language: empty(v.language), topic: empty(v.topic), difficulty: v.difficulty ?? null, time_limit_min: v.time_limit_min ?? null,
    pass_percent: v.pass_percent, question_types: v.question_types, ai_prompt: empty(v.ai_prompt), max_attempts: v.max_attempts,
    shuffle: v.shuffle, show_answers: v.show_answers, questions: qs.questions, updated_at: new Date().toISOString()
  };
  if (v.id && !v.is_new) {
    const { error } = await ctx.supabase.from("quizzes").update(fields).eq("id", v.id).eq("teacher_id", ctx.userId);
    if (error) return { error: error.message };
    // Students who have not answered yet see the new title.
    await ctx.supabase.from("quiz_assignments").update({ title: v.title }).eq("quiz_id", v.id).eq("teacher_id", ctx.userId).eq("status", "assigned");
    refresh();
    return { id: v.id };
  }
  let family: { parent_id?: string; version?: number } = {};
  if (v.variant_of) {
    const { data: src } = await ctx.supabase.from("quizzes").select("id, parent_id").eq("id", v.variant_of).eq("teacher_id", ctx.userId).maybeSingle();
    if (src) {
      const root = (src.parent_id as string | null) ?? (src.id as string);
      const { data: rows } = await ctx.supabase.from("quizzes").select("version").eq("teacher_id", ctx.userId).or(`id.eq.${root},parent_id.eq.${root}`);
      family = { parent_id: root, version: Math.min(1000, Math.max(1, ...(rows ?? []).map(r => Number(r.version) || 1)) + 1) };
    }
  }
  const { data, error } = await ctx.supabase.from("quizzes").insert({ ...fields, ...family, ...(v.id ? { id: v.id } : {}), teacher_id: ctx.userId, status: "draft" }).select("id").single();
  if (error) return { error: error.message };
  refresh();
  return { id: data.id as string };
}

export async function deleteQuiz(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("quizzes").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
  redirect("/quizzes");
}

/** Copy (new draft) or new version (same family, version + 1) of a test. */
export async function duplicateQuiz(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  const asVersion = formData.get("mode") === "version";
  if (!ctx || !id) return;
  const { data: q } = await ctx.supabase.from("quizzes").select("*").eq("id", id).eq("teacher_id", ctx.userId).maybeSingle();
  if (!q) return;
  const root = (q.parent_id as string | null) ?? (q.id as string);
  let version = 1;
  if (asVersion) {
    const { data: family } = await ctx.supabase.from("quizzes").select("version").eq("teacher_id", ctx.userId).or(`id.eq.${root},parent_id.eq.${root}`);
    version = Math.min(1000, Math.max(...(family ?? []).map(f => Number(f.version) || 1), 1) + 1);
  }
  const copy = {
    teacher_id: ctx.userId, course_id: q.course_id, description: q.description, questions: q.questions, subject: q.subject, level: q.level,
    language: q.language, topic: q.topic, difficulty: q.difficulty, time_limit_min: q.time_limit_min, pass_percent: q.pass_percent,
    question_types: q.question_types, ai_prompt: q.ai_prompt, max_attempts: q.max_attempts, shuffle: q.shuffle, show_answers: q.show_answers,
    status: "draft", version, parent_id: asVersion ? root : null,
    title: asVersion ? String(q.title).replace(/ · v\d+$/, "").slice(0, 150) + ` · v${version}` : String(`${q.title} (copie)`).slice(0, 160)
  };
  const { data, error } = await ctx.supabase.from("quizzes").insert(copy).select("id").single();
  if (error || !data) return;
  refresh();
  redirect(`/quizzes/${data.id}/edit`);
}

/** Archive, restore, finish (no new attempts) or reopen a test. */
export async function setQuizStatus(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!ctx || !id || !["draft", "published", "finished", "archived"].includes(status)) return;
  let next = status;
  if (status === "published") {
    // Restoring / reopening: published only if it was given to someone.
    const { count } = await ctx.supabase.from("quiz_assignments").select("id", { count: "exact", head: true }).eq("quiz_id", id);
    next = count ? "published" : "draft";
  }
  await ctx.supabase.from("quizzes").update({ status: next, updated_at: new Date().toISOString() }).eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}

const localDateTime = z.string().optional().transform(v => (v ? v : null)).refine(v => !v || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), "Dată invalidă.");
const optInt = (min: number, max: number) => z.string().optional().transform(v => (v ? Number(v) : null)).refine(v => v == null || (Number.isInteger(v) && v >= min && v <= max), "Valoare invalidă.");

const publishSchema = z.object({
  quiz_id: z.string().uuid(),
  course_id: optId,
  starts: localDateTime,
  due: localDateTime,
  time_limit_min: optInt(1, 240),
  max_attempts: optInt(1, 20),
  show_answers: z.enum(["after_submit", "after_due", "never"]).default("after_submit"),
  shuffle: z.string().optional()
});

function shareCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map(b => abc[b % abc.length]).join("");
}

/**
 * Publishes a test: to every active student of a group/course and/or to chosen students, with the
 * start, deadline, time limit, attempts, order and answer settings. Students who already have the
 * test keep their results; their settings are updated.
 */
export async function publishQuiz(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(publishSchema, formData);
  if ("error" in parsed) return parsed;
  const v = parsed.data;
  const { data: quiz } = await ctx.supabase.from("quizzes").select("id, title, course_id, status, share_code, questions").eq("id", v.quiz_id).eq("teacher_id", ctx.userId).maybeSingle();
  if (!quiz) return { error: "Testul nu a fost găsit." };
  if (!Array.isArray(quiz.questions) || !quiz.questions.length) return { error: "Adaugă cel puțin o întrebare." };

  const picked = formData.getAll("student_ids").map(String).filter(id => /^[0-9a-f-]{36}$/i.test(id));
  let studentIds = [...picked];
  if (v.course_id) {
    const { data } = await ctx.supabase.from("course_enrollments").select("student_id").eq("course_id", v.course_id).eq("status", "active");
    studentIds.push(...(data ?? []).map(r => r.student_id as string));
  }
  studentIds = [...new Set(studentIds)];
  if (!studentIds.length) return { error: "Alege o grupă cu elevi înscriși sau cel puțin un elev." };

  const tz = await teacherTimezone(ctx);
  const toUtc = (s: string | null) => {
    if (!s) return null;
    const [d, time] = s.split("T");
    const [y, m, day] = d.split("-").map(Number);
    const [h, min] = time.split(":").map(Number);
    return zonedToUtc(y, m, day, h, min, tz).toISOString();
  };
  const starts_at = toUtc(v.starts);
  const due_at = toUtc(v.due);
  if (starts_at && due_at && due_at <= starts_at) return { error: "Termenul trebuie să fie după data de început." };
  const settings = { starts_at, due_at, time_limit_min: v.time_limit_min, max_attempts: v.max_attempts ?? 1, show_answers: v.show_answers, shuffle: v.shuffle === "on", title: quiz.title as string };

  const { data: existing } = await ctx.supabase.from("quiz_assignments").select("id, student_id").eq("quiz_id", quiz.id);
  const have = new Map((existing ?? []).map(r => [r.student_id as string, r.id as string]));
  const fresh = studentIds.filter(id => !have.has(id));
  const again = studentIds.filter(id => have.has(id)).map(id => have.get(id)!);

  if (fresh.length) {
    const { error } = await ctx.supabase.from("quiz_assignments").insert(fresh.map(student_id => ({
      ...settings, quiz_id: quiz.id, teacher_id: ctx.userId, student_id, course_id: v.course_id ?? quiz.course_id
    })));
    if (error) return { error: error.message };
  }
  if (again.length) {
    const { error } = await ctx.supabase.from("quiz_assignments").update(settings).in("id", again).eq("teacher_id", ctx.userId);
    if (error) return { error: error.message };
  }
  await ctx.supabase.from("quizzes").update({
    status: "published", share_code: quiz.share_code ?? shareCode(), updated_at: new Date().toISOString(),
    time_limit_min: v.time_limit_min, max_attempts: v.max_attempts ?? 1, show_answers: v.show_answers, shuffle: v.shuffle === "on"
  }).eq("id", quiz.id).eq("teacher_id", ctx.userId);
  if (fresh.length) notifyQuizAssigned(fresh, quiz.title as string);
  refresh();
  redirect(`/quizzes/${quiz.id}?published=${fresh.length}`);
}

/** Lets the student take the test from scratch (all attempts are removed). */
export async function resetQuizAssignment(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("quiz_attempts").delete().eq("assignment_id", id).eq("teacher_id", ctx.userId);
  await ctx.supabase.from("quiz_assignments")
    .update({ status: "assigned", answers: null, questions: null, correct_ids: null, score: null, max_score: null, submitted_at: null, attempts_used: 0, needs_review: false, last_attempt_id: null, time_spent_sec: null })
    .eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}

/** One more attempt for a student who used them all. */
export async function grantQuizAttempt(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  const { data } = await ctx.supabase.from("quiz_assignments").select("attempts_used, max_attempts").eq("id", id).eq("teacher_id", ctx.userId).maybeSingle();
  if (!data) return;
  await ctx.supabase.from("quiz_assignments").update({ max_attempts: Math.min(20, Math.max(Number(data.max_attempts), Number(data.attempts_used)) + 1) }).eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}

export async function removeQuizAssignment(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("quiz_assignments").delete().eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}

/** The teacher's marks (and comments) for the open questions of one attempt. */
export async function gradeOpenAnswers(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const attemptId = String(formData.get("attempt_id") ?? "");
  if (!z.string().uuid().safeParse(attemptId).success) return { error: "Date invalide." };
  const scores: Record<string, number | null> = {};
  const feedback: Record<string, string> = {};
  for (const [k, val] of formData.entries()) {
    const s = String(val).trim();
    if (k.startsWith("s_")) scores[k.slice(2)] = s === "" ? null : Number(s.replace(",", "."));
    if (k.startsWith("f_")) feedback[k.slice(2)] = s.slice(0, 2000);
  }
  if (Object.values(scores).some(v => v != null && (!Number.isFinite(v) || v < 0))) return { error: "Punctajul trebuie să fie un număr pozitiv." };
  const { error } = await ctx.supabase.rpc("quiz_grade_open", { p_attempt_id: attemptId, p_scores: scores, p_feedback: feedback });
  if (error) return { error: error.message };
  refresh();
  return { ok: "Notele au fost salvate." };
}

// Student side --------------------------------------------------------------------------------

const QUIZ_ERRORS: Record<string, string> = {
  quiz_not_found: "Testul nu a fost găsit.",
  quiz_already_submitted: "Ai trimis deja acest test.",
  quiz_no_attempts_left: "Ai folosit toate încercările la acest test.",
  quiz_not_started: "Testul nu a început încă.",
  quiz_past_due: "Termenul testului a trecut.",
  quiz_closed: "Profesorul a închis acest test.",
  quiz_time_over: "Timpul pentru test s-a terminat.",
  quiz_empty: "Testul nu are întrebări.",
  answers_too_long: "Răspunsurile sunt prea lungi."
};
const quizError = (message: string) => {
  const key = Object.keys(QUIZ_ERRORS).find(k => message.includes(k));
  return key ? QUIZ_ERRORS[key] : "A apărut o eroare. Încearcă din nou.";
};
const uuid = (v: unknown) => (typeof v === "string" && z.string().uuid().safeParse(v).success ? v : null);

/** Starts (or resumes) an attempt; the timer runs from here. */
export async function startQuiz(assignmentId: string): Promise<{ error?: string }> {
  const id = uuid(assignmentId);
  const supabase = await createClient();
  if (!id || !supabase) return { error: "Mod demonstrativ: testul nu se poate rezolva." };
  const { error } = await supabase.rpc("quiz_start", { p_assignment_id: id });
  if (error) return { error: quizError(error.message) };
  refresh();
  return {};
}

async function loadRunning(id: string) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.rpc("quiz_for_student", { p_assignment_id: id });
  const row = Array.isArray(data) ? data[0] : null;
  return row ? { supabase, questions: publicQuestions(row.questions) } : null;
}

/** Auto-save of the answers while the attempt runs. */
export async function saveQuizAnswers(assignmentId: string, answers: unknown): Promise<{ savedAt?: string; error?: string }> {
  const id = uuid(assignmentId);
  if (!id) return { error: "Date invalide." };
  const run = await loadRunning(id);
  if (!run) return { error: QUIZ_ERRORS.quiz_not_found };
  const { data, error } = await run.supabase.rpc("quiz_save_draft", { p_assignment_id: id, p_answers: cleanAnswers(run.questions, answers) });
  if (error) return { error: quizError(error.message) };
  return { savedAt: String(data) };
}

/** Hands in the attempt; the database grades it. */
export async function submitQuizAnswers(assignmentId: string, answers: unknown): Promise<{ error?: string }> {
  const id = uuid(assignmentId);
  if (!id) return { error: "Date invalide." };
  const run = await loadRunning(id);
  if (!run) return { error: QUIZ_ERRORS.quiz_not_found };
  const { error } = await run.supabase.rpc("submit_quiz", { p_assignment_id: id, p_answers: cleanAnswers(run.questions, answers) });
  if (error) return { error: quizError(error.message) };
  notifyQuizSubmitted(id);
  refresh();
  return {};
}

