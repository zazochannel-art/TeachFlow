// Server only (node:crypto).
import { createHmac, randomBytes } from "node:crypto";

// Server-side helpers for lesson calls: who may join, short-lived TURN credentials and LiveKit
// (SFU) access tokens. Every secret stays on the server; the browser only gets credentials that
// expire within hours and are bound to one user.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CallTransport = "p2p" | "sfu";
export interface CallIdentity { role: "teacher" | "student"; name: string; userId: string; teacherId: string }

/** Lifetime of TURN credentials and SFU tokens handed to the browser. */
export const CREDENTIAL_TTL_S = 4 * 3600;

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;

/**
 * Role and display name of the signed-in user for a lesson, checked in the database
 * (public.lesson_call_identity, migration 0018). `null` = not the teacher or a student of this lesson.
 * `"missing"` = migration 0018 is not applied yet.
 */
export async function lessonCallIdentity(supabase: { rpc: Rpc }, userId: string, lessonId: string): Promise<CallIdentity | null | "missing"> {
  if (!UUID_RE.test(lessonId)) return null;
  const { data, error } = await supabase.rpc("lesson_call_identity", { p_lesson_id: lessonId });
  if (error) return error.code === "PGRST202" || error.code === "42883" ? "missing" : null;
  const row = (Array.isArray(data) ? data[0] : data) as { role?: string; display_name?: string; teacher_id?: string } | undefined;
  if (!row || (row.role !== "teacher" && row.role !== "student") || !row.teacher_id) return null;
  return { role: row.role, name: (row.display_name ?? "").slice(0, 60) || (row.role === "teacher" ? "Profesor" : "Elev"), userId, teacherId: row.teacher_id };
}

// ---------- TURN ----------

/**
 * Time-limited TURN credentials for a self-hosted coturn server (`use-auth-secret` /
 * `static-auth-secret`): username = "<expiry unix time>:<user>", password = base64(HMAC-SHA1(secret, username)).
 */
export function coturnCredentials(secret: string, userId: string, ttlS = CREDENTIAL_TTL_S, now = Date.now()) {
  const username = `${Math.floor(now / 1000) + ttlS}:${userId}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential };
}

export function parseTurnUrls(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map(s => s.trim()).filter(u => /^(turns?|stun):/i.test(u));
}

// ---------- LiveKit (SFU) ----------

export interface LiveKitConfig { url: string; apiKey: string; apiSecret: string }

export function liveKitConfig(env: NodeJS.ProcessEnv = process.env): LiveKitConfig | null {
  const url = env.LIVEKIT_URL?.trim();
  const apiKey = env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret || !/^wss?:\/\//i.test(url)) return null;
  return { url, apiKey, apiSecret };
}

/**
 * Which transport a lesson uses. All participants of a lesson get the same answer because it
 * depends only on the lesson and the server configuration:
 * - RTC_MODE=p2p: always peer-to-peer; RTC_MODE=sfu: always LiveKit (when configured);
 * - default ("auto"): LiveKit for group lessons (course lesson without a single student), P2P for 1:1.
 */
export function callTransport(lesson: { course_id: string | null; student_id: string | null }, env: NodeJS.ProcessEnv = process.env): CallTransport {
  if (!liveKitConfig(env)) return "p2p";
  const mode = (env.RTC_MODE ?? "auto").trim().toLowerCase();
  if (mode === "p2p") return "p2p";
  if (mode === "sfu") return "sfu";
  return lesson.course_id && !lesson.student_id ? "sfu" : "p2p";
}

export const liveKitRoomName = (lessonId: string) => `lesson_${lessonId}`;

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url");

/** LiveKit access token (HS256 JWT, https://docs.livekit.io/home/get-started/authentication/). */
export function liveKitToken(cfg: LiveKitConfig, opts: {
  identity: string; name: string; room: string; metadata?: Record<string, unknown>; ttlS?: number; now?: number; maxParticipants?: number;
}): string {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const payload = {
    iss: cfg.apiKey,
    sub: opts.identity,
    jti: `${opts.identity}:${randomBytes(6).toString("hex")}`,
    nbf: iat - 10,
    exp: iat + (opts.ttlS ?? CREDENTIAL_TTL_S),
    name: opts.name,
    metadata: JSON.stringify(opts.metadata ?? {}),
    video: {
      room: opts.room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: false
    },
    // Created on first join; closed 5 minutes after the last person leaves.
    roomConfig: { name: opts.room, maxParticipants: opts.maxParticipants ?? 50, emptyTimeout: 300, departureTimeout: 60 }
  };
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", cfg.apiSecret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

/** Random suffix so the same user can be in the call from two tabs/devices without kicking the other. */
export const connectionSuffix = () => randomBytes(4).toString("hex");
