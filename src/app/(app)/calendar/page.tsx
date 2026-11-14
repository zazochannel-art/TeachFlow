import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Video } from "lucide-react";
import { DemoNotice, PageHeader, Pill } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/workspace";
import { currentLesson, lessonsBetween, toSlot } from "@/lib/data/derive";
import { addDays, dateKey, dayRange, formatShortDay, isDateKey, startOfWeek } from "@/lib/time";
import { setLessonStatus } from "../actions";

const statusLabel = { completed: "Finalizată", cancelled: "Anulată", no_show: "Absent" } as const;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ws = await loadWorkspace();
  const { date } = await searchParams;
  const now = new Date();
  const today = dateKey(now, ws.timezone);
  const key = isDateKey(date) ? date : today;
  const monday = startOfWeek(key);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const cur = currentLesson(ws, now);
  const live = ws.mode === "live";

  return (
    <div>
      <PageHeader title="Calendar" subtitle="Săptămâna ta de lecții"
        action={
          <div className="flex items-center gap-2">
            <Link href={`/calendar?date=${addDays(monday, -7)}`} aria-label="Săptămâna anterioară" className="tf-btn-ghost px-3"><ChevronLeft className="h-4 w-4" /></Link>
            <Link href="/calendar" className="tf-btn-ghost">Astăzi</Link>
            <Link href={`/calendar?date=${addDays(monday, 7)}`} aria-label="Săptămâna următoare" className="tf-btn-ghost px-3"><ChevronRight className="h-4 w-4" /></Link>
          </div>
        } />

      <div className="tf-scroll grid gap-3 overflow-x-auto pb-2 lg:grid-cols-7">
        {days.map(day => {
          const { start, end } = dayRange(day, ws.timezone);
          const slots = lessonsBetween(ws, start, end).map(l => toSlot(ws, l, now, cur?.id ?? null));
          const { weekday, day: num } = formatShortDay(day);
          const isToday = day === today;
          return (
            <div key={day} className="min-w-0 rounded-[20px] bg-soft p-3">
              <Link href={`/dashboard?date=${day}`} className="mb-3 flex items-center justify-between px-1">
                <span className={`text-[11px] font-bold ${isToday ? "text-primary" : "text-muted"}`}>{weekday}</span>
                <span className={`grid h-7 w-7 place-items-center rounded-full text-[12px] font-extrabold ${isToday ? "bg-primary text-white" : "text-ink"}`}>{num}</span>
              </Link>
              <div className="space-y-2">
                {slots.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-muted">—</p>}
                {slots.map(s => {
                  const active = s.state === "now" || s.state === "next";
                  const needsStatus = s.state === "past" && s.status === "scheduled";
                  return (
                    <div key={s.id} className={`rounded-2xl p-3 text-[11px] ${active ? "bg-primary text-white shadow-lift" : "bg-white shadow-card"} ${s.status === "cancelled" ? "opacity-60" : ""}`}>
                      <div className={`font-bold ${active ? "text-white/80" : "text-muted"}`}>{s.start} - {s.end}</div>
                      <div className={`mt-0.5 truncate text-[12px] font-extrabold ${s.status === "cancelled" ? "line-through" : ""}`}>{s.title}</div>
                      {s.subtitle && <div className={`truncate ${active ? "text-white/80" : "text-muted"}`}>{s.subtitle}</div>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {s.status !== "scheduled" && <Pill tone={s.status === "completed" ? "green" : s.status === "cancelled" ? "gray" : "red"}>{statusLabel[s.status]}</Pill>}
                        {active && s.meetingUrl && <a href={s.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/80 px-2 py-1 font-bold"><Video className="h-3 w-3" /> Începe</a>}
                        {needsStatus && live && (
                          <form action={setLessonStatus}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="status" value="completed" />
                            <button className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-tint px-2 py-1 font-bold text-primary-2 hover:bg-[#dfe4fb]"><Check className="h-3 w-3" /> Finalizată</button>
                          </form>
                        )}
                        {needsStatus && !live && <Pill tone="amber">Fără status</Pill>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {ws.mode === "demo" && <DemoNotice />}
    </div>
  );
}
