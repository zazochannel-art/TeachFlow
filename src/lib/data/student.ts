import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TZ } from "@/lib/time";
import { buildDemoWorkspace } from "./demo";
import { getT } from "@/lib/i18n/server";
import type { Course, Homework, Lesson, Message, Payment } from "@/types/database";

/** One teacher relationship of the signed-in student (a students row linked to their account). */
export interface StudentLink { studentId: string; teacherId: string; teacherName: string; studentName: string }

export interface StudentPortal {
  mode: "live" | "demo";
  name: string;
  timezone: string;
  links: StudentLink[];
  courses: Course[];
  lessons: Lesson[];
  homework: Homework[];
  messages: Message[];
  payments: Payment[];
}

/**
 * Loads everything a student may see. RLS (migration 0003) limits every query to rows of the
 * students records linked to this account; teachers are sent to their dashboard.
 */
export const loadStudentPortal = cache(async (): Promise<StudentPortal> => {
  const supabase = await createClient();
  if (!supabase) return demoPortal();

  const tr = await getT();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/login?next=/student");

  // The role lookup runs in the same parallel batch as the data (one round trip); RLS already
  // limits the data, and the role is enforced before anything is returned.
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [role, profile, students, courses, lessons, homework, messages, payments] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("full_name, timezone").eq("id", userId).maybeSingle(),
    supabase.from("students").select("id, teacher_id, full_name").eq("user_id", userId),
    supabase.from("courses").select("id, title, description, subject, level, format, price, currency, is_active, created_at").order("title"),
    supabase.from("lessons").select("id, course_id, student_id, title, description, starts_at, ends_at, status, meeting_url").gte("starts_at", since).order("starts_at").limit(500),
    supabase.from("homework").select("id, student_id, course_id, lesson_id, title, description, due_at, status, submitted_at, grade, feedback, created_at, submission").order("created_at", { ascending: false }).limit(300),
    supabase.from("messages").select("id, student_id, direction, body, read_at, created_at").order("created_at").limit(1000),
    supabase.from("payments").select("id, student_id, course_id, amount, currency, status, due_date, paid_at, method, note, created_at").order("created_at", { ascending: false }).limit(300)
  ]);

  if (role.data?.role !== "student") redirect("/dashboard");

  const rows = (students.data ?? []) as Array<{ id: string; teacher_id: string; full_name: string }>;
  const teacherIds = [...new Set(rows.map(r => r.teacher_id))];
  const { data: teachers } = teacherIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", teacherIds)
    : { data: [] as Array<{ id: string; full_name: string }> };
  const teacherName = new Map((teachers ?? []).map(t => [t.id, t.full_name || tr("Profesor")]));

  const p = profile.data as { full_name: string; timezone: string } | null;
  return {
    mode: "live",
    name: p?.full_name || (typeof data?.claims?.email === "string" ? data.claims.email.split("@")[0] : tr("Elev")),
    timezone: p?.timezone || DEFAULT_TZ,
    links: rows.map(r => ({ studentId: r.id, teacherId: r.teacher_id, teacherName: teacherName.get(r.teacher_id) ?? tr("Profesor"), studentName: r.full_name })),
    courses: (courses.data as Course[] | null) ?? [],
    lessons: (lessons.data as Lesson[] | null) ?? [],
    homework: (homework.data as Homework[] | null) ?? [],
    messages: (messages.data as Message[] | null) ?? [],
    payments: ((payments.data as Payment[] | null) ?? []).map(x => ({ ...x, amount: Number(x.amount) }))
  };
});

/** Labelled demo shown only when Supabase is not configured: the portal of the first demo student. */
function demoPortal(): StudentPortal {
  const ws = buildDemoWorkspace();
  const me = ws.students[0];
  const courseIds = new Set(ws.enrollments.filter(e => e.student_id === me.id && e.status === "active").map(e => e.course_id));
  return {
    mode: "demo",
    name: me.full_name,
    timezone: ws.timezone,
    links: [{ studentId: me.id, teacherId: "demo", teacherName: "Profesor Demo", studentName: me.full_name }],
    courses: ws.courses.filter(c => courseIds.has(c.id)),
    lessons: ws.lessons.filter(l => l.student_id === me.id || (!l.student_id && l.course_id && courseIds.has(l.course_id))),
    homework: ws.homework.filter(h => h.student_id === me.id),
    messages: ws.messages.filter(m => m.student_id === me.id),
    payments: ws.payments.filter(p => p.student_id === me.id)
  };
}
