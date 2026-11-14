// Pure helpers for the lesson video call (kept out of the component so they can be unit-tested).

/** Which message to show for a failed getUserMedia / getDisplayMedia call. */
export type MediaProblem = "denied" | "notFound" | "busy" | "unsupported" | "other";

export function mediaProblem(err: unknown): MediaProblem {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "notFound";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy";
    case "TypeError":
    case "NotSupportedError":
      return "unsupported";
    default:
      return "other";
  }
}

/** True when this browser can make WebRTC calls at all. */
export function canCall(): boolean {
  return typeof window !== "undefined" && typeof window.RTCPeerConnection === "function" && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Sliding-window counter: at most `max` events per `windowMs` for each key. Used to drop floods of
 * signalling or chat messages from one participant.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}

  allow(key: string, now = Date.now()): boolean {
    const list = (this.hits.get(key) ?? []).filter(t => now - t < this.windowMs);
    if (list.length >= this.max) { this.hits.set(key, list); return false; }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }

  forget(key: string) { this.hits.delete(key); }
}

/** Remembers ids already seen (bounded), so a message delivered twice is handled once. */
export class SeenIds {
  private set = new Set<string>();
  constructor(private max = 500) {}

  /** Returns true the first time an id is seen. */
  add(id: string): boolean {
    if (this.set.has(id)) return false;
    this.set.add(id);
    if (this.set.size > this.max) this.set.delete(this.set.values().next().value as string);
    return true;
  }
}

/** Caps the bitrate of outgoing video so a call stays smooth on home connections (mesh = one upload per peer). */
export async function capVideoBitrate(pc: RTCPeerConnection, maxBitrate: number) {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== "video") continue;
    const params = sender.getParameters();
    if (!params.encodings?.length) continue;
    params.encodings = params.encodings.map(e => ({ ...e, maxBitrate }));
    await sender.setParameters(params).catch(() => {});
  }
}
