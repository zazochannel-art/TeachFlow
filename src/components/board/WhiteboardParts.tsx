"use client";

// Toolbar data and small presentational pieces of the whiteboard (Whiteboard.tsx holds the canvas,
// realtime sync and saving).
import {
  Circle, Eraser, Highlighter, Minus, MoveUpRight, Pen, Square, Type, X, type LucideIcon
} from "lucide-react";
import type { Stroke, Tool } from "@/lib/board/model";
import { useT } from "@/lib/i18n/client";
import type { BoardAccess } from "@/lib/data/board";

export type ToolOrEraser = Tool | "eraser";
export type HistoryEntry = { kind: "add" | "remove"; strokes: Stroke[] };
export type Conn = "offline" | "connecting" | "live" | "error";
export type SaveState = "idle" | "saving" | "saved" | "error";
export interface BoardPeer { key: string; name: string; role: string }

export const TOOL_BUTTONS: Array<{ tool: ToolOrEraser; label: string; icon: LucideIcon; key: string }> = [
  { tool: "pen", label: "Creion", icon: Pen, key: "p" },
  { tool: "highlighter", label: "Marker", icon: Highlighter, key: "m" },
  { tool: "line", label: "Linie", icon: Minus, key: "l" },
  { tool: "arrow", label: "Săgeată", icon: MoveUpRight, key: "s" },
  { tool: "rect", label: "Dreptunghi", icon: Square, key: "d" },
  { tool: "ellipse", label: "Elipsă", icon: Circle, key: "c" },
  { tool: "text", label: "Text", icon: Type, key: "t" },
  { tool: "eraser", label: "Radieră", icon: Eraser, key: "e" }
];

export const COLORS = [
  { value: "#20234b", label: "Negru" },
  { value: "#5269e8", label: "Albastru" },
  { value: "#e5484d", label: "Roșu" },
  { value: "#30a46c", label: "Verde" },
  { value: "#f5a524", label: "Galben" },
  { value: "#8e4ec6", label: "Violet" }
];
export const SIZES = [{ value: 3, label: "Subțire" }, { value: 6, label: "Mediu" }, { value: 12, label: "Gros" }];
/** Tool, colour and thickness pickers (shown only to people who may draw). */
export function DrawControls({ tool, color, size, onTool, onColor, onSize }: {
  tool: ToolOrEraser; color: string; size: number;
  onTool: (tool: ToolOrEraser) => void; onColor: (color: string) => void; onSize: (size: number) => void;
}) {
  const t = useT();
  return (
    <>
      <div role="toolbar" aria-label={t("Instrumente")} className="flex flex-wrap items-center gap-1">
        {TOOL_BUTTONS.map(({ tool: tb, label, icon: Icon, key }) => (
          <button
            key={tb}
            type="button"
            onClick={() => onTool(tb)}
            aria-pressed={tool === tb}
            title={`${t(label)} (${key.toUpperCase()})`}
            aria-label={t(label)}
            className={`grid h-9 w-9 cursor-pointer place-items-center rounded-xl transition-colors ${tool === tb ? "bg-primary text-white shadow-md" : "text-ink hover:bg-soft"}`}
          >
            <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
          </button>
        ))}
      </div>

      <span className="mx-1 hidden h-6 w-px bg-line sm:block" />

      <div className="flex items-center gap-1.5" role="radiogroup" aria-label={t("Culoare")}>
        {COLORS.map(c => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={color === c.value}
            aria-label={t(c.label)}
            title={t(c.label)}
            onClick={() => onColor(c.value)}
            className={`h-7 w-7 cursor-pointer rounded-full border-2 transition-transform ${color === c.value ? "scale-110 border-white ring-2 ring-primary" : "border-white ring-1 ring-line hover:scale-105"}`}
            style={{ background: c.value }}
          />
        ))}
      </div>

      <span className="mx-1 hidden h-6 w-px bg-line sm:block" />

      <div className="flex items-center gap-1" role="radiogroup" aria-label={t("Grosime")}>
        {SIZES.map(s => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={size === s.value}
            aria-label={t(s.label)}
            title={t(s.label)}
            onClick={() => onSize(s.value)}
            className={`grid h-9 w-9 cursor-pointer place-items-center rounded-xl ${size === s.value ? "bg-tint" : "hover:bg-soft"}`}
          >
            <span className="rounded-full bg-ink" style={{ width: 4 + s.value, height: 4 + s.value }} />
          </button>
        ))}
      </div>
    </>
  );
}

