// Connection quality and adaptive video for lesson calls (pure functions, unit-tested).

export type Quality = "good" | "fair" | "poor" | "unknown";

export interface StatSample {
  /** Round-trip time of the selected candidate pair, ms. */
  rttMs: number | null;
  /** Share of incoming packets lost since the previous sample, percent. */
  lossPct: number | null;
  /** Incoming / outgoing media bitrate since the previous sample, kbps. */
  inKbps: number | null;
  outKbps: number | null;
  /** Estimated available upload bandwidth (congestion control), kbps. */
  availableOutKbps: number | null;
  /** Media goes through a TURN relay. */
  relay: boolean;
}

/** Counters kept between two getStats() calls. */
export interface StatCounters { at: number; bytesIn: number; bytesOut: number; packetsIn: number; lost: number }

type Stat = Record<string, unknown> & { type: string; id: string };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Reads one RTCPeerConnection.getStats() report into a sample. `prev` = counters of the previous call. */
export function readStats(report: Iterable<Stat> | { values(): Iterable<Stat> }, prev: StatCounters | null, now: number): { sample: StatSample; counters: StatCounters } {
  // RTCStatsReport is map-like (not a Map instance): read its values.
  const list: Stat[] = "values" in report && typeof report.values === "function" ? [...report.values()] : [...(report as Iterable<Stat>)];
  const byId = new Map(list.map(s => [s.id, s]));

  let pair: Stat | undefined;
  const transport = list.find(s => s.type === "transport" && typeof s.selectedCandidatePairId === "string");
  if (transport) pair = byId.get(transport.selectedCandidatePairId as string);
  pair ??= list.find(s => s.type === "candidate-pair" && s.state === "succeeded" && (s.nominated === true || s.selected === true));

  let bytesIn = 0, bytesOut = 0, packetsIn = 0, lost = 0;
  for (const s of list) {
    if (s.type === "inbound-rtp") {
      bytesIn += num(s.bytesReceived) ?? 0;
      packetsIn += num(s.packetsReceived) ?? 0;
      lost += Math.max(0, num(s.packetsLost) ?? 0);
    } else if (s.type === "outbound-rtp") {
      bytesOut += num(s.bytesSent) ?? 0;
    }
  }
  const counters: StatCounters = { at: now, bytesIn, bytesOut, packetsIn, lost };

  let inKbps: number | null = null, outKbps: number | null = null, lossPct: number | null = null;
  if (prev && now > prev.at) {
    const secs = (now - prev.at) / 1000;
    inKbps = Math.max(0, ((bytesIn - prev.bytesIn) * 8) / 1000 / secs);
    outKbps = Math.max(0, ((bytesOut - prev.bytesOut) * 8) / 1000 / secs);
    const got = packetsIn - prev.packetsIn;
    const miss = lost - prev.lost;
    lossPct = got + miss > 20 ? Math.max(0, Math.min(100, (miss / (got + miss)) * 100)) : null;
  }

  const rtt = num(pair?.currentRoundTripTime);
  const avail = num(pair?.availableOutgoingBitrate);
  const local = pair && typeof pair.localCandidateId === "string" ? byId.get(pair.localCandidateId) : undefined;
  const remote = pair && typeof pair.remoteCandidateId === "string" ? byId.get(pair.remoteCandidateId) : undefined;
  const relay = local?.candidateType === "relay" || remote?.candidateType === "relay";

  return {
    sample: { rttMs: rtt === null ? null : Math.round(rtt * 1000), lossPct, inKbps, outKbps, availableOutKbps: avail === null ? null : Math.round(avail / 1000), relay },
    counters
  };
}

/** good: RTT < 250 ms and loss < 2 %; poor: RTT > 600 ms or loss > 8 %; otherwise fair. */
export function rateQuality(s: Pick<StatSample, "rttMs" | "lossPct">): Quality {
  if (s.rttMs === null && s.lossPct === null) return "unknown";
  const rtt = s.rttMs ?? 0;
  const loss = s.lossPct ?? 0;
  if (rtt > 600 || loss > 8) return "poor";
  if (rtt < 250 && loss < 2) return "good";
  return "fair";
}

/** The worse of two qualities ("unknown" counts as no information). */
export function worstQuality(a: Quality, b: Quality): Quality {
  const rank: Record<Quality, number> = { unknown: -1, good: 0, fair: 1, poor: 2 };
  return rank[a] >= rank[b] ? a : b;
}

// ---------- adaptive video ----------

/** Outgoing video steps, best first. The camera is captured at up to 960×540. */
export const VIDEO_PROFILES = [
  { name: "hd", maxBitrate: 1_200_000, scale: 1, fps: 30 },
  { name: "sd", maxBitrate: 600_000, scale: 1.5, fps: 24 },
  { name: "low", maxBitrate: 300_000, scale: 2, fps: 20 },
  { name: "min", maxBitrate: 150_000, scale: 3, fps: 15 }
] as const;
export type VideoProfile = (typeof VIDEO_PROFILES)[number];

export interface AdaptState { level: number; goodStreak: number }
export const INITIAL_ADAPT: AdaptState = { level: 1, goodStreak: 0 };

/**
 * Next video step for one connection, from its latest sample:
 * - poor → one step down at once; the upload estimate below the step's bitrate → down to a step that fits;
 * - good three samples in a row (≈ 12 s) → one step up; `maxLevel` caps the best step (e.g. many people in a mesh).
 */
export function adaptVideo(state: AdaptState, q: Quality, availableOutKbps: number | null, minLevel = 0): AdaptState {
  const last = VIDEO_PROFILES.length - 1;
  let level = Math.max(state.level, minLevel);
  let goodStreak = q === "good" ? state.goodStreak + 1 : 0;
  if (q === "poor") level = Math.min(last, level + 1);
  if (availableOutKbps !== null) {
    while (level < last && VIDEO_PROFILES[level].maxBitrate / 1000 > availableOutKbps * 0.9) level++;
  }
  if (q === "good" && goodStreak >= 3 && level > minLevel) {
    const up = level - 1;
    if (availableOutKbps === null || VIDEO_PROFILES[up].maxBitrate / 1000 <= availableOutKbps * 0.9) level = up;
    goodStreak = 0;
  }
  return { level, goodStreak };
}

/** Best step allowed when the upload is shared by several connections (mesh). */
export const meshMinLevel = (connections: number) => (connections <= 1 ? 0 : connections <= 3 ? 1 : 2);

/** Applies a video step to an RTCRtpSender (screen sharing keeps full resolution for readable text). */
export async function applyVideoProfile(sender: RTCRtpSender, profile: VideoProfile, screen: boolean) {
  const params = sender.getParameters();
  if (!params.encodings?.length) return;
  params.encodings = params.encodings.map(e => ({
    ...e,
    maxBitrate: screen ? Math.max(profile.maxBitrate, 800_000) : profile.maxBitrate,
    scaleResolutionDownBy: screen ? 1 : profile.scale,
    maxFramerate: screen ? 15 : profile.fps
  }));
  await sender.setParameters(params).catch(() => {});
}
