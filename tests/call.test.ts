import { describe, expect, it } from "vitest";
import { RateLimiter, SeenIds, mediaProblem } from "@/lib/board/call";
import { MAX_CHAT, sanitizeCallSignal } from "@/lib/board/rtc";

describe("call signals", () => {
  it("validates chat messages", () => {
    expect(sanitizeCallSignal({ type: "chat", from: "a:1", id: "m1", name: "Ana", text: "  salut  " }))
      .toEqual({ type: "chat", from: "a:1", id: "m1", name: "Ana", text: "salut" });
    expect(sanitizeCallSignal({ type: "chat", from: "a:1", id: "m1", name: "Ana", text: "x".repeat(2000) }))
      .toMatchObject({ text: "x".repeat(MAX_CHAT) });
    expect(sanitizeCallSignal({ type: "chat", from: "a:1", id: "m1", name: "Ana", text: "   " })).toBeNull();
    expect(sanitizeCallSignal({ type: "chat", from: "a:1", name: "Ana", text: "hi" })).toBeNull();
    expect(sanitizeCallSignal({ type: "chat", from: "a:1", id: "m1", name: 5, text: "hi" })).toBeNull();
  });

  it("validates restart requests and the screen flag", () => {
    expect(sanitizeCallSignal({ type: "restart", from: "a:1", to: "b:2" })).toEqual({ type: "restart", from: "a:1", to: "b:2" });
    expect(sanitizeCallSignal({ type: "restart", from: "a:1" })).toBeNull();
    expect(sanitizeCallSignal({ type: "state", from: "a:1", mic: true, cam: true, screen: true })).toEqual({ type: "state", from: "a:1", mic: true, cam: true, screen: true });
    expect(sanitizeCallSignal({ type: "state", from: "a:1", screen: "yes" })).toEqual({ type: "state", from: "a:1", mic: true, cam: true });
  });
});

describe("mediaProblem", () => {
  it("maps browser errors to user-facing problems", () => {
    expect(mediaProblem({ name: "NotAllowedError" })).toBe("denied");
    expect(mediaProblem({ name: "NotFoundError" })).toBe("notFound");
    expect(mediaProblem({ name: "NotReadableError" })).toBe("busy");
    expect(mediaProblem({ name: "NotSupportedError" })).toBe("unsupported");
    expect(mediaProblem(new Error("x"))).toBe("other");
    expect(mediaProblem(null)).toBe("other");
  });
});

describe("RateLimiter / SeenIds", () => {
  it("allows at most N events per window and per key", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("a", 10)).toBe(true);
    expect(rl.allow("a", 20)).toBe(false);
    expect(rl.allow("b", 20)).toBe(true);
    expect(rl.allow("a", 1001)).toBe(true);
  });

  it("reports duplicates once", () => {
    const seen = new SeenIds(2);
    expect(seen.add("x")).toBe(true);
    expect(seen.add("x")).toBe(false);
    seen.add("y"); seen.add("z");
    expect(seen.add("x")).toBe(true); // evicted
  });
});
