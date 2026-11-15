import Link from "next/link";
import { BookOpen, CalendarCheck, Clock, Flame, Medal, Rocket, Star, Target, Trophy, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";
import type { BadgeIcon, Progress } from "@/lib/gamification";
import { formatDate } from "@/lib/time";
import type { T } from "@/lib/i18n/core";

const icons: Record<BadgeIcon, LucideIcon> = { book: BookOpen, clock: Clock, flame: Flame, trophy: Trophy, star: Star, target: Target, calendar: CalendarCheck, medal: Medal, rocket: Rocket };

function levelPct(p: Progress) {
  return p.levelTo == null ? 100 : Math.round(((p.points - p.levelFrom) / (p.levelTo - p.levelFrom)) * 100);
}

/** Level, points and streak in one gradient card (student home, parent home, teacher's student card). */
export function ProgressSummary({ p, t, href, compact = false }: { p: Progress; t: T; href?: string; compact?: boolean }) {
  const earned = p.badges.filter(b => b.earned).length;
  const body = (
    <div className="tf-rise rounded-[22px] bg-gradient-to-br from-[#5269e8] to-[#1c1f6e] p-5 text-white shadow-lift">
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15 text-[22px] font-extrabold" aria-label={t("Nivelul {n}", { n: p.level })}>{p.level}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-white/75">{t("Nivelul {n}", { n: p.level })}</p>
          <p className="truncate text-[18px] font-extrabold leading-tight">{t(p.levelName)}</p>
          <p className="text-[12px] font-bold text-white/85">{t.n("{n} punct|{n} puncte|{n} de puncte", p.points)}</p>
        </div>
        <div className="text-center" title={t("Zile la rând cu teme sau teste")}>
          <Flame className={`mx-auto h-6 w-6 ${p.streak ? "text-[#ffb547]" : "text-white/40"}`} fill={p.streak ? "currentColor" : "none"} />
          <p className="text-[16px] font-extrabold leading-tight">{p.streak}</p>
          <p className="text-[10px] text-white/70">{t.n("zi la rând|zile la rând|de zile la rând", p.streak)}</p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#ffb547]" style={{ width: `${levelPct(p)}%` }} /></div>
      <div className="mt-1.5 flex justify-between gap-2 text-[10px] text-white/75">
        <span>{p.levelTo == null ? t("Nivel maxim atins!") : t("Încă {n} puncte până la nivelul {level}", { n: p.levelTo - p.points, level: p.level + 1 })}</span>
        {!compact && <span className="shrink-0">{t("{n} din {total} insigne", { n: earned, total: p.badges.length })}</span>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block transition-transform hover:-translate-y-0.5">{body}</Link> : body;
}

/** Badges grid: earned ones in colour, the others grey with progress. */
export function BadgeGrid({ p, t }: { p: Progress; t: T }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {p.badges.map(b => {
        const Icon = icons[b.icon];
        return (
          <Card key={b.id} className={`p-4 text-center ${b.earned ? "" : "opacity-70"}`}>
            <span className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${b.earned ? "bg-gradient-to-br from-[#ffb547] to-[#f07c2b] text-white shadow-md" : "bg-soft text-muted"}`}>
              <Icon className="h-5 w-5" />
            </span>
            <p className="mt-2 text-[13px] font-extrabold">{t(b.title)}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">{t(b.text)}</p>
            {!b.earned && (
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((b.value / b.target) * 100)}%` }} /></div>
                <p className="mt-1 text-[10px] font-bold text-muted">{b.value}/{b.target}</p>
              </div>
            )}
            {b.earned && <p className="mt-2 text-[10px] font-extrabold uppercase tracking-wider text-[#c0661b]">{t("Câștigată")}</p>}
          </Card>
        );
      })}
    </div>
  );
}

/** Last 14 days as dots: a day counts when homework was handed in or a test finished. */
export function StreakDays({ p, t }: { p: Progress; t: T }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-extrabold"><Flame className="mr-1 inline h-4 w-4 text-[#f07c2b]" />{t.n("Serie: {n} zi|Serie: {n} zile|Serie: {n} de zile", p.streak)}</p>
        <p className="text-[11px] text-muted">{t("Cea mai lungă serie: {n}", { n: p.bestStreak })}</p>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5 sm:grid-cols-14">
        {p.lastDays.map(d => (
          <span key={d.day} title={d.day} className={`grid h-8 place-items-center rounded-lg text-[10px] font-bold ${d.active ? "bg-gradient-to-br from-[#ffb547] to-[#f07c2b] text-white" : "bg-soft text-muted"}`}>
            {Number(d.day.slice(8))}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted">
        {p.activeToday ? t("Azi ai făcut deja ceva. Seria continuă!") : p.streak ? t("Predă o temă sau rezolvă un test azi ca să nu pierzi seria.") : t("Predă o temă sau rezolvă un test ca să începi o serie.")}
      </p>
    </Card>
  );
}

/** Where the points came from, newest first. */
export function PointHistory({ p, t, tz, limit = 12 }: { p: Progress; t: T; tz: string; limit?: number }) {
  if (!p.events.length) return <Card className="p-5 text-[12px] text-muted">{t("Încă nu ai puncte. Predă o temă sau rezolvă un test ca să câștigi primele puncte.")}</Card>;
  return (
    <Card className="divide-y divide-line">
      {p.events.slice(0, limit).map((e, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 text-[12px]">
          <div className="min-w-0 flex-1">
            <p className="font-extrabold">{t(e.label)}</p>
            <p className="truncate text-muted">{[e.detail, formatDate(e.at, tz, t.locale)].filter(Boolean).join(" · ")}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${e.points >= 0 ? "bg-[#e7f6ee] text-[#11603f]" : "bg-[#fdecec] text-[#c03a3a]"}`}>{e.points > 0 ? "+" : ""}{e.points}</span>
        </div>
      ))}
    </Card>
  );
}

/** How points are earned (shown on the achievements page). */
export function PointRules({ t }: { t: T }) {
  const rows = [
    [t("Temă predată"), "+10"], [t("Predată la timp"), "+5"], [t("Nota 9 sau 10"), "+5"],
    [t("Test rezolvat"), "+10"], [t("Pentru rezultat (după procent)"), t("până la +10")], [t("Test fără greșeală"), "+5"],
    [t("Lecție la care ai participat"), "+5"], [t("Bonus de la profesor"), t("variabil")]
  ];
  return (
    <Card className="divide-y divide-line">
      {rows.map(([a, b]) => <div key={a} className="flex justify-between gap-3 px-4 py-2.5 text-[12px]"><span>{a}</span><b className="shrink-0">{b}</b></div>)}
    </Card>
  );
}
