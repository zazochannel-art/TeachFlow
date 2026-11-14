import { describe, expect, it } from "vitest";
import { applyEvent, hitStroke, sanitizeBoard, sanitizeEvent, sanitizeStroke, type Stroke } from "@/lib/board/model";

const pen = (id: string, points = [10, 10, 100, 10]): Stroke => ({ id, tool: "pen", color: "#20234b", size: 4, points });

describe("sanitizeStroke", () => {
  it("keeps a valid stroke and rounds coordinates", () => {
    expect(sanitizeStroke({ id: "a", tool: "pen", color: "#5269E8", size: 3.4, points: [1.6, 2.2, 3, 4] }))
      .toEqual({ id: "a", tool: "pen", color: "#5269e8", size: 3, points: [2, 2, 3, 4] });
  });

  it("rejects unknown tools, bad colors and non-numeric points", () => {
    expect(sanitizeStroke({ ...pen("a"), tool: "laser" })).toBeNull();
    expect(sanitizeStroke({ ...pen("a"), color: "red;background:url(x)" })).toBeNull();
    expect(sanitizeStroke({ ...pen("a"), points: [1, "2"] })).toBeNull();
    expect(sanitizeStroke({ ...pen("a"), points: [] })).toBeNull();
  });

  it("requires text for the text tool and caps its length", () => {
    expect(sanitizeStroke({ id: "t", tool: "text", color: "#20234b", size: 3, points: [0, 0] })).toBeNull();
    const s = sanitizeStroke({ id: "t", tool: "text", color: "#20234b", size: 3, points: [0, 0], text: "x".repeat(500) });
    expect(s?.text).toHaveLength(300);
  });

  it("clamps size", () => {
    expect(sanitizeStroke({ ...pen("a"), size: 999 })?.size).toBe(80);
  });
});

describe("sanitizeBoard", () => {
  it("drops invalid and duplicate strokes", () => {
    expect(sanitizeBoard({ v: 1, strokes: [pen("a"), pen("a"), { id: 1 }, pen("b")] }).map(s => s.id)).toEqual(["a", "b"]);
    expect(sanitizeBoard(null)).toEqual([]);
    expect(sanitizeBoard({ strokes: "nope" })).toEqual([]);
  });
});

describe("applyEvent", () => {
  const base = [pen("a"), pen("b")];

  it("adds strokes once", () => {
    const next = applyEvent(base, { type: "add", strokes: [pen("b"), pen("c")] });
    expect(next.map(s => s.id)).toEqual(["a", "b", "c"]);
    expect(applyEvent(base, { type: "add", strokes: [pen("a")] })).toBe(base);
  });

  it("removes and clears", () => {
    expect(applyEvent(base, { type: "remove", ids: ["a"] }).map(s => s.id)).toEqual(["b"]);
    expect(applyEvent(base, { type: "remove", ids: ["zzz"] })).toBe(base);
    expect(applyEvent(base, { type: "clear" })).toEqual([]);
  });

  it("ignores progress events", () => {
    expect(applyEvent(base, { type: "progress", by: "x", stroke: pen("c") })).toBe(base);
  });
});

describe("sanitizeEvent", () => {
  it("validates peer events", () => {
    expect(sanitizeEvent({ type: "add", strokes: [pen("a"), { bad: true }] })).toEqual({ type: "add", strokes: [pen("a")] });
    expect(sanitizeEvent({ type: "add", strokes: [{ bad: true }] })).toBeNull();
    expect(sanitizeEvent({ type: "remove", ids: ["a", 3] })).toEqual({ type: "remove", ids: ["a"] });
    expect(sanitizeEvent({ type: "clear" })).toEqual({ type: "clear" });
    expect(sanitizeEvent({ type: "progress", by: "u1", stroke: null })).toEqual({ type: "progress", by: "u1", stroke: null });
    expect(sanitizeEvent({ type: "drop_tables" })).toBeNull();
    expect(sanitizeEvent("x")).toBeNull();
  });
});

