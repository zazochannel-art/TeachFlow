import { describe, expect, it } from "vitest";
import {
  SequenceGuard, b64url, fromB64url, importPeerKey, isPublicJwk, newConnKey, newSigningKey, openEnvelope, parseEnvelope, sealEnvelope
} from "@/lib/call/peer-auth";

const TOPIC = "screen:00000000-0000-4000-8000-0000000000aa";
const USER = "11111111-1111-4111-8111-111111111111";

describe("signed call signalling", () => {
  it("makes connection keys that start with the user id and pass the database check", () => {
    const key = newConnKey(USER);
    expect(key.startsWith(`${USER}:`)).toBe(true);
    expect(key).toMatch(new RegExp(`^${USER}:[A-Za-z0-9_-]{12}$`));
    expect(newConnKey(USER)).not.toBe(key);
  });

  it("round-trips base64url", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    expect([...fromB64url(b64url(bytes))]).toEqual([...bytes]);
    expect(b64url(bytes)).not.toMatch(/[+/=]/);
  });

  it("opens a message signed by the sender's key", async () => {
    const me = await newSigningKey();
    expect(isPublicJwk(me.publicJwk)).toBe(true);
    const key = newConnKey(USER);
    const env = await sealEnvelope(me.privateKey, TOPIC, "call", key, 1, { type: "hello", from: key, name: "Ana" });
    expect(parseEnvelope(JSON.parse(JSON.stringify(env)))).toEqual(env);
    const msg = await openEnvelope(await importPeerKey(me.publicJwk), TOPIC, "call", env);
    expect(msg).toEqual({ type: "hello", from: key, name: "Ana" });
  });

  it("refuses a message signed by somebody else", async () => {
    const victim = await newSigningKey();
    const attacker = await newSigningKey();
    const key = newConnKey(USER);
    const forged = await sealEnvelope(attacker.privateKey, TOPIC, "call", key, 5, { type: "bye", from: key });
    expect(await openEnvelope(await importPeerKey(victim.publicJwk), TOPIC, "call", forged)).toBeNull();
  });

  it("refuses a changed message, or one moved to another lesson or event", async () => {
    const me = await newSigningKey();
    const pub = await importPeerKey(me.publicJwk);
    const key = newConnKey(USER);
    const env = await sealEnvelope(me.privateKey, TOPIC, "call", key, 2, { type: "state", from: key, mic: false });
    expect(await openEnvelope(pub, TOPIC, "call", { ...env, d: env.d.replace("false", "true") })).toBeNull();
    expect(await openEnvelope(pub, TOPIC, "call", { ...env, n: 3 })).toBeNull();
    expect(await openEnvelope(pub, "screen:00000000-0000-4000-8000-0000000000bb", "call", env)).toBeNull();
    expect(await openEnvelope(pub, TOPIC, "rtc", env)).toBeNull();
  });

  it("drops malformed envelopes before any crypto", () => {
    expect(parseEnvelope(null)).toBeNull();
    expect(parseEnvelope({ type: "bye", from: "x:y" })).toBeNull();
    expect(parseEnvelope({ v: 1, k: "a:b", n: 0, d: "{}", s: "A".repeat(86) })).toBeNull();
    expect(parseEnvelope({ v: 1, k: "a:b", n: 1, d: "{}", s: "not base64!" })).toBeNull();
    expect(parseEnvelope({ v: 1, k: "a:b", n: 1, d: "x".repeat(200_001), s: "A".repeat(86) })).toBeNull();
  });

  it("accepts each sender's counter only once and only going up (no replays)", () => {
    const seq = new SequenceGuard();
    expect(seq.accept("a", 1)).toBe(true);
    expect(seq.accept("a", 1)).toBe(false);
    expect(seq.accept("a", 3)).toBe(true);
    expect(seq.accept("a", 2)).toBe(false);
    expect(seq.accept("b", 1)).toBe(true);
  });

  it("only accepts P-256 public keys", () => {
    expect(isPublicJwk({ kty: "RSA", n: "x", e: "AQAB" })).toBe(false);
    expect(isPublicJwk({ kty: "EC", crv: "P-384", x: "A".repeat(43), y: "A".repeat(43) })).toBe(false);
    expect(isPublicJwk({ kty: "EC", crv: "P-256", x: "A".repeat(43), y: "A".repeat(43) })).toBe(true);
  });
});
