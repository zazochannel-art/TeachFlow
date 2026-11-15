import { requireTeacher } from "./workspace";
import { createClient } from "@/lib/supabase/server";
import { storedQuestions } from "@/lib/quiz";
import type { Quiz, QuizAssignment } from "@/types/database";

const A_COLUMNS = "id, quiz_id, student_id, course_id, title, due_at, status, answers, questions, correct_ids, score, max_score, submitted_at, created_at";

const toAssignment = (r: Record<string, unknown>): QuizAssignment => ({
  ...(r as unknown as QuizAssignment),
  questions: r.questions ? storedQuestions(r.questions) : null,
  correct_ids: Array.isArray(r.correct_ids) ? r.correct_ids.map(String) : null,
  score: r.score == null ? null : Number(r.score),
  max_score: r.max_score == null ? null : Number(r.max_score)
});

/** The teacher's quizzes and everything assigned from them (migration 0013). */
export async function loadTeacherQuizzes(): Promise<{ ready: boolean; quizzes: Quiz[]; assignments: QuizAssignment[] }> {
  const { supabase, userId } = await requireTeacher();
  if (!supabase || !userId) return { ready: true, quizzes: [], assignments: [] };
  const [q, a] = await Promise.all([
    supabase.from("quizzes").select("id, course_id, title, description, questions, created_at, updated_at").eq("teacher_id", userId).order("created_at", { ascending: false }).limit(500),
    supabase.from("quiz_assignments").select(A_COLUMNS).eq("teacher_id", userId).order("created_at", { ascending: false }).limit(3000)
  ]);
  if (q.error || a.error) return { ready: false, quizzes: [], assignments: [] };
  return {
    ready: true,
    quizzes: (q.data ?? []).map(r => ({ ...(r as unknown as Quiz), questions: storedQuestions(r.questions) })),
    assignments: (a.data ?? []).map(toAssignment)
  };
}

/** Quizzes of the signed-in student or parent's children (RLS decides which rows). */
export async function loadMyQuizAssignments(): Promise<{ ready: boolean; assignments: QuizAssignment[] }> {
  const supabase = await createClient();
  if (!supabase) return { ready: true, assignments: [] };
  const { data, error } = await supabase.from("quiz_assignments").select(A_COLUMNS).order("created_at", { ascending: false }).limit(500);
  if (error) return { ready: false, assignments: [] };
  return { ready: true, assignments: (data ?? []).map(toAssignment) };
}