describe("hitStroke", () => {
  it("hits freehand lines near the path only", () => {
    const s = pen("a", [0, 0, 100, 0]);
    expect(hitStroke(s, 50, 5, 4)).toBe(true);
    expect(hitStroke(s, 50, 30, 4)).toBe(false);
  });

  it("hits rectangle edges but not the empty middle", () => {
    const r: Stroke = { id: "r", tool: "rect", color: "#20234b", size: 4, points: [0, 0, 200, 100] };
    expect(hitStroke(r, 0, 50, 4)).toBe(true);
    expect(hitStroke(r, 100, 50, 4)).toBe(false);
  });

  it("hits text inside its box", () => {
    const t: Stroke = { id: "t", tool: "text", color: "#20234b", size: 3, points: [100, 100], text: "Salut" };
    expect(hitStroke(t, 110, 105, 0)).toBe(true);
    expect(hitStroke(t, 400, 400, 0)).toBe(false);
  });
});

import { sanitizeSignal, userOfKey } from "@/lib/board/rtc";

describe("sanitizeSignal", () => {
  it("accepts well-formed signals", () => {
    expect(sanitizeSignal({ type: "want", from: "u1:abc" })).toEqual({ type: "want", from: "u1:abc" });
    expect(sanitizeSignal({ type: "offer", from: "t:1", to: "s:2", sdp: "v=0", extra: 1 })).toEqual({ type: "offer", from: "t:1", to: "s:2", sdp: "v=0" });
    expect(sanitizeSignal({ type: "ice", from: "t:1", to: "s:2", candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 } }))
      .toEqual({ type: "ice", from: "t:1", to: "s:2", candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 } });
  });

  it("rejects malformed signals", () => {
    expect(sanitizeSignal({ type: "offer", from: "t:1", sdp: "v=0" })).toBeNull();
    expect(sanitizeSignal({ type: "answer", from: "t:1", to: "s", sdp: "x".repeat(200_000) })).toBeNull();
    expect(sanitizeSignal({ type: "ice", from: "t:1", to: "s", candidate: "nope" })).toBeNull();
    expect(sanitizeSignal({ type: "hack", from: "t:1" })).toBeNull();
    expect(sanitizeSignal({ type: "want" })).toBeNull();
  });

  it("extracts the user id from a peer key", () => {
    expect(userOfKey("1b2c-uuid:ab12cd34")).toBe("1b2c-uuid");
  });
});

import { sanitizeCallSignal } from "@/lib/board/rtc";

describe("sanitizeCallSignal", () => {
  it("accepts call signals and trims names", () => {
    expect(sanitizeCallSignal({ type: "hello", from: "u:1", name: "x".repeat(100), role: "student", mic: false, cam: true }))
      .toEqual({ type: "hello", from: "u:1", name: "x".repeat(60), role: "student", mic: false, cam: true });
    expect(sanitizeCallSignal({ type: "offer", from: "a:1", to: "b:2", sdp: "v=0", name: "Ana", role: "teacher", mic: true, cam: true }))
      .toEqual({ type: "offer", from: "a:1", to: "b:2", sdp: "v=0", name: "Ana", role: "teacher", mic: true, cam: true });
    expect(sanitizeCallSignal({ type: "bye", from: "a:1" })).toEqual({ type: "bye", from: "a:1" });
    expect(sanitizeCallSignal({ type: "state", from: "a:1", mic: false })).toEqual({ type: "state", from: "a:1", mic: false, cam: true });
  });

  it("rejects bad roles, missing targets and unknown types", () => {
    expect(sanitizeCallSignal({ type: "hello", from: "u:1", name: "A", role: "admin" })).toBeNull();
    expect(sanitizeCallSignal({ type: "here", from: "u:1", name: "A", role: "student" })).toBeNull();
    expect(sanitizeCallSignal({ type: "offer", from: "a:1", to: "b:2", name: "A", role: "student" })).toBeNull();
    expect(sanitizeCallSignal({ type: "start", from: "a:1" })).toBeNull();
  });
});
