// Screen-share signalling messages, sent on the private Realtime channel "screen:<lesson_id>".
// The teacher is always the offerer; each student gets its own peer connection.
//
//   student → all:      want        (on join, or when a share starts)
//   teacher → all:      start / stop
//   teacher → student:  offer
//   student → teacher:  answer
//   both:               ice

export type RtcSignal =
  | { type: "want"; from: string }
  | { type: "start"; from: string }
  | { type: "stop"; from: string }
  | { type: "offer"; from: string; to: string; sdp: string }
  | { type: "answer"; from: string; to: string; sdp: string }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit };

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
];

const MAX_SDP = 100_000;
const isKey = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 80;

/** Validates a signal received from a peer. */
export function sanitizeSignal(raw: unknown): RtcSignal | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (!isKey(m.from)) return null;
  switch (m.type) {
    case "want":
    case "start":
    case "stop":
      return { type: m.type, from: m.from };
    case "offer":
    case "answer":
      if (!isKey(m.to) || typeof m.sdp !== "string" || m.sdp.length === 0 || m.sdp.length > MAX_SDP) return null;
      return { type: m.type, from: m.from, to: m.to, sdp: m.sdp };
    case "ice": {
      if (!isKey(m.to) || !m.candidate || typeof m.candidate !== "object") return null;
      const c = m.candidate as Record<string, unknown>;
      if (typeof c.candidate !== "string" || c.candidate.length > 2000) return null;
      return {
        type: "ice", from: m.from, to: m.to,
        candidate: {
          candidate: c.candidate,
          sdpMid: typeof c.sdpMid === "string" ? c.sdpMid : null,
          sdpMLineIndex: typeof c.sdpMLineIndex === "number" ? c.sdpMLineIndex : null
        }
      };
    }
    default:
      return null;
  }
}

/** Presence/peer keys look like "<auth user id>:<tab id>". */
export const userOfKey = (key: string) => key.split(":")[0];

// ---- Lesson video call (mesh: every participant connects to every other one) ----
// Event "call" on the same channel. A newcomer says `hello`; each pair connects once, and only
// the side with the smaller key sends the offer (the other answers `here`), so offers never cross.
// `who` asks who is already in the call (shown before joining).

export interface CallMeta { name: string; role: "teacher" | "student"; mic: boolean; cam: boolean }

export type CallSignal =
  | ({ type: "hello"; from: string } & CallMeta)
  | { type: "who"; from: string }
  | ({ type: "here"; from: string; to: string } & CallMeta)
  | ({ type: "offer"; from: string; to: string; sdp: string } & CallMeta)
  | { type: "answer"; from: string; to: string; sdp: string }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: "state"; from: string; mic: boolean; cam: boolean }
  | { type: "bye"; from: string };

function meta(m: Record<string, unknown>): CallMeta | null {
  if (typeof m.name !== "string" || (m.role !== "teacher" && m.role !== "student")) return null;
  return { name: m.name.slice(0, 60), role: m.role, mic: m.mic !== false, cam: m.cam !== false };
}

/** Validates a call signal received from a peer. */
export function sanitizeCallSignal(raw: unknown): CallSignal | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (!isKey(m.from)) return null;
  const from = m.from;
  switch (m.type) {
    case "who":
    case "bye":
      return { type: m.type, from };
    case "state":
      return { type: "state", from, mic: m.mic !== false, cam: m.cam !== false };
    case "hello": {
      const x = meta(m);
      return x ? { type: "hello", from, ...x } : null;
    }
    case "here": {
      const x = meta(m);
      return x && isKey(m.to) ? { type: "here", from, to: m.to, ...x } : null;
    }
    case "offer": {
      const x = meta(m);
      const base = sanitizeSignal({ ...m, type: "offer" });
      return x && base?.type === "offer" ? { ...base, ...x } : null;
    }
    case "answer":
    case "ice": {
      const base = sanitizeSignal(m);
      return base && (base.type === "answer" || base.type === "ice") ? base : null;
    }
    default:
      return null;
  }
}
