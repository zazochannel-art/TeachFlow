import { describe, expect, it } from "vitest";
import { INITIAL_ADAPT, VIDEO_PROFILES, adaptVideo, meshMinLevel, rateQuality, readStats, worstQuality } from "@/lib/call/quality";
import { formatDuration, mergeSpans, summarizeAttendance, type Stay } from "@/lib/call/attendance";

const report = (o: { rtt?: number; avail?: number; bytesIn: number; bytesOut: number; recv: number; lost: number; relay?: boolean }) => new Map(Object.entries({
  T: { id: "T", type: "transport", selectedCandidatePairId: "P" },
  P: { id: "P", type: "candidate-pair", state: "succeeded", currentRoundTripTime: o.rtt, availableOutgoingBitrate: o.avail, localCandidateId: "L", remoteCandidateId: "R" },
  L: { id: "L", type: "local-candidate", candidateType: o.relay ? "relay" : "srflx" },
  R: { id: "R", type: "remote-candidate", candidateType: "host" },
  IA: { id: "IA", type: "inbound-rtp", kind: "audio", bytesReceived: o.bytesIn / 2, packetsReceived: o.recv / 2, packetsLost: o.lost / 2 },
  IV: { id: "IV", type: "inbound-rtp", kind: "video", bytesReceived: o.bytesIn / 2, packetsReceived: o.recv / 2, packetsLost: o.lost / 2 },
  O: { id: "O", type: "outbound-rtp", kind: "video", bytesSent: o.bytesOut }
}));

describe("readStats", () => {
  it("computes rtt, loss, bitrate and relay from two reports", () => {
    const a = readStats(report({ rtt: 0.08, avail: 2_000_000, bytesIn: 0, bytesOut: 0, recv: 0, lost: 0 }), null, 0);
    expect(a.sample).toMatchObject({ rttMs: 80, lossPct: null, inKbps: null, availableOutKbps: 2000, relay: false });
    const b = readStats(report({ rtt: 0.12, bytesIn: 500_000, bytesOut: 250_000, recv: 950, lost: 50, relay: true }), a.counters, 4000);
    expect(b.sample.rttMs).toBe(120);
    expect(b.sample.lossPct).toBeCloseTo(5);
    expect(b.sample.inKbps).toBe(1000);
    expect(b.sample.outKbps).toBe(500);
    expect(b.sample.relay).toBe(true);
  });

  it("reads a map-like RTCStatsReport (not a Map instance)", () => {
    const m = report({ rtt: 0.05, bytesIn: 0, bytesOut: 0, recv: 0, lost: 0 });
    const like = { values: () => m.values(), forEach: m.forEach.bind(m) };
    expect(readStats(like, null, 0).sample.rttMs).toBe(50);
  });
});

describe("quality", () => {
  it("rates links", () => {
    expect(rateQuality({ rttMs: 60, lossPct: 0 })).toBe("good");
    expect(rateQuality({ rttMs: 300, lossPct: 1 })).toBe("fair");
    expect(rateQuality({ rttMs: 80, lossPct: 12 })).toBe("poor");
    expect(rateQuality({ rttMs: 900, lossPct: null })).toBe("poor");
    expect(rateQuality({ rttMs: null, lossPct: null })).toBe("unknown");
    expect(worstQuality("good", "poor")).toBe("poor");
    expect(worstQuality("unknown", "fair")).toBe("fair");
  });

  it("steps video down at once and up slowly", () => {
    let s = adaptVideo(INITIAL_ADAPT, "poor", null);
    expect(s.level).toBe(2);
    s = adaptVideo(s, "poor", null);
    s = adaptVideo(s, "poor", null);
    expect(s.level).toBe(VIDEO_PROFILES.length - 1);
    s = adaptVideo(s, "good", null);
    s = adaptVideo(s, "good", null);
    expect(s.level).toBe(3);
    s = adaptVideo(s, "good", null);
    expect(s.level).toBe(2);
  });

  it("fits the upload estimate and the mesh cap", () => {
    expect(adaptVideo({ level: 0, goodStreak: 0 }, "good", 400).level).toBe(2);
    expect(adaptVideo({ level: 0, goodStreak: 0 }, "good", null, meshMinLevel(4)).level).toBe(2);
    expect(meshMinLevel(1)).toBe(0);
    // never climbs above what the upload can carry
    expect(adaptVideo({ level: 1, goodStreak: 2 }, "good", 700).level).toBe(1);
    expect(adaptVideo({ level: 1, goodStreak: 2 }, "good", 5000).level).toBe(0);
  });
});

describe("attendance", () => {
  const at = (min: number) => new Date(Date.UTC(2026, 10, 16, 12, min)).toISOString();
  const stay = (user: string, role: Stay["role"], a: number, b: number, open = false): Stay => ({
    user_id: user, role, display_name: user, joined_at: at(a), last_seen_at: at(b), left_at: open ? null : at(b)
  });

  it("merges overlapping stays", () => {
    expect(mergeSpans([[5, 9], [1, 3], [2, 4], [9, 10]])).toEqual([[1, 4], [5, 10]]);
  });

  it("counts time per person, the call span and the time teacher and students overlap", () => {
    const now = Date.parse(at(60));
    const s = summarizeAttendance([
      stay("Prof", "teacher", 0, 45),
      stay("Ana", "student", 5, 20),
      stay("Ana", "student", 15, 40), // second tab, overlapping
      stay("Ion", "student", 50, 59, true) // still in the call (last beat 1 min ago)
    ], now);
    const ana = s.people.find(p => p.userId === "Ana")!;
    expect(ana.seconds).toBe(35 * 60);
    expect(s.people[0].role).toBe("teacher");
    expect(s.people.find(p => p.userId === "Ion")).toMatchObject({ present: true, seconds: 10 * 60 });
    expect(s.startedAt).toBe(at(0));
    expect(s.seconds).toBe((45 + 10) * 60);
    expect(s.lessonSeconds).toBe(35 * 60);
  });

  it("ends a stay that stopped beating at its last heartbeat", () => {
    const now = Date.parse(at(60));
    const s = summarizeAttendance([stay("Ana", "student", 0, 10, true)], now);
    expect(s.people[0]).toMatchObject({ seconds: 600, present: false });
  });

  it("formats durations", () => {
    expect(formatDuration(30)).toBe("<1 min");
    expect(formatDuration(12 * 60)).toBe("12 min");
    expect(formatDuration(65 * 60)).toBe("1 h 05 min");
  });
});
