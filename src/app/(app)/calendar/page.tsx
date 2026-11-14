import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Plus, Video } from "lucide-react";
import { DemoNotice, PageHeader, Panel, Pill } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { LessonForm } from "@/components/LessonForm";
import { loadWorkspace } from "@/lib/data/workspace";
import { currentLesson, lessonsBetween, toSlot } from "@/lib/data/derive";
import { deleteLesson, setLessonStatus } from "@/lib/actions/lessons";
import { getT } from "@/lib/i18n/server";
import { addDays, dateKey, dayRange, formatDayHeading, formatShortDay, formatTime, isDateKey, startOfWeek } from "@/lib/time";

const statusLabel = { scheduled: "Programată", completed: "Finalizată", cancelled: "Anulată", no_show: "Absent" } as const;
const statusTone = { scheduled: "blue", completed: "green", cancelled: "gray", no_show: "red" } as const;

type Params = { date?: string; new?: string; lesson?: string; course?: string; back?: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [ws, t] = await Promise.all([loadWorkspace(), getT()]);
  const sp = await searchParams;
  const now = new Date();
  const today = dateKey(now, ws.timezone);
  const selected = sp.lesson ? ws.lessons.find(l => l.id === sp.lesson) : undefined;
  const key = isDateKey(sp.date) ? sp.date : selected ? dateKey(new Date(selected.starts_at), ws.timezone) : today;
  const monday = startOfWeek(key);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const cur = currentLesson(ws, now);
  const live = ws.mode === "live";
  const back = sp.back?.startsWith("/") ? sp.back : undefined;
  const self = `/calendar${key === today ? "" : `?date=${key}`}`;
  const weekLabel = `${formatDayHeading(monday, t.locale).rest.replace(/ \d{4}$/, "")} – ${formatDayHeading(addDays(monday, 6), t.locale).rest}`;

  return (
    <div>
      <PageHeader title={t("Calendar")} subtitle={weekLabel}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/calendar?date=${addDays(monday, -7)}`} aria-label={t("Săptămâna anterioară")} className="tf-btn-ghost px-3"><ChevronLeft className="h-4 w-4" /></Link>
            <Link href="/calendar" className="tf-btn-ghost">{t("Astăzi")}</Link>
            <Link href={`/calendar?date=${addDays(monday, 7)}`} aria-label={t("Săptămâna următoare")} className="tf-btn-ghost px-3"><ChevronRight className="h-4 w-4" /></Link>
            <Link href={`/calendar?new=1&date=${key}`} className="tf-btn"><Plus className="h-4 w-4" /> {t("Lecție nouă")}</Link>
          </div>
        } />

      {sp.new && (
        <Panel title={t("Programează o lecție")} closeHref={self}>
          <LessonForm ws={ws} date={key < today ? today : key} courseId={sp.course} back={back} />
        </Panel>
      )}
      {selected && (
        <Panel title={`${selected.title} · ${formatTime(selected.starts_at, ws.timezone, t.locale)}`} closeHref={back ?? self} aside={
          <form action={deleteLesson}><input type="hidden" name="id" value={selected.id} /><ConfirmSubmit label={t("Șterge")} confirm={t("Șterge lecția")} className="py-1.5" /></form>
        }>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-bold text-muted">{t("Status")}:</span>
            {!live && <Pill tone={statusTone[selected.status]}>{t(statusLabel[selected.status])}</Pill>}
            {live && (["scheduled", "completed", "no_show", "cancelled"] as const).map(st => (
              <form key={st} action={setLessonStatus}>
                <input type="hidden" name="id" value={selected.id} />
                <input type="hidden" name="status" value={st} />
                <SubmitButton className={`rounded-xl px-3 py-1.5 text-[12px] font-bold ${selected.status === st ? "bg-primary text-white" : "bg-soft text-ink hover:bg-tint"}`}>{t(statusLabel[st])}</SubmitButton>
              </form>
            ))}
          </div>
          <LessonForm ws={ws} lesson={selected} date={key} back={back} />
        </Panel>
      )}

      <div className="tf-scroll grid gap-3 overflow-x-auto pb-2 lg:grid-cols-7">
        {days.map(day => {
          const { start, end } = dayRange(day, ws.timezone);
          const slots = lessonsBetween(ws, start, end).map(l => toSlot(ws, l, now, cur?.id ?? null, t));
          const { weekday, day: num } = formatShortDay(day, t.locale);
          const isToday = day === today;
          return (
            <div key={day} className="min-w-0 rounded-[20px] bg-soft p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <Link href={`/dashboard?date=${day}`} className={`text-[11px] font-bold ${isToday ? "text-primary" : "text-muted"}`}>{weekday}</Link>
                <span className={`grid h-7 w-7 place-items-center rounded-full text-[12px] font-extrabold ${isToday ? "bg-primary text-white" : "text-ink"}`}>{num}</span>
              </div>
              <div className="space-y-2">
                {slots.map(s => {
                  const active = s.state === "now" || s.state === "next";
                  const needsStatus = s.state === "past" && s.status === "scheduled";
                  return (
                    <div key={s.id} className={`rounded-2xl text-[11px] transition-shadow ${active ? "bg-primary text-white shadow-lift" : "bg-white shadow-card hover:shadow-md"} ${s.status === "cancelled" ? "opacity-60" : ""} ${selected?.id === s.id ? "ring-2 ring-primary" : ""}`}>
                      <Link href={`/calendar?date=${day}&lesson=${s.id}`} className="block p-3 pb-2">
                        <div className={`font-bold ${active ? "text-white/80" : "text-muted"}`}>{s.start} - {s.end}</div>
                        <div className={`mt-0.5 truncate text-[12px] font-extrabold ${s.status === "cancelled" ? "line-through" : ""}`}>{s.title}</div>
                        {s.subtitle && <div className={`truncate ${active ? "text-white/80" : "text-muted"}`}>{s.subtitle}</div>}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3">
                        {s.status !== "scheduled" && <Pill tone={statusTone[s.status]}>{t(statusLabel[s.status])}</Pill>}
                        {active && s.meetingUrl && <a href={s.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/80 px-2 py-1 font-bold"><Video className="h-3 w-3" /> {t("Începe")}</a>}
                        {needsStatus && live && (
                          <form action={setLessonStatus}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="status" value="completed" />
                            <SubmitButton className="inline-flex items-center gap-1 rounded-lg bg-tint px-2 py-1 font-bold text-primary-2 hover:bg-[#dfe4fb]"><Check className="h-3 w-3" /> {t("Finalizată")}</SubmitButton>
                          </form>
                        )}
                        {needsStatus && !live && <Pill tone="amber">{t("Fără status")}</Pill>}
                      </div>
                    </div>
                  );
                })}
                <Link href={`/calendar?new=1&date=${day}`} aria-label={t("Adaugă lecție · {day}", { day: `${weekday} ${num}` })}
                  className="flex items-center justify-center rounded-2xl border border-dashed border-[#d5d9ef] py-2 text-muted hover:border-primary hover:text-primary">
                  <Plus className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      {ws.mode === "demo" && <DemoNotice />}
    </div>
  );
}
