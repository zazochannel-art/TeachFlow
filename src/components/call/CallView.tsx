"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronUp, Expand, GripHorizontal, Loader2, Maximize2, MessageSquare, Mic, MicOff, MonitorUp, MonitorX,
  PanelsTopLeft, PhoneOff, Presentation, RefreshCw, Send, Shrink, Users, Video, VideoOff, WifiOff, X
} from "lucide-react";
import { MAX_CHAT } from "@/lib/board/rtc";
import type { Quality } from "@/lib/call/quality";
import { useT } from "@/lib/i18n/client";
import type { CallEngine, CallParticipant, ChatLine, PeerStatus } from "./types";

interface Props {
  engine: CallEngine;
  me: { id: string; name: string; role: "teacher" | "student" };
  live: boolean;
  lessonTitle?: string;
}

type Layout = "stage" | "panel";
const LAYOUT_KEY = "tf-call-layout";
function loadLayout(): Layout {
  try { return typeof window !== "undefined" && localStorage.getItem(LAYOUT_KEY) === "panel" ? "panel" : "stage"; } catch { return "stage"; }
}

/** The call UI, the same for the P2P mesh and the SFU: a join bar, then a full call view or a small panel. */
export function CallView({ engine, me, live, lessonTitle }: Props) {
  const t = useT();
  const [layout, setLayoutState] = useState<Layout>(loadLayout);
  const [side, setSide] = useState<"chat" | "people" | null>(null);

  const setLayout = (l: Layout) => {
    setLayoutState(l);
    try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* storage blocked */ }
  };
  const openSide = (s: "chat" | "people" | null) => {
    const next = s === side ? null : s;
    setSide(next);
    engine.setChatOpen(next === "chat");
  };

  // The stage covers the page: no scrolling behind it.
  useEffect(() => {
    if (!engine.joined || layout !== "stage") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [engine.joined, layout]);

  if (!engine.joined) return <JoinBar engine={engine} />;

  const common = { engine, me, live, side, openSide };
  return layout === "stage"
    ? <Stage {...common} lessonTitle={lessonTitle} onBoard={() => setLayout("panel")} />
    : <Panel {...common} onStage={() => setLayout("stage")} t={t} />;
}

// ---------------------------------------------------------------------------
// Before joining
// ---------------------------------------------------------------------------

