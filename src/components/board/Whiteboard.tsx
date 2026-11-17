"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Download, Grid3x3, ImagePlus, Loader2, Maximize2, Minimize2, Paperclip, PencilLine, PencilOff, Redo2, Trash2, Undo2
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  BOARD_H, BOARD_W, MAX_POINTS, MAX_TEXT, applyEvent, hitStroke, newId, sanitizeBoard, sanitizeEvent,
  textFontSize, type BoardEvent, type Stroke
} from "@/lib/board/model";
import { drawGrid, drawStroke } from "@/lib/board/draw";
import { FILE_ACCEPT, FILES_BUCKET, MAX_FILE_BYTES, isImage, storageName, uploadContentType } from "@/lib/files";
import { LessonFiles, type LessonFile } from "./LessonFiles";
import { useT } from "@/lib/i18n/client";
import type { BoardAccess } from "@/lib/data/board";
import { saveBlob } from "@/lib/native";

import {
  BoardAccessPanel, COLORS, DrawControls, IconButton, PeersBadge, SIZES, StatusDot, TOOL_BUTTONS,
  type BoardPeer, type Conn, type HistoryEntry, type SaveState, type ToolOrEraser
} from "./WhiteboardParts";

export type { BoardPeer } from "./WhiteboardParts";

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
  /** Who may draw (migration 0019). When not ready, everybody in the lesson draws, as before. */
  access: BoardAccess;
}

/**
 * Shared lesson whiteboard. Strokes are sent to the other participants over a private
 * Supabase Realtime channel and the full board is saved to `lesson_boards` (debounced).
 */
