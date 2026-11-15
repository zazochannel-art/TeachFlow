import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clip, pushConfigured, pushToUsers, serviceClient } from "./server";
import { formatDate, formatTime, DEFAULT_TZ } from "@/lib/time";
import type { T } from "@/lib/i18n/core";

/**
 * Push notifications for app events. Each helper runs after the response is sent (next/server
 * `after`), so a slow push service never delays the page, and does nothing when push is not
 * configured. Recipients are looked up with the secret key; ids come from rows the caller
 * already wrote through RLS.
 */
function later(job: (db: SupabaseClient) => Promise<unknown>) {
  if (!pushConfigured()) return;
  const db = serviceClient();
  if (!db) return;
  const run = () => job(db).catch(e => console.error("notify failed", e instanceof Error ? e.message : e));
  try { after(run); } catch { void run(); }
}

async function studentUsers(db: SupabaseClient, studentIds: string[]) {
  if (!studentIds.length) return [];
  const { data } = await db.from("students").select("user_id").in("id", studentIds);
  return (data ?? []).map(r => r.user_id as string | null);
}

async function parentUsers(db: SupabaseClient, studentIds: string[]) {
  if (!studentIds.length) return [];
  const { data } = await db.from("parent_links").select("user_id").in("student_id", studentIds);
  return (data ?? []).map(r => r.user_id as string);
}

async function teacherTz(db: SupabaseClient, teacherId: string) {
  const { data } = await db.from("profiles").select("timezone").eq("id", teacherId).maybeSingle();
  return (data?.timezone as string | undefined) || DEFAULT_TZ;
}

/** New homework for these students. */
export function notifyHomeworkAssigned(studentIds: string[], title: string) {
  later(async db => pushToUsers(db, await studentUsers(db, studentIds), t => ({
    title: t("Temă nouă"), body: clip(title), url: "/student#teme", tag: "homework"
  })));
}

/** A student handed in homework: tell the teacher. */
export function notifyHomeworkSubmitted(homeworkId: string) {
  later(async db => {
    const { data: h } = await db.from("homework").select("teacher_id, title, student_id").eq("id", homeworkId).maybeSingle();
    if (!h) return;
    const { data: s } = await db.from("students").select("full_name").eq("id", h.student_id).maybeSingle();
    return pushToUsers(db, [h.teacher_id], t => ({
      title: t("Temă predată"), body: clip(`${s?.full_name ?? t("Elev")} · ${h.title}`), url: "/homework?status=submitted", tag: "homework-review"
    }));
  });
}

/** The teacher reviewed homework: tell the student. */
export function notifyHomeworkReviewed(homeworkId: string) {
  later(async db => {
    const { data: h } = await db.from("homework").select("title, student_id, grade, status").eq("id", homeworkId).maybeSingle();
    if (!h || h.status !== "reviewed") return;
    return pushToUsers(db, await studentUsers(db, [h.student_id]), t => ({
      title: t("Tema ta a fost verificată"), body: clip(h.grade ? `${h.title} · ${t("Nota: {grade}", { grade: h.grade })}` : h.title), url: "/student#teme", tag: "homework"
    }));
  });
}

/** A message in a conversation; `from` says who wrote it. */
export function notifyMessage(m: { studentId: string; from: "teacher" | "student" | "parent"; channel: "student" | "parent"; body: string }) {
  later(async db => {
    const { data: s } = await db.from("students").select("teacher_id, full_name, user_id").eq("id", m.studentId).maybeSingle();
    if (!s) return;
    if (m.from === "teacher") {
      const { data: p } = await db.from("profiles").select("full_name").eq("id", s.teacher_id).maybeSingle();
      const recipients = m.channel === "parent" ? await parentUsers(db, [m.studentId]) : [s.user_id as string | null];
      const url = m.channel === "parent" ? "/parent/messages" : "/student/messages";
      return pushToUsers(db, recipients, t => ({ title: p?.full_name || t("Profesor"), body: clip(m.body), url, tag: `msg-${m.studentId}` }));
    }
    const url = `/messages?student=${m.studentId}${m.channel === "parent" ? "&with=parent" : ""}`;
    return pushToUsers(db, [s.teacher_id], t => ({
      title: m.from === "parent" ? t("Părintele lui {name}", { name: s.full_name }) : s.full_name,
      body: clip(m.body), url, tag: `msg-${m.studentId}-${m.channel}`
    }));
  });
}

/** New quiz for these students. */
export function notifyQuizAssigned(studentIds: string[], title: string) {
  later(async db => pushToUsers(db, await studentUsers(db, studentIds), t => ({
    title: t("Test nou"), body: clip(title), url: "/student/quizzes", tag: "quiz"
  })));
}

/** A student finished a quiz: tell the teacher the score. */
export function notifyQuizSubmitted(assignmentId: string) {
  later(async db => {
    const { data: a } = await db.from("quiz_assignments").select("teacher_id, title, student_id, score, max_score, quiz_id").eq("id", assignmentId).maybeSingle();
    if (!a) return;
    const { data: s } = await db.from("students").select("full_name").eq("id", a.student_id).maybeSingle();
    return pushToUsers(db, [a.teacher_id], t => ({
      title: t("Test rezolvat"), body: clip(`${s?.full_name ?? t("Elev")} · ${a.title} · ${Number(a.score)}/${Number(a.max_score)}`), url: `/quizzes?view=${a.quiz_id}`, tag: "quiz-result"
    }));
  });
}

/** Lessons were scheduled, changed or cancelled: tell their students (group lessons: the course's students). */
export function notifyLessons(lessonIds: string[], kind: "new" | "cancelled") {
  later(async db => {
    if (!lessonIds.length) return;
    const { data: lessons } = await db.from("lessons").select("id, teacher_id, title, starts_at, student_id, course_id").in("id", lessonIds).order("starts_at");
    if (!lessons?.length) return;
    const first = lessons[0];
    const tz = await teacherTz(db, first.teacher_id);
    const studentIds = new Set<string>();
    for (const l of lessons) if (l.student_id) studentIds.add(l.student_id);
    const courseIds = [...new Set(lessons.filter(l => !l.student_id && l.course_id).map(l => l.course_id as string))];
    if (courseIds.length) {
      const { data: en } = await db.from("course_enrollments").select("student_id").in("course_id", courseIds).eq("status", "active");
      for (const e of en ?? []) studentIds.add(e.student_id as string);
    }
    const build = (url: string) => (t: T) => {
      const when = `${formatDate(first.starts_at, tz, t.locale)}, ${formatTime(first.starts_at, tz, t.locale)}`;
      const more = lessons.length > 1 ? ` · ${t.n("+{n} lecție|+{n} lecții|+{n} de lecții", lessons.length - 1)}` : "";
      return kind === "new"
        ? { title: t("Lecție programată"), body: clip(`${first.title} · ${when}${more}`), url, tag: "lesson" }
        : { title: t("Lecție anulată"), body: clip(`${first.title} · ${when}`), url, tag: "lesson" };
    };
    const ids = [...studentIds];
    await pushToUsers(db, await studentUsers(db, ids), build("/student"));
    return pushToUsers(db, await parentUsers(db, ids), build("/parent"));
  });
}
