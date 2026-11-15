import { requireTeacher } from "./workspace";
import { createClient } from "@/lib/supabase/server";
import { storedQuestions } from "@/lib/quiz";
import type { Quiz, QuizAssignment, QuizAttempt, QuizType } from "@/types/database";

// Quizzes (migrations 0013 + 0014). `ready: false` means migration 0014 is not applied yet.

const A_COLUMNS = "id, quiz_id, student_id, course_id, title, due_at, starts_at, status, answers, correct_ids, score, max_score, submitted_at, created_at, time_limit_min, max_attempts, shuffle, show_answers, attempts_used, needs_review, last_attempt_id, time_spent_sec";
const Q_COLUMNS = "id, course_id, title, description, questions, created_at, updated_at, subject, level, language, topic, difficulty, time_limit_min, pass_percent, status, version, parent_id, share_code, ai_prompt, question_types, max_attempts, shuffle, show_answers";
const T_COLUMNS = "id, assignment_id, quiz_id, student_id, attempt_no, status, questions, answers, question_scores, manual_scores, feedback, auto_score, score, max_score, needs_review, started_at, deadline_at, submitted_at";

const num = (v: unknown) => (v == null ? null : Number(v));
const numMap = (v: unknown): Record<string, number> =>
  v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, Number(x)])) : {};

export const toAssignment = (r: Record<string, unknown>): QuizAssignment => ({
  ...(r as unknown as QuizAssignment),
  correct_ids: Array.isArray(r.correct_ids) ? r.correct_ids.map(String) : null,
  score: num(r.score),
  max_score: num(r.max_score),
  attempts_used: Number(r.attempts_used ?? 0),
  max_attempts: Number(r.max_attempts ?? 1)
});

export const toQuiz = (r: Record<string, unknown>): Quiz => ({
  ...(r as unknown as Quiz),
  questions: storedQuestions(r.questions),
  question_types: Array.isArray(r.question_types) ? (r.question_types as QuizType[]) : []
});

export const toAttempt = (r: Record<string, unknown>): QuizAttempt => ({
  ...(r as unknown as QuizAttempt),
  questions: storedQuestions(r.questions),
  answers: (r.answers as Record<string, unknown>) ?? {},
  question_scores: numMap(r.question_scores),
  manual_scores: numMap(r.manual_scores),
  feedback: r.feedback && typeof r.feedback === "object" ? (r.feedback as Record<string, string>) : {},
  auto_score: num(r.auto_score),
  score: num(r.score),
  max_score: num(r.max_score)
});

/** The teacher's quizzes and everything assigned from them. */
export async function loadTeacherQuizzes(): Promise<{ ready: boolean; quizzes: Quiz[]; assignments: QuizAssignment[] }> {
  const { supabase, userId } = await requireTeacher();
  if (!supabase || !userId) return { ready: true, quizzes: [], assignments: [] };
  const [q, a] = await Promise.all([
    supabase.from("quizzes").select(Q_COLUMNS).eq("teacher_id", userId).order("updated_at", { ascending: false }).limit(500),
    supabase.from("quiz_assignments").select(A_COLUMNS).eq("teacher_id", userId).order("created_at", { ascending: false }).limit(5000)
  ]);
  if (q.error || a.error) return { ready: false, quizzes: [], assignments: [] };
  return { ready: true, quizzes: (q.data ?? []).map(toQuiz), assignments: (a.data ?? []).map(toAssignment) };
}

/** One quiz with its assignments and every attempt (results page). */
export async function loadQuizDetail(id: string): Promise<{ ready: boolean; quiz: Quiz | null; assignments: QuizAssignment[]; attempts: QuizAttempt[] }> {
  const { supabase, userId } = await requireTeacher();
  if (!supabase || !userId || !/^[0-9a-f-]{36}$/i.test(id)) return { ready: true, quiz: null, assignments: [], attempts: [] };
  const [q, a, t] = await Promise.all([
    supabase.from("quizzes").select(Q_COLUMNS).eq("id", id).eq("teacher_id", userId).maybeSingle(),
    supabase.from("quiz_assignments").select(A_COLUMNS).eq("quiz_id", id).order("created_at", { ascending: true }).limit(2000),
    supabase.from("quiz_attempts").select(T_COLUMNS).eq("quiz_id", id).order("attempt_no", { ascending: true }).limit(5000)
  ]);
  if (q.error || a.error || t.error) return { ready: false, quiz: null, assignments: [], attempts: [] };
  return { ready: true, quiz: q.data ? toQuiz(q.data) : null, assignments: (a.data ?? []).map(toAssignment), attempts: (t.data ?? []).map(toAttempt) };
}

/** Quizzes of the signed-in student or parent's children (RLS decides which rows). */
export async function loadMyQuizAssignments(): Promise<{ ready: boolean; assignments: QuizAssignment[] }> {
  const supabase = await createClient();
  if (!supabase) return { ready: true, assignments: [] };
  const { data, error } = await supabase.from("quiz_assignments").select(A_COLUMNS).order("created_at", { ascending: false }).limit(500);
  if (error) return { ready: false, assignments: [] };
  return { ready: true, assignments: (data ?? []).map(toAssignment) };
}
