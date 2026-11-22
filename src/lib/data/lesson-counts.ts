import type { Enrollment, Lesson, LessonStatus } from "@/types/database";

/** Which lessons every teacher page loads: from 120 days ago to 240 days ahead. */
export const LESSON_WINDOW = { pastDays: 120, futureDays: 240 } as const;

/** ISO bounds of the lesson window around `now` (from inclusive, to exclusive). */
export function lessonWindow(now = new Date()) {
  return {
    from: new Date(now.getTime() - LESSON_WINDOW.pastDays * 86_400_000).toISOString(),
    to: new Date(now.getTime() + LESSON_WINDOW.futureDays * 86_400_000).toISOString()
  };
}

/**
 * Number of lessons per (course, student, status) over the whole history. Every teacher page only
 * loads the lessons around today (see LESSON_WINDOW in workspace.ts); totals such as "12 of 20
 * lessons held" come from these counts, which the database computes (view lesson_status_counts,
 * migration 0024).
 */
export interface LessonCount { course_id: string | null; student_id: string | null; status: LessonStatus; n: number }

/** The same counts computed from lesson rows (demo mode, or before migration 0024). */
export function countLessons(lessons: Pick<Lesson, "course_id" | "student_id" | "status">[]): LessonCount[] {
  const map = new Map<string, LessonCount>();
  for (const l of lessons) {
    const key = `${l.course_id ?? ""}|${l.student_id ?? ""}|${l.status}`;
    const cur = map.get(key);
    if (cur) cur.n++;
    else map.set(key, { course_id: l.course_id, student_id: l.student_id, status: l.status, n: 1 });
  }
  return [...map.values()];
}

const sum = (rows: LessonCount[], keep: (r: LessonCount) => boolean) => rows.reduce((n, r) => (keep(r) ? n + r.n : n), 0);

/** A course's lessons (cancelled ones left out) and how many of them are behind us (held or missed). */
export function courseLessonTotals(counts: LessonCount[], courseId: string) {
  const mine = counts.filter(r => r.course_id === courseId && r.status !== "cancelled");
  return { total: sum(mine, () => true), done: sum(mine, r => r.status === "completed" || r.status === "no_show") };
}

/**
 * A student's lessons: their own (student_id) plus the group lessons of the courses they are
 * actively enrolled in (course lessons without a single student), like the student card shows them.
 */
export function studentLessonTotals(counts: LessonCount[], studentId: string, enrollments: Pick<Enrollment, "course_id" | "student_id" | "status">[]) {
  const courses = new Set(enrollments.filter(e => e.student_id === studentId && e.status === "active").map(e => e.course_id));
  const mine = counts.filter(r => r.student_id === studentId || (!r.student_id && r.course_id != null && courses.has(r.course_id)));
  return {
    held: sum(mine, r => r.status === "completed"),
    missed: sum(mine, r => r.status === "no_show"),
    total: sum(mine, r => r.status !== "cancelled")
  };
}

export const totalLessons = (counts: LessonCount[]) => sum(counts, () => true);
