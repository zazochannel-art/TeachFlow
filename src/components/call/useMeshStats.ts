"use client";

import { useEffect, useState, type RefObject } from "react";
import { INITIAL_ADAPT, adaptVideo, meshMinLevel, rateQuality, readStats, worstQuality, type AdaptState, type Quality, type StatCounters } from "@/lib/call/quality";
import type { CallParticipant } from "./types";

const STATS_EVERY = 4000;

/**
 * Connection quality for the peer-to-peer call: every few seconds read each connection's stats,
 * show them, and move its outgoing video one step down (bad network) or up (good network for a
 * while). Returns the worst quality over all connections and whether any of them goes through TURN.
 */
export function useMeshStats({ joined, pcsRef, adaptRef, countersRef, applyLevel, upsertPeer }: {
  joined: boolean;
  pcsRef: RefObject<Map<string, RTCPeerConnection>>;
  adaptRef: RefObject<Map<string, AdaptState>>;
  countersRef: RefObject<Map<string, StatCounters>>;
  applyLevel: (key: string, pc: RTCPeerConnection) => Promise<void>;
  upsertPeer: (key: string, patch: Partial<CallParticipant>) => void;
}): { myQuality: Quality; relay: boolean } {
  const [myQuality, setMyQuality] = useState<Quality>("unknown");
  const [relay, setRelay] = useState(false);
  useEffect(() => {
    if (!joined) return;
    let stop = false;
    const tick = async () => {
      let worst: Quality = "unknown";
      let anyRelay = false;
      const n = pcsRef.current.size;
      for (const [key, pc] of pcsRef.current) {
        if (pc.connectionState !== "connected") continue;
        let report: RTCStatsReport;
        try { report = await pc.getStats(); } catch { continue; }
        if (stop) return;
        const { sample, counters } = readStats(report as unknown as { values(): Iterable<never> }, countersRef.current.get(key) ?? null, Date.now());
        countersRef.current.set(key, counters);
        const q = rateQuality(sample);
        worst = worstQuality(worst, q);
        anyRelay ||= sample.relay;
        const prev = adaptRef.current.get(key) ?? INITIAL_ADAPT;
        const next = adaptVideo(prev, q, sample.availableOutKbps, meshMinLevel(n));
        adaptRef.current.set(key, next);
        if (next.level !== prev.level) void applyLevel(key, pc);
        upsertPeer(key, { quality: q, relay: sample.relay });
      }
      setMyQuality(worst);
      setRelay(anyRelay);
    };
    const id = setInterval(() => { void tick(); }, STATS_EVERY);
    const first = setTimeout(() => { void tick(); }, 1500);
    // Leaving the call (joined → false) starts the next call from "unknown" again.
    return () => { stop = true; clearInterval(id); clearTimeout(first); setMyQuality("unknown"); };
  }, [joined, applyLevel, upsertPeer, pcsRef, adaptRef, countersRef]);

  return { myQuality, relay };
}
