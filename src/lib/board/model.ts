// Whiteboard data model, shared by the canvas, the live channel and the saved snapshot.
// Coordinates live in a fixed logical space (BOARD_W x BOARD_H) so every participant sees
// the same drawing whatever their screen size.

export const BOARD_W = 1600;
export const BOARD_H = 1000;
export const MAX_STROKES = 4000;
export const MAX_POINTS = 3000;
export const MAX_TEXT = 300;

export type Tool = "pen" | "highlighter" | "line" | "arrow" | "rect" | "ellipse" | "text";
export const TOOLS: readonly Tool[] = ["pen", "highlighter", "line", "arrow", "rect", "ellipse", "text"];

export interface Stroke {
  id: string;
  tool: Tool;
  color: string;
  size: number;
  /** Flat [x0, y0, x1, y1, ...] in board coordinates. Shapes and text use the first two (or four) values. */
  points: number[];
  text?: string;
}

export interface BoardData { v: 1; strokes: Stroke[] }

/** Messages sent on the live channel. `progress` is a stroke still being drawn. */
export type BoardEvent =
  | { type: "add"; strokes: Stroke[] }
  | { type: "remove"; ids: string[] }
  | { type: "clear" }
  | { type: "progress"; by: string; stroke: Stroke | null };

const COLOR_RE = /^#[0-9a-f]{6}$/i;

const clampNum = (n: unknown, lo: number, hi: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null;

/** Validates one stroke from an untrusted source (database or peer). Returns null when unusable. */
export function sanitizeStroke(raw: unknown): Stroke | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id.length === 0 || s.id.length > 64) return null;
  if (typeof s.tool !== "string" || !TOOLS.includes(s.tool as Tool)) return null;
  if (typeof s.color !== "string" || !COLOR_RE.test(s.color)) return null;
  const size = clampNum(s.size, 1, 80);
  if (size === null || !Array.isArray(s.points)) return null;
  const points: number[] = [];
  for (let i = 0; i + 1 < s.points.length && points.length < MAX_POINTS * 2; i += 2) {
    const x = clampNum(s.points[i], -BOARD_W, BOARD_W * 2);
    const y = clampNum(s.points[i + 1], -BOARD_H, BOARD_H * 2);
    if (x === null || y === null) return null;
    points.push(x, y);
  }
  if (points.length < 2) return null;
  const tool = s.tool as Tool;
  const stroke: Stroke = { id: s.id, tool, color: s.color.toLowerCase(), size, points };
  if (tool === "text") {
    if (typeof s.text !== "string" || s.text.trim() === "") return null;
    stroke.text = s.text.slice(0, MAX_TEXT);
  }
  return stroke;
}

export function sanitizeBoard(raw: unknown): Stroke[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { strokes?: unknown }).strokes)
    ? (raw as { strokes: unknown[] }).strokes
    : [];
  const seen = new Set<string>();
  const out: Stroke[] = [];
  for (const item of list) {
    const s = sanitizeStroke(item);
    if (s && !seen.has(s.id)) { seen.add(s.id); out.push(s); }
    if (out.length >= MAX_STROKES) break;
  }
  return out;
}

/** Applies a live event to the committed strokes (pure). `progress` does not change them. */
export function applyEvent(strokes: Stroke[], ev: BoardEvent): Stroke[] {
  switch (ev.type) {
    case "add": {
      const ids = new Set(strokes.map(s => s.id));
      const fresh = ev.strokes.filter(s => !ids.has(s.id));
      return fresh.length ? [...strokes, ...fresh].slice(-MAX_STROKES) : strokes;
    }
    case "remove": {
      const ids = new Set(ev.ids);
      const next = strokes.filter(s => !ids.has(s.id));
      return next.length === strokes.length ? strokes : next;
    }
    case "clear":
      return strokes.length ? [] : strokes;
    default:
      return strokes;
  }
}

/** Validates an event received from a peer. */
export function sanitizeEvent(raw: unknown): BoardEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  switch (e.type) {
    case "add": {
      if (!Array.isArray(e.strokes)) return null;
      const strokes = e.strokes.slice(0, MAX_STROKES).map(sanitizeStroke).filter((s): s is Stroke => s !== null);
      return strokes.length ? { type: "add", strokes } : null;
    }
    case "remove": {
      if (!Array.isArray(e.ids)) return null;
      const ids = e.ids.filter((x): x is string => typeof x === "string").slice(0, MAX_STROKES);
      return ids.length ? { type: "remove", ids } : null;
    }
    case "clear":
      return { type: "clear" };
    case "progress": {
      if (typeof e.by !== "string") return null;
      return { type: "progress", by: e.by.slice(0, 64), stroke: e.stroke === null ? null : sanitizeStroke(e.stroke) };
    }
    default:
      return null;
  }
}

// ---- Geometry (used for the eraser) ----

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Approximate text box: width ~0.6em per character. */
export function textBox(s: Stroke) {
  const fontSize = textFontSize(s.size);
  const lines = (s.text ?? "").split("\n");
  const w = Math.max(...lines.map(l => l.length)) * fontSize * 0.6;
  return { x: s.points[0], y: s.points[1], w, h: lines.length * fontSize * 1.25 };
}

export const textFontSize = (size: number) => Math.max(22, size * 5);

/** Polyline that approximates what the stroke draws, for hit testing. */
export function outline(s: Stroke): number[] {
  const p = s.points;
  if (s.tool === "pen" || s.tool === "highlighter") return p;
  if (s.tool === "text") {
    const b = textBox(s);
    return [b.x, b.y, b.x + b.w, b.y, b.x + b.w, b.y + b.h, b.x, b.y + b.h, b.x, b.y];
  }
  const [x0, y0, x1 = x0, y1 = y0] = p;
  if (s.tool === "rect") return [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];
  if (s.tool === "ellipse") {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
    const out: number[] = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      out.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
    }
    return out;
  }
  return [x0, y0, x1, y1];
}

/** True when the point (x, y) is within `radius` of what the stroke draws. */
export function hitStroke(s: Stroke, x: number, y: number, radius: number): boolean {
  if (s.tool === "text") {
    const b = textBox(s);
    return x >= b.x - radius && x <= b.x + b.w + radius && y >= b.y - radius && y <= b.y + b.h + radius;
  }
  const line = outline(s);
  const reach = radius + (s.tool === "highlighter" ? Math.max(8, s.size * 2) : s.size / 2);
  if (line.length === 2) return Math.hypot(x - line[0], y - line[1]) <= reach;
  for (let i = 0; i + 3 < line.length; i += 2) {
    if (distToSegment(x, y, line[i], line[i + 1], line[i + 2], line[i + 3]) <= reach) return true;
  }
  return false;
}

export function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
