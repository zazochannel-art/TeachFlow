"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Bell, Calendar, ChevronLeft, ChevronRight, Search, Video, X } from "lucide-react";
import { Avatar } from "@/components/ui";
import { addDays, formatDayHeading, isDateKey } from "@/lib/time";
import { useT } from "@/lib/i18n/client";

export interface CurrentLessonChip {
  title: string;
  time: string;
  running: boolean;
  href: string;
  external: boolean;
}

interface Props {
  todayKey: string;
  name: string;
  avatarUrl: string | null;
  current: CurrentLessonChip | null;
  unread: number;
}

const DATED_PAGES = ["/dashboard", "/calendar"];

export function TopBar({ todayKey, name, avatarUrl, current, unread }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const t = useT();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const raw = params.get("date");
  const key = isDateKey(raw) ? raw : todayKey;
  const base = DATED_PAGES.includes(pathname) ? pathname : "/dashboard";
  const step = pathname === "/calendar" ? 7 : 1;
  const hrefFor = (k: string) => (k === todayKey ? base : `${base}?date=${k}`);
  const { weekday, rest } = formatDayHeading(key, t.locale);

  const roundBtn = "grid h-5 w-5 place-items-center rounded-full bg-ink text-white transition-opacity hover:opacity-80";

  return (
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <Link href={hrefFor(addDays(key, -step))} aria-label={t("Ziua anterioară")} className={roundBtn}><ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} /></Link>
        <h1 className="text-[17px] tracking-tight text-ink">
          <strong className="font-extrabold">{weekday}</strong>, {rest}
        </h1>
        <Link href={hrefFor(addDays(key, step))} aria-label={t("Ziua următoare")} className={roundBtn}><ChevronRight className="h-3.5 w-3.5" strokeWidth={2.6} /></Link>
        <Link href={`/calendar${key === todayKey ? "" : `?date=${key}`}`} aria-label={t("Calendar")}
          className="ml-1 grid h-8 w-8 place-items-center rounded-full border border-[#cfd3e6] text-ink transition-colors hover:bg-white">
          <Calendar className="h-3.5 w-3.5" />
        </Link>
        {key !== todayKey && <Link href={base} className="text-[11px] font-bold text-primary">{t("Astăzi")}</Link>}
      </div>

      <div className="flex h-[54px] items-center overflow-hidden rounded-2xl bg-white shadow-card">
        {current && (
          current.external
            ? <a href={current.href} target="_blank" rel="noreferrer" className="flex h-full items-center gap-4 rounded-r-2xl bg-primary px-5 text-white" title={current.running ? t("Lecție în desfășurare") : t("Următoarea lecție la {time}", { time: current.time })}><Chip c={current} /></a>
            : <Link href={current.href} className="flex h-full items-center gap-4 rounded-r-2xl bg-primary px-5 text-white"><Chip c={current} /></Link>
        )}
        <div className="flex items-center gap-5 px-5 text-ink">
          {searching ? (
            <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); router.push(`/students?q=${encodeURIComponent(query)}`); setSearching(false); }}>
              <Search className="h-4 w-4 text-muted" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Caută elevi…")} aria-label={t("Caută elevi")}
                className="w-28 bg-transparent text-[12px] outline-none sm:w-40" />
              <button type="button" aria-label={t("Închide căutarea")} onClick={() => setSearching(false)}><X className="h-3.5 w-3.5 text-muted" /></button>
            </form>
          ) : (
            <button type="button" aria-label={t("Caută")} onClick={() => setSearching(true)} className="cursor-pointer hover:opacity-70"><Search className="h-4 w-4" strokeWidth={2.3} /></button>
          )}
          <div className="h-5 w-px bg-line" />
          <Link href="/dashboard#notificari" aria-label={t("Notificări")} className="relative hover:opacity-70">
            <Bell className="h-4 w-4" fill="currentColor" />
            {unread > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-white" />}
          </Link>
          <Link href="/settings" className="flex items-center gap-3 pl-1">
            <span className="hidden max-w-[120px] truncate text-[12px] font-extrabold sm:inline">{name}</span>
            <Avatar name={name} src={avatarUrl} size={32} />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Chip({ c }: { c: CurrentLessonChip }) {
  const t = useT();
  return (
    <>
      <span className="flex flex-col leading-tight">
        <span className="max-w-[140px] truncate text-[12px] font-extrabold tracking-wide">{c.title}</span>
        <span className="text-[10px] text-white/75">{c.running ? t("în desfășurare") : t("la {time}", { time: c.time })}</span>
      </span>
      <span className="grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-white/15">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white"><Video className="h-3.5 w-3.5 text-primary" fill="currentColor" /></span>
      </span>
    </>
  );
}
