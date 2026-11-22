import type { Workspace } from "@/lib/data/workspace";
import { countLessons } from "@/lib/data/lesson-counts";
import type { Course, Lesson, Payment, Student } from "@/types/database";

/** A teacher workspace for tests; the lesson totals follow the given lessons unless set. */
export function emptyWorkspace(over: Partial<Workspace> = {}): Workspace {
  return {
    lessonWindow: { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" },
    lessonCounts: countLessons(over.lessons ?? []),
    mode: "live", userId: "u1", email: "t@example.com", isAdmin: false, timezone: "Europe/Chisinau",
    profile: { full_name: "Profesor Test", avatar_url: null, preferred_language: "ro", timezone: "Europe/Chisinau" },
    teacherProfile: null, subscription: null,
    students: [], courses: [], enrollments: [], lessons: [], homework: [], messages: [], payments: [],
    missingTables: [], ...over
  };
}

export const student = (id: string, over: Partial<Student> = {}): Student =>
  ({ id, full_name: `Elev ${id}`, email: null, phone: null, notes: null, status: "active", created_at: "2026-11-01T10:00:00Z", ...over });

export const course = (id: string, over: Partial<Course> = {}): Course =>
  ({ id, title: `Curs ${id}`, description: null, subject: "Engleză", level: null, format: "group", price: 200, currency: "MDL", is_active: true, created_at: "2026-11-01T10:00:00Z", ...over });

export const lesson = (id: string, starts: string, minutes: number, over: Partial<Lesson> = {}): Lesson => ({
  id, course_id: null, student_id: null, title: `Lecția ${id}`, description: null,
  starts_at: starts, ends_at: new Date(new Date(starts).getTime() + minutes * 60000).toISOString(),
  status: "scheduled", meeting_url: null, ...over
});

export const payment = (id: string, over: Partial<Payment> = {}): Payment => ({
  id, student_id: "s1", course_id: null, amount: 100, currency: "MDL", status: "pending",
  due_date: null, paid_at: null, method: null, note: null, created_at: "2026-11-01T10:00:00Z", ...over
});
