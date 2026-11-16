"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ICE_SERVERS, MAX_CHAT, sanitizeCallSignal, userOfKey, type CallMeta, type CallSignal } from "@/lib/board/rtc";
import { getIceServers, joinSignal, type SignalHandle } from "@/lib/board/signal";
import { RateLimiter, SeenIds, canCall, mediaProblem, type MediaProblem } from "@/lib/board/call";
import { INITIAL_ADAPT, VIDEO_PROFILES, adaptVideo, applyVideoProfile, meshMinLevel, rateQuality, readStats, worstQuality, type AdaptState, type Quality, type StatCounters } from "@/lib/call/quality";
import { newId } from "@/lib/board/model";
import { useT } from "@/lib/i18n/client";
import type { CallEngine, CallParticipant, CallProps, ChatLine } from "./types";
import { useMediaProblemText } from "./media";

type Peer = CallParticipant;

const MAX_PEERS = 7;
const MAX_RESTARTS = 2;
const CONNECT_TIMEOUT = 20_000;
const STATS_EVERY = 4000;
export const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
export const VIDEO: MediaTrackConstraints = { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24, max: 30 } };

/**
 * TeachFlow's own P2P lesson call: camera + microphone (or microphone only), WebRTC mesh with
 * exactly one RTCPeerConnection per pair of participants. Signalling runs on the lesson's private
 * Realtime channel (a WebSocket protected by RLS); audio and video never pass through Supabase.
 *
 * Every connection always negotiates one audio and one video transceiver in both directions, so a
 * participant can turn the camera on later, or share the screen, by swapping the track that is sent
 * (replaceTrack) without renegotiating. Each connection's quality is measured every few seconds
 * (getStats) and its outgoing video resolution/bitrate follows it.
 */
