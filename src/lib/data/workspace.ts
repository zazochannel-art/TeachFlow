import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TZ } from "@/lib/time";
import { buildDemoWorkspace } from "./demo";
import { oldestFirst } from "./rows";
import { readAll, type Rows } from "./paged";
import { countLessons, lessonWindow, type LessonCount } from "./lesson-counts";
export { LESSON_WINDOW, lessonWindow } from "./lesson-counts";
import { pendingInviteToken } from "@/lib/invite-token";
import type { Course, Enrollment, Homework, Lesson, Message, Payment, Profile, Student, Subscription, TeacherProfile } from "@/types/database";

export interface Workspace {
  /** "demo" only when Supabase env vars are missing (local preview, clearly labelled in the UI). */
  mode: "live" | "demo";
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
  timezone: string;
  profile: Pick<Profile, "full_name" | "avatar_url" | "preferred_language" | "timezone"> | null;
  teacherProfile: TeacherProfile | null;
  subscription: Subscription | null;
  students: Student[];
  courses: Course[];
  enrollments: Enrollment[];
  /**
   * The lessons around today only (LESSON_WINDOW: the last 4 months and the next 8), oldest first.
   * Pages that show other dates load them with loadLessonsBetween() / loadLesson().
   */
  lessons: Lesson[];
  /** ISO bounds of `lessons` (from inclusive, to exclusive). */
  lessonWindow: { from: string; to: string };
  /** Lessons per course, student and status over the whole history (for totals). */
  lessonCounts: LessonCount[];
  /** Light rows (no texts or files) for counts and badges; the homework page loads full rows with loadHomework(). */
  homework: HomeworkSummary[];
  /** Unread incoming messages only; the messages page loads whole conversations with loadMessages(). */
  messages: Message[];
  /**
   * Every pending payment plus the others created in the last 13 months (enough for the charts,
   * badges and student cards). The payments page, exports and invoices load the full list.
   */
  payments: Payment[];
  /** Tables from migration 0002 that are not available yet (migration not applied). */
  missingTables: Array<"homework" | "messages" | "payments">;
}

/** Homework without its long texts and file lists, which only the homework page shows. */
export type HomeworkSummary = Omit<Homework, "description" | "feedback" | "submission" | "attachments" | "submission_files">;
const HOMEWORK_SUMMARY_COLS = "id, student_id, course_id, lesson_id, title, due_at, status, submitted_at, grade, created_at";
const HOMEWORK_FULL_COLS = `${HOMEWORK_SUMMARY_COLS}, description, feedback, submission, attachments, submission_files`;

const LESSON_COLS = "id, course_id, student_id, title, description, starts_at, ends_at, status, meeting_url";
const MESSAGE_COLS = "id, student_id, direction, body, read_at, created_at, channel, author_id";
export const PAYMENT_COLS = "id, student_id, course_id, amount, currency, status, due_date, paid_at, method, note, created_at, invoice_no";
const DAY_MS = 86_400_000;
/** Payments older than this (and no longer pending) stay out of the workspace. */
const PAYMENT_HISTORY_DAYS = 400;

/** Verified session claims for this request (deduplicated per render with React cache). */
const getSession = cache(async () => {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, userId: null, email: null } as const;

  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/login");

  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  return { supabase, userId, email, inviteToken: pendingInviteToken(data?.claims) } as const;
});

/** Same rules as the original dashboard page: students go to their portal, others to login. */
function enforceTeacherRole(role: string | undefined | null) {
  if (role === "student") redirect("/student");
  if (role === "parent") redirect("/parent");
  if (!role || !["teacher", "admin"].includes(role)) redirect("/login?error=no_teacher_role");
}

const loadRole = async (supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, userId: string) => {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  return (data?.role as string | undefined) ?? null;
};

/**
 * Auth + role guard used by server actions.
 * Same rules as the original dashboard page: signed-in user with role teacher/admin.
 */
export const requireTeacher = cache(async () => {
  const session = await getSession();
  if (!session.supabase || !session.userId) return { ...session, isAdmin: false } as const;
  const role = await loadRole(session.supabase, session.userId);
  enforceTeacherRole(role);
  return { ...session, isAdmin: role === "admin" } as const;
});

/**
 * Runs `query` and, if it fails (e.g. a column from a migration that is not applied yet),
 * retries with `fallback` so the app keeps working on an older schema.
 */
async function withFallback<T extends { error: unknown }>(query: () => PromiseLike<T>, fallback: () => PromiseLike<T>): Promise<T> {
  const first = await query();
  return first.error ? fallback() : first;
}

/**
 * Loads the signed-in teacher's data. RLS limits every query to rows owned by the teacher.
 * The role lookup runs in the same parallel batch as the data queries (one database round
 * trip instead of two); the role is enforced before anything is returned.
 */
