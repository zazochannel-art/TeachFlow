"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Circle, Download, Eraser, Grid3x3, Highlighter, Maximize2, Minimize2, Minus, MoveUpRight,
  Pen, Redo2, Square, Trash2, Type, Undo2, type LucideIcon
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  BOARD_H, BOARD_W, MAX_POINTS, MAX_TEXT, applyEvent, hitStroke, newId, sanitizeBoard, sanitizeEvent,
  textFontSize, type BoardEvent, type Stroke, type Tool
} from "@/lib/board/model";
import { drawGrid, drawStroke } from "@/lib/board/draw";

type ToolOrEraser = Tool | "eraser";
type HistoryEntry = { kind: "add" | "remove"; strokes: Stroke[] };
type Conn = "offline" | "connecting" | "live" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";
export interface BoardPeer { key: string; name: string; role: string }

const TOOL_BUTTONS: Array<{ tool: ToolOrEraser; label: string; icon: LucideIcon; key: string }> = [
  { tool: "pen", label: "Creion", icon: Pen, key: "p" },
  { tool: "highlighter", label: "Marker", icon: Highlighter, key: "m" },
  { tool: "line", label: "Linie", icon: Minus, key: "l" },
  { tool: "arrow", label: "Săgeată", icon: MoveUpRight, key: "s" },
  { tool: "rect", label: "Dreptunghi", icon: Square, key: "d" },
  { tool: "ellipse", label: "Elipsă", icon: Circle, key: "c" },
  { tool: "text", label: "Text", icon: Type, key: "t" },
  { tool: "eraser", label: "Radieră", icon: Eraser, key: "e" }
];

const COLORS = [
  { value: "#20234b", label: "Negru" },
  { value: "#5269e8", label: "Albastru" },
  { value: "#e5484d", label: "Roșu" },
  { value: "#30a46c", label: "Verde" },
  { value: "#f5a524", label: "Galben" },
  { value: "#8e4ec6", label: "Violet" }
];
const SIZES = [{ value: 3, label: "Subțire" }, { value: 6, label: "Mediu" }, { value: 12, label: "Gros" }];
const ERASER_RADIUS = 14;
const SAVE_DELAY = 1200;
const PROGRESS_EVERY = 50;

interface Props {
  lessonId: string;
  initial: unknown;
  /** false in demo mode (no Supabase): the board works locally but is neither shared nor saved. */
  live: boolean;
  me: { id: string; name: string; role: "teacher" | "student" };
  title: string;
}

/**
 * Shared lesson whiteboard. Strokes are sent to the other participants over a private
 * Supabase Realtime channel and the full board is saved to `lesson_boards` (debounced).
 */
