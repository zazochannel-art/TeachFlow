import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { callTransport, coturnCredentials, lessonCallIdentity, liveKitConfig, liveKitToken, parseTurnUrls } from "@/lib/call/tokens";

const LESSON = "11111111-2222-4333-8444-555555555555";
const lk = { LIVEKIT_URL: "wss://x.livekit.cloud", LIVEKIT_API_KEY: "APIkey", LIVEKIT_API_SECRET: "secret-secret-secret" } as unknown as NodeJS.ProcessEnv;

describe("TURN credentials", () => {
  it("builds coturn REST credentials that expire", () => {
    const now = Date.UTC(2026, 10, 16, 12, 0, 0);
    const c = coturnCredentials("s3cret", "user-1", 3600, now);
    expect(c.username).toBe(`${now / 1000 + 3600}:user-1`);
    expect(c.credential).toBe(createHmac("sha1", "s3cret").update(c.username).digest("base64"));
  });
  it("keeps only turn/stun urls", () => {
    expect(parseTurnUrls(" turn:a.example:3478?transport=udp, turns:a.example:5349 ,http://evil, ")).toEqual([
      "turn:a.example:3478?transport=udp", "turns:a.example:5349"
    ]);
    expect(parseTurnUrls(undefined)).toEqual([]);
  });
});

describe("lessonCallIdentity", () => {
  const rpc = (data: unknown, error: { code?: string } | null = null) => ({ rpc: async () => ({ data, error }) });
  it("returns the database role and name", async () => {
    await expect(lessonCallIdentity(rpc([{ role: "student", display_name: "Ana", teacher_id: "t1" }]), "u1", LESSON))
      .resolves.toEqual({ role: "student", name: "Ana", userId: "u1", teacherId: "t1" });
  });
  it("refuses non-members and bad ids", async () => {
    await expect(lessonCallIdentity(rpc([]), "u1", LESSON)).resolves.toBeNull();
    await expect(lessonCallIdentity(rpc([{ role: "parent", teacher_id: "t1" }]), "u1", LESSON)).resolves.toBeNull();
    await expect(lessonCallIdentity(rpc([{ role: "teacher" }]), "u1", "../x")).resolves.toBeNull();
    await expect(lessonCallIdentity(rpc(null, { code: "42501" }), "u1", LESSON)).resolves.toBeNull();
  });
  it("reports a missing migration", async () => {
    await expect(lessonCallIdentity(rpc(null, { code: "PGRST202" }), "u1", LESSON)).resolves.toBe("missing");
  });
});

describe("transport choice", () => {
  const group = { course_id: "c1", student_id: null };
  const single = { course_id: null, student_id: "s1" };
  it("is P2P without LiveKit", () => {
    expect(callTransport(group, {} as NodeJS.ProcessEnv)).toBe("p2p");
    expect(liveKitConfig({ ...lk, LIVEKIT_URL: "https://x" } as NodeJS.ProcessEnv)).toBeNull();
  });
  it("uses the SFU for group lessons in auto mode", () => {
    expect(callTransport(group, lk)).toBe("sfu");
    expect(callTransport(single, lk)).toBe("p2p");
    expect(callTransport({ course_id: "c1", student_id: "s1" }, lk)).toBe("p2p");
  });
  it("follows RTC_MODE", () => {
    expect(callTransport(single, { ...lk, RTC_MODE: "sfu" } as NodeJS.ProcessEnv)).toBe("sfu");
    expect(callTransport(group, { ...lk, RTC_MODE: "p2p" } as NodeJS.ProcessEnv)).toBe("p2p");
  });
});

describe("LiveKit token", () => {
  it("is a valid HS256 JWT limited to one room", () => {
    const cfg = liveKitConfig(lk)!;
    const now = Date.UTC(2026, 10, 16, 12, 0, 0);
    const token = liveKitToken(cfg, { identity: "u1:ab", name: "Ana", room: `lesson_${LESSON}`, metadata: { role: "student" }, now, ttlS: 600 });
    const [h, b, s] = token.split(".");
    expect(createHmac("sha256", cfg.apiSecret).update(`${h}.${b}`).digest("base64url")).toBe(s);
    const head = JSON.parse(Buffer.from(h, "base64url").toString());
    const body = JSON.parse(Buffer.from(b, "base64url").toString());
    expect(head).toEqual({ alg: "HS256", typ: "JWT" });
    expect(body).toMatchObject({ iss: "APIkey", sub: "u1:ab", name: "Ana", exp: now / 1000 + 600, video: { room: `lesson_${LESSON}`, roomJoin: true, canUpdateOwnMetadata: false } });
    expect(JSON.parse(body.metadata)).toEqual({ role: "student" });
    expect(body.video.roomAdmin).toBeUndefined();
  });
});
