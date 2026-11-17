"use client";

// Leaf pieces of the call view: control buttons, video tiles, chat, people list and quality badges.
// CallView.tsx arranges them into the stage and panel layouts.
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, MonitorUp, MonitorX, RefreshCw, Send, Video, VideoOff, WifiOff } from "lucide-react";
import { MAX_CHAT } from "@/lib/board/rtc";
import type { Quality } from "@/lib/call/quality";
import { useT } from "@/lib/i18n/client";
import type { CallEngine, ChatLine, PeerStatus, ScreenAccess } from "./types";

export interface CallMe { id: string; name: string; role: "teacher" | "student" }

export interface TileModel {
  key: string; stream: MediaStream | null; name: string; mine: boolean; mic: boolean; cam: boolean; screen: boolean;
  teacher: boolean; status?: PeerStatus; quality: Quality; relay?: boolean; speaking?: boolean;
}

export function Controls({ engine, size, canShare }: { engine: CallEngine; size: "sm" | "lg"; canShare: boolean }) {
  const t = useT();
  const { mic, cam, sharing, local } = engine;
  const hasCamera = (local?.getVideoTracks().length ?? 0) > 0;
  const B = size === "lg" ? BarButton : CallButtonAdapter;
  return (
    <>
      <B onClick={engine.toggleMic} off={!mic} label={mic ? t("Oprește microfonul") : t("Pornește microfonul")} icon={mic ? Mic : MicOff} />
      <B onClick={() => void engine.toggleCam()} off={!(cam && hasCamera)} label={!hasCamera ? t("Pornește camera") : cam ? t("Oprește camera") : t("Pornește camera")} icon={cam && hasCamera ? Video : VideoOff} />
      {canShare && <B onClick={() => void engine.toggleScreen()} active={sharing} label={sharing ? t("Oprește partajarea ecranului") : t("Arată ecranul în apel")} icon={sharing ? MonitorX : MonitorUp} className={size === "lg" ? "hidden sm:grid" : undefined} />}
    </>
  );
}

