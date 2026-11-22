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

/** What a participant may publish: the camera and microphone, and the screen only when allowed. */
export type PublishSource = "camera" | "microphone" | "screen_share" | "screen_share_audio";
export const publishSources = (screen: boolean): PublishSource[] =>
  screen ? ["camera", "microphone", "screen_share", "screen_share_audio"] : ["camera", "microphone"];

function signJwt(cfg: LiveKitConfig, payload: Record<string, unknown>) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", cfg.apiSecret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

/**
 * LiveKit access token (HS256 JWT, https://docs.livekit.io/home/get-started/authentication/).
 * `sources` limits what the participant may publish; the LiveKit server enforces it (a student
 * without the teacher's permission cannot publish a screen share even with a modified browser).
 */
export function liveKitToken(cfg: LiveKitConfig, opts: {
  identity: string; name: string; room: string; metadata?: Record<string, unknown>; ttlS?: number; now?: number; maxParticipants?: number;
  sources?: PublishSource[];
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
      canUpdateOwnMetadata: false,
      ...(opts.sources ? { canPublishSources: opts.sources } : {})
    },
    // Created on first join; closed 5 minutes after the last person leaves.
    roomConfig: { name: opts.room, maxParticipants: opts.maxParticipants ?? 50, emptyTimeout: 300, departureTimeout: 60 }
  };
  return signJwt(cfg, payload);
}

/** Short server-side token for the LiveKit room API (list and update the participants of one room). */
export function liveKitAdminToken(cfg: LiveKitConfig, room: string, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  return signJwt(cfg, { iss: cfg.apiKey, sub: "teachflow-server", nbf: iat - 10, exp: iat + 120, video: { room, roomAdmin: true } });
}

const TRACK_SOURCE: Record<PublishSource, string> = { camera: "CAMERA", microphone: "MICROPHONE", screen_share: "SCREEN_SHARE", screen_share_audio: "SCREEN_SHARE_AUDIO" };

/**
 * Applies a new screen-share permission to every connection of `userId` that is in the room now
 * (the teacher switched it during the call). Uses LiveKit's RoomService (Twirp/JSON):
 * ListParticipants, then UpdateParticipant for each identity "<userId>:<suffix>". LiveKit stops a
 * screen share that is no longer allowed. Returns how many connections were updated.
 */
export async function syncScreenPermission(cfg: LiveKitConfig, room: string, userId: string, allowScreen: boolean, fetchFn: typeof fetch = fetch): Promise<number> {
  const base = cfg.url.replace(/^ws/i, "http").replace(/\/$/, "");
  const call = async (method: string, body: unknown) => {
    const res = await fetchFn(`${base}/twirp/livekit.RoomService/${method}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${liveKitAdminToken(cfg, room)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`LiveKit ${method}: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return res.json() as Promise<{ participants?: Array<{ identity?: string }> }>;
  };
  const list = await call("ListParticipants", { room });
  const mine = (list.participants ?? []).map(p => p.identity ?? "").filter(id => id.startsWith(`${userId}:`));
  for (const identity of mine) {
    await call("UpdateParticipant", {
      room, identity,
      permission: {
        canSubscribe: true, canPublish: true, canPublishData: true, canUpdateMetadata: false,
        canPublishSources: publishSources(allowScreen).map(s => TRACK_SOURCE[s])
      }
    });
  }
  return mine.length;
}

/**
 * The automated call test harness (/dev/call, scripts/rtc-e2e) is on only with RTC_TEST_HARNESS=1,
 * and never on Vercel (VERCEL is set on every Vercel deployment), whatever the variables say.
 */
export const harnessEnabled = (env: NodeJS.ProcessEnv = process.env) => env.RTC_TEST_HARNESS === "1" && !env.VERCEL;

/** Random suffix so the same user can be in the call from two tabs/devices without kicking the other. */
export const connectionSuffix = () => randomBytes(4).toString("hex");
