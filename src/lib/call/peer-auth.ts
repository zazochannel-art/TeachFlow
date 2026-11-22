// Signed signalling for lesson calls (browser and Node: WebCrypto only, no secrets on the server).
//
// Each browser tab that joins a lesson's signalling channel makes its own ECDSA P-256 key pair.
// The private key cannot be exported; the public key is registered in the database for the tab's
// connection key "<auth user id>:<random>" (public.register_call_peer, migration 0024), which
// checks the caller's lesson membership. Every message then travels in an envelope signed with
// that key, and receivers verify it against the registered key, so nobody can send in another
// participant's name. A counter per sender rejects replayed messages.

export interface PublicJwk { kty: "EC"; crv: "P-256"; x: string; y: string }

/** A signed message: sender key, counter, the message as JSON text, signature (base64url). */
export interface Envelope { v: 1; k: string; n: number; d: string; s: string }

const KEY_ALG: EcKeyImportParams = { name: "ECDSA", namedCurve: "P-256" };
const SIGN_ALG: EcdsaParams = { name: "ECDSA", hash: "SHA-256" };
const MAX_DATA = 200_000;

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Connection key of one tab: "<user id>:<12 random characters>". */
export function newConnKey(userId: string, random: Uint8Array = crypto.getRandomValues(new Uint8Array(9))): string {
  return `${userId}:${b64url(random)}`;
}

export function isPublicJwk(v: unknown): v is PublicJwk {
  if (!v || typeof v !== "object") return false;
  const k = v as Record<string, unknown>;
  const coord = (c: unknown) => typeof c === "string" && /^[A-Za-z0-9_-]{43}$/.test(c);
  return k.kty === "EC" && k.crv === "P-256" && coord(k.x) && coord(k.y);
}

/** A new signing key; the private half is not extractable. */
export async function newSigningKey(): Promise<{ privateKey: CryptoKey; publicJwk: PublicJwk }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: pair.privateKey, publicJwk: { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! } };
}

export function importPeerKey(jwk: PublicJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true }, KEY_ALG, false, ["verify"]);
}

/** The exact text that is signed: topic and event are included, so a message cannot be replayed elsewhere. */
export const signedText = (topic: string, event: string, e: Pick<Envelope, "k" | "n" | "d">) =>
  JSON.stringify([1, topic, event, e.k, e.n, e.d]);

const bytes = (s: string) => new TextEncoder().encode(s);

export async function sealEnvelope(privateKey: CryptoKey, topic: string, event: string, key: string, n: number, message: unknown): Promise<Envelope> {
  const d = JSON.stringify(message);
  const sig = await crypto.subtle.sign(SIGN_ALG, privateKey, bytes(signedText(topic, event, { k: key, n, d })));
  return { v: 1, k: key, n, d, s: b64url(sig) };
}

/** Shape check of something received from the channel (nothing is trusted yet). */
export function parseEnvelope(raw: unknown): Envelope | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (e.v !== 1) return null;
  if (typeof e.k !== "string" || e.k.length < 3 || e.k.length > 80) return null;
  if (typeof e.n !== "number" || !Number.isSafeInteger(e.n) || e.n < 1) return null;
  if (typeof e.d !== "string" || e.d.length > MAX_DATA) return null;
  if (typeof e.s !== "string" || !/^[A-Za-z0-9_-]{40,200}$/.test(e.s)) return null;
  return { v: 1, k: e.k, n: e.n, d: e.d, s: e.s };
}

/** The message of an envelope when the signature matches `key`, otherwise null. */
export async function openEnvelope(key: CryptoKey, topic: string, event: string, env: Envelope): Promise<Record<string, unknown> | null> {
  let ok = false;
  try {
    ok = await crypto.subtle.verify(SIGN_ALG, key, fromB64url(env.s), bytes(signedText(topic, event, env)));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const msg = JSON.parse(env.d) as unknown;
    return msg && typeof msg === "object" && !Array.isArray(msg) ? (msg as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Accepts each sender's counter only when it is higher than the last one seen (no replays). */
export class SequenceGuard {
  private last = new Map<string, number>();
  constructor(private max = 500) {}

  accept(key: string, n: number): boolean {
    if (n <= (this.last.get(key) ?? 0)) return false;
    this.last.delete(key);
    this.last.set(key, n);
    if (this.last.size > this.max) this.last.delete(this.last.keys().next().value as string);
    return true;
  }
}
