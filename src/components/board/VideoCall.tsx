"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown, ChevronUp, Expand, GripHorizontal, Loader2, Maximize2, MessageSquare, Mic, MicOff, MonitorUp, MonitorX,
  PhoneOff, RefreshCw, Send, Shrink, Users, Video, VideoOff, WifiOff
} from "lucide-react";
import { ICE_SERVERS, MAX_CHAT, sanitizeCallSignal, userOfKey, type CallMeta, type CallSignal } from "@/lib/board/rtc";
import { getIceServers, joinSignal, type SignalHandle } from "@/lib/board/signal";
import { RateLimiter, SeenIds, canCall, capVideoBitrate, mediaProblem, type MediaProblem } from "@/lib/board/call";
import { newId } from "@/lib/board/model";
import { useT } from "@/lib/i18n/client";

interface Props {
  lessonId: string;
  /** false in demo mode / before migration 0006: only the local camera preview works. */
  live: boolean;
  me: { id: string; name: string; role: "teacher" | "student" };
  teacherId: string;
}

type PeerStatus = "connecting" | "connected" | "reconnecting" | "failed";
interface Peer extends CallMeta { key: string; stream: MediaStream | null; status: PeerStatus }
interface ChatLine { id: string; from: string; name: string; text: string; mine: boolean; at: number }

const MAX_PEERS = 7;
const MAX_RESTARTS = 2;
const VIDEO_BITRATE = 700_000;
const CONNECT_TIMEOUT = 20_000;
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const VIDEO: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } };

/**
 * TeachFlow's own lesson video call: camera + microphone (or microphone only), peer-to-peer
 * (WebRTC mesh: exactly one RTCPeerConnection per pair of participants). Signalling runs on the
 * lesson's private Realtime channel; audio and video never pass through Supabase.
 *
 * Every connection always negotiates one audio and one video transceiver in both directions, so a
 * participant can turn the camera on later, or share the screen, by swapping the track that is sent
 * (replaceTrack) without renegotiating.
 */
