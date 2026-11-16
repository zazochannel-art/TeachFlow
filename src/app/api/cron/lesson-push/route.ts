import { NextResponse, type NextRequest } from "next/server";
import { pushConfigured, pushToUsers, serviceClient } from "@/lib/push/server";
import { DEFAULT_TZ, dateKey, dayRange, formatTime } from "@/lib/time";
import type { T } from "@/lib/i18n/core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type LessonRow = { id: string; teacher_id: string; title: string; starts_at: string; student_id: string | null; course_id: string | null };

/**
 * Lesson push notifications, called with `Authorization: Bearer $CRON_SECRET`.
 * - default (Vercel Cron every morning): "today's lessons" to teachers, students and parents.
 * - `?mode=soon` (optional, from an external scheduler every 5–10 minutes): "starts in N minutes"
 *   for lessons that start within the next 30 minutes, once per lesson (lesson_push_log).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = serviceClient();
  if (!db || !pushConfigured()) return NextResponse.json({ error: "push not configured", missing: ["SUPABASE_SECRET_KEY"] }, { status: 503 });

  const now = new Date();
  const soon = request.nextUrl.searchParams.get("mode") === "soon";
  const from = soon ? now : new Date(now.getTime() - 14 * 3600000);
  const to = new Date(now.getTime() + (soon ? 30 * 60000 : 38 * 3600000));
  const { data, error } = await db.from("lessons").select("id, teacher_id, title, starts_at, student_id, course_id")
    .eq("status", "scheduled").gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at").limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let lessons = (data ?? []) as LessonRow[];

  if (soon && lessons.length) {
    const { data: done, error: logErr } = await db.from("lesson_push_log").select("lesson_id").in("lesson_id", lessons.map(l => l.id));
    if (logErr) return NextResponse.json({ error: "apply supabase/migrations/0013_library_quizzes_reports_push.sql" }, { status: 503 });
    const skip = new Set((done ?? []).map(r => r.lesson_id as string));
    lessons = lessons.filter(l => !skip.has(l.id));
  }

  // Time zone of each teacher; "today" means today where the teacher lives.
  const teacherIds = [...new Set(lessons.map(l => l.teacher_id))];
  const { data: profiles } = teacherIds.length ? await db.from("profiles").select("id, timezone").in("id", teacherIds) : { data: [] };
  const tzOf = new Map((profiles ?? []).map(p => [p.id as string, (p.timezone as string) || DEFAULT_TZ]));
  if (!soon) lessons = lessons.filter(l => {
    const tz = tzOf.get(l.teacher_id) ?? DEFAULT_TZ;
    const { start, end } = dayRange(dateKey(now, tz), tz);
    const at = new Date(l.starts_at);
    return at >= start && at < end;
  });
  if (!lessons.length) return NextResponse.json({ lessons: 0, sent: 0 });

  // Who attends: the lesson's student, or the active students of a group lesson's course.
  const courseIds = [...new Set(lessons.filter(l => !l.student_id && l.course_id).map(l => l.course_id as string))];
  const { data: enrolled } = courseIds.length ? await db.from("course_enrollments").select("course_id, student_id").in("course_id", courseIds).eq("status", "active") : { data: [] };
  const attendees = (l: LessonRow) => l.student_id ? [l.student_id] : (enrolled ?? []).filter(e => e.course_id === l.course_id).map(e => e.student_id as string);
  const studentIds = [...new Set(lessons.flatMap(attendees))];
  const [{ data: students }, { data: parents }] = await Promise.all([
    studentIds.length ? db.from("students").select("id, user_id").in("id", studentIds) : Promise.resolve({ data: [] as Array<{ id: string; user_id: string | null }> }),
    studentIds.length ? db.from("parent_links").select("student_id, user_id").in("student_id", studentIds) : Promise.resolve({ data: [] as Array<{ student_id: string; user_id: string }> })
  ]);
  const userOf = new Map((students ?? []).map(s => [s.id as string, s.user_id as string | null]));

  let sent = 0;
  if (soon) {
    for (const l of lessons) {
      const tz = tzOf.get(l.teacher_id) ?? DEFAULT_TZ;
      const ids = attendees(l);
      const mins = Math.max(1, Math.round((new Date(l.starts_at).getTime() - now.getTime()) / 60000));
      const msg = (url: string) => (t: T) => ({
        title: t("Lecția începe în {n} min", { n: mins }), body: `${formatTime(l.starts_at, tz, t.locale)} · ${l.title}`, url, tag: `lesson-${l.id}`
      });
      sent += (await pushToUsers(db, [l.teacher_id], msg(`/classroom/${l.id}`))).sent;
      sent += (await pushToUsers(db, ids.map(id => userOf.get(id)), msg(`/student/lesson/${l.id}`))).sent;
      await db.from("lesson_push_log").insert({ lesson_id: l.id });
    }
    return NextResponse.json({ lessons: lessons.length, sent });
  }

  // Morning summary: one notification per person with their lessons of today.
  const perUser = new Map<string, { url: string; tz: string; items: LessonRow[] }>();
  const add = (uid: string | null | undefined, url: string, l: LessonRow) => {
    if (!uid) return;
    const e = perUser.get(uid) ?? { url, tz: tzOf.get(l.teacher_id) ?? DEFAULT_TZ, items: [] };
    if (!e.items.some(x => x.id === l.id)) e.items.push(l);
    perUser.set(uid, e);
  };
  for (const l of lessons) {
    add(l.teacher_id, "/calendar", l);
    for (const sid of attendees(l)) {
      add(userOf.get(sid), "/student", l);
      for (const p of (parents ?? []).filter(x => x.student_id === sid)) add(p.user_id, "/parent", l);
    }
  }
  for (const [uid, e] of perUser) {
    const r = await pushToUsers(db, [uid], t => ({
      title: e.url === "/parent" ? t("Lecțiile de azi") : t.n("Azi ai {n} lecție|Azi ai {n} lecții|Azi ai {n} de lecții", e.items.length),
      body: e.items.slice(0, 4).map(l => `${formatTime(l.starts_at, e.tz, t.locale)} ${l.title}`).join(" · "),
      url: e.url, tag: "today"
    }));
    sent += r.sent;
  }
  return NextResponse.json({ lessons: lessons.length, people: perUser.size, sent });
}
