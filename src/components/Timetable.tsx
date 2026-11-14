"use client";

import Link from "next/link";
import { CalendarPlus, Video } from "lucide-react";
import type { Slot } from "@/lib/data/derive";
import { useT } from "@/lib/i18n/client";

function StartButton({ slot }: { slot: Slot }) {
  const t = useT();
  const cls = "flex items-center gap-2 rounded-xl border border-white/80 px-3.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-white/10";
  const body = <><Video className="h-3.5 w-3.5" fill="currentColor" /> {t("Începe lecția")}</>;
  return slot.meetingUrl
    ? <a href={slot.meetingUrl} target="_blank" rel="noreferrer" className={cls}>{body}</a>
    : <Link href="/classroom" className={cls}>{body}</Link>;
}

/** Vertical day timetable — the separate right-hand column of the reference. */
export function Timetable({ slots, className = "" }: { slots: Slot[]; className?: string }) {
  const t = useT();
  return (
    <div className={`flex min-h-0 rounded-[26px] bg-white p-5 shadow-card ${className}`}>
      <div className="tf-scroll min-h-0 flex-1 space-y-3.5 overflow-y-auto pr-2">
        {slots.length === 0 && (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-[12px] text-muted">
            <CalendarPlus className="mb-3 h-6 w-6 text-primary" />
            {t("Nicio lecție programată în această zi.")}
            <Link href="/calendar" className="mt-2 font-bold text-primary">{t("Deschide calendarul")}</Link>
          </div>
        )}
        {slots.map(slot => {
          const active = slot.state === "now" || slot.state === "next";
          const cancelled = slot.status === "cancelled";
          return (
            <div key={slot.id} className="flex items-start gap-3">
              <span className="w-9 shrink-0 pt-2 text-[11px] font-semibold text-muted">{slot.start.replace(/^0/, "").replace(/:\d\d$/, ":00")}</span>
              <div className={`min-w-0 flex-1 rounded-[18px] px-4 py-3 ${active ? "bg-primary text-white shadow-lift" : "bg-soft text-ink"} ${slot.state === "past" || cancelled ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-[13px] font-extrabold ${cancelled ? "line-through" : ""}`}>{slot.title}</span>
                  {active && <span className="shrink-0 text-[10px] font-semibold text-white/80">{slot.state === "now" ? t("Acum") : t("Urmează")}</span>}
                </div>
                <p className={`mt-0.5 truncate text-[11px] ${active ? "text-white/80" : "text-muted"}`}>
                  {slot.start} - {slot.end}{slot.subtitle ? ` · ${slot.subtitle}` : ""}
                </p>
                {active && <div className="mt-3 flex justify-end"><StartButton slot={slot} /></div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
