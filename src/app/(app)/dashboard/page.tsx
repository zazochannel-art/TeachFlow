import Link from "next/link";
import { CourseTile, CreateCourseTile, DemoNotice, EmptyNote, FeedCard, SectionTitle } from "@/components/ui";
import { Timetable } from "@/components/Timetable";
import { GettingStarted, gettingStartedSteps } from "@/components/GettingStarted";
import { loadWorkspace } from "@/lib/data/workspace";
import { colorOf, courseCards, currentLesson, daySlots, lessonSubtitle, notifications, tasks } from "@/lib/data/derive";
import { dateKey, formatShortDay, formatTime, isDateKey } from "@/lib/time";
import { NextLessonHero, type HeroLesson } from "@/components/NextLessonHero";
import type { Workspace } from "@/lib/data/workspace";
import type { T } from "@/lib/i18n/core";

/** The lesson in progress, otherwise the next scheduled one (today or later). */
function heroLesson(ws: Workspace, now: Date, t: T): HeroLesson | null {
  const l = currentLesson(ws, now)
    ?? ws.lessons.find(x => x.status === "scheduled" && new Date(x.starts_at) > now);
  if (!l) return null;
  const tz = ws.timezone;
  const day = dateKey(new Date(l.starts_at), tz);
  const today = dateKey(now, tz);
  const time = `${formatTime(l.starts_at, tz, t.locale)} - ${formatTime(l.ends_at, tz, t.locale)}`;
  const { weekday, day: num } = formatShortDay(day, t.locale);
  const studentIds = l.student_id
    ? [l.student_id]
    : ws.enrollments.filter(e => e.course_id === l.course_id && e.status === "active").map(e => e.student_id);
  return {
    id: l.id, title: l.title, subtitle: lessonSubtitle(ws, l), startsAt: l.starts_at, endsAt: l.ends_at,
    when: day === today ? time : `${weekday} ${num}, ${time}`,
    color: colorOf(ws, l.course_id),
    people: studentIds.map(id => ws.students.find(s => s.id === id)).filter(s => s != null).map(s => ({ name: s.full_name, src: s.avatar_url ?? null }))
  };
}

function greeting(now: Date, tz: string, t: T, name: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));
  const first = name.split(" ")[0];
  const hello = h < 12 ? t("Bună dimineața") : h < 18 ? t("Bună ziua") : t("Bună seara");
  return first ? `${hello}, ${first}` : hello;
}
import { getT } from "@/lib/i18n/server";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [ws, t] = await Promise.all([loadWorkspace(), getT()]);
  const { date } = await searchParams;
  const now = new Date();
  const key = isDateKey(date) ? date : dateKey(now, ws.timezone);

  const cards = courseCards(ws);
  const slots = daySlots(ws, key, now, t);
  const notes = notifications(ws, now, t, true);
  const todo = tasks(ws, now, t);
  const hero = heroLesson(ws, now, t);
  const hello = greeting(now, ws.timezone, t, ws.profile?.full_name || (ws.mode === "demo" ? "" : ws.email?.split("@")[0] ?? ""));

  // Layout: on wide screens the timetable is a separate right column; on phones and tablets
  // it comes right after the course tiles, because "what do I teach today" is the first question.
  return (
    <div className="grid flex-1 content-start gap-7 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[auto_1fr] xl:gap-x-8">
      <section className="min-w-0 xl:col-start-1 xl:row-start-1">
        {ws.mode === "live" && <GettingStarted steps={gettingStartedSteps(ws)} />}
        <NextLessonHero lesson={hero} greeting={hello} />
        <SectionTitle action={cards.length > 4 ? <Link href="/courses" className="text-[11px] font-bold text-primary">{t("Vezi toate")}</Link> : undefined}>
          {t("Cursurile și grupele tale")}
        </SectionTitle>
        <div className="tf-scroll -mx-4 grid auto-cols-[minmax(150px,46%)] grid-flow-col gap-3 overflow-x-auto px-4 pb-1 sm:auto-cols-[minmax(150px,calc((100%-3rem)/4))] md:mx-0 md:gap-4 md:px-0 2xl:auto-cols-[minmax(140px,calc((100%-4rem)/5))]">
          {cards.map((card, i) => <CourseTile key={card.id} card={card} index={i} />)}
          <CreateCourseTile />
        </div>
      </section>

      {/* Timetable */}
      <section className="flex min-h-0 min-w-0 flex-col xl:col-start-2 xl:row-span-2 xl:row-start-1">
        <SectionTitle action={<Link href="/calendar" className="text-[11px] font-bold text-primary">{t("Deschide calendarul")}</Link>}>{t("Orar")}</SectionTitle>
        <div className="relative flex-1 xl:min-h-[420px]">
          <Timetable slots={slots} className="xl:absolute xl:inset-0" />
        </div>
      </section>

      <div className="flex min-w-0 flex-col xl:col-start-1 xl:row-start-2">
        <div className="grid gap-7 md:grid-cols-2 md:gap-6">
          <section id="notificari" className="scroll-mt-6">
            <SectionTitle>{t("Notificări")}</SectionTitle>
            <div className="space-y-3">
              {notes.length ? notes.map(n => <FeedCard key={n.id} item={n} />) : <EmptyNote>{t("Nu ai notificări noi.")}</EmptyNote>}
            </div>
          </section>
          <section>
            <SectionTitle>{t("De făcut astăzi")}</SectionTitle>
            <div className="space-y-3">
              {todo.length ? todo.map(item => <FeedCard key={item.id} item={item} />) : <EmptyNote>{t("Totul e la zi. Nicio sarcină în așteptare.")}</EmptyNote>}
            </div>
          </section>
        </div>
        {ws.mode === "demo" && <DemoNotice />}
      </div>
    </div>
  );
}
