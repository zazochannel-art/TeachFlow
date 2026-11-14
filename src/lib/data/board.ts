import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWorkspace } from "./workspace";
import { loadStudentPortal } from "./student";
import { lessonSubtitle } from "./derive";
import type { Lesson } from "@/types/database";

export interface BoardRoom {
  mode: "live" | "demo";
  lesson: Lesson;
  subtitle: string;
  timezone: string;
  /** Saved board JSON (validated on the client), or null when nothing was drawn yet. */
  board: unknown;
  /** false when migration 0006 (lesson_boards) is not applied yet. */
  boardReady: boolean;
  me: { id: string; name: string; role: "teacher" | "student" };
  /** Auth user id of the lesson's teacher: only their screen share is accepted by students. */
  teacherId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadBoard(lessonId: string) {
  const supabase = await createClient();
  if (!supabase) return { board: null, boardReady: false };
  const { data, error } = await supabase.from("lesson_boards").select("data").eq("lesson_id", lessonId).maybeSingle();
  return { board: data?.data ?? null, boardReady: !error };
}

/** Lesson room for the teacher who owns the lesson. */
export async function loadTeacherRoom(lessonId: string): Promise<BoardRoom> {
  const ws = await loadWorkspace();
  const lesson = ws.lessons.find(l => l.id === lessonId);
  if (!lesson) notFound();
  const me = { id: ws.userId ?? "demo-teacher", name: ws.profile?.full_name || ws.email?.split("@")[0] || "Profesor", role: "teacher" as const };
  const base = { lesson, subtitle: lessonSubtitle(ws, lesson), timezone: ws.timezone, me, teacherId: me.id };
  if (ws.mode === "demo") return { ...base, mode: "demo", board: null, boardReady: false };
  return { ...base, mode: "live", ...(await loadBoard(lessonId)) };
}

/** Lesson room for a student of the lesson (RLS from migration 0003 decides access). */
export async function loadStudentRoom(lessonId: string): Promise<BoardRoom> {
  const portal = await loadStudentPortal();
  const courseTitle = (l: Lesson) => {
    const t = portal.courses.find(c => c.id === l.course_id)?.title;
    return t && t !== l.title ? t : undefined;
  };

  if (portal.mode === "demo") {
    const lesson = portal.lessons.find(l => l.id === lessonId);
    if (!lesson) notFound();
    return {
      mode: "demo", lesson, subtitle: courseTitle(lesson) ?? "", timezone: portal.timezone,
      board: null, boardReady: false, me: { id: "demo-student", name: portal.name, role: "student" }, teacherId: "demo-teacher"
    };
  }

  if (!UUID_RE.test(lessonId)) notFound();
  const supabase = (await createClient())!;
  const [{ data: claims }, { data: lesson }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("lessons").select("id, teacher_id, course_id, student_id, title, description, starts_at, ends_at, status, meeting_url").eq("id", lessonId).maybeSingle()
  ]);
  if (!lesson) notFound();
  const { teacher_id: teacherId, ...l } = lesson as Lesson & { teacher_id: string };
  const teacher = portal.links.find(x => x.studentId === l.student_id)?.teacherName;
  return {
    mode: "live", lesson: l, subtitle: [courseTitle(l), teacher].filter(Boolean).join(" · "), timezone: portal.timezone,
    me: { id: claims?.claims?.sub ?? "student", name: portal.name, role: "student" }, teacherId,
    ...(await loadBoard(lessonId))
  };
}
