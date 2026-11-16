import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWorkspace } from "./workspace";
import { loadStudentPortal } from "./student";
import { lessonSubtitle } from "./derive";
import type { Lesson } from "@/types/database";
import { callTransport, type CallTransport } from "@/lib/call/tokens";

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
  /** Who may draw on the board (migration 0019). */
  access: BoardAccess;
  /** How the lesson's call carries media: P2P (1:1) or the LiveKit SFU (group lessons, when configured). */
  transport: CallTransport;
}

export interface BoardAccess {
  /** false before migration 0019 (and in demo mode): everybody in the lesson draws, as before. */
  ready: boolean;
  /** Auth user ids of the students the teacher allowed to draw. */
  writers: string[];
  /** The lesson's students, for the teacher's access list (empty for students). */
  students: { userId: string | null; name: string }[];
  /** false before migration 0021 (and in demo mode): everybody may share the screen in the call, as before. */
  shareReady: boolean;
  /** Auth user ids of the students the teacher allowed to share their screen in the call. */
  sharers: string[];
}

const NO_ACCESS: BoardAccess = { ready: false, writers: [], students: [], shareReady: false, sharers: [] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadBoard(lessonId: string) {
  const supabase = await createClient();
  if (!supabase) return { board: null, boardReady: false, access: NO_ACCESS };
  const [{ data, error }, writers, sharers] = await Promise.all([
    supabase.from("lesson_boards").select("data").eq("lesson_id", lessonId).maybeSingle(),
    supabase.from("lesson_board_access").select("user_id").eq("lesson_id", lessonId),
    supabase.from("lesson_screen_access").select("user_id").eq("lesson_id", lessonId)
  ]);
  const ids = (rows: unknown) => ((rows as { user_id: string }[] | null) ?? []).map(r => r.user_id);
  const access: BoardAccess = {
    ready: !writers.error, writers: writers.error ? [] : ids(writers.data), students: [],
    shareReady: !sharers.error, sharers: sharers.error ? [] : ids(sharers.data)
  };
  return { board: data?.data ?? null, boardReady: !error, access };
}

/** Lesson room for the teacher who owns the lesson. */
export async function loadTeacherRoom(lessonId: string): Promise<BoardRoom> {
  const ws = await loadWorkspace();
  const lesson = ws.lessons.find(l => l.id === lessonId);
  if (!lesson) notFound();
  const me = { id: ws.userId ?? "demo-teacher", name: ws.profile?.full_name || ws.email?.split("@")[0] || "Profesor", role: "teacher" as const };
  const base = { lesson, subtitle: lessonSubtitle(ws, lesson), timezone: ws.timezone, me, teacherId: me.id, transport: callTransport(lesson) };
  const ids = lesson.student_id
    ? [lesson.student_id]
    : ws.enrollments.filter(e => e.course_id === lesson.course_id && (e.status === "active" || e.status === "paused")).map(e => e.student_id);
  const students = ws.students.filter(s => ids.includes(s.id)).map(s => ({ userId: s.user_id ?? null, name: s.full_name }));
  if (ws.mode === "demo") return { ...base, mode: "demo", board: null, boardReady: false, access: { ...NO_ACCESS, students } };
  const loaded = await loadBoard(lessonId);
  return { ...base, mode: "live", ...loaded, access: { ...loaded.access, students } };
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
      board: null, boardReady: false, access: NO_ACCESS, me: { id: "demo-student", name: portal.name, role: "student" }, teacherId: "demo-teacher", transport: "p2p"
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
    me: { id: claims?.claims?.sub ?? "student", name: portal.name, role: "student" }, teacherId, transport: callTransport(l),
    ...(await loadBoard(lessonId))
  };
}