/** Teacher: one switch per student of the lesson. */
export function BoardAccessPanel({ students, writers, online, busy, onToggle, onClose }: {
  students: BoardAccess["students"]; writers: string[]; online: Set<string>; busy: string;
  onToggle: (userId: string, allow: boolean) => void; onClose: () => void;
}) {
  const t = useT();
  const withAccount = students.filter(s => s.userId) as { userId: string; name: string }[];
  const allOn = withAccount.length > 0 && withAccount.every(s => writers.includes(s.userId));
  return (
    <div data-testid="board-access-panel" className="rounded-[18px] border border-line/70 bg-white p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold text-ink">{t("Cine poate desena și scrie pe tablă")}</p>
          <p className="text-[11px] text-muted">{t("Toți elevii văd tabla. Desenează doar cei cărora le dai acces aici; îl poți opri oricând.")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {withAccount.length > 1 && (
            <button type="button" disabled={!!busy} className="cursor-pointer rounded-xl bg-soft px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-tint disabled:opacity-50"
              onClick={() => { for (const s of withAccount) if (writers.includes(s.userId) === allOn) onToggle(s.userId, !allOn); }}>
              {allOn ? t("Oprește la toți") : t("Dă acces tuturor")}
            </button>
          )}
          <button type="button" onClick={onClose} aria-label={t("Închide")} title={t("Închide")} className="grid h-8 w-8 cursor-pointer place-items-center rounded-xl text-muted hover:bg-soft"><X className="h-4 w-4" /></button>
        </div>
      </div>
      {students.length === 0 && <p className="text-[12px] text-muted">{t("Lecția nu are încă elevi.")}</p>}
      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {students.map((s, i) => {
          const on = !!s.userId && writers.includes(s.userId);
          const here = !!s.userId && online.has(s.userId);
          return (
            <li key={s.userId ?? `x${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-soft px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${here ? "bg-emerald-500" : "bg-slate-300"}`} title={here ? t("În lecție acum") : t("Nu este în lecție")} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-ink">{s.name}</span>
                  {!s.userId && <span className="block text-[10px] text-muted">{t("Nu are încă un cont (invitație neacceptată)")}</span>}
                </span>
              </span>
              <button type="button" role="switch" aria-checked={on} disabled={!s.userId || busy === s.userId}
                aria-label={t("{name} poate desena pe tablă", { name: s.name })} data-testid="board-access-switch" data-name={s.name}
                onClick={() => s.userId && onToggle(s.userId, !on)}
                className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? "bg-primary" : "bg-slate-300"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function IconButton({ label, icon: Icon, onClick, disabled, pressed }: { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`grid h-9 w-9 cursor-pointer place-items-center rounded-xl text-ink transition-colors hover:bg-soft disabled:cursor-not-allowed disabled:opacity-35 ${pressed ? "bg-tint text-primary-2" : ""}`}
    >
      <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
    </button>
  );
}

export function PeersBadge({ peers }: { peers: BoardPeer[] }) {
  const t = useT();
  if (peers.length === 0) return null;
  const names = peers.map(p => p.name || (p.role === "teacher" ? t("Profesor") : t("Elev")));
  return (
    <span className="flex items-center gap-1.5 text-primary-2" title={names.join(", ")}>
      <span className="flex -space-x-1.5">
        {names.slice(0, 3).map((n, i) => (
          <span key={i} className="grid h-6 w-6 place-items-center rounded-full bg-tint text-[9px] font-extrabold ring-2 ring-white">
            {n.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()}
          </span>
        ))}
      </span>
      <span className="hidden md:inline">{names.length === 1 ? names[0] : t.n("{n} participant|{n} participanți|{n} de participanți", names.length)}</span>
    </span>
  );
}

export function StatusDot({ conn, save }: { conn: Conn; save: SaveState }) {
  const t = useT();
  const map = {
    live: { dot: "bg-emerald-500", text: save === "saving" ? t("Se salvează…") : save === "error" ? t("Nu s-a salvat") : "Live" },
    connecting: { dot: "bg-amber-400", text: t("Se conectează…") },
    error: { dot: "bg-red-500", text: t("Fără conexiune live") },
    offline: { dot: "bg-slate-300", text: t("Local") }
  } as const;
  const m = map[conn];
  const text = conn !== "live" && save === "error" ? t("Nu s-a salvat") : m.text;
  return (
    <span className="flex items-center gap-1.5 text-muted" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${save === "error" ? "bg-red-500" : m.dot}`} />
      {text}
    </span>
  );
}
