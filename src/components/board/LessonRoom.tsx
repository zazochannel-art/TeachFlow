import Link from "next/link";
import { ArrowLeft, Video } from "lucide-react";
import { Whiteboard } from "./Whiteboard";
import { DemoNotice } from "@/components/ui";
import type { BoardRoom } from "@/lib/data/board";
import { formatDate, formatTime } from "@/lib/time";

/** Lesson room: lesson header with the video link, and the shared whiteboard below. */
export function LessonRoom({ room, backHref, backLabel }: { room: BoardRoom; backHref: string; backLabel: string }) {
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
              {formatDate(lesson.starts_at, tz)} · {formatTime(lesson.starts_at, tz)} - {formatTime(lesson.ends_at, tz)}{room.subtitle ? ` · ${room.subtitle}` : ""}
            </p>
          </div>
        </div>
        {lesson.meeting_url ? (
          <a href={lesson.meeting_url} target="_blank" rel="noopener noreferrer" className="tf-btn">
            <Video className="h-4 w-4" fill="currentColor" /> {isTeacher ? "Pornește video" : "Intră în video"}
          </a>
        ) : isTeacher ? (
          <Link href={`/calendar?lesson=${lesson.id}&back=/classroom/${lesson.id}`} className="tf-btn-ghost">Adaugă linkul video</Link>
        ) : (
          <span className="rounded-xl bg-soft px-4 py-2 text-[12px] font-bold text-muted">Linkul video apare aici înainte de lecție</span>
        )}
      </div>

      {room.mode === "live" && !room.boardReady && (
        <p className="mb-4 rounded-[16px] border border-dashed border-[#f0c46b] bg-[#fff8e8] p-4 text-[12px] text-[#7a5208]">
          {isTeacher
            ? <>Tabla partajată nu este activă încă: aplică migrarea <code>supabase/migrations/0004_lesson_whiteboard.sql</code> în Supabase (SQL Editor). Până atunci poți desena, dar desenul nu se salvează și elevul nu îl vede.</>
            : <>Tabla partajată nu este activă încă. Poți desena, dar profesorul nu vede desenul.</>}
        </p>
      )}

      <Whiteboard lessonId={lesson.id} initial={room.board} live={live} me={room.me} title={lesson.title} />

      <p className="mt-3 text-[11px] text-muted">
        {isTeacher
          ? "Elevii lecției văd tabla în timp real din portalul lor și pot desena și ei. Video-ul se deschide într-o filă nouă: așază fereastra video lângă tablă sau partajează ecranul cu tabla."
          : "Tabla este comună cu profesorul: vezi în timp real ce scrie și poți desena și tu."}
      </p>
      {room.mode === "demo" && <DemoNotice />}
    </div>
  );
}
