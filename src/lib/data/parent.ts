import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TZ } from "@/lib/time";
import { buildDemoWorkspace } from "./demo";
import { oldestFirst } from "./rows";
import { getT } from "@/lib/i18n/server";
import { pendingInviteToken } from "@/lib/invite-token";
import type { Course, Enrollment, Homework, Lesson, Message, Payment } from "@/types/database";

/** One child of the signed-in parent (a students row of one teacher). */
export interface ParentChild {
  studentId: string;
  teacherId: string;
  teacherName: string;
  name: string;
  avatarUrl: string | null;
  gradeLevel: string | null;
  birthDate: string | null;
}

export interface ParentPortal {
  mode: "live" | "demo";
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  children: ParentChild[];
  courses: Course[];
  enrollments: Enrollment[];
  lessons: Lesson[];
  homework: Homework[];
  messages: Message[];
  payments: Payment[];
}

/**
 * Loads everything a parent may see (migration 0012). RLS limits every query to the rows of the
 * children linked to this account; other roles are sent to their own home.
 */
export const loadParentPortal = cache(async (): Promise<ParentPortal> => {
  const supabase = await createClient();
  if (!supabase) return demoPortal();

  const tr = await getT();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/login?next=/parent");

  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const [role, profile, children, courses, enrollments, lessons, homework, messages, payments] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("full_name, timezone, avatar_url").eq("id", userId).maybeSingle(),
    supabase.rpc("parent_children"),
    supabase.from("courses").select("id, title, description, subject, level, format, price, currency, is_active, created_at, color").order("title"),
    supabase.from("course_enrollments").select("id, course_id, student_id, enrolled_at, status"),
    supabase.from("lessons").select("id, course_id, student_id, title, description, starts_at, ends_at, status, meeting_url").gte("starts_at", since).order("starts_at").limit(800),
    supabase.from("homework").select("id, student_id, course_id, lesson_id, title, description, due_at, status, submitted_at, grade, feedback, created_at, attachments, submission_files").order("created_at", { ascending: false }).limit(400),
    supabase.from("messages").select("id, student_id, direction, body, read_at, created_at, channel, author_id").eq("channel", "parent").order("created_at", { ascending: false }).limit(1000),
    supabase.from("payments").select("id, student_id, course_id, amount, currency, status, due_date, paid_at, method, note, created_at").order("created_at", { ascending: false }).limit(400)
  ]);

  const r = role.data?.role as string | undefined;
  if (r === "student") redirect("/student");
  if (r !== "parent") redirect("/dashboard");

  type Row = { student_id: string; teacher_id: string; teacher_name: string; full_name: string; avatar_url: string | null; grade_level: string | null; birth_date: string | null };
  const rows = (Array.isArray(children.data) ? children.data : []) as Row[];

  // Signed up from a parent invite but not linked yet: link now instead of showing an empty portal.
  const inviteToken = pendingInviteToken(data?.claims);
  if (!rows.length && inviteToken) {
    const accepted = await supabase.rpc("accept_parent_invite", { p_token: inviteToken });
    if (!accepted.error) redirect("/parent");
  }

  const p = profile.data as { full_name: string; timezone: string; avatar_url: string | null } | null;
  return {
    mode: "live",
    userId,
    name: p?.full_name || (typeof data?.claims?.email === "string" ? data.claims.email.split("@")[0] : tr("Părinte")),
    avatarUrl: p?.avatar_url ?? null,
    timezone: p?.timezone || DEFAULT_TZ,
    children: rows.map(c => ({ studentId: c.student_id, teacherId: c.teacher_id, teacherName: c.teacher_name || tr("Profesor"), name: c.full_name, avatarUrl: c.avatar_url, gradeLevel: c.grade_level, birthDate: c.birth_date })),
    courses: (courses.data as Course[] | null) ?? [],
    enrollments: (enrollments.data as Enrollment[] | null) ?? [],
    lessons: (lessons.data as Lesson[] | null) ?? [],
    homework: (homework.data as Homework[] | null) ?? [],
    messages: oldestFirst(messages.data as Message[] | null),
    payments: ((payments.data as Payment[] | null) ?? []).map(x => ({ ...x, amount: Number(x.amount) }))
  };
});

/** Labelled demo shown only when Supabase is not configured: the parent of the first demo student. */
function demoPortal(): ParentPortal {
  const ws = buildDemoWorkspace();
  const kid = ws.students[0];
  const courseIds = new Set(ws.enrollments.filter(e => e.student_id === kid.id && e.status === "active").map(e => e.course_id));
  return {
    mode: "demo",
    userId: null,
    name: "Părinte Demo",
    avatarUrl: null,
    timezone: ws.timezone,
    children: [{ studentId: kid.id, teacherId: "demo", teacherName: "Profesor Demo", name: kid.full_name, avatarUrl: null, gradeLevel: null, birthDate: null }],
    courses: ws.courses.filter(c => courseIds.has(c.id)),
    enrollments: ws.enrollments.filter(e => e.student_id === kid.id),
    lessons: ws.lessons.filter(l => l.student_id === kid.id || (!l.student_id && l.course_id && courseIds.has(l.course_id))),
    homework: ws.homework.filter(h => h.student_id === kid.id),
    messages: [],
    payments: ws.payments.filter(p => p.student_id === kid.id)
  };
}

/** Lessons of one child: their individual lessons plus group lessons of the courses they attend. */
export function lessonsOfChild(p: Pick<ParentPortal, "lessons" | "enrollments">, studentId: string) {
  const courseIds = new Set(p.enrollments.filter(e => e.student_id === studentId && e.status !== "completed").map(e => e.course_id));
  return p.lessons.filter(l => l.student_id === studentId || (!l.student_id && l.course_id != null && courseIds.has(l.course_id)));
}
