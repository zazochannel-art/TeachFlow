import Link from "next/link";
import { AlertCircle, Check, Plus, Video, X } from "lucide-react";
import type { Slot } from "@/lib/data/derive";
import { colorVar } from "@/lib/colors";
import type { T } from "@/lib/i18n/core";

export interface WeekDay {
  key: string;
  weekday: string;
  num: number;
  isToday: boolean;
  slots: Array<Slot & { startMin: number; endMin: number }>;
}

const HOUR = 56;

/** Places overlapping lessons side by side: returns lane index and lane count per lesson. */
function lanes(slots: WeekDay["slots"]) {
  const out = new Map<string, { lane: number; of: number }>();
  let group: typeof slots = [];
  let groupEnd = -1;
  const flush = () => {
    const ends: number[] = [];
    const assigned = group.map(s => {
      let lane = ends.findIndex(e => e <= s.startMin);
      if (lane === -1) { lane = ends.length; ends.push(s.endMin); } else ends[lane] = s.endMin;
      return { s, lane };
    });
    assigned.forEach(({ s, lane }) => out.set(s.id, { lane, of: ends.length }));
    group = [];
  };
  for (const s of [...slots].sort((a, b) => a.startMin - b.startMin)) {
    if (group.length && s.startMin >= groupEnd) flush();
    group.push(s);
    groupEnd = Math.max(groupEnd, s.endMin);
  }
  if (group.length) flush();
  return out;
}

/** Desktop week view: one column per day, lessons as coloured blocks on an hour grid. */
export function WeekGrid({ days, nowMin, selectedId, t }: { days: WeekDay[]; nowMin: number | null; selectedId?: string; t: T }) {
  const all = days.flatMap(d => d.slots);
  const from = Math.max(0, Math.min(8, ...all.map(s => Math.floor(s.startMin / 60))));
  const to = Math.min(24, Math.max(20, ...all.map(s => Math.ceil(s.endMin / 60))));
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const height = hours.length * HOUR;
  const y = (min: number) => ((min - from * 60) / 60) * HOUR;

  return (
    <div className="overflow-hidden rounded-[22px] border border-line/70 bg-white shadow-card">
      <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-line">
        <span />
        {days.map(d => (
          <Link key={d.key} href={`/dashboard?date=${d.key}`} className="flex items-center justify-center gap-2 border-l border-line py-3 hover:bg-soft">
            <span className={`text-[11px] font-bold ${d.isToday ? "text-primary" : "text-muted"}`}>{d.weekday}</span>
            <span className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-extrabold ${d.isToday ? "bg-primary text-white" : "text-ink"}`}>{d.num}</span>
          </Link>
        ))}
      </div>
      <div className="tf-scroll max-h-[calc(100dvh-230px)] min-h-[420px] overflow-y-auto">
        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))]" style={{ height }}>
          <div className="relative">
            {hours.map(h => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] font-semibold text-muted" style={{ top: y(h * 60) }}>
                {h === from ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          {days.map(d => {
            const place = lanes(d.slots);
            return (
              <div key={d.key} className={`group/day relative border-l border-line ${d.isToday ? "bg-primary/[0.03]" : ""}`}>
                {hours.map(h => (
                  <Link key={h} href={`/calendar?new=1&date=${d.key}&time=${String(h).padStart(2, "0")}:00`}
                    aria-label={t("Adaugă lecție · {day}", { day: `${d.weekday} ${d.num}, ${String(h).padStart(2, "0")}:00` })}
                    className="group/cell absolute inset-x-0 flex items-center justify-center border-t border-line/60 hover:bg-tint/60"
                    style={{ top: y(h * 60), height: HOUR }}>
                    <Plus className="h-3.5 w-3.5 text-primary opacity-0 group-hover/cell:opacity-100" />
                  </Link>
                ))}
                {d.isToday && nowMin != null && nowMin >= from * 60 && nowMin <= to * 60 && (
                  <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: y(nowMin) }}>
                    <div className="relative h-0.5 bg-[#e5484d]"><span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-[#e5484d]" /></div>
                  </div>
                )}
                {d.slots.map(s => {
                  const { lane, of } = place.get(s.id) ?? { lane: 0, of: 1 };
                  const top = y(s.startMin);
                  const h = Math.max(26, y(s.endMin) - top - 2);
                  const active = s.state === "now" || s.state === "next";
                  const cancelled = s.status === "cancelled";
                  const needsStatus = s.state === "past" && s.status === "scheduled";
                  const compact = h < 46;
                  return (
                    <Link key={s.id} href={`/calendar?date=${d.key}&lesson=${s.id}`} title={`${s.start} - ${s.end} · ${s.title}${s.subtitle ? ` · ${s.subtitle}` : ""}`}
                      style={{ ...colorVar(s.color), top: top + 1, height: h, left: `calc(${(lane / of) * 100}% + 3px)`, width: `calc(${100 / of}% - 6px)` }}
                      className={`absolute z-10 overflow-hidden rounded-xl px-2 py-1.5 text-[11px] leading-tight transition-shadow hover:z-30 hover:shadow-md
                        ${active ? "tf-c-tile shadow-lift" : "tf-c-soft tf-c-edge text-ink"}
                        ${cancelled ? "opacity-50" : s.state === "past" ? "opacity-75" : ""}
                        ${selectedId === s.id ? "ring-2 ring-ink" : ""}`}>
                      <div className={`flex items-center gap-1 font-bold ${active ? "text-white/85" : "tf-c-ink"}`}>
                        <span className="truncate">{s.start}{compact ? ` · ${s.title}` : ` - ${s.end}`}</span>
                        {s.status === "completed" && <Check className="ml-auto h-3 w-3 shrink-0" strokeWidth={3} />}
                        {s.status === "no_show" && <X className="ml-auto h-3 w-3 shrink-0" strokeWidth={3} />}
                        {needsStatus && <AlertCircle className="ml-auto h-3 w-3 shrink-0 text-[#e0a100]" strokeWidth={3} />}
                        {active && s.meetingUrl && <Video className="ml-auto h-3 w-3 shrink-0" />}
                      </div>
                      {!compact && <div className={`mt-0.5 truncate text-[12px] font-extrabold ${cancelled ? "line-through" : ""}`}>{s.title}</div>}
                      {!compact && h > 62 && s.subtitle && <div className={`truncate ${active ? "text-white/80" : "text-muted"}`}>{s.subtitle}</div>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