export const loadWorkspace = cache(async (): Promise<Workspace> => {
  const { supabase, userId, email, inviteToken } = await getSession();
  if (!supabase || !userId) return buildDemoWorkspace();

  const window = lessonWindow();
  const paymentsSince = new Date(Date.now() - PAYMENT_HISTORY_DAYS * DAY_MS).toISOString();
  const lessonsIn = (cols: string) => readAll<Lesson>((from, to) => supabase.from("lessons").select(cols)
    .eq("teacher_id", userId).gte("starts_at", window.from).lt("starts_at", window.to)
    .order("starts_at", { ascending: false }).order("id").range(from, to) as unknown as PromiseLike<Rows<Lesson>>, 5000);

  const [role, profile, teacherProfile, subscription, students, courses, enrollments, lessons, counts, homework, messages, payments] = await Promise.all([
    loadRole(supabase, userId),
    supabase.from("profiles").select("full_name, avatar_url, preferred_language, timezone").eq("id", userId).maybeSingle(),
    supabase.from("teacher_profiles").select("user_id, headline, bio, subject_specialties, hourly_rate, currency, email_reminders, parent_reports").eq("user_id", userId).maybeSingle(),
    supabase.from("subscriptions").select("plan_code, status, current_period_end").eq("teacher_id", userId).maybeSingle(),
    readAll<Student>((from, to) => supabase.from("students").select("id, full_name, email, phone, notes, status, created_at, user_id, avatar_url, birth_date, grade_level, goals, parent_name, parent_phone, parent_email").eq("teacher_id", userId).order("full_name").order("id").range(from, to), 20_000),
    readAll<Course>((from, to) => supabase.from("courses").select("id, title, description, subject, level, format, price, currency, is_active, created_at, color").eq("teacher_id", userId).order("created_at").order("id").range(from, to), 5000),
    readAll<Enrollment>((from, to) => supabase.from("course_enrollments").select("id, course_id, student_id, enrolled_at, status").eq("teacher_id", userId).order("id").range(from, to), 50_000),
    // series_id comes with migration 0017; until it is applied, load without it.
    withFallback(() => lessonsIn(`${LESSON_COLS}, series_id`), () => lessonsIn(LESSON_COLS)),
    // Totals over the whole history (migration 0024); 0 rows to read when the view is missing.
    readAll<LessonCount>((from, to) => supabase.from("lesson_status_counts").select("course_id, student_id, status, n").eq("teacher_id", userId).order("course_id").order("student_id").order("status").range(from, to), 50_000),
    supabase.from("homework").select(HOMEWORK_SUMMARY_COLS).eq("teacher_id", userId).order("created_at", { ascending: false }).limit(1000),
    // Every page only needs the unread messages (bell, badges, student list); the messages page loads the threads itself.
    supabase.from("messages").select(MESSAGE_COLS).eq("teacher_id", userId).eq("direction", "incoming").is("read_at", null).order("created_at", { ascending: false }).limit(500),
    readAll<Payment>((from, to) => supabase.from("payments").select(PAYMENT_COLS).eq("teacher_id", userId)
      // The timestamp has "." and ":", which are reserved inside or(): quoted.
      .or(`status.eq.pending,created_at.gte."${paymentsSince}"`)
      .order("created_at", { ascending: false }).order("id").range(from, to), 10_000)
  ]);

  enforceTeacherRole(role);

  // An account created from a student invite that is still a teacher (it never pressed
  // "Acceptă invitația", or signed up before migration 0007): finish the invite now, as long
  // as the account has no teaching data of its own. accept_student_invite re-checks all of it.
  if (role === "teacher" && inviteToken && !students.data?.length && !courses.data?.length && !lessons.data?.length) {
    const { error } = await supabase.rpc("accept_student_invite", { p_token: inviteToken });
    if (!error) redirect("/student");
  }

  const missingTables: Workspace["missingTables"] = [];
  if (homework.error) missingTables.push("homework");
  if (messages.error) missingTables.push("messages");
  if (payments.error) missingTables.push("payments");

  const lessonRows = oldestFirst(lessons.data);
  const p = profile.data as Workspace["profile"];
  return {
    mode: "live",
    userId,
    email,
    isAdmin: role === "admin",
    timezone: p?.timezone || DEFAULT_TZ,
    profile: p,
    teacherProfile: (teacherProfile.data as TeacherProfile | null) ?? null,
    subscription: (subscription.data as Subscription | null) ?? null,
    students: students.data ?? [],
    courses: courses.data ?? [],
    enrollments: enrollments.data ?? [],
    // Loaded newest first, then put back in chronological order.
    lessons: lessonRows,
    lessonWindow: window,
    // Before migration 0024 the totals can only count the lessons that were loaded.
    lessonCounts: counts.error ? countLessons(lessonRows) : (counts.data ?? []).map(c => ({ ...c, n: Number(c.n) })),
    homework: (homework.data as HomeworkSummary[] | null) ?? [],
    messages: oldestFirst(messages.data as Message[] | null),
    payments: (payments.data ?? []).map(p => ({ ...p, amount: Number(p.amount) })),
    missingTables
  };
});

/**
 * The teacher's lessons starting in [from, to) (ISO), oldest first, for dates outside the
 * workspace's lesson window (calendar weeks long ago or far ahead). Inside the window it simply
 * filters the workspace.
 */
