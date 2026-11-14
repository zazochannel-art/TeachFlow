import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Whiteboard } from "./Whiteboard";
import { ScreenShare } from "./ScreenShare";
import { VideoCall } from "./VideoCall";
import { DemoNotice } from "@/components/ui";
import type { BoardRoom } from "@/lib/data/board";
import { formatDate, formatTime } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

/** Lesson room: built-in video call, the teacher's screen share and the shared whiteboard. */
export async function LessonRoom({ room, backHref, backLabel }: { room: BoardRoom; backHref: string; backLabel: string }) {
  const t = await getT();
  const { lesson, timezone: tz } = room;
  const isTeacher = room.me.role === "teacher";
  const live = room.mode === "live" && room.boardReady;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={backHref} aria-label={backLabel} title={backLabel} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-soft text-muted hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-extrabold tracking-tight text-ink">{lesson.title}</h1>
            <p className="truncate text-[13px] text-muted">
              {formatDate(lesson.starts_at, tz, t.locale)} · {formatTime(lesson.starts_at, tz, t.locale)} - {formatTime(lesson.ends_at, tz, t.locale)}{room.subtitle ? ` · ${room.subtitle}` : ""}
            </p>
          </div>
        </div>
        {lesson.meeting_url && (
          <a href={lesson.meeting_url} target="_blank" rel="noopener noreferrer" className="tf-btn-ghost" title={t("Linkul extern salvat la lecție (Zoom, Meet…)")}>
            <ExternalLink className="h-4 w-4" /> {t("Link extern")}
          </a>
        )}
      </div>

      {room.mode === "live" && !room.boardReady && (
        <p className="mb-4 rounded-[16px] border border-dashed border-[#f0c46b] bg-[#fff8e8] p-4 text-[12px] text-[#7a5208]">
          {isTeacher
            ? <>{t("Tabla partajată nu este activă încă: aplică migrarea")} <code>supabase/migrations/0006_lesson_whiteboard.sql</code> {t("în Supabase (SQL Editor). Până atunci apelul video, tabla și ecranul partajat funcționează doar la tine.")}</>
            : t("Sala online nu este activă încă: apelul video și tabla nu ajung la profesor. Anunță-l pe profesor.")}
        </p>
      )}

      <VideoCall lessonId={lesson.id} live={live} me={room.me} teacherId={room.teacherId} />

      <ScreenShare lessonId={lesson.id} live={live} me={room.me} teacherId={room.teacherId} />

      <Whiteboard lessonId={lesson.id} initial={room.board} live={live} me={room.me} title={lesson.title} />

      <p className="mt-3 text-[11px] text-muted">
        {isTeacher
          ? t("Elevii intră în apel și văd tabla din pagina lecției din portalul lor. Pot desena și ei pe tablă. Cu „Partajează ecranul” elevii văd ecranul tău deasupra tablei.")
          : t("Apelul video și tabla sunt comune cu profesorul: vezi în timp real ce scrie și poți desena și tu. Când profesorul îți partajează ecranul, îl vezi deasupra tablei.")}
      </p>
      {room.mode === "demo" && <DemoNotice />}
    </div>
  );
}