export function Whiteboard({ lessonId, initial, live, me, title }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>(() => sanitizeBoard(initial));
  const [tool, setTool] = useState<ToolOrEraser>("pen");
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(SIZES[0].value);
  const [grid, setGrid] = useState(false);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [conn, setConn] = useState<Conn>(live ? "connecting" : "offline");
  const [save, setSave] = useState<SaveState>("idle");
  const [peers, setPeers] = useState<BoardPeer[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const [cssSize, setCssSize] = useState({ w: 0, h: 0 });

  const frameRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef(strokes);
  const currentRef = useRef<Stroke | null>(null);
  const erasedRef = useRef<Stroke[]>([]);
  const remoteRef = useRef(new Map<string, Stroke>());
  const rafRef = useRef(0);
  const baseDirtyRef = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressRef = useRef(0);
  const tabKeyRef = useRef("");
  const fontRef = useRef("sans-serif");
  const sizeRef = useRef(cssSize);
  const gridRef = useRef(grid);

  // ---------- rendering ----------

  const render = useCallback(() => {
    rafRef.current = 0;
    const canvas = canvasRef.current;
    const { w, h } = sizeRef.current;
    if (!canvas || w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; baseDirtyRef.current = true; }
    const scale = pw / BOARD_W;

    let base = baseRef.current;
    if (!base) { base = document.createElement("canvas"); baseRef.current = base; }
    if (baseDirtyRef.current || base.width !== pw || base.height !== ph) {
      base.width = pw; base.height = ph;
      const b = base.getContext("2d")!;
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.fillStyle = "#ffffff";
      b.fillRect(0, 0, pw, ph);
      b.setTransform(scale, 0, 0, scale, 0, 0);
      if (gridRef.current) drawGrid(b);
      for (const s of strokesRef.current) drawStroke(b, s, fontRef.current);
      baseDirtyRef.current = false;
    }

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    for (const s of remoteRef.current.values()) drawStroke(ctx, s, fontRef.current);
    if (currentRef.current) drawStroke(ctx, currentRef.current, fontRef.current);
  }, []);

  const requestDraw = useCallback((baseChanged = false) => {
    if (baseChanged) baseDirtyRef.current = true;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(render);
  }, [render]);

  useEffect(() => {
    strokesRef.current = strokes;
    requestDraw(true);
  }, [strokes, requestDraw]);

  useEffect(() => {
    gridRef.current = grid;
    requestDraw(true);
  }, [grid, requestDraw]);

  useEffect(() => {
    sizeRef.current = cssSize;
    requestDraw(true);
  }, [cssSize, requestDraw]);

  // Fit the 16:10 board inside its holder (also in fullscreen).
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    fontRef.current = getComputedStyle(document.body).fontFamily || "sans-serif";
    const fit = () => {
      const r = holder.getBoundingClientRect();
      const scale = Math.min(r.width / BOARD_W, (r.height || r.width * BOARD_H / BOARD_W) / BOARD_H);
      setCssSize({ w: Math.floor(BOARD_W * scale), h: Math.floor(BOARD_H * scale) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(holder);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // ---------- saving ----------

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (!live) return;
    const supabase = createClient();
    if (!supabase) return;
    setSave("saving");
    const { error } = await supabase
      .from("lesson_boards")
      .upsert({ lesson_id: lessonId, data: { v: 1, strokes: strokesRef.current } }, { onConflict: "lesson_id" });
    setSave(error ? "error" : "saved");
  }, [live, lessonId]);

  const scheduleSave = useCallback(() => {
    if (!live) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSave("saving");
    saveTimerRef.current = setTimeout(() => { void flushSave(); }, SAVE_DELAY);
  }, [live, flushSave]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden" && saveTimerRef.current) void flushSave(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (saveTimerRef.current) void flushSave();
    };
  }, [flushSave]);

  // ---------- live channel ----------

  const send = useCallback((ev: BoardEvent) => {
    const ch = channelRef.current;
    if (ch) void ch.send({ type: "broadcast", event: "board", payload: ev });
  }, []);

  /** Applies a committed change made here: state, history, peers and the saved copy. */
  const commit = useCallback((ev: BoardEvent) => {
    const next = applyEvent(strokesRef.current, ev);
    strokesRef.current = next;
    setStrokes(next);
    send(ev);
    scheduleSave();
  }, [send, scheduleSave]);

  useEffect(() => {
    if (!live) return;
    const supabase = createClient();
    if (!supabase) return;
    let cancelled = false;
    tabKeyRef.current = `${me.id}:${newId().slice(0, 8)}`;
    const pending: BoardEvent[] = [];
    let synced = false;

    const onRemote = (payload: unknown) => {
      const ev = sanitizeEvent(payload);
      if (!ev) return;
      if (ev.type === "progress") {
        if (ev.stroke) remoteRef.current.set(ev.by, ev.stroke); else remoteRef.current.delete(ev.by);
        requestDraw();
        return;
      }
      if (ev.type === "add") for (const [by, s] of remoteRef.current) if (ev.strokes.some(x => x.id === s.id)) remoteRef.current.delete(by);
      if (!synced) pending.push(ev);
      const next = applyEvent(strokesRef.current, ev);
      strokesRef.current = next;
      setStrokes(next);
    };

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      const channel = supabase.channel(`board:${lessonId}`, {
        config: { private: true, broadcast: { self: false }, presence: { key: tabKeyRef.current } }
      });
      channelRef.current = channel;
      channel
        .on("broadcast", { event: "board" }, ({ payload }) => onRemote(payload))
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState<{ name: string; role: string }>();
          const list: BoardPeer[] = [];
          for (const [key, metas] of Object.entries(state)) {
            const m = metas[0];
            if (m) list.push({ key, name: String(m.name ?? "").slice(0, 60), role: String(m.role ?? "") });
          }
          const online = new Set(list.map(p => p.key));
          for (const by of remoteRef.current.keys()) if (!online.has(by)) remoteRef.current.delete(by);
          setPeers(list.filter(p => p.key !== tabKeyRef.current));
        })
        .subscribe(async status => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setConn("live");
            await channel.track({ name: me.name, role: me.role });
            // Catch up with whatever was saved between page load and joining the channel.
            const { data } = await supabase.from("lesson_boards").select("data").eq("lesson_id", lessonId).maybeSingle();
            if (cancelled) return;
            if (data) {
              let next = sanitizeBoard(data.data);
              for (const ev of pending) next = applyEvent(next, ev);
              // Keep strokes drawn here meanwhile that the snapshot does not know yet.
              const known = new Set(next.map(s => s.id));
              const local = strokesRef.current.filter(s => !known.has(s.id) && !pending.some(p => p.type === "add" && p.strokes.some(x => x.id === s.id)));
              next = applyEvent(next, { type: "add", strokes: local });
              strokesRef.current = next;
              setStrokes(next);
            }
            synced = true;
            pending.length = 0;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConn("error");
          } else if (status === "CLOSED") {
            setConn("offline");
          }
        });
    })();

    return () => {
      cancelled = true;
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [live, lessonId, me.id, me.name, me.role, requestDraw]);

  // ---------- history ----------

  const pushHistory = useCallback((entry: HistoryEntry) => {
    setUndoStack(u => [...u.slice(-99), entry]);
    setRedoStack([]);
  }, []);

  const replay = useCallback((entry: HistoryEntry, inverse: boolean) => {
    const add = (entry.kind === "add") !== inverse;
    if (add) {
      commit({ type: "add", strokes: entry.strokes });
    } else {
      commit({ type: "remove", ids: entry.strokes.map(s => s.id) });
    }
  }, [commit]);

  const undo = useCallback(() => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    replay(entry, true);
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack(r => [...r, entry]);
  }, [undoStack, replay]);

  const redo = useCallback(() => {
    const entry = redoStack[redoStack.length - 1];
    if (!entry) return;
    replay(entry, false);
    setRedoStack(redoStack.slice(0, -1));
    setUndoStack(u => [...u, entry]);
  }, [redoStack, replay]);

  const clearBoard = () => {
    const all = strokesRef.current;
    if (all.length === 0) return;
    if (!window.confirm("Ștergi tot de pe tablă? Poți reveni cu „Anulează”.")) return;
    commit({ type: "clear" });
    pushHistory({ kind: "remove", strokes: all });
  };

  // ---------- pointer input ----------

  const toBoard = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: Math.round(((e.clientX - r.left) / r.width) * BOARD_W), y: Math.round(((e.clientY - r.top) / r.height) * BOARD_H) };
  };

  const sendProgress = (force = false) => {
    const now = performance.now();
    if (!force && now - lastProgressRef.current < PROGRESS_EVERY) return;
    lastProgressRef.current = now;
    send({ type: "progress", by: tabKeyRef.current, stroke: currentRef.current });
  };

  const eraseAt = (x: number, y: number) => {
    const hits = strokesRef.current.filter(s => hitStroke(s, x, y, ERASER_RADIUS));
    if (hits.length === 0) return;
    erasedRef.current.push(...hits);
    commit({ type: "remove", ids: hits.map(s => s.id) });
  };

  const draftRef = useRef(textDraft);
  useEffect(() => { draftRef.current = textDraft; }, [textDraft]);

  const commitText = useCallback(() => {
    const draft = draftRef.current;
    draftRef.current = null;
    setTextDraft(null);
    if (!draft || !draft.value.trim()) return;
    const s: Stroke = { id: newId(), tool: "text", color, size, points: [draft.x, draft.y], text: draft.value.slice(0, MAX_TEXT) };
    commit({ type: "add", strokes: [s] });
    pushHistory({ kind: "add", strokes: [s] });
  }, [color, size, commit, pushHistory]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    // Keep focus where it is (e.g. in the text box) and skip emulated mouse events.
    e.preventDefault();
    const { x, y } = toBoard(e);
    if (tool === "text") {
      if (textDraft) commitText();
      else { draftRef.current = { x, y, value: "" }; setTextDraft(draftRef.current); }
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "eraser") {
      erasedRef.current = [];
      eraseAt(x, y);
      return;
    }
    const points = tool === "pen" || tool === "highlighter" ? [x, y] : [x, y, x, y];
    currentRef.current = { id: newId(), tool, color, size, points };
    requestDraw();
    sendProgress(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    const samples = events.length ? events : [e.nativeEvent];
    if (tool === "eraser") {
      for (const ev of samples) { const p = toBoard(ev); eraseAt(p.x, p.y); }
      return;
    }
    const cur = currentRef.current;
    if (!cur) return;
    if (cur.tool === "pen" || cur.tool === "highlighter") {
      for (const ev of samples) {
        const { x, y } = toBoard(ev);
        const n = cur.points.length;
        if (Math.hypot(x - cur.points[n - 2], y - cur.points[n - 1]) >= 2 && n < MAX_POINTS * 2) cur.points.push(x, y);
      }
    } else {
      const { x, y } = toBoard(e);
      cur.points[2] = x; cur.points[3] = y;
    }
    requestDraw();
    sendProgress();
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (tool === "eraser") {
      if (erasedRef.current.length) pushHistory({ kind: "remove", strokes: erasedRef.current });
      erasedRef.current = [];
      return;
    }
    const cur = currentRef.current;
    currentRef.current = null;
    if (!cur) return;
    sendProgress(true);
    const [x0, y0, x1, y1] = cur.points;
    const isShape = cur.tool !== "pen" && cur.tool !== "highlighter";
    if (isShape && Math.hypot(x1 - x0, y1 - y0) < 4) { requestDraw(); return; }
    commit({ type: "add", strokes: [cur] });
    pushHistory({ kind: "add", strokes: [cur] });
  };

  // ---------- keyboard ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === "y") { e.preventDefault(); redo(); return; }
      if (mod || e.altKey) return;
      const btn = TOOL_BUTTONS.find(b => b.key === k);
      if (btn) setTool(btn.tool);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---------- actions ----------

  const download = () => {
    const c = document.createElement("canvas");
    c.width = BOARD_W; c.height = BOARD_H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    if (grid) drawGrid(ctx);
    for (const s of strokesRef.current) drawStroke(ctx, s, fontRef.current);
    c.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `tabla-${title.toLowerCase().replace(/[^a-z0-9ăâîșțşţ]+/gi, "-").replace(/^-|-$/g, "") || "lectie"}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen?.();
  };

  const scale = cssSize.w / BOARD_W;
  const cursor = tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair";

  return (
    <div ref={frameRef} className={`flex flex-col gap-3 ${fullscreen ? "h-screen bg-canvas p-4" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-line/70 bg-white p-2 shadow-card">
        <div role="toolbar" aria-label="Instrumente" className="flex flex-wrap items-center gap-1">
          {TOOL_BUTTONS.map(({ tool: t, label, icon: Icon, key }) => (
            <button
              key={t}
              type="button"
              onClick={() => { if (textDraft) commitText(); setTool(t); }}
              aria-pressed={tool === t}
              title={`${label} (${key.toUpperCase()})`}
              aria-label={label}
              className={`grid h-9 w-9 cursor-pointer place-items-center rounded-xl transition-colors ${tool === t ? "bg-primary text-white shadow-md" : "text-ink hover:bg-soft"}`}
            >
              <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
            </button>
          ))}
        </div>

        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />

        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Culoare">
          {COLORS.map(c => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={color === c.value}
              aria-label={c.label}
              title={c.label}
              onClick={() => setColor(c.value)}
              className={`h-7 w-7 cursor-pointer rounded-full border-2 transition-transform ${color === c.value ? "scale-110 border-white ring-2 ring-primary" : "border-white ring-1 ring-line hover:scale-105"}`}
              style={{ background: c.value }}
            />
          ))}
        </div>

        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />

        <div className="flex items-center gap-1" role="radiogroup" aria-label="Grosime">
          {SIZES.map(s => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={size === s.value}
              aria-label={s.label}
              title={s.label}
              onClick={() => setSize(s.value)}
              className={`grid h-9 w-9 cursor-pointer place-items-center rounded-xl ${size === s.value ? "bg-tint" : "hover:bg-soft"}`}
            >
              <span className="rounded-full bg-ink" style={{ width: 4 + s.value, height: 4 + s.value }} />
            </button>
          ))}
        </div>

        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />

        <div className="flex items-center gap-1">
          <IconButton label="Anulează (Ctrl+Z)" icon={Undo2} onClick={undo} disabled={undoStack.length === 0} />
          <IconButton label="Refă (Ctrl+Y)" icon={Redo2} onClick={redo} disabled={redoStack.length === 0} />
          <IconButton label="Caroiaj" icon={Grid3x3} onClick={() => setGrid(g => !g)} pressed={grid} />
          {me.role === "teacher" && <IconButton label="Șterge tabla" icon={Trash2} onClick={clearBoard} disabled={strokes.length === 0} />}
          <IconButton label="Descarcă PNG" icon={Download} onClick={download} />
          <IconButton label={fullscreen ? "Ieși din ecran complet" : "Ecran complet"} icon={fullscreen ? Minimize2 : Maximize2} onClick={toggleFullscreen} />
        </div>

        <div className="ml-auto flex items-center gap-3 px-2 text-[11px] font-bold">
          <PeersBadge peers={peers} />
          <StatusDot conn={conn} save={save} />
        </div>
      </div>

      <div ref={holderRef} className={`relative w-full ${fullscreen ? "min-h-0 flex-1" : "aspect-[16/10] max-h-[calc(100vh-140px)]"} flex items-center justify-center`}>
        <div className="relative overflow-hidden rounded-[20px] border border-line/70 shadow-card" style={{ width: cssSize.w || "100%", height: cssSize.h || "100%" }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Tabla lecției ${title}`}
            data-strokes={strokes.length}
            className="block h-full w-full touch-none select-none"
            style={{ cursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {textDraft && (
            <textarea
              autoFocus
              value={textDraft.value}
              maxLength={MAX_TEXT}
              onChange={e => { const next = { ...textDraft, value: e.target.value }; draftRef.current = next; setTextDraft(next); }}
              onBlur={commitText}
              onKeyDown={e => {
                if (e.key === "Escape") { draftRef.current = null; setTextDraft(null); }
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); }
              }}
              placeholder="Scrie aici…"
              aria-label="Text pe tablă"
              className="absolute z-10 min-w-[140px] resize-none rounded-md border border-dashed border-primary bg-white/80 p-0 font-bold outline-none"
              rows={Math.max(1, textDraft.value.split("\n").length)}
              style={{
                left: textDraft.x * scale,
                top: textDraft.y * scale,
                color,
                fontSize: textFontSize(size) * scale,
                lineHeight: 1.25,
                width: Math.max(140, (Math.max(...textDraft.value.split("\n").map(l => l.length), 8) + 2) * textFontSize(size) * scale * 0.6)
              }}
            />
          )}
        </div>
      </div>
      {!live && <p className="text-[11px] text-muted">Mod demo: tabla funcționează, dar nu se salvează și nu se partajează.</p>}
    </div>
  );
}

function IconButton({ label, icon: Icon, onClick, disabled, pressed }: { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
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

function PeersBadge({ peers }: { peers: BoardPeer[] }) {
  if (peers.length === 0) return null;
  const names = peers.map(p => p.name || (p.role === "teacher" ? "Profesor" : "Elev"));
  return (
    <span className="flex items-center gap-1.5 text-primary-2" title={names.join(", ")}>
      <span className="flex -space-x-1.5">
        {names.slice(0, 3).map((n, i) => (
          <span key={i} className="grid h-6 w-6 place-items-center rounded-full bg-tint text-[9px] font-extrabold ring-2 ring-white">
            {n.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()}
          </span>
        ))}
      </span>
      <span className="hidden md:inline">{names.length === 1 ? names[0] : `${names.length} participanți`}</span>
    </span>
  );
}

function StatusDot({ conn, save }: { conn: Conn; save: SaveState }) {
  const map = {
    live: { dot: "bg-emerald-500", text: save === "saving" ? "Se salvează…" : save === "error" ? "Nu s-a salvat" : "Live" },
    connecting: { dot: "bg-amber-400", text: "Se conectează…" },
    error: { dot: "bg-red-500", text: "Fără conexiune live" },
    offline: { dot: "bg-slate-300", text: "Local" }
  } as const;
  const m = map[conn];
  const text = conn !== "live" && save === "error" ? "Nu s-a salvat" : m.text;
  return (
    <span className="flex items-center gap-1.5 text-muted" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${save === "error" ? "bg-red-500" : m.dot}`} />
      {text}
    </span>
  );
}