export async function loadLessonsBetween(ws: Workspace, from: string, to: string): Promise<Lesson[]> {
  if (ws.mode === "demo" || (from >= ws.lessonWindow.from && to <= ws.lessonWindow.to)) {
    return ws.lessons.filter(l => l.starts_at >= from && l.starts_at < to);
  }
  const { supabase, userId } = await getSession();
  if (!supabase || !userId) return [];
  const read = (cols: string) => readAll<Lesson>((a, b) => supabase.from("lessons").select(cols).eq("teacher_id", userId)
    .gte("starts_at", from).lt("starts_at", to).order("starts_at").order("id").range(a, b) as unknown as PromiseLike<Rows<Lesson>>, 5000);
  const { data } = await withFallback(() => read(`${LESSON_COLS}, series_id`), () => read(LESSON_COLS));
  return data ?? [];
}

/** One lesson of the signed-in teacher, also outside the workspace's window. */
export async function loadLesson(ws: Workspace, id: string): Promise<Lesson | null> {
  const known = ws.lessons.find(l => l.id === id);
  if (known || ws.mode === "demo") return known ?? null;
  const { supabase, userId } = await getSession();
  if (!supabase || !userId || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await withFallback(
    () => supabase.from("lessons").select(`${LESSON_COLS}, series_id`).eq("teacher_id", userId).eq("id", id).maybeSingle(),
    () => supabase.from("lessons").select(LESSON_COLS).eq("teacher_id", userId).eq("id", id).maybeSingle()
  );
  return (data as Lesson | null) ?? null;
}

/** Every payment of the signed-in teacher (newest first): payments page, exports, reports. */
export const loadAllPayments = cache(async (): Promise<Payment[]> => {
  const ws = await loadWorkspace();
  const { supabase, userId } = await getSession();
  if (ws.mode === "demo" || !supabase || !userId) return ws.payments;
  const { data, error } = await readAll<Payment>((from, to) => supabase.from("payments").select(PAYMENT_COLS).eq("teacher_id", userId)
    .order("created_at", { ascending: false }).order("id").range(from, to), 200_000);
  if (error) return ws.payments;
  return (data ?? []).map(p => ({ ...p, amount: Number(p.amount) }));
});

/** Every payment of one student, newest first (student card totals, student report). */
export async function loadStudentPayments(ws: Workspace, studentId: string): Promise<Payment[]> {
  if (ws.mode === "demo") return ws.payments.filter(p => p.student_id === studentId);
  const { supabase, userId } = await getSession();
  if (!supabase || !userId) return [];
  const { data, error } = await readAll<Payment>((from, to) => supabase.from("payments").select(PAYMENT_COLS).eq("teacher_id", userId).eq("student_id", studentId)
    .order("created_at", { ascending: false }).order("id").range(from, to), 20_000);
  if (error) return ws.payments.filter(p => p.student_id === studentId);
  return (data ?? []).map(p => ({ ...p, amount: Number(p.amount) }));
}

/** All lessons of one student: their own and the group lessons of their courses (student report). */
export async function loadStudentLessons(ws: Workspace, studentId: string, courseIds: string[]): Promise<Lesson[]> {
  if (ws.mode === "demo") return ws.lessons.filter(l => l.student_id === studentId || (!l.student_id && l.course_id && courseIds.includes(l.course_id)));
  const { supabase, userId } = await getSession();
  if (!supabase || !userId) return [];
  const ids = courseIds.filter(id => /^[0-9a-f-]{36}$/i.test(id));
  const filter = ids.length ? `student_id.eq.${studentId},and(student_id.is.null,course_id.in.(${ids.join(",")}))` : `student_id.eq.${studentId}`;
  const { data } = await readAll<Lesson>((from, to) => supabase.from("lessons").select(LESSON_COLS).eq("teacher_id", userId).or(filter)
    .order("starts_at").order("id").range(from, to) as unknown as PromiseLike<Rows<Lesson>>, 20_000);
  return data ?? [];
}

/** The signed-in teacher's homework with texts and files (newest 1000), for the homework page. */
export const loadHomework = cache(async (): Promise<Homework[]> => {
  const ws = await loadWorkspace();
  const { supabase, userId } = await getSession();
  if (ws.mode === "demo" || !supabase || !userId) return buildDemoWorkspace().homework;
  const { data } = await supabase.from("homework").select(HOMEWORK_FULL_COLS).eq("teacher_id", userId).order("created_at", { ascending: false }).limit(1000);
  return (data as Homework[] | null) ?? [];
});

/** All conversations of the signed-in teacher, newest 3000 messages, in chronological order. */
export const loadMessages = cache(async (): Promise<Message[]> => {
  const ws = await loadWorkspace();
  const { supabase, userId } = await getSession();
  if (ws.mode === "demo" || !supabase || !userId) return ws.messages;
  const { data } = await readAll<Message>((from, to) => supabase.from("messages").select(MESSAGE_COLS).eq("teacher_id", userId)
    .order("created_at", { ascending: false }).order("id").range(from, to), 3000);
  return oldestFirst(data);
});