export function BarButton({ onClick, off, active, label, icon: Icon, badge, className = "" }: { onClick: () => void; off?: boolean; active?: boolean; label: string; icon: typeof Mic; badge?: number; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={off ?? active}
      className={`relative grid h-12 w-12 cursor-pointer place-items-center rounded-full transition-colors ${off ? "bg-white text-[#c03a3a]" : active ? "bg-primary text-white" : "bg-white/10 text-white hover:bg-white/20"} ${className}`}
    >
      <Icon className="h-5 w-5" />
      {!!badge && <span className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#e5484d] px-1 text-[10px] font-extrabold text-white">{badge > 9 ? "9+" : badge}</span>}
    </button>
  );
}

export function CallButtonAdapter({ onClick, off, active, label, icon }: { onClick: () => void; off?: boolean; active?: boolean; label: string; icon: typeof Mic; className?: string }) {
  return <CallButton onClick={onClick} active={!off && !active} label={label} icon={icon} />;
}

export function StatusLines({ engine, me, live, dark }: { engine: CallEngine; me: CallMe; live: boolean; dark?: boolean }) {
  const t = useT();
  const anyFailed = engine.peers.some(p => p.status === "failed");
  const size = dark ? "text-[12px]" : "text-[10px]";
  const lines = [
    !live && <p key="local" className="text-white/65">{t("Mod local: vezi doar camera ta. Apelul cu elevii pornește după configurarea Supabase.")}</p>,
    live && engine.peers.length === 0 && (
      <p key="alone" className="text-white/70">{me.role === "teacher" ? t("Elevul nu a intrat încă în apel. El intră din pagina lecției, cu „Intră în apel”.") : t("Profesorul nu a intrat încă în apel. Rămâi aici, conexiunea pornește singură când intră.")}</p>
    ),
    !engine.online && <p key="off" role="alert" className="flex items-center gap-1 font-bold text-[#ffd27a]"><WifiOff className="h-3 w-3 shrink-0" /> {t("Conexiunea la internet s-a întrerupt. Reconectez când revine rețeaua…")}</p>,
    engine.reconnecting && <p key="rec" role="status" className="flex items-center gap-1 font-bold text-[#ffd27a]"><RefreshCw className="h-3 w-3 shrink-0 animate-spin" /> {t("Se reconectează…")}</p>,
    anyFailed && <p key="fail" role="alert" className="font-bold text-[#ffb4b4]">{t("Conexiunea directă nu a reușit. Rețeaua actuală (de exemplu date mobile sau un Wi-Fi cu restricții) poate necesita un server TURN.")}</p>,
    engine.notice && <p key="notice" role="status" className="font-bold text-[#ffd27a]">{engine.notice}</p>
  ].filter(Boolean);
  if (lines.length === 0) return null;
  return <div className={`space-y-1 leading-snug ${size} ${dark ? "rounded-[12px] bg-white/5 px-3 py-2" : ""}`}>{lines}</div>;
}

export function People({ tiles, me, compact, screen }: { tiles: TileModel[]; me: CallMe; compact?: boolean; screen?: ScreenAccess }) {
  const t = useT();
  const statusText = (s?: PeerStatus) =>
    !s || s === "connected" ? t("Conectat") : s === "reconnecting" ? t("Se reconectează…") : s === "failed" ? t("Nu se poate conecta") : t("Se conectează…");
  const manage = screen?.manage;
  return (
    <div className={`tf-scroll overflow-y-auto ${compact ? "max-h-[30vh] text-[11px]" : "flex-1 text-[13px]"}`}>
    <ul className={compact ? "space-y-1 p-2" : "space-y-1 p-3"}>
      {tiles.map(x => (
        <li key={x.key} className={`flex items-center gap-2 rounded-[10px] ${compact ? "" : "bg-white/5 px-3 py-2"}`}>
          {!compact && <Avatar name={x.mine ? me.name : x.name} small />}
          <span className="min-w-0 flex-1 truncate font-bold">{x.mine ? `${me.name} (${t("tu")})` : x.name}</span>
          {x.teacher && <span className="rounded bg-primary px-1 text-[8px] font-extrabold uppercase">{t("Profesor")}</span>}
          {x.mic ? <Mic className="h-3 w-3 text-white/60" /> : <MicOff className="h-3 w-3 text-[#ff8b8b]" />}
          {x.cam ? <Video className="h-3 w-3 text-white/60" /> : <VideoOff className="h-3 w-3 text-white/40" />}
          <QualityBars quality={x.quality} small />
          <span className={`shrink-0 text-[9px] ${x.status === "failed" ? "font-bold text-[#ff8b8b]" : "text-white/60"}`}>{statusText(x.status)}</span>
        </li>
      ))}
    </ul>
    {manage && (
      <section data-testid="screen-access" className={`border-t border-white/10 ${compact ? "p-2" : "p-3"}`}>
        <h3 className="flex items-center gap-1.5 font-extrabold"><MonitorUp className="h-3.5 w-3.5" /> {t("Cine poate partaja ecranul")}</h3>
        <p className="mt-0.5 text-[11px] text-white/60">{t("Doar tu partajezi ecranul. Pornește comutatorul pentru elevul care are voie să își arate ecranul.")}</p>
        {manage.students.length === 0 && <p className="mt-2 text-[11px] text-white/60">{t("Lecția nu are încă elevi.")}</p>}
        <ul className="mt-2 space-y-1">
          {manage.students.map((s, i) => {
            const on = !!s.userId && manage.sharers.includes(s.userId);
            return (
              <li key={s.userId ?? `none-${i}`} className={`flex items-center gap-2 rounded-[10px] ${compact ? "" : "bg-white/5 px-3 py-2"}`}>
                <span className="min-w-0 flex-1 truncate font-bold">{s.name}</span>
                {s.userId ? (
                  <button type="button" role="switch" aria-checked={on} disabled={manage.busy === s.userId}
                    aria-label={t("{name} poate partaja ecranul", { name: s.name })} data-testid="screen-access-switch" data-name={s.name}
                    onClick={() => manage.toggle(s.userId!, !on)}
                    className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[#3ecf8e]" : "bg-white/25"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                ) : <span className="shrink-0 text-[10px] text-white/50">{t("fără cont")}</span>}
              </li>
            );
          })}
        </ul>
        {manage.failed && <p role="alert" className="mt-2 text-[11px] font-bold text-[#ff8b8b]">{t("Nu s-a putut schimba accesul. Încearcă din nou.")}</p>}
      </section>
    )}
    </div>
  );
}

export function ChatBox({ lines, onSend, disabled, roomy }: { lines: ChatLine[]; onSend: (text: string) => void; disabled: boolean; roomy?: boolean }) {
  const t = useT();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [lines.length]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(text);
    setText("");
  };
  return (
    <div className={`flex select-text flex-col text-white ${roomy ? "min-h-0 flex-1 p-3" : "p-2"}`}>
      <div ref={listRef} className={`tf-scroll space-y-1.5 overflow-y-auto ${roomy ? "min-h-0 flex-1 text-[13px]" : "max-h-[28vh] min-h-[60px] text-[11px]"}`} aria-live="polite">
        {lines.length === 0 && <p className="text-white/50">{t("Mesajele din chat nu se salvează: le văd doar cei din apel acum.")}</p>}
        {lines.map(l => (
          <p key={l.id} className={`break-words ${roomy ? `rounded-[12px] px-3 py-1.5 ${l.mine ? "ml-8 bg-primary/40" : "mr-8 bg-white/8"}` : ""}`}>
            <span className={`font-extrabold ${l.mine ? "text-[#c3ccff]" : "text-white"}`}>{l.name}: </span>
            <span className="text-white/85">{l.text}</span>
          </p>
        ))}
      </div>
      <form onSubmit={submit} className="mt-2 flex gap-1.5">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={MAX_CHAT}
          disabled={disabled}
          placeholder={t("Scrie un mesaj…")}
          aria-label={t("Scrie un mesaj…")}
          className={`min-w-0 flex-1 rounded-md bg-white/10 px-2 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/40 ${roomy ? "h-10 rounded-full px-4 text-[13px]" : "py-1 text-[11px]"}`}
        />
        <button type="submit" disabled={disabled || !text.trim()} aria-label={t("Trimite")} className={`grid cursor-pointer place-items-center bg-primary text-white disabled:opacity-40 ${roomy ? "h-10 w-10 rounded-full" : "h-6 w-7 rounded-md"}`}>
          <Send className={roomy ? "h-4 w-4" : "h-3 w-3"} />
        </button>
      </form>
    </div>
  );
}

export function Tile({ tile, big, className = "", onClick, pinned }: { tile: TileModel; big?: boolean; className?: string; onClick?: () => void; pinned?: boolean }) {
  const t = useT();
  const ref = useRef<HTMLVideoElement>(null);
  const { stream, status } = tile;
  useEffect(() => {
    const v = ref.current;
    if (v && v.srcObject !== stream) v.srcObject = stream;
  }, [stream]);
  const label = tile.teacher ? t("Profesor") : undefined;

  return (
    <div
      onClick={onClick}
      data-testid={tile.mine ? "tile-me" : "tile-peer"}
      data-name={tile.name}
      data-mic={tile.mic}
      data-cam={tile.cam}
      data-screen={tile.screen}
      data-status={tile.status ?? "connected"}
      title={onClick ? (pinned ? t("Anulează fixarea") : t("Arată mare")) : undefined}
      className={`relative overflow-hidden rounded-[12px] bg-[#1c1f6e] ${tile.speaking ? "ring-2 ring-[#3ecf8e]" : ""} ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={tile.mine}
        className={`h-full w-full ${tile.screen ? "object-contain" : big ? "object-cover md:object-contain" : "object-cover"} ${tile.mine && !tile.screen ? "-scale-x-100" : ""} ${tile.cam ? "" : "invisible"}`}
      />
      {!tile.cam && (
        <span className="absolute inset-0 grid place-items-center">
          <Avatar name={tile.name} big={big} />
        </span>
      )}
      {(status === "connecting" || status === "reconnecting") && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/35 text-[10px] font-bold text-white">
          {status === "reconnecting" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Loader2 className="h-5 w-5 animate-spin" />}
          {status === "reconnecting" ? t("Se reconectează…") : t("Se conectează…")}
        </span>
      )}
      {status === "failed" && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 px-2 text-center text-[10px] font-bold leading-tight text-white" title={t("Rețeaua blochează conexiunea directă. Încercați din nou sau configurați un server TURN.")}>
          <WifiOff className="h-4 w-4 text-[#ff8b8b]" />
          {t("Nu se poate conecta")}
        </span>
      )}
      <span className={`absolute bottom-1 left-1 flex max-w-[90%] items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 font-bold text-white ${big ? "bottom-2 left-2 text-[12px]" : "text-[10px]"}`}>
        {!tile.mic && <MicOff className="h-2.5 w-2.5 shrink-0 text-[#ff8b8b]" />}
        {tile.screen && <MonitorUp className="h-2.5 w-2.5 shrink-0" />}
        <span className="truncate">{tile.name}</span>
        {label && <span className="rounded bg-primary px-1 text-[8px] font-extrabold uppercase">{label}</span>}
      </span>
      {!tile.mine && tile.quality !== "unknown" && (
        <span className="absolute right-1 top-1 rounded-md bg-black/45 px-1 py-0.5"><QualityBars quality={tile.quality} small /></span>
      )}
    </div>
  );
}

export function Avatar({ name, big, small }: { name: string; big?: boolean; small?: boolean }) {
  const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const size = big ? "h-24 w-24 text-[30px]" : small ? "h-7 w-7 text-[10px]" : "h-10 w-10 text-[13px]";
  return <span className={`grid shrink-0 place-items-center rounded-full bg-primary font-extrabold text-white ${size}`}>{initials || "?"}</span>;
}

export const QUALITY_COLOR: Record<Quality, string> = { good: "#3ecf8e", fair: "#f5b544", poor: "#ff6b6b", unknown: "rgba(255,255,255,.35)" };
export const QUALITY_BARS: Record<Quality, number> = { good: 3, fair: 2, poor: 1, unknown: 0 };

export function useQualityText() {
  const t = useT();
  return (q: Quality) => q === "good" ? t("Conexiune bună") : q === "fair" ? t("Conexiune medie") : q === "poor" ? t("Conexiune slabă") : t("Se măsoară conexiunea…");
}

export function QualityBars({ quality, small }: { quality: Quality; small?: boolean }) {
  const text = useQualityText()(quality);
  const n = QUALITY_BARS[quality];
  const h = small ? [4, 7, 10] : [6, 10, 14];
  return (
    <span role="img" aria-label={text} title={text} data-quality={quality} className="inline-flex shrink-0 items-end gap-[2px]">
      {h.map((px, i) => (
        <span key={i} style={{ height: px, background: i < n ? QUALITY_COLOR[quality] : "rgba(255,255,255,.22)" }} className={`${small ? "w-[3px]" : "w-1"} rounded-sm`} />
      ))}
    </span>
  );
}

export function QualityBadge({ quality, relay }: { quality: Quality; relay: boolean }) {
  const t = useT();
  const text = useQualityText()(quality);
  return (
    <span className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-3 text-[11px] font-bold" title={relay ? `${text} · ${t("prin releu TURN")}` : text}>
      <QualityBars quality={quality} />
      <span className="hidden md:inline">{text}</span>
      {relay && <span className="hidden rounded bg-white/15 px-1 text-[9px] uppercase md:inline">TURN</span>}
    </span>
  );
}

export function CallTimer({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!since) return null;
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(hh ? 2 : 1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span className="tabular-nums" aria-label="timer">{hh ? `${hh}:` : ""}{mm}:{ss}</span>;
}

export function MiniButton({ onClick, label, icon: Icon, active }: { onClick: () => void; label: string; icon: typeof Mic; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active} className={`grid h-6 w-6 cursor-pointer place-items-center rounded-md hover:bg-white/15 hover:text-white ${active ? "bg-white/20 text-white" : "text-white/80"}`}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

export function CallButton({ onClick, active, label, icon: Icon }: { onClick: () => void; active: boolean; label: string; icon: typeof Mic }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={!active}
      className={`grid h-8 w-8 cursor-pointer place-items-center rounded-full transition-colors ${active ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-[#c03a3a]"}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export interface PanelView { pos: { x: number; y: number } | null; large: boolean; min: boolean }
export const VIEW_KEY = "tf-call-panel";

export function loadView(): PanelView {
  const fallback: PanelView = { pos: null, large: false, min: false };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") as Partial<PanelView> | null;
    if (!raw || typeof raw !== "object") return fallback;
    const pos = raw.pos && Number.isFinite(raw.pos.x) && Number.isFinite(raw.pos.y) ? clampPos(raw.pos, null) : null;
    return { pos, large: raw.large === true, min: raw.min === true };
  } catch {
    return fallback;
  }
}

/** Keeps at least the panel's header inside the window. */
export function clampPos(p: { x: number; y: number }, el: HTMLElement | null) {
  const w = el?.offsetWidth ?? 180;
  const h = el?.offsetHeight ?? 40;
  const maxX = Math.max(0, window.innerWidth - w - 4);
  const maxY = Math.max(0, window.innerHeight - Math.min(h, 40) - 4);
  return { x: Math.round(Math.min(Math.max(4, p.x), maxX)), y: Math.round(Math.min(Math.max(4, p.y), maxY)) };
}
