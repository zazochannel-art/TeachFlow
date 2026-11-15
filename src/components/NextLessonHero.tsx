"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarPlus, Clock, Video } from "lucide-react";
import { Avatar } from "@/components/ui";
import { colorVar } from "@/lib/colors";
import { useT } from "@/lib/i18n/client";

export interface HeroLesson {
  id: string;
  title: string;
  subtitle: string;
  startsAt: string;
  endsAt: string;
  /** "14:00 - 15:00", or "joi, 14:00 - 15:00" when it is not today. */
  when: string;
  color: string;
  people: Array<{ name: string; src: string | null }>;
}

function useNow(stepMs = 30000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, stepMs);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [stepMs]);
  return now;
}

/** Big card at the top of the dashboard: the lesson in progress or the next one, with a countdown. */
export function NextLessonHero({ lesson, greeting }: { lesson: HeroLesson | null; greeting: string }) {
  const t = useT();
  const now = useNow();

  if (!lesson) {
    return (
      <div className="tf-rise mb-7 flex flex-wrap items-center justify-between gap-4 rounded-[24px] bg-tint p-5 sm:p-6">
        <div>
          <p className="text-[12px] font-bold text-muted">{greeting}</p>
          <h2 className="mt-1 text-[18px] font-extrabold text-ink">{t("Nicio lecție programată în curând")}</h2>
          <p className="mt-1 text-[12px] text-muted">{t("Programează următoarea lecție și o vei vedea aici.")}</p>
        </div>
        <Link href="/calendar?new=1" className="tf-btn"><CalendarPlus className="h-4 w-4" /> {t("Programează o lecție")}</Link>
      </div>
    );
  }

  const start = new Date(lesson.startsAt).getTime();
  const end = new Date(lesson.endsAt).getTime();
  const running = now != null && now >= start && now < end;
  const mins = now == null ? null : Math.max(0, Math.round(((running ? end : start) - now) / 60000));
  const span = (m: number) => m < 60 ? t("{n} min", { n: m }) : m < 24 * 60 ? t("{h} h {m} min", { h: Math.floor(m / 60), m: m % 60 }) : t("{n} zile", { n: Math.round(m / 1440) });
  const countdown = mins == null ? "" : running ? t("În desfășurare · mai sunt {time}", { time: span(mins) }) : mins === 0 ? t("Începe acum") : t("Începe în {time}", { time: span(mins) });
  const soon = running || (mins != null && mins <= 15);

  return (
    <div style={colorVar(lesson.color)} className="tf-c-tile tf-rise relative mb-7 overflow-hidden rounded-[24px] p-5 shadow-lift sm:p-6">
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
      <span aria-hidden className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/[0.07]" />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-white/80">{greeting} · {running ? t("Lecția de acum") : t("Următoarea lecție")}</p>
          <h2 className="mt-1 truncate text-[22px] font-extrabold leading-tight sm:text-[26px]">{lesson.title}</h2>
          <p className="mt-1 truncate text-[13px] text-white/85">{[lesson.when, lesson.subtitle].filter(Boolean).join(" · ")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {lesson.people.length > 0 && (
              <div className="flex -space-x-2">
                {lesson.people.slice(0, 4).map((p, i) => <Avatar key={i} name={p.name} src={p.src} size={30} className="ring-2 ring-white/40" />)}
              </div>
            )}
            {countdown && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-extrabold ${soon ? "bg-white text-ink" : "bg-white/15"}`}>
                <Clock className="h-3.5 w-3.5" /> {countdown}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/calendar?lesson=${lesson.id}`} className="rounded-xl bg-white/15 px-4 py-2.5 text-[13px] font-bold hover:bg-white/25">{t("Detalii")}</Link>
          <Link href={`/classroom/${lesson.id}`} className="tf-c-ink inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13px] font-extrabold shadow-md hover:brightness-95">
            <Video className="h-4 w-4" fill="currentColor" /> {t("Intră în lecție")}
          </Link>
        </div>
      </div>
    </div>
  );
}
