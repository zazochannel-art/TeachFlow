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
