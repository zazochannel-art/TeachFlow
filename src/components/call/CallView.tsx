"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronUp, Expand, GripHorizontal, Loader2, Maximize2, MessageSquare, Mic, PanelsTopLeft, PhoneOff,
  Presentation, Shrink, Users, Video, X
} from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { CallEngine, CallParticipant, ScreenAccess } from "./types";
import {
  BarButton, CallButton, type CallMe, CallTimer, ChatBox, clampPos, Controls, loadView, MiniButton, type PanelView,
  People, QualityBadge, QualityBars, StatusLines, Tile, type TileModel, VIEW_KEY
} from "./CallParts";

interface Props {
  engine: CallEngine;
  me: CallMe;
  live: boolean;
  lessonTitle?: string;
  /** Screen sharing rights; without it everybody may share. */
  screen?: ScreenAccess;
}

type Layout = "stage" | "panel";
const LAYOUT_KEY = "tf-call-layout";
function loadLayout(): Layout {
  try { return typeof window !== "undefined" && localStorage.getItem(LAYOUT_KEY) === "panel" ? "panel" : "stage"; } catch { return "stage"; }
}

/** The call UI, the same for the P2P mesh and the SFU: a join bar, then a full call view or a small panel. */
export function CallView({ engine, me, live, lessonTitle, screen }: Props) {
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

  const common = { engine, me, live, side, openSide, screen };
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
  me: CallMe;
  live: boolean;
  side: "chat" | "people" | null;
  openSide: (s: "chat" | "people" | null) => void;
  screen?: ScreenAccess;
}

function useTiles(engine: CallEngine, me: CallMe): TileModel[] {
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

function Stage({ engine, me, live, side, openSide, screen, onBoard, lessonTitle }: ViewProps & { onBoard: () => void; lessonTitle?: string }) {
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
            {side === "chat" ? <ChatBox lines={engine.chat} onSend={engine.sendChat} disabled={!live} roomy /> : <People tiles={tiles} me={me} screen={screen} />}
          </aside>
        )}
      </div>

      {/* control bar */}
      <footer className="flex items-center justify-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:gap-3">
        <Controls engine={engine} size="lg" canShare={screen?.canShare ?? true} />
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

function Panel({ engine, me, live, side, openSide, screen, onStage, t }: ViewProps & { onStage: () => void; t: ReturnType<typeof useT> }) {
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

      {side === "people" && <div className="mx-2 mt-1 w-[260px] rounded-[10px] bg-white/5"><People tiles={tiles} me={me} screen={screen} compact /></div>}
      {side === "chat" && <div className="mx-2 mt-1 w-[260px] rounded-[10px] bg-white/5"><ChatBox lines={engine.chat} onSend={engine.sendChat} disabled={!live} /></div>}

      <div className="flex items-center justify-center gap-1.5 px-2 py-1.5">
        <Controls engine={engine} size="sm" canShare={screen?.canShare ?? true} />
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
