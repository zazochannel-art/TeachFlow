import type { SupabaseClient } from "@supabase/supabase-js";
import { computeProgress, type GReward, type Progress } from "@/lib/gamification";
import { createClient } from "@/lib/supabase/server";
import { DEMO_REWARD_REASON } from "./demo";
import { readAll } from "./paged";

/**
 * Everything the points are computed from, for one or more students rows (a student with two
 * teachers has two). Works for the teacher, the student and the parents: RLS decides the rows.
 * `ready: false` means migration 0015 is not applied (no bonus table yet), so points are hidden.
 */
export async function loadProgress(supabase: SupabaseClient, studentIds: string[], timezone: string): Promise<{ ready: boolean; progress: Progress | null }> {
  if (!studentIds.length) return { ready: true, progress: null };
  const [homework, quizzes, enrollments, own, rewards] = await Promise.all([
    readAll((a, b) => supabase.from("homework").select("id, title, status, due_at, submitted_at, grade").in("student_id", studentIds).neq("status", "assigned").order("id").range(a, b), 20_000),
    readAll((a, b) => supabase.from("quiz_assignments").select("id, title, status, score, max_score, submitted_at").in("student_id", studentIds).eq("status", "submitted").order("id").range(a, b), 20_000),
    readAll((a, b) => supabase.from("course_enrollments").select("id, course_id, enrolled_at").in("student_id", studentIds).order("id").range(a, b), 5000),
    readAll((a, b) => supabase.from("lessons").select("id, title, status, starts_at").in("student_id", studentIds).eq("status", "completed").order("id").range(a, b), 20_000),
    supabase.from("student_rewards").select("points, reason, created_at").in("student_id", studentIds).order("created_at", { ascending: false }).limit(1000)
  ]);
  if (rewards.error) return { ready: false, progress: null };

  // Group lessons count from the day the student joined the course.
  const joined = new Map<string, string>();
  for (const e of enrollments.data ?? []) {
    const prev = joined.get(e.course_id as string);
    if (!prev || (e.enrolled_at as string) < prev) joined.set(e.course_id as string, e.enrolled_at as string);
  }
  const group = joined.size
    ? await readAll<{ id: string; title: string; status: string; starts_at: string; course_id: string }>((a, b) => supabase.from("lessons").select("id, title, status, starts_at, course_id").is("student_id", null).in("course_id", [...joined.keys()]).eq("status", "completed").order("id").range(a, b), 20_000)
    : { data: [] as Array<{ id: string; title: string; status: string; starts_at: string; course_id: string }> };
  const lessons = [
    ...(own.data ?? []),
    ...(group.data ?? []).filter(l => (l.starts_at as string) >= (joined.get(l.course_id as string) ?? ""))
  ] as Array<{ title: string; status: string; starts_at: string }>;

  return {
    ready: true,
    progress: computeProgress({
      homework: (homework.data ?? []) as Parameters<typeof computeProgress>[0]["homework"],
      quizzes: (quizzes.data ?? []).map(q => ({ ...q, score: q.score == null ? null : Number(q.score), max_score: q.max_score == null ? null : Number(q.max_score) })) as Parameters<typeof computeProgress>[0]["quizzes"],
      lessons,
      rewards: (rewards.data ?? []) as GReward[],
      timezone,
      now: new Date()
    })
  };
}

/** Teachers (of the signed-in student or parent) who have points switched on (migration 0015). */
export async function gamificationTeachers(supabase: SupabaseClient): Promise<Set<string> | null> {
  const { data, error } = await supabase.rpc("gamification_teachers");
  if (error) return null;
  return new Set(((data ?? []) as Array<string | { gamification_teachers: string }>).map(x => (typeof x === "string" ? x : x.gamification_teachers)));
}

/**
 * Points of the signed-in student or parent's child: only the students rows whose teacher has
 * points switched on count. Null when nothing applies (switched off, demo, migration missing).
 */
export async function loadPortalProgress(links: Array<{ studentId: string; teacherId: string }>, timezone: string): Promise<Progress | null> {
  const supabase = await createClient();
  if (!supabase || !links.length) return null;
  const on = await gamificationTeachers(supabase);
  if (!on) return null;
  const ids = links.filter(l => on.has(l.teacherId)).map(l => l.studentId);
  if (!ids.length) return null;
  return (await loadProgress(supabase, ids, timezone)).progress;
}

/** Demo mode (no Supabase): points from the demo homework and lessons, plus one sample bonus. */
export function demoProgress(d: { homework: Parameters<typeof computeProgress>[0]["homework"]; lessons: Parameters<typeof computeProgress>[0]["lessons"] }, timezone: string): Progress {
  const now = new Date();
  return computeProgress({ ...d, quizzes: [], rewards: [{ points: 15, reason: DEMO_REWARD_REASON, created_at: new Date(now.getTime() - 2 * 86400000).toISOString() }], timezone, now });
}