export function VideoCall({ lessonId, live, me, teacherId }: Props) {
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
  const gridRef = useRef<HTMLDivElement>(null);

  const myMeta = useCallback((): CallMeta => ({ name: me.name, role: me.role, ...stateRef.current }), [me.name, me.role]);
  const send = useCallback((msg: CallSignal) => { signalRef.current?.send(msg); }, []);

  const problemText = useCallback((p: MediaProblem, what: "cam" | "mic" | "both" | "screen") => {
    if (p === "denied") {
      return what === "screen" ? t("Partajarea ecranului a fost anulată sau refuzată.")
        : what === "cam" ? t("Ai refuzat accesul la cameră. Permite-l din bara de adrese a browserului și încearcă din nou.")
        : t("Ai refuzat accesul la microfon. Permite-l din bara de adrese a browserului și încearcă din nou.");
    }
    if (p === "notFound") return what === "cam" ? t("Nu am găsit nicio cameră pe acest dispozitiv.") : t("Nu am găsit niciun microfon pe acest dispozitiv.");
    if (p === "busy") return t("Camera sau microfonul este folosit de altă aplicație. Închide-o și încearcă din nou.");
    if (p === "unsupported") return what === "screen" ? t("Partajarea ecranului nu este disponibilă pe acest dispozitiv sau browser.") : t("Browserul nu suportă apeluri video. Folosește Chrome, Edge, Firefox sau Safari actualizat.");
    return t("Nu am acces la cameră sau microfon. Permite-le din setările browserului și încearcă din nou.");
  }, [t]);

  const upsertPeer = useCallback((key: string, patch: Partial<Peer>) => {
    setPeers(list => {
      const i = list.findIndex(p => p.key === key);
      if (i === -1) return [...list, { key, name: "", role: "student", mic: true, cam: true, stream: null, status: "connecting", ...patch }];
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
    clearTimer(key);
    setPeers(list => list.filter(p => p.key !== key));
  }, []);

  /** The track we currently send as "video": the screen while sharing, else the camera (if any). */
  const outgoingVideo = () => screenRef.current ?? streamRef.current?.getVideoTracks()[0] ?? null;

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
        void capVideoBitrate(pc, VIDEO_BITRATE);
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
  }, [send, upsertPeer, restartIce]);

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

  const fullscreen = () => { void gridRef.current?.requestFullscreen?.(); };

  // ---------- Floating panel (small, movable, so the whiteboard keeps the page) ----------

  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [view, setView] = useState<PanelView>(loadView);
  const [isFull, setIsFull] = useState(false);
  const [side, setSide] = useState<"chat" | "people" | null>(null);

  const openSide = (s: "chat" | "people") => {
    const next = side === s ? null : s;
    setSide(next);
    chatOpenRef.current = next === "chat";
    if (next === "chat") setUnread(0);
  };

  const updateView = useCallback((patch: Partial<PanelView>) => {
    setView(v => {
      const next = { ...v, ...patch };
      try { localStorage.setItem(VIEW_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, []);

  useEffect(() => {
    const onFull = () => setIsFull(!!document.fullscreenElement && document.fullscreenElement === gridRef.current);
    // Keep the panel on screen when the window shrinks.
    const onResize = () => setView(v => (v.pos ? { ...v, pos: clampPos(v.pos, panelRef.current) } : v));
    document.addEventListener("fullscreenchange", onFull);
    window.addEventListener("resize", onResize);
    return () => { document.removeEventListener("fullscreenchange", onFull); window.removeEventListener("resize", onResize); };
  }, []);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const box = panelRef.current?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setView(v => ({ ...v, pos: clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }, panelRef.current) }));
  };
  const onDragEnd = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setView(v => {
      try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* storage blocked */ }
      return v;
    });
  };

  // ---------- UI ----------

  const othersInCall = Object.keys(inCall).length;
  const hasCamera = (local?.getVideoTracks().length ?? 0) > 0;

  if (!joined) {
    return (
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-primary px-4 py-2.5 text-white shadow-card">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20"><Video className="h-4 w-4" fill="currentColor" /></span>
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold leading-tight">
              {t("Lecția video")}
              <span className="ml-2 font-semibold text-white/80">
                {othersInCall > 0
                  ? t.n("{n} participant este deja în apel|{n} participanți sunt deja în apel|{n} de participanți sunt deja în apel", othersInCall)
                  : t("Cameră și microfon direct în TeachFlow, fără Zoom sau Meet.")}
              </span>
            </p>
            {error && <p role="alert" className="mt-0.5 text-[12px] font-bold text-[#ffd7d7]">{error}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void join("audio")} disabled={!!joining} title={t("Intră doar cu microfonul, fără cameră")} className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-extrabold text-white hover:bg-white/25 disabled:opacity-70">
            {joining === "audio" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />} {t("Doar audio")}
          </button>
          <button type="button" onClick={() => void join("av")} disabled={!!joining} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-4 py-1.5 text-[12px] font-extrabold text-primary-2 hover:bg-tint disabled:opacity-70">
            {joining === "av" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />} {t("Intră în apel")}
          </button>
        </div>
      </section>
    );
  }

  const count = peers.length + 1;
  const tileW = isFull ? "" : view.large ? "w-[220px] sm:w-[260px]" : "w-[120px] sm:w-[150px]";
  const cols = isFull
    ? count <= 1 ? "grid-cols-1" : count <= 4 ? "grid-cols-2" : "grid-cols-3"
    : count <= 2 ? "grid-cols-1" : "grid-cols-2";
  const place = view.pos ? undefined : "right-3 bottom-20 md:right-5 md:bottom-5";
  const anyFailed = peers.some(p => p.status === "failed");
  const statusText = (s: PeerStatus) =>
    s === "connected" ? t("Conectat") : s === "reconnecting" ? t("Se reconectează…") : s === "failed" ? t("Nu se poate conecta") : t("Se conectează…");

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label={t("Apel video")}
      style={view.pos ? { left: view.pos.x, top: view.pos.y } : undefined}
      className={`fixed z-50 select-none overflow-hidden rounded-[16px] bg-navy shadow-lift ring-1 ring-white/10 ${place ?? ""}`}
    >
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        title={t("Mută fereastra")}
        className="flex cursor-grab touch-none items-center gap-1 px-2 py-1 text-white/80 active:cursor-grabbing"
      >
        <GripHorizontal className="h-4 w-4 shrink-0" />
        <span className="mr-auto truncate text-[11px] font-extrabold">{t("Apel video")} · {count}</span>
        <MiniButton onClick={() => openSide("people")} label={t("Participanți")} icon={Users} active={side === "people"} />
        <span className="relative">
          <MiniButton onClick={() => openSide("chat")} label={t("Chat")} icon={MessageSquare} active={side === "chat"} />
          {unread > 0 && <span className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#e5484d] px-0.5 text-[8px] font-extrabold text-white">{unread > 9 ? "9+" : unread}</span>}
        </span>
        {!view.min && (
          <MiniButton onClick={() => updateView({ large: !view.large })} label={view.large ? t("Camere mai mici") : t("Camere mai mari")} icon={view.large ? Shrink : Expand} />
        )}
        <MiniButton onClick={() => updateView({ min: !view.min })} label={view.min ? t("Arată camerele") : t("Ascunde camerele")} icon={view.min ? ChevronUp : ChevronDown} />
      </div>

      {/* Hidden, not unmounted, when minimised: the video elements also play the others' audio. */}
      <div className={view.min ? "hidden" : "px-1.5"}>
        <div
          ref={gridRef}
          className={`tf-scroll grid gap-1.5 bg-navy ${cols} ${isFull ? "h-full content-center p-4" : "max-h-[55vh] overflow-y-auto"}`}
        >
          <Tile className={tileW} stream={local} name={t("Tu")} muted mirror={!sharing} mic={mic} cam={(cam && hasCamera) || sharing} label={me.role === "teacher" ? t("Profesor") : undefined} screen={sharing} />
          {peers.map(p => (
            <Tile key={p.key} className={tileW} stream={p.stream} name={p.name || t("Participant")} mic={p.mic} cam={p.cam || !!p.screen} screen={p.screen} status={p.status} label={p.role === "teacher" ? t("Profesor") : undefined} />
          ))}
        </div>
      </div>

      <div className="max-w-[300px] space-y-1 px-2 pt-1 text-[10px] leading-snug">
        {!live && <p className="text-white/65">{t("Mod local: vezi doar camera ta. Apelul cu elevii pornește după configurarea Supabase.")}</p>}
        {live && peers.length === 0 && (
          <p className="text-white/70">{me.role === "teacher" ? t("Elevul nu a intrat încă în apel. El intră din pagina lecției, cu „Intră în apel”.") : t("Profesorul nu a intrat încă în apel. Rămâi aici, conexiunea pornește singură când intră.")}</p>
        )}
        {!online && <p role="alert" className="flex items-center gap-1 font-bold text-[#ffd27a]"><WifiOff className="h-3 w-3 shrink-0" /> {t("Conexiunea la internet s-a întrerupt. Reconectez când revine rețeaua…")}</p>}
        {anyFailed && <p role="alert" className="font-bold text-[#ffb4b4]">{t("Conexiunea directă nu a reușit. Rețeaua actuală (de exemplu date mobile sau un Wi-Fi cu restricții) poate necesita un server TURN.")}</p>}
        {notice && <p role="status" className="font-bold text-[#ffd27a]">{notice}</p>}
      </div>

      {side === "people" && (
        <ul className="mx-2 mt-1 max-h-[30vh] w-[260px] space-y-1 overflow-y-auto rounded-[10px] bg-white/5 p-2 text-[11px] text-white">
          <PersonRow name={`${me.name} (${t("tu")})`} teacher={me.role === "teacher"} mic={mic} cam={cam && hasCamera} status={t("Conectat")} teacherLabel={t("Profesor")} />
          {peers.map(p => (
            <PersonRow key={p.key} name={p.name || t("Participant")} teacher={p.role === "teacher"} mic={p.mic} cam={p.cam} status={statusText(p.status)} bad={p.status === "failed"} teacherLabel={t("Profesor")} />
          ))}
        </ul>
      )}
      {side === "chat" && <ChatBox lines={chat} onSend={sendChat} disabled={!live} />}

      <div className="flex items-center justify-center gap-1.5 px-2 py-1.5">
        <CallButton onClick={toggleMic} active={mic} label={mic ? t("Oprește microfonul") : t("Pornește microfonul")} icon={mic ? Mic : MicOff} />
        <CallButton onClick={() => void toggleCam()} active={cam && hasCamera} label={!hasCamera ? t("Pornește camera") : cam ? t("Oprește camera") : t("Pornește camera")} icon={cam && hasCamera ? Video : VideoOff} />
        <CallButton onClick={() => void toggleScreen()} active={!sharing} label={sharing ? t("Oprește partajarea ecranului") : t("Arată ecranul în apel")} icon={sharing ? MonitorX : MonitorUp} />
        {!view.min && <CallButton onClick={fullscreen} active label={t("Ecran complet")} icon={Maximize2} />}
        <button type="button" onClick={leave} aria-label={t("Ieși din apel")} title={t("Ieși din apel")} className="grid h-8 w-10 cursor-pointer place-items-center rounded-full bg-[#e5484d] text-white hover:bg-[#c93a3f]">
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** DTLS fingerprint of an SDP: unchanged for an ICE restart, new for a brand-new connection. */
function fingerprint(sdp: string | undefined) {
  return sdp?.match(/^a=fingerprint:(.+)$/m)?.[1]?.trim() ?? null;
}

interface PanelView { pos: { x: number; y: number } | null; large: boolean; min: boolean }
const VIEW_KEY = "tf-call-panel";

function loadView(): PanelView {
  const fallback: PanelView = { pos: null, large: false, min: false };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") as Partial<PanelView> | null;
    if (!raw || typeof raw !== "object") return fallback;
    const pos = raw.pos && Number.isFinite(raw.pos.x) && Number.isFinite(raw.pos.y) ? clampPos(raw.pos, null) : null;
    return { pos, large: raw.large === true, min: raw.min === true };
  } catch {
    return fallback;
  }
}

/** Keeps at least the panel's header inside the window. */
function clampPos(p: { x: number; y: number }, el: HTMLElement | null) {
  const w = el?.offsetWidth ?? 180;
  const h = el?.offsetHeight ?? 40;
  const maxX = Math.max(0, window.innerWidth - w - 4);
  const maxY = Math.max(0, window.innerHeight - Math.min(h, 40) - 4);
  return { x: Math.round(Math.min(Math.max(4, p.x), maxX)), y: Math.round(Math.min(Math.max(4, p.y), maxY)) };
}

function MiniButton({ onClick, label, icon: Icon, active }: { onClick: () => void; label: string; icon: typeof Mic; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active} className={`grid h-6 w-6 cursor-pointer place-items-center rounded-md hover:bg-white/15 hover:text-white ${active ? "bg-white/20 text-white" : "text-white/80"}`}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function CallButton({ onClick, active, disabled, label, icon: Icon }: { onClick: () => void; active: boolean; disabled?: boolean; label: string; icon: typeof Mic }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={!active}
      className={`grid h-8 w-8 cursor-pointer place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-[#c03a3a]"}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function PersonRow({ name, teacher, mic, cam, status, bad, teacherLabel }: { name: string; teacher: boolean; mic: boolean; cam: boolean; status: string; bad?: boolean; teacherLabel: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate font-bold">{name}</span>
      {teacher && <span className="rounded bg-primary px-1 text-[8px] font-extrabold uppercase">{teacherLabel}</span>}
      {mic ? <Mic className="h-3 w-3 text-white/60" /> : <MicOff className="h-3 w-3 text-[#ff8b8b]" />}
      {cam ? <Video className="h-3 w-3 text-white/60" /> : <VideoOff className="h-3 w-3 text-white/40" />}
      <span className={`shrink-0 text-[9px] ${bad ? "font-bold text-[#ff8b8b]" : "text-white/60"}`}>{status}</span>
    </li>
  );
}

function ChatBox({ lines, onSend, disabled }: { lines: ChatLine[]; onSend: (text: string) => void; disabled: boolean }) {
  const t = useT();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [lines.length]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(text);
    setText("");
  };
  return (
    <div className="mx-2 mt-1 w-[260px] select-text rounded-[10px] bg-white/5 p-2 text-white">
      <div ref={listRef} className="tf-scroll max-h-[28vh] min-h-[60px] space-y-1 overflow-y-auto text-[11px]" aria-live="polite">
        {lines.length === 0 && <p className="text-white/50">{t("Mesajele din chat nu se salvează: le văd doar cei din apel acum.")}</p>}
        {lines.map(l => (
          <p key={l.id} className="break-words">
            <span className={`font-extrabold ${l.mine ? "text-[#a9b6ff]" : "text-white"}`}>{l.name}: </span>
            <span className="text-white/85">{l.text}</span>
          </p>
        ))}
      </div>
      <form onSubmit={submit} className="mt-1.5 flex gap-1">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={MAX_CHAT}
          disabled={disabled}
          placeholder={t("Scrie un mesaj…")}
          aria-label={t("Scrie un mesaj…")}
          className="min-w-0 flex-1 rounded-md bg-white/10 px-2 py-1 text-[11px] text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
        />
        <button type="submit" disabled={disabled || !text.trim()} aria-label={t("Trimite")} className="grid h-6 w-7 cursor-pointer place-items-center rounded-md bg-primary text-white disabled:opacity-40">
          <Send className="h-3 w-3" />
        </button>
      </form>
    </div>
  );
}

function Tile({ stream, name, muted, mirror, mic, cam, status, screen, label, className = "" }: {
  stream: MediaStream | null; name: string; muted?: boolean; mirror?: boolean; mic: boolean; cam: boolean; status?: PeerStatus; screen?: boolean; label?: string; className?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v && v.srcObject !== stream) v.srcObject = stream;
  }, [stream]);
  const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className={`relative aspect-video overflow-hidden rounded-[10px] bg-[#1c1f6e] ${className}`}>
      <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full ${screen ? "object-contain" : "object-cover"} ${mirror ? "-scale-x-100" : ""} ${cam ? "" : "invisible"}`} />
      {!cam && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-[13px] font-extrabold text-white">{initials || "?"}</span>
        </span>
      )}
      {(status === "connecting" || status === "reconnecting") && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/35 text-[9px] font-bold text-white">
          {status === "reconnecting" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Loader2 className="h-5 w-5 animate-spin" />}
          {status === "reconnecting" ? t("Se reconectează…") : t("Se conectează…")}
        </span>
      )}
      {status === "failed" && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 px-2 text-center text-[10px] font-bold leading-tight text-white" title={t("Rețeaua blochează conexiunea directă. Încercați din nou sau configurați un server TURN.")}>
          <WifiOff className="h-4 w-4 text-[#ff8b8b]" />
          {t("Nu se poate conecta")}
        </span>
      )}
      <span className="absolute bottom-1 left-1 flex max-w-[90%] items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
        {!mic && <MicOff className="h-2.5 w-2.5 shrink-0 text-[#ff8b8b]" />}
        {screen && <MonitorUp className="h-2.5 w-2.5 shrink-0" />}
        <span className="truncate">{name}</span>
        {label && <span className="rounded bg-primary px-1 text-[8px] font-extrabold uppercase">{label}</span>}
      </span>
    </div>
  );
}