function JoinBar({ engine }: { engine: CallEngine }) {
  const t = useT();
  const { joining, error, othersInCall } = engine;
  return (
    <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-primary px-4 py-2.5 text-white shadow-card">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20"><Video className="h-4 w-4" fill="currentColor" /></span>
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold leading-tight">
            {t("Lecția video")}
            <span className="ml-2 font-semibold text-white/80">
              {othersInCall > 0
                ? t.n("{n} participant este deja în apel|{n} participanți sunt deja în apel|{n} de participanți sunt deja în apel", othersInCall)
                : t("Cameră și microfon direct în TeachFlow, fără Zoom sau Meet.")}
            </span>
          </p>
          {error && <p role="alert" className="mt-0.5 text-[12px] font-bold text-[#ffd7d7]">{error}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void engine.join("audio")} disabled={!!joining} title={t("Intră doar cu microfonul, fără cameră")} className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-extrabold text-white hover:bg-white/25 disabled:opacity-70">
          {joining === "audio" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />} {t("Doar audio")}
        </button>
        <button type="button" onClick={() => void engine.join("av")} disabled={!!joining} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-4 py-1.5 text-[12px] font-extrabold text-primary-2 hover:bg-tint disabled:opacity-70">
          {joining === "av" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />} {t("Intră în apel")}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Full call view (dark, covers the page)
// ---------------------------------------------------------------------------

interface ViewProps {
  engine: CallEngine;
  me: Props["me"];
  live: boolean;
  side: "chat" | "people" | null;
  openSide: (s: "chat" | "people" | null) => void;
}

interface TileModel {
  key: string; stream: MediaStream | null; name: string; mine: boolean; mic: boolean; cam: boolean; screen: boolean;
  teacher: boolean; status?: PeerStatus; quality: Quality; relay?: boolean; speaking?: boolean;
}

function useTiles(engine: CallEngine, me: Props["me"]): TileModel[] {
  const t = useT();
  const { local, mic, cam, sharing, peers, myQuality } = engine;
  const hasCamera = (local?.getVideoTracks().length ?? 0) > 0;
  return useMemo(() => [
    { key: "me", stream: local, name: t("Tu"), mine: true, mic, cam: (cam && hasCamera) || sharing, screen: sharing, teacher: me.role === "teacher", quality: myQuality },
    ...peers.map((p: CallParticipant) => ({
      key: p.key, stream: p.stream, name: p.name || t("Participant"), mine: false, mic: p.mic, cam: p.cam || !!p.screen, screen: !!p.screen,
      teacher: p.role === "teacher", status: p.status, quality: p.quality, relay: p.relay, speaking: p.speaking
    }))
  ], [local, mic, cam, hasCamera, sharing, peers, myQuality, me.role, t]);
}

function Stage({ engine, me, live, side, openSide, onBoard, lessonTitle }: ViewProps & { onBoard: () => void; lessonTitle?: string }) {
  const t = useT();
  const tiles = useTiles(engine, me);
  const [pinned, setPinned] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const others = tiles.filter(x => !x.mine);

  // Main video: a shared screen first, then the pinned person, then the teacher (for a student)
  // or the first student (for the teacher); alone in the call: yourself.
  const main =
    tiles.find(x => x.screen && !x.mine) ?? tiles.find(x => x.key === pinned) ?? tiles.find(x => x.mine && x.screen)
    ?? (me.role === "student" ? others.find(x => x.teacher) : undefined) ?? others[0] ?? tiles[0];
  const rest = tiles.filter(x => x.key !== main.key);
  // Many people and nobody sharing: an even grid works better than one big video.
  const grid = !main.screen && !pinned && tiles.length >= 4;

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  return (
    <div ref={rootRef} role="region" aria-label={t("Apel video")} className="fixed inset-0 z-[70] flex flex-col bg-[#0a0a26] text-white">
      {/* top bar */}
      <header className="flex items-center gap-3 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary"><Video className="h-4 w-4" fill="currentColor" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold leading-tight">{lessonTitle || t("Lecția video")}</p>
          <p className="flex items-center gap-2 text-[11px] text-white/60">
            <CallTimer since={engine.joinedAt} />
            <span aria-hidden>·</span>
            <span>{t.n("{n} participant|{n} participanți|{n} de participanți", tiles.length)}</span>
            <span className="hidden rounded bg-white/10 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide text-white/70 sm:inline" title={engine.transport === "sfu" ? t("Server video pentru grupuri (SFU)") : t("Conexiune directă între dispozitive (P2P)")}>
              {engine.transport === "sfu" ? "SFU" : "P2P"}
            </span>
          </p>
        </div>
        {engine.peers.length > 0 && <QualityBadge quality={engine.myQuality} relay={engine.relay} />}
        <button type="button" onClick={fullscreen} aria-label={t("Ecran complet")} title={t("Ecran complet")} className="hidden h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/10 hover:bg-white/20 sm:grid">
          <Maximize2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={onBoard} title={t("Înapoi la tablă: apelul continuă într-o fereastră mică")} className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12px] font-extrabold hover:bg-white/20">
          <Presentation className="h-4 w-4" /> <span className="hidden sm:inline">{t("Tablă")}</span>
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-2 pb-2 sm:px-4">
          <StatusLines engine={engine} me={me} live={live} dark />
          {grid ? (
            <div className={`grid min-h-0 flex-1 auto-rows-fr gap-2 ${tiles.length <= 4 ? "grid-cols-2" : tiles.length <= 9 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-3 md:grid-cols-4"}`}>
              {tiles.map(x => <Tile key={x.key} tile={x} onClick={() => setPinned(x.key)} className="h-full" />)}
            </div>
          ) : (
            <>
              <div className="relative min-h-0 flex-1">
                <Tile tile={main} big className="h-full" onClick={pinned ? () => setPinned(null) : undefined} pinned={pinned === main.key} />
              </div>
              {rest.length > 0 && (
                <div className="tf-scroll flex shrink-0 gap-2 overflow-x-auto pb-0.5">
                  {rest.map(x => <Tile key={x.key} tile={x} onClick={() => setPinned(x.key)} className="h-[84px] w-[150px] shrink-0 sm:h-[110px] sm:w-[196px]" />)}
                </div>
              )}
            </>
          )}
        </main>

        {side && (
          <aside className="absolute inset-x-0 bottom-0 z-10 flex h-[62%] flex-col rounded-t-[20px] bg-[#14143a] shadow-lift ring-1 ring-white/10 md:static md:h-auto md:w-[340px] md:rounded-none md:rounded-l-[20px]">
            <div className="flex items-center gap-1 border-b border-white/10 px-3 py-2">
              <SideTab active={side === "chat"} onClick={() => openSide("chat")} icon={MessageSquare} label={t("Chat")} />
              <SideTab active={side === "people"} onClick={() => openSide("people")} icon={Users} label={`${t("Participanți")} (${tiles.length})`} />
              <button type="button" onClick={() => openSide(null)} aria-label={t("Închide")} className="ml-auto grid h-8 w-8 cursor-pointer place-items-center rounded-full text-white/70 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            {side === "chat" ? <ChatBox lines={engine.chat} onSend={engine.sendChat} disabled={!live} roomy /> : <People tiles={tiles} me={me} />}
          </aside>
        )}
      </div>

      {/* control bar */}
      <footer className="flex items-center justify-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:gap-3">
        <Controls engine={engine} size="lg" />
        <span className="mx-1 h-8 w-px bg-white/10" aria-hidden />
        <BarButton onClick={() => openSide("chat")} active={side === "chat"} label={t("Chat")} icon={MessageSquare} badge={engine.unread} />
        <BarButton onClick={() => openSide("people")} active={side === "people"} label={t("Participanți")} icon={Users} className="hidden sm:grid" />
        <button type="button" onClick={engine.leave} aria-label={t("Ieși din apel")} title={t("Ieși din apel")} className="flex h-12 cursor-pointer items-center gap-2 rounded-full bg-[#e5484d] px-5 text-[13px] font-extrabold text-white hover:bg-[#c93a3f]">
          <PhoneOff className="h-5 w-5" /> <span className="hidden sm:inline">{t("Ieși")}</span>
        </button>
      </footer>
    </div>
  );
}

function SideTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Mic; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-extrabold ${active ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Small movable panel (so the whiteboard keeps the page)
// ---------------------------------------------------------------------------

function Panel({ engine, me, live, side, openSide, onStage, t }: ViewProps & { onStage: () => void; t: ReturnType<typeof useT> }) {
  const tiles = useTiles(engine, me);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [view, setView] = useState<PanelView>(loadView);

  const updateView = useCallback((patch: Partial<PanelView>) => {
    setView(v => {
      const next = { ...v, ...patch };
      try { localStorage.setItem(VIEW_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, []);

  useEffect(() => {
    // Keep the panel on screen when the window shrinks.
    const onResize = () => setView(v => (v.pos ? { ...v, pos: clampPos(v.pos, panelRef.current) } : v));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const box = panelRef.current?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setView(v => ({ ...v, pos: clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }, panelRef.current) }));
  };
  const onDragEnd = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setView(v => {
      try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* storage blocked */ }
      return v;
    });
  };

  const count = tiles.length;
  const tileW = view.large ? "w-[220px] sm:w-[260px]" : "w-[120px] sm:w-[150px]";
  const cols = count <= 2 ? "grid-cols-1" : "grid-cols-2";
  const place = view.pos ? undefined : "right-3 bottom-20 md:right-5 md:bottom-5";

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label={t("Apel video")}
      style={view.pos ? { left: view.pos.x, top: view.pos.y } : undefined}
      className={`fixed z-50 select-none overflow-hidden rounded-[16px] bg-navy shadow-lift ring-1 ring-white/10 ${place ?? ""}`}
    >
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        title={t("Mută fereastra")}
        className="flex cursor-grab touch-none items-center gap-1 px-2 py-1 text-white/80 active:cursor-grabbing"
      >
        <GripHorizontal className="h-4 w-4 shrink-0" />
        <span className="mr-auto flex min-w-0 items-center gap-1.5 truncate text-[11px] font-extrabold">
          {t("Apel video")} · {count} <QualityBars quality={engine.myQuality} small />
        </span>
        <MiniButton onClick={() => openSide("people")} label={t("Participanți")} icon={Users} active={side === "people"} />
        <span className="relative">
          <MiniButton onClick={() => openSide("chat")} label={t("Chat")} icon={MessageSquare} active={side === "chat"} />
          {engine.unread > 0 && <span className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#e5484d] px-0.5 text-[8px] font-extrabold text-white">{engine.unread > 9 ? "9+" : engine.unread}</span>}
        </span>
        {!view.min && (
          <MiniButton onClick={() => updateView({ large: !view.large })} label={view.large ? t("Camere mai mici") : t("Camere mai mari")} icon={view.large ? Shrink : Expand} />
        )}
        <MiniButton onClick={() => updateView({ min: !view.min })} label={view.min ? t("Arată camerele") : t("Ascunde camerele")} icon={view.min ? ChevronUp : ChevronDown} />
      </div>

      {/* Hidden, not unmounted, when minimised: the video elements also play the others' audio. */}
      <div className={view.min ? "hidden" : "px-1.5"}>
        <div className={`tf-scroll grid max-h-[55vh] gap-1.5 overflow-y-auto bg-navy ${cols}`}>
          {tiles.map(x => <Tile key={x.key} tile={x} className={`aspect-video ${tileW}`} />)}
        </div>
      </div>

      <div className="max-w-[300px] px-2 pt-1">
        <StatusLines engine={engine} me={me} live={live} />
      </div>

      {side === "people" && <div className="mx-2 mt-1 w-[260px] rounded-[10px] bg-white/5"><People tiles={tiles} me={me} compact /></div>}
      {side === "chat" && <div className="mx-2 mt-1 w-[260px] rounded-[10px] bg-white/5"><ChatBox lines={engine.chat} onSend={engine.sendChat} disabled={!live} /></div>}

      <div className="flex items-center justify-center gap-1.5 px-2 py-1.5">
        <Controls engine={engine} size="sm" />
        <CallButton onClick={onStage} active label={t("Mod apel: video mare")} icon={PanelsTopLeft} />
        <button type="button" onClick={engine.leave} aria-label={t("Ieși din apel")} title={t("Ieși din apel")} className="grid h-8 w-10 cursor-pointer place-items-center rounded-full bg-[#e5484d] text-white hover:bg-[#c93a3f]">
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function Controls({ engine, size }: { engine: CallEngine; size: "sm" | "lg" }) {
  const t = useT();
  const { mic, cam, sharing, local } = engine;
  const hasCamera = (local?.getVideoTracks().length ?? 0) > 0;
  const B = size === "lg" ? BarButton : CallButtonAdapter;
  return (
    <>
      <B onClick={engine.toggleMic} off={!mic} label={mic ? t("Oprește microfonul") : t("Pornește microfonul")} icon={mic ? Mic : MicOff} />
      <B onClick={() => void engine.toggleCam()} off={!(cam && hasCamera)} label={!hasCamera ? t("Pornește camera") : cam ? t("Oprește camera") : t("Pornește camera")} icon={cam && hasCamera ? Video : VideoOff} />
      <B onClick={() => void engine.toggleScreen()} active={sharing} label={sharing ? t("Oprește partajarea ecranului") : t("Arată ecranul în apel")} icon={sharing ? MonitorX : MonitorUp} className={size === "lg" ? "hidden sm:grid" : undefined} />
    </>
  );
}

function BarButton({ onClick, off, active, label, icon: Icon, badge, className = "" }: { onClick: () => void; off?: boolean; active?: boolean; label: string; icon: typeof Mic; badge?: number; className?: string }) {
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

function CallButtonAdapter({ onClick, off, active, label, icon }: { onClick: () => void; off?: boolean; active?: boolean; label: string; icon: typeof Mic; className?: string }) {
  return <CallButton onClick={onClick} active={!off && !active} label={label} icon={icon} />;
}

function StatusLines({ engine, me, live, dark }: { engine: CallEngine; me: Props["me"]; live: boolean; dark?: boolean }) {
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

function People({ tiles, me, compact }: { tiles: TileModel[]; me: Props["me"]; compact?: boolean }) {
  const t = useT();
  const statusText = (s?: PeerStatus) =>
    !s || s === "connected" ? t("Conectat") : s === "reconnecting" ? t("Se reconectează…") : s === "failed" ? t("Nu se poate conecta") : t("Se conectează…");
  return (
    <ul className={`tf-scroll overflow-y-auto ${compact ? "max-h-[30vh] space-y-1 p-2 text-[11px]" : "flex-1 space-y-1 p-3 text-[13px]"}`}>
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
  );
}

function ChatBox({ lines, onSend, disabled, roomy }: { lines: ChatLine[]; onSend: (text: string) => void; disabled: boolean; roomy?: boolean }) {
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

function Tile({ tile, big, className = "", onClick, pinned }: { tile: TileModel; big?: boolean; className?: string; onClick?: () => void; pinned?: boolean }) {
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

function Avatar({ name, big, small }: { name: string; big?: boolean; small?: boolean }) {
  const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const size = big ? "h-24 w-24 text-[30px]" : small ? "h-7 w-7 text-[10px]" : "h-10 w-10 text-[13px]";
  return <span className={`grid shrink-0 place-items-center rounded-full bg-primary font-extrabold text-white ${size}`}>{initials || "?"}</span>;
}

const QUALITY_COLOR: Record<Quality, string> = { good: "#3ecf8e", fair: "#f5b544", poor: "#ff6b6b", unknown: "rgba(255,255,255,.35)" };
const QUALITY_BARS: Record<Quality, number> = { good: 3, fair: 2, poor: 1, unknown: 0 };

function useQualityText() {
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

function QualityBadge({ quality, relay }: { quality: Quality; relay: boolean }) {
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

function CallTimer({ since }: { since: number | null }) {
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

function MiniButton({ onClick, label, icon: Icon, active }: { onClick: () => void; label: string; icon: typeof Mic; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active} className={`grid h-6 w-6 cursor-pointer place-items-center rounded-md hover:bg-white/15 hover:text-white ${active ? "bg-white/20 text-white" : "text-white/80"}`}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function CallButton({ onClick, active, label, icon: Icon }: { onClick: () => void; active: boolean; label: string; icon: typeof Mic }) {
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

interface PanelView { pos: { x: number; y: number } | null; large: boolean; min: boolean }
const VIEW_KEY = "tf-call-panel";

function loadView(): PanelView {
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
function clampPos(p: { x: number; y: number }, el: HTMLElement | null) {
  const w = el?.offsetWidth ?? 180;
  const h = el?.offsetHeight ?? 40;
  const maxX = Math.max(0, window.innerWidth - w - 4);
  const maxY = Math.max(0, window.innerHeight - Math.min(h, 40) - 4);
  return { x: Math.round(Math.min(Math.max(4, p.x), maxX)), y: Math.round(Math.min(Math.max(4, p.y), maxY)) };
}