export function Whiteboard({ lessonId, initial, live, me, title, access }: Props) {
  const t = useT();
  const isTeacher = me.role === "teacher";
  // Drawing access is enforced only on a live board with migration 0019; the database decides, this mirrors it.
  const enforced = live && access.ready;
  const [writers, setWriters] = useState<string[]>(access.writers);
  const canDraw = isTeacher || !enforced || writers.includes(me.id);
  const canDrawRef = useRef(canDraw);
  const [rejoin, setRejoin] = useState(0);
  const [showAccess, setShowAccess] = useState(false);
  const [accessBusy, setAccessBusy] = useState("");
  const [accessNote, setAccessNote] = useState("");
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
  const [uploading, setUploading] = useState(0);
  const [fileError, setFileError] = useState("");
  const [showFiles, setShowFiles] = useState(false);
  const [localFiles, setLocalFiles] = useState<LessonFile[]>([]);
  const [filesVersion, setFilesVersion] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement | "loading" | "error">());

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
  const getImageRef = useRef<(src: string) => HTMLImageElement | null>(() => null);

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
      // Pictures go underneath, so drawings made on top of them stay visible.
      for (const s of strokesRef.current) if (s.tool === "image") drawStroke(b, s, fontRef.current, getImageRef.current);
      for (const s of strokesRef.current) if (s.tool !== "image") drawStroke(b, s, fontRef.current);
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

  // Pictures on the board: Storage files get a short-lived signed link; demo pictures use blob: URLs.
  useEffect(() => {
    getImageRef.current = (src: string) => {
      const cached = imagesRef.current.get(src);
      if (cached instanceof HTMLImageElement) return cached;
      if (cached) return null;
      imagesRef.current.set(src, "loading");
      void (async () => {
        let url = src;
        if (!src.startsWith("blob:")) {
          const supabase = createClient();
          const signed = supabase ? await supabase.storage.from(FILES_BUCKET).createSignedUrl(src, 3600) : null;
          if (!signed?.data?.signedUrl) { imagesRef.current.set(src, "error"); return; }
          url = signed.data.signedUrl;
        }
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { imagesRef.current.set(src, img); requestDraw(true); };
        img.onerror = () => imagesRef.current.set(src, "error");
        img.src = url;
      })();
      return null;
    };
    requestDraw(true);
  }, [requestDraw]);

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
    if (!canDrawRef.current) { setSave("idle"); return; }
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
    if (!canDrawRef.current) return;
    const next = applyEvent(strokesRef.current, ev);
    strokesRef.current = next;
    setStrokes(next);
    send(ev);
    scheduleSave();
  }, [send, scheduleSave]);

  // ---------- drawing access ----------

  /**
   * Reads who may draw from the database (the teacher's change arrives as a ping on the channel).
   * A student who gains or loses access is told, loses what was in progress, and joins the channel
   * again: Realtime checks the right to send when the channel is joined.
   */
  const refreshAccess = useCallback(async () => {
    if (!enforced) return;
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase.from("lesson_board_access").select("user_id").eq("lesson_id", lessonId);
    if (error) return;
    const next = ((data as { user_id: string }[] | null) ?? []).map(r => r.user_id);
    setWriters(next);
    if (isTeacher) return;
    const allowed = next.includes(me.id);
    if (allowed === canDrawRef.current) return;
    canDrawRef.current = allowed;
    currentRef.current = null;
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    setTextDraft(null);
    setUndoStack([]);
    setRedoStack([]);
    setSave("idle");
    setAccessNote(allowed ? t("Profesorul ți-a dat acces: acum poți desena și scrie pe tablă.") : t("Profesorul a oprit accesul tău la desenare. Vezi în continuare tabla."));
    setRejoin(n => n + 1);
  }, [enforced, lessonId, isTeacher, me.id, t]);

  /** Teacher: lets one student draw, or stops it. */
  const setStudentAccess = useCallback(async (userId: string, allow: boolean) => {
    const supabase = createClient();
    if (!supabase || !isTeacher) return;
    setAccessBusy(userId);
    setAccessNote("");
    const q = allow
      ? supabase.from("lesson_board_access").upsert({ lesson_id: lessonId, user_id: userId }, { onConflict: "lesson_id,user_id", ignoreDuplicates: true })
      : supabase.from("lesson_board_access").delete().eq("lesson_id", lessonId).eq("user_id", userId);
    const { error } = await q;
    setAccessBusy("");
    if (error) { setAccessNote(t("Nu s-a putut schimba accesul. Încearcă din nou.")); return; }
    setWriters(list => (allow ? [...new Set([...list, userId])] : list.filter(id => id !== userId)));
    const ch = channelRef.current;
    if (ch) void ch.send({ type: "broadcast", event: "access", payload: {} });
  }, [isTeacher, lessonId, t]);

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
        .on("broadcast", { event: "files" }, () => setFilesVersion(v => v + 1))
        .on("broadcast", { event: "access" }, () => { void refreshAccess(); })
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
            // The access list may have changed while this tab was not listening.
            void refreshAccess();
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
  }, [live, lessonId, me.id, me.name, me.role, requestDraw, refreshAccess, rejoin]);

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
    if (!window.confirm(t("Ștergi tot de pe tablă? Poți reveni cu „Anulează”."))) return;
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
    if (!canDraw) return;
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

  // ---------- files and pictures ----------

  /** Uploads one file: pictures are placed on the board, other files go to the lesson's file list. */
  const addFile = useCallback(async (file: File, at?: { x: number; y: number }) => {
    if (!canDrawRef.current) return;
    setFileError("");
    if (file.size > MAX_FILE_BYTES) { setFileError(t("„{name}” e prea mare (maxim 25 MB).", { name: file.name })); return; }
    const picture = isImage(file) && file.type !== "image/svg+xml";
    let src: string;
    if (live) {
      const supabase = createClient();
      if (!supabase) return;
      src = `lesson/${lessonId}/${storageName(file.name, newId())}`;
      setUploading(n => n + 1);
      const { error } = await supabase.storage.from(FILES_BUCKET).upload(src, file, { contentType: uploadContentType(file.type) });
      setUploading(n => n - 1);
      if (error) { setFileError(t("Nu s-a putut încărca „{name}”.", { name: file.name })); return; }
      const ch = channelRef.current;
      if (ch) void ch.send({ type: "broadcast", event: "files", payload: {} });
      setFilesVersion(v => v + 1);
    } else {
      src = URL.createObjectURL(file);
      setLocalFiles(list => [...list, { key: src, name: file.name, size: file.size, url: src }]);
    }
    if (!picture) { setShowFiles(true); return; }

    // Natural size, fitted into at most 60% of the board, centred on the drop point (or the board).
    const dims = await new Promise<{ w: number; h: number }>(resolve => {
      const probe = new Image();
      const url = URL.createObjectURL(file);
      probe.onload = () => { resolve({ w: probe.naturalWidth || 800, h: probe.naturalHeight || 600 }); URL.revokeObjectURL(url); };
      probe.onerror = () => { resolve({ w: 800, h: 600 }); URL.revokeObjectURL(url); };
      probe.src = url;
    });
    const k = Math.min(1, (BOARD_W * 0.6) / dims.w, (BOARD_H * 0.6) / dims.h);
    const w = Math.round(dims.w * k), h = Math.round(dims.h * k);
    const cx = at?.x ?? BOARD_W / 2, cy = at?.y ?? BOARD_H / 2;
    const x0 = Math.round(Math.min(Math.max(cx - w / 2, 0), BOARD_W - w)), y0 = Math.round(Math.min(Math.max(cy - h / 2, 0), BOARD_H - h));
    const stroke: Stroke = { id: newId(), tool: "image", color: "#000000", size: 1, points: [x0, y0, x0 + w, y0 + h], src };
    commit({ type: "add", strokes: [stroke] });
    pushHistory({ kind: "add", strokes: [stroke] });
  }, [live, lessonId, t, commit, pushHistory]);

  const addFiles = useCallback((list: FileList | File[] | null, at?: { x: number; y: number }) => {
    if (!list) return;
    for (const f of [...list].slice(0, 10)) void addFile(f, at);
  }, [addFile]);

  // Paste a picture (Ctrl+V) straight onto the board.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const files = [...(e.clipboardData?.files ?? [])].filter(f => isImage(f));
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  // ---------- keyboard ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!canDrawRef.current) return;
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
    for (const s of strokesRef.current) if (s.tool === "image") drawStroke(ctx, s, fontRef.current, getImageRef.current);
    for (const s of strokesRef.current) if (s.tool !== "image") drawStroke(ctx, s, fontRef.current);
    c.toBlob(blob => {
      if (!blob) return;
      void saveBlob(blob, `tabla-${title.toLowerCase().replace(/[^a-z0-9ăâîșțşţ]+/gi, "-").replace(/^-|-$/g, "") || "lectie"}.png`);
    }, "image/png");
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen?.();
  };

  const scale = cssSize.w / BOARD_W;
  const cursor = !canDraw ? "default" : tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair";
  const onlineUsers = new Set(peers.map(p => p.key.split(":")[0]));

  return (
    <div ref={frameRef} className={`flex flex-col gap-3 ${fullscreen ? "h-screen bg-canvas p-4" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-line/70 bg-white p-2 shadow-card">
        {!canDraw && (
          <span className="flex items-center gap-1.5 rounded-xl bg-soft px-3 py-2 text-[12px] font-bold text-muted" data-testid="board-readonly">
            <PencilOff className="h-4 w-4 shrink-0" /> {t("Doar vizualizare: profesorul îți poate da acces la desenare.")}
          </span>
        )}
        {canDraw && <>
        <DrawControls tool={tool} color={color} size={size} onColor={setColor} onSize={setSize}
          onTool={tb => { if (textDraft) commitText(); setTool(tb); }} />
        </>}

        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />

        <div className="flex items-center gap-1">
          {canDraw && <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading > 0}
            title={t("Adaugă poză sau fișier (sau Ctrl+V / trage pe tablă)")}
            aria-label={t("Adaugă poză sau fișier")}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-tint px-2.5 text-[12px] font-bold text-primary-2 hover:bg-[#dfe4fb] disabled:cursor-not-allowed disabled:opacity-40">
            {uploading > 0 ? <Loader2 className="h-[17px] w-[17px] animate-spin" /> : <ImagePlus className="h-[17px] w-[17px]" />}
            <span className="hidden lg:inline">{t("Adaugă")}</span>
          </button>}
          <input ref={fileInputRef} type="file" multiple accept={FILE_ACCEPT} className="sr-only" tabIndex={-1}
            onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
          <IconButton label={t("Fișierele lecției")} icon={Paperclip} onClick={() => setShowFiles(v => !v)} pressed={showFiles} />
        </div>

        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />

        <div className="flex items-center gap-1">
          {canDraw && <IconButton label={t("Anulează (Ctrl+Z)")} icon={Undo2} onClick={undo} disabled={undoStack.length === 0} />}
          {canDraw && <IconButton label={t("Refă (Ctrl+Y)")} icon={Redo2} onClick={redo} disabled={redoStack.length === 0} />}
          <IconButton label={t("Caroiaj")} icon={Grid3x3} onClick={() => setGrid(g => !g)} pressed={grid} />
          {me.role === "teacher" && <IconButton label={t("Șterge tabla")} icon={Trash2} onClick={clearBoard} disabled={strokes.length === 0} />}
          <IconButton label={t("Descarcă PNG")} icon={Download} onClick={download} />
          <IconButton label={fullscreen ? t("Ieși din ecran complet") : t("Ecran complet")} icon={fullscreen ? Minimize2 : Maximize2} onClick={toggleFullscreen} />
        </div>

        {isTeacher && enforced && (
          <button type="button" onClick={() => setShowAccess(v => !v)} aria-expanded={showAccess} data-testid="board-access-button"
            title={t("Alege ce elevi pot desena și scrie pe tablă")}
            className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-bold ${showAccess ? "bg-primary text-white" : "bg-tint text-primary-2 hover:bg-[#dfe4fb]"}`}>
            <PencilLine className="h-[17px] w-[17px]" />
            <span>{t("Acces elevi")}</span>
            <span className={`rounded-full px-1.5 text-[11px] ${showAccess ? "bg-white/25" : "bg-white"}`}>{access.students.filter(st => st.userId && writers.includes(st.userId)).length}/{access.students.length}</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-3 px-2 text-[11px] font-bold">
          <PeersBadge peers={peers} />
          <StatusDot conn={conn} save={save} />
        </div>
      </div>

      {isTeacher && enforced && showAccess && (
        <BoardAccessPanel students={access.students} writers={writers} online={onlineUsers} busy={accessBusy}
          onToggle={setStudentAccess} onClose={() => setShowAccess(false)} />
      )}
      {isTeacher && live && !access.ready && (
        <p className="rounded-[14px] border border-dashed border-[#f0c46b] bg-[#fff8e8] px-3 py-2 text-[12px] text-[#7a5208]">
          {t("Acum toți elevii pot desena pe tablă. Ca să alegi tu cine desenează, aplică în Supabase (SQL Editor) migrarea")} <code>supabase/migrations/0019_board_access.sql</code>.
        </p>
      )}
      {accessNote && <p role="status" data-testid="board-access-note" className="rounded-[14px] bg-tint px-3 py-2 text-[12px] font-bold text-primary-2">{accessNote}</p>}
      {fileError && <p role="alert" className="text-[12px] font-semibold text-[#c03a3a]">{fileError}</p>}
      {showFiles && (
        <LessonFiles lessonId={lessonId} live={live} localFiles={localFiles} version={filesVersion}
          canDelete={me.role === "teacher"} onClose={() => setShowFiles(false)} />
      )}

      <div ref={holderRef}
        className={`relative w-full ${fullscreen ? "min-h-0 flex-1" : "aspect-[16/10] max-h-[calc(100vh-140px)]"} flex items-center justify-center`}
        onDragOver={e => { if (canDraw && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files, canvasRef.current ? toBoard(e) : undefined);
        }}>
        <div className="relative overflow-hidden rounded-[20px] border border-line/70 shadow-card" style={{ width: cssSize.w || "100%", height: cssSize.h || "100%" }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${t("Tabla lecției")} ${title}`}
            data-strokes={strokes.length}
            className="block h-full w-full touch-none select-none"
            style={{ cursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-primary/10 text-[14px] font-extrabold text-primary-2 ring-4 ring-inset ring-primary/40">
              {t("Lasă fișierul aici")}
            </div>
          )}
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
              placeholder={t("Scrie aici…")}
              aria-label={t("Text pe tablă")}
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
      {!live && <p className="text-[11px] text-muted">{t("Mod demo: tabla funcționează, dar nu se salvează și nu se partajează.")}</p>}
    </div>
  );
}