export function useMeshCall({ lessonId, live, me, teacherId }: CallProps): CallEngine {
  const t = useT();
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState<"av" | "audio" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [inCall, setInCall] = useState<Record<string, string>>({});
  const [online, setOnline] = useState(true);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [unread, setUnread] = useState(0);

  const keyRef = useRef("");
  const signalRef = useRef<SignalHandle | null>(null);
  const iceRef = useRef<RTCIceServer[]>(ICE_SERVERS);
  /** Our outgoing stream: microphone, plus the camera when we have one. */
  const streamRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStreamTrack | null>(null);
  const joinedRef = useRef(false);
  const stateRef = useRef<{ mic: boolean; cam: boolean; screen?: boolean }>({ mic: true, cam: true });
  const pcsRef = useRef(new Map<string, RTCPeerConnection>());
  const remoteRef = useRef(new Map<string, MediaStream>());
  const iceQueueRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const restartsRef = useRef(new Map<string, number>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const chainsRef = useRef(new Map<string, Promise<void>>());
  const chatOpenRef = useRef(false);
  const adaptRef = useRef(new Map<string, AdaptState>());
  const countersRef = useRef(new Map<string, StatCounters>());
  const [joinedAt, setJoinedAt] = useState<number | null>(null);

  const myMeta = useCallback((): CallMeta => ({ name: me.name, role: me.role, ...stateRef.current }), [me.name, me.role]);
  const send = useCallback((msg: CallSignal) => { signalRef.current?.send(msg); }, []);

  const problemText = useMediaProblemText();

  const upsertPeer = useCallback((key: string, patch: Partial<Peer>) => {
    setPeers(list => {
      const i = list.findIndex(p => p.key === key);
      if (i === -1) return [...list, { key, name: "", role: "student", mic: true, cam: true, stream: null, status: "connecting", quality: "unknown", ...patch }];
      const next = list.slice();
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }, []);

  const clearTimer = (key: string) => {
    const tm = timersRef.current.get(key);
    if (tm) clearTimeout(tm);
    timersRef.current.delete(key);
  };

  const dropPeer = useCallback((key: string) => {
    const pc = pcsRef.current.get(key);
    if (pc) { pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null; pc.close(); }
    pcsRef.current.delete(key);
    remoteRef.current.delete(key);
    iceQueueRef.current.delete(key);
    restartsRef.current.delete(key);
    chainsRef.current.delete(key);
    adaptRef.current.delete(key);
    countersRef.current.delete(key);
    clearTimer(key);
    setPeers(list => list.filter(p => p.key !== key));
  }, []);

  /** The track we currently send as "video": the screen while sharing, else the camera (if any). */
  const outgoingVideo = () => screenRef.current ?? streamRef.current?.getVideoTracks()[0] ?? null;

  /** Applies this connection's current video step to its outgoing video. */
  const applyLevel = useCallback(async (key: string, pc: RTCPeerConnection) => {
    const st = adaptRef.current.get(key) ?? INITIAL_ADAPT;
    const level = Math.max(st.level, meshMinLevel(pcsRef.current.size));
    for (const tr of pc.getTransceivers()) {
      if (tr.receiver.track.kind === "video" && tr.currentDirection !== "stopped" && tr.sender.track) {
        await applyVideoProfile(tr.sender, VIDEO_PROFILES[level], !!screenRef.current);
      }
    }
  }, []);

  /** ICE restart on an existing connection (only the offering side of a pair does this). */
  const restartIce = useCallback(async (key: string) => {
    const pc = pcsRef.current.get(key);
    if (!pc) return;
    const tries = restartsRef.current.get(key) ?? 0;
    if (tries >= MAX_RESTARTS) { upsertPeer(key, { status: "failed" }); return; }
    restartsRef.current.set(key, tries + 1);
    if (pc.signalingState !== "stable") return; // an offer is already under way
    upsertPeer(key, { status: "reconnecting" });
    const offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);
    send({ type: "offer", from: keyRef.current, to: key, sdp: offer.sdp ?? "", ...myMeta() });
  }, [send, upsertPeer, myMeta]);

  /** Exactly one peer connection per participant pair; a new one replaces (and closes) the old. */
  const connect = useCallback((key: string, offerer: boolean) => {
    const old = pcsRef.current.get(key);
    if (old) { old.onconnectionstatechange = null; old.ontrack = null; old.onicecandidate = null; old.close(); }
    clearTimer(key);
    const pc = new RTCPeerConnection({ iceServers: iceRef.current, iceCandidatePoolSize: 4 });
    pcsRef.current.set(key, pc);
    const remote = new MediaStream();
    remoteRef.current.set(key, remote);
    upsertPeer(key, { stream: remote, status: "connecting" });

    if (offerer) {
      // Always one audio and one video line, both ways, even without a camera/microphone yet.
      const stream = streamRef.current;
      pc.addTransceiver(stream?.getAudioTracks()[0] ?? "audio", { direction: "sendrecv", streams: stream ? [stream] : [] });
      pc.addTransceiver(outgoingVideo() ?? "video", { direction: "sendrecv", streams: stream ? [stream] : [] });
    }
    pc.onicecandidate = e => { if (e.candidate) send({ type: "ice", from: keyRef.current, to: key, candidate: e.candidate.toJSON() }); };
    pc.ontrack = e => {
      if (!remote.getTracks().includes(e.track)) remote.addTrack(e.track);
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") {
        clearTimer(key);
        restartsRef.current.delete(key);
        upsertPeer(key, { status: "connected" });
        void applyLevel(key, pc);
      } else if (st === "disconnected") {
        // Often a short network blip that recovers by itself; restart ICE if it does not.
        upsertPeer(key, { status: "reconnecting" });
        clearTimer(key);
        timersRef.current.set(key, setTimeout(() => {
          if (pc.connectionState !== "disconnected" && pc.connectionState !== "failed") return;
          if (offerer) void restartIce(key).catch(() => {});
          else send({ type: "restart", from: keyRef.current, to: key });
        }, 4000));
      } else if (st === "failed") {
        onFailed();
      }
    };
    /** Connection failed (or never got through): retry with an ICE restart, then report it. */
    const onFailed = () => {
      if (pcsRef.current.get(key) !== pc) return;
      clearTimer(key);
      const tries = restartsRef.current.get(key) ?? 0;
      if (tries >= MAX_RESTARTS) { upsertPeer(key, { status: "failed" }); return; }
      if (offerer) void restartIce(key).catch(() => upsertPeer(key, { status: "failed" }));
      else {
        restartsRef.current.set(key, tries + 1);
        upsertPeer(key, { status: "reconnecting" });
        send({ type: "restart", from: keyRef.current, to: key });
      }
      watchdog();
    };
    // ICE can also hang in "checking" forever (no usable candidates at all): give up after a while
    // instead of showing a spinner forever.
    const watchdog = () => {
      timersRef.current.set(key, setTimeout(() => { if (pc.connectionState !== "connected") onFailed(); }, CONNECT_TIMEOUT));
    };
    watchdog();
    return pc;
  }, [send, upsertPeer, restartIce, applyLevel]);

  /** Answering side: send our tracks on the transceivers the offer created. */
  const attachLocalTracks = useCallback((pc: RTCPeerConnection) => {
    const stream = streamRef.current;
    const video = screenRef.current ?? stream?.getVideoTracks()[0] ?? null;
    for (const tr of pc.getTransceivers()) {
      if (tr.currentDirection === "stopped") continue;
      const kind = tr.receiver.track.kind;
      const track = kind === "audio" ? stream?.getAudioTracks()[0] ?? null : video;
      if (tr.sender.track !== track) void tr.sender.replaceTrack(track).catch(() => {});
      if (stream) tr.sender.setStreams?.(stream);
      tr.direction = "sendrecv";
    }
  }, []);

  /** Swaps the outgoing video track (camera on/off, screen share) on every connection. */
  const sendVideoTrack = (track: MediaStreamTrack | null) => {
    for (const pc of pcsRef.current.values()) {
      for (const tr of pc.getTransceivers()) {
        if (tr.receiver.track.kind === "video" && tr.currentDirection !== "stopped") void tr.sender.replaceTrack(track).catch(() => {});
      }
    }
    // Screen ↔ camera changes the encoding rules (full resolution for a screen).
    setTimeout(() => { for (const [key, pc] of pcsRef.current) void applyLevel(key, pc); }, 300);
  };

  const flushIce = async (key: string, pc: RTCPeerConnection) => {
    const queued = iceQueueRef.current.get(key) ?? [];
    iceQueueRef.current.delete(key);
    for (const c of queued) await pc.addIceCandidate(c).catch(() => {});
  };

  // ---------- signalling ----------

  useEffect(() => {
    keyRef.current = `${me.id}:${newId().slice(0, 8)}`;
    if (!live) return;
    const pcs = pcsRef.current;
    const chains = chainsRef.current;
    void getIceServers(lessonId).then(s => { iceRef.current = s; });

    // Abuse protection: one participant cannot flood the others (ICE trickle needs some room).
    const signalLimit = new RateLimiter(400, 10_000);
    const chatLimit = new RateLimiter(12, 10_000);
    const seenChat = new SeenIds();

    const roleOf = (key: string): CallMeta["role"] => (userOfKey(key) === teacherId ? "teacher" : "student");

    const onSignal = async (msg: CallSignal) => {
      const from = msg.from;

      // Who is in the call (shown on the "join" button even before joining).
      if (msg.type === "hello" || msg.type === "here" || msg.type === "offer") setInCall(m => ({ ...m, [from]: msg.name }));
      if (msg.type === "bye") setInCall(m => { const n = { ...m }; delete n[from]; return n; });

      if (msg.type === "who") {
        if (joinedRef.current) send({ type: "here", from: keyRef.current, to: from, ...myMeta() });
        return;
      }
      if (!joinedRef.current) return;

      switch (msg.type) {
        case "hello":
        case "here": {
          upsertPeer(from, { name: msg.name, role: roleOf(from), mic: msg.mic, cam: msg.cam, screen: msg.screen });
          // Deterministic initiator: only the participant with the smaller key offers, so offers never cross.
          if (keyRef.current > from) {
            if (msg.type === "hello") send({ type: "here", from: keyRef.current, to: from, ...myMeta() });
            return;
          }
          if (msg.type === "here" && pcs.has(from)) return;
          if (!pcs.has(from) && pcs.size >= MAX_PEERS) return;
          const pc = connect(from, true);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send({ type: "offer", from: keyRef.current, to: from, sdp: offer.sdp ?? "", ...myMeta() });
          break;
        }
        case "offer": {
          if (keyRef.current < from) return; // we are the offerer of this pair: ignore a crossing offer
          upsertPeer(from, { name: msg.name, role: roleOf(from), mic: msg.mic, cam: msg.cam, screen: msg.screen });
          // An ICE restart renegotiates on the existing connection; a new offer otherwise starts fresh.
          const existing = pcs.get(from);
          const sameSession = existing?.signalingState === "stable" && !!existing.remoteDescription && fingerprint(existing.remoteDescription?.sdp) === fingerprint(msg.sdp);
          if (!existing || !sameSession) {
            if (!existing && pcs.size >= MAX_PEERS) return;
            connect(from, false);
          }
          const pc = pcs.get(from)!;
          await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
          attachLocalTracks(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: "answer", from: keyRef.current, to: from, sdp: answer.sdp ?? "" });
          await flushIce(from, pc);
          break;
        }
        case "answer": {
          const pc = pcs.get(from);
          if (!pc || pc.signalingState !== "have-local-offer") return; // duplicate or stale answer
          await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          await flushIce(from, pc);
          break;
        }
        case "ice": {
          const pc = pcs.get(from);
          if (pc?.remoteDescription) await pc.addIceCandidate(msg.candidate).catch(() => {});
          else {
            // Buffer candidates that arrive before the offer/answer.
            const q = iceQueueRef.current.get(from) ?? [];
            if (q.length < 50) q.push(msg.candidate);
            iceQueueRef.current.set(from, q);
          }
          break;
        }
        case "restart":
          if (keyRef.current < from) await restartIce(from);
          break;
        case "state":
          if (pcs.has(from)) upsertPeer(from, { mic: msg.mic, cam: msg.cam, screen: msg.screen });
          break;
        case "chat":
          if (!seenChat.add(msg.id) || !chatLimit.allow(from)) return;
          setChat(list => [...list.slice(-99), { id: msg.id, from, name: msg.name, text: msg.text, mine: false, at: Date.now() }]);
          if (!chatOpenRef.current) setUnread(n => n + 1);
          break;
        case "bye":
          if (pcs.has(from) && roleOf(from) === "teacher" && me.role === "student") setNotice(t("Profesorul a ieșit din apel."));
          dropPeer(from);
          break;
      }
    };

    const handle = joinSignal(`screen:${lessonId}`, "call", payload => {
      const msg = sanitizeCallSignal(payload);
      if (!msg || ("to" in msg && msg.to !== keyRef.current) || msg.from === keyRef.current) return;
      if (!signalLimit.allow(msg.from)) return;
      // Messages from one participant are handled in order (offer before its ICE, and so on).
      const from = msg.from;
      const prev = chains.get(from) ?? Promise.resolve();
      const next = prev.then(() => onSignal(msg)).catch(() => {});
      chains.set(from, next);
    }, () => {
      send({ type: "who", from: keyRef.current });
      // After a reconnect, announce ourselves again so the others reconnect to us.
      if (joinedRef.current) send({ type: "hello", from: keyRef.current, ...myMeta() });
    });
    signalRef.current = handle;

    const onHide = () => { if (joinedRef.current) send({ type: "bye", from: keyRef.current }); };
    window.addEventListener("pagehide", onHide);
    const timers = timersRef.current;

    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
      signalRef.current = null;
      handle?.leave();
      for (const pc of pcs.values()) pc.close();
      pcs.clear();
      chains.clear();
      for (const tm of timers.values()) clearTimeout(tm);
      timers.clear();
    };
  }, [live, lessonId, me.id, me.role, teacherId, connect, dropPeer, upsertPeer, myMeta, send, restartIce, attachLocalTracks, t]);

  // Connection quality: every few seconds read each connection's stats, show them, and move its
  // outgoing video one step down (bad network) or up (good network for a while).
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
    return () => { stop = true; clearInterval(id); clearTimeout(first); };
  }, [joined, applyLevel, upsertPeer]);

  // Network interruptions: tell the user, and reconnect everything when the network is back.
  useEffect(() => {
    const off = () => setOnline(false);
    const on = () => {
      setOnline(true);
      if (!joinedRef.current) return;
      for (const [key, pc] of pcsRef.current) {
        if (pc.connectionState === "connected") continue;
        restartsRef.current.delete(key);
        if (keyRef.current < key) void restartIce(key).catch(() => {});
        else send({ type: "restart", from: keyRef.current, to: key });
      }
    };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => { window.removeEventListener("offline", off); window.removeEventListener("online", on); };
  }, [restartIce, send]);

  // ---------- actions ----------

  const join = async (mode: "av" | "audio") => {
    setError(null);
    setNotice(null);
    if (!canCall()) { setError(problemText("unsupported", "both")); return; }
    setJoining(mode);
    if (live) iceRef.current = await getIceServers(lessonId);
    let stream: MediaStream | null = null;
    let camProblem: MediaProblem | null = null;
    if (mode === "av") {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: VIDEO });
      } catch (e) {
        camProblem = mediaProblem(e);
      }
    }
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
      } catch (e) {
        setError(problemText(mediaProblem(e), "mic"));
      }
    }
    setJoining(null);
    if (!stream) return;
    // Joined, but without the camera: say why, the call works with audio only.
    if (camProblem) setNotice(`${problemText(camProblem, "cam")} ${t("Ai intrat doar cu audio.")}`);
    streamRef.current = stream;
    const hasVideo = stream.getVideoTracks().length > 0;
    stateRef.current = { mic: true, cam: hasVideo };
    setMic(true);
    setCam(hasVideo);
    setLocal(stream);
    joinedRef.current = true;
    setJoined(true);
    setJoinedAt(Date.now());
    send({ type: "hello", from: keyRef.current, ...myMeta() });
  };

  const stopScreen = useCallback(() => {
    const tr = screenRef.current;
    if (!tr) return;
    tr.onended = null;
    tr.stop();
    screenRef.current = null;
    setSharing(false);
  }, []);

  const leave = useCallback(() => {
    if (joinedRef.current) send({ type: "bye", from: keyRef.current });
    joinedRef.current = false;
    stopScreen();
    for (const key of [...pcsRef.current.keys()]) dropPeer(key);
    streamRef.current?.getTracks().forEach(tr => tr.stop());
    streamRef.current = null;
    setLocal(null);
    setPeers([]);
    setNotice(null);
    setJoined(false);
    setJoinedAt(null);
    setMyQuality("unknown");
  }, [send, dropPeer, stopScreen]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(tr => tr.stop());
    screenRef.current?.stop();
  }, []);

  const broadcastState = () => send({ type: "state", from: keyRef.current, ...stateRef.current });

  const toggleMic = () => {
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    if (tracks.length === 0) return;
    const on = !stateRef.current.mic;
    tracks.forEach(tr => { tr.enabled = on; });
    stateRef.current = { ...stateRef.current, mic: on };
    setMic(on);
    broadcastState();
  };

  const toggleCam = async () => {
    const stream = streamRef.current;
    if (!stream) return;
    let track = stream.getVideoTracks()[0];
    if (!track) {
      // Joined with audio only: ask for the camera now and start sending it.
      try {
        const got = await navigator.mediaDevices.getUserMedia({ video: VIDEO });
        track = got.getVideoTracks()[0];
      } catch (e) {
        setNotice(problemText(mediaProblem(e), "cam"));
        return;
      }
      stream.addTrack(track);
      setLocal(new MediaStream(stream.getTracks()));
      if (!screenRef.current) sendVideoTrack(track);
      stateRef.current = { ...stateRef.current, cam: true };
      setCam(true);
      setNotice(null);
      broadcastState();
      return;
    }
    const on = !stateRef.current.cam;
    track.enabled = on;
    stateRef.current = { ...stateRef.current, cam: on };
    setCam(on);
    broadcastState();
  };

  const toggleScreen = async () => {
    if (screenRef.current) {
      stopScreen();
      sendVideoTrack(streamRef.current?.getVideoTracks()[0] ?? null);
      stateRef.current = { ...stateRef.current, screen: false };
      broadcastState();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) { setNotice(problemText("unsupported", "screen")); return; }
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (e) {
      const p = mediaProblem(e);
      if (p !== "denied") setNotice(problemText(p, "screen"));
      return;
    }
    const track = display.getVideoTracks()[0];
    if (!track) return;
    screenRef.current = track;
    // The browser's own "Stop sharing" button: go back to the camera.
    track.onended = () => {
      screenRef.current = null;
      setSharing(false);
      sendVideoTrack(streamRef.current?.getVideoTracks()[0] ?? null);
      stateRef.current = { ...stateRef.current, screen: false };
      broadcastState();
    };
    sendVideoTrack(track);
    setSharing(true);
    stateRef.current = { ...stateRef.current, screen: true };
    broadcastState();
  };

  const sendChat = (text: string) => {
    const clean = text.trim().slice(0, MAX_CHAT);
    if (!clean) return;
    const id = newId();
    setChat(list => [...list.slice(-99), { id, from: keyRef.current, name: t("Tu"), text: clean, mine: true, at: Date.now() }]);
    send({ type: "chat", from: keyRef.current, id, name: me.name, text: clean });
  };

  const setChatOpen = useCallback((open: boolean) => {
    chatOpenRef.current = open;
    if (open) setUnread(0);
  }, []);

  return {
    transport: "p2p", joined, joining, joinedAt, error, notice, local, mic, cam, sharing, peers,
    othersInCall: Object.keys(inCall).length, online, myQuality, relay, reconnecting: false, chat, unread,
    join, leave, toggleMic, toggleCam, toggleScreen, sendChat, setChatOpen
  };
}

/** DTLS fingerprint of an SDP: unchanged for an ICE restart, new for a brand-new connection. */
function fingerprint(sdp: string | undefined) {
  return sdp?.match(/^a=fingerprint:(.+)$/m)?.[1]?.trim() ?? null;
}
