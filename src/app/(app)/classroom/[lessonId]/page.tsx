import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCog, Check, ClipboardList, UserX } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { LessonRoom } from "@/components/board/LessonRoom";
import { loadTeacherRoom } from "@/lib/data/board";
import { loadWorkspace, type Workspace } from "@/lib/data/workspace";
import { setLessonStatus } from "@/lib/actions/lessons";
import { Avatar, Pill } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { dateKey } from "@/lib/time";
import type { Lesson } from "@/types/database";
import type { T } from "@/lib/i18n/core";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t("Tabla lecției")} · TeachFlow` };
}

export default async function TeacherLessonRoom({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const [t, room, ws] = await Promise.all([getT(), loadTeacherRoom(lessonId), loadWorkspace()]);
  return <LessonRoom room={room} backHref="/classroom" backLabel={t("Înapoi la lecții online")} toolbar={<LessonBar ws={ws} lesson={room.lesson} t={t} />} />;
}

const statusLabel = { scheduled: "Programată", completed: "Finalizată", cancelled: "Anulată", no_show: "Absent" } as const;
const statusTone = { scheduled: "blue", completed: "green", cancelled: "gray", no_show: "red" } as const;

/** Who is in the lesson, its status, and the follow-up actions, without leaving the room. */
function LessonBar({ ws, lesson, t }: { ws: Workspace; lesson: Lesson; t: T }) {
  const ids = lesson.student_id
    ? [lesson.student_id]
    : ws.enrollments.filter(e => e.course_id === lesson.course_id && e.status === "active").map(e => e.student_id);
  const people = ids.map(id => ws.students.find(s => s.id === id)).filter(Boolean) as Workspace["students"];
  const live = ws.mode === "live";
  const homeworkHref = lesson.student_id ? `/homework?new=1&student=${lesson.student_id}` : lesson.course_id ? `/homework?new=1&course=${lesson.course_id}` : "/homework?new=1";
  const editHref = `/calendar?date=${dateKey(new Date(lesson.starts_at), ws.timezone)}&lesson=${lesson.id}&back=/classroom/${lesson.id}`;
  const btn = "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[20px] border border-line/70 bg-white p-3 pl-4 shadow-card">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0 text-[11px] font-bold text-muted">{t("Participanți")}</span>
        {people.length === 0 && <span className="text-[12px] text-muted">{t("Niciun elev înscris")}</span>}
        <div className="tf-scroll flex min-w-0 gap-2 overflow-x-auto">
          {people.map(s => (
            <Link key={s.id} href={`/students?edit=${s.id}`} className="flex shrink-0 items-center gap-1.5 rounded-full bg-soft py-1 pl-1 pr-3 text-[12px] font-bold hover:bg-tint">
              <Avatar name={s.full_name} size={24} />{s.full_name.split(" ")[0]}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {lesson.status !== "scheduled" && <Pill tone={statusTone[lesson.status]}>{t(statusLabel[lesson.status])}</Pill>}
        {live && lesson.status === "scheduled" && (
          <>
            <form action={setLessonStatus}><input type="hidden" name="id" value={lesson.id} /><input type="hidden" name="status" value="completed" />
              <SubmitButton className={`${btn} bg-primary text-white hover:bg-primary-2`}><Check className="h-3.5 w-3.5" /> {t("Lecție ținută")}</SubmitButton>
            </form>
            <form action={setLessonStatus}><input type="hidden" name="id" value={lesson.id} /><input type="hidden" name="status" value="no_show" />
              <SubmitButton className={`${btn} bg-soft text-ink hover:bg-tint`}><UserX className="h-3.5 w-3.5" /> {t("Absent")}</SubmitButton>
            </form>
          </>
        )}
        <Link href={homeworkHref} className={`${btn} bg-soft text-ink hover:bg-tint`}><ClipboardList className="h-3.5 w-3.5" /> {t("Dă temă")}</Link>
        <Link href={editHref} aria-label={t("Editează lecția")} title={t("Editează lecția")} className={`${btn} bg-soft text-ink hover:bg-tint`}><CalendarCog className="h-3.5 w-3.5" /></Link>
      </div>
    </div>
  );
}
