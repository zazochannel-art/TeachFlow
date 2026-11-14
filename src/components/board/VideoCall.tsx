"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Expand, GripHorizontal, Loader2, Maximize2, Mic, MicOff, PhoneOff, Shrink, Video, VideoOff, WifiOff } from "lucide-react";
import { ICE_SERVERS, sanitizeCallSignal, userOfKey, type CallMeta, type CallSignal } from "@/lib/board/rtc";
import { getIceServers, joinSignal, type SignalHandle } from "@/lib/board/signal";
import { newId } from "@/lib/board/model";
import { useT } from "@/lib/i18n/client";

interface Props {
  lessonId: string;
  /** false in demo mode / before migration 0006: only the local camera preview works. */
  live: boolean;
  me: { id: string; name: string; role: "teacher" | "student" };
  teacherId: string;
}

interface Peer extends CallMeta { key: string; stream: MediaStream | null; connected: boolean; failed?: boolean }

const MAX_PEERS = 7;
const MEDIA: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } }
};

/**
 * TeachFlow's own lesson video call: camera + microphone, peer-to-peer (WebRTC mesh, one
 * connection per pair of participants). Signalling runs on the lesson's private Realtime channel.
 */
export function VideoCall({ lessonId, live, me, teacherId }: Props) {
  const t = useT();
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [inCall, setInCall] = useState<Record<string, string>>({});

  const keyRef = useRef("");
  const signalRef = useRef<SignalHandle | null>(null);
  const iceRef = useRef<RTCIceServer[]>(ICE_SERVERS);
  const streamRef = useRef<MediaStream | null>(null);
  const joinedRef = useRef(false);
  const stateRef = useRef({ mic: true, cam: true });
  const pcsRef = useRef(new Map<string, RTCPeerConnection>());
  const iceQueueRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const gridRef = useRef<HTMLDivElement>(null);

  const myMeta = useCallback((): CallMeta => ({ name: me.name, role: me.role, ...stateRef.current }), [me.name, me.role]);
  const send = useCallback((msg: CallSignal) => { signalRef.current?.send(msg); }, []);

  const upsertPeer = useCallback((key: string, patch: Partial<Peer>) => {
    setPeers(list => {
      const i = list.findIndex(p => p.key === key);
      if (i === -1) return [...list, { key, name: "", role: "student", mic: true, cam: true, stream: null, connected: false, ...patch }];
      const next = list.slice();
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }, []);

  const dropPeer = useCallback((key: string) => {
    const pc = pcsRef.current.get(key);
    if (pc) { pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null; pc.close(); }
    pcsRef.current.delete(key);
    iceQueueRef.current.delete(key);
    setPeers(list => list.filter(p => p.key !== key));
  }, []);

  const restartsRef = useRef(new Map<string, number>());

  /**
   * Peer connection to `key` carrying our camera and microphone. The offerer always asks for both
   * audio and video, so the other side can send its camera even when we have none (and vice versa).
   */
  const connect = useCallback((key: string, offerer: boolean) => {
    const old = pcsRef.current.get(key);
    if (old) { old.onconnectionstatechange = null; old.close(); }
    const pc = new RTCPeerConnection({ iceServers: iceRef.current });
    pcsRef.current.set(key, pc);
    const stream = streamRef.current;
    if (stream) for (const track of stream.getTracks()) pc.addTrack(track, stream);
    if (offerer) {
      for (const kind of ["audio", "video"] as const) {
        if (!stream || stream.getTracks().every(tr => tr.kind !== kind)) pc.addTransceiver(kind, { direction: "recvonly" });
      }
    }
    pc.onicecandidate = e => { if (e.candidate) send({ type: "ice", from: keyRef.current, to: key, candidate: e.candidate.toJSON() }); };
    pc.ontrack = e => {
      const remote = e.streams[0] ?? new MediaStream([e.track]);
      upsertPeer(key, { stream: remote });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") { restartsRef.current.delete(key); upsertPeer(key, { connected: true, failed: false }); }
      if (pc.connectionState === "failed") {
        // Usually a strict NAT/firewall: retry once with an ICE restart, then show the problem.
        const tries = restartsRef.current.get(key) ?? 0;
        if (offerer && tries < 1) {
          restartsRef.current.set(key, tries + 1);
          void pc.createOffer({ iceRestart: true }).then(async offer => {
            await pc.setLocalDescription(offer);
            send({ type: "offer", from: keyRef.current, to: key, sdp: offer.sdp ?? "", name: me.name, role: me.role, ...stateRef.current });
          }).catch(() => {});
        } else {
          upsertPeer(key, { connected: false, failed: true });
        }
      }
    };
    return pc;
  }, [send, upsertPeer, me.name, me.role]);

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
    void getIceServers().then(s => { iceRef.current = s; });

    const roleOf = (key: string): CallMeta["role"] => (userOfKey(key) === teacherId ? "teacher" : "student");

    const onSignal = async (raw: unknown) => {
      const msg = sanitizeCallSignal(raw);
      if (!msg) return;
      if ("to" in msg && msg.to !== keyRef.current) return;
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
          upsertPeer(from, { name: msg.name, role: roleOf(from), mic: msg.mic, cam: msg.cam });
          // Only the participant with the smaller key offers, so two offers never cross.
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
          upsertPeer(from, { name: msg.name, role: roleOf(from), mic: msg.mic, cam: msg.cam, failed: false });
          // An ICE restart renegotiates on the existing connection; a new offer otherwise starts fresh.
          const existing = pcs.get(from);
          const sameSession = existing?.signalingState === "stable" && !!existing.remoteDescription && fingerprint(existing.remoteDescription?.sdp) === fingerprint(msg.sdp);
          const pc = existing && sameSession ? existing : connect(from, false);
          await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: "answer", from: keyRef.current, to: from, sdp: answer.sdp ?? "" });
          await flushIce(from, pc);
          break;
        }
        case "answer": {
          const pc = pcs.get(from);
          if (!pc || pc.signalingState !== "have-local-offer") return;
          await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          await flushIce(from, pc);
          break;
        }
        case "ice": {
          const pc = pcs.get(from);
          if (pc?.remoteDescription) await pc.addIceCandidate(msg.candidate).catch(() => {});
          else {
            const q = iceQueueRef.current.get(from) ?? [];
            if (q.length < 50) q.push(msg.candidate);
            iceQueueRef.current.set(from, q);
          }
          break;
        }
        case "state":
          if (pcs.has(from)) upsertPeer(from, { mic: msg.mic, cam: msg.cam });
          break;
        case "bye":
          dropPeer(from);
          break;
      }
    };

    const handle = joinSignal(`screen:${lessonId}`, "call", payload => { void onSignal(payload).catch(() => {}); }, () => {
      send({ type: "who", from: keyRef.current });
      // After a reconnect, announce ourselves again so the others reconnect to us.
      if (joinedRef.current) send({ type: "hello", from: keyRef.current, ...myMeta() });
    });
    signalRef.current = handle;

    const onHide = () => { if (joinedRef.current) send({ type: "bye", from: keyRef.current }); };
    window.addEventListener("pagehide", onHide);

    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
      signalRef.current = null;
      handle?.leave();
      for (const pc of pcs.values()) pc.close();
      pcs.clear();
    };
  }, [live, lessonId, me.id, teacherId, connect, dropPeer, upsertPeer, myMeta, send]);

  // ---------- actions ----------

  const join = async () => {
    setError(null);
    setJoining(true);
    if (live) iceRef.current = await getIceServers();
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia(MEDIA);
    } catch {
      try {
        // No camera (or camera refused): join with the microphone only.
        stream = await navigator.mediaDevices.getUserMedia({ audio: MEDIA.audio });
      } catch {
        setError(t("Nu am acces la cameră sau microfon. Permite-le din setările browserului și încearcă din nou."));
      }
    }
    setJoining(false);
    if (!stream) return;
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

  const leave = useCallback(() => {
    if (joinedRef.current) send({ type: "bye", from: keyRef.current });
    joinedRef.current = false;
    for (const key of [...pcsRef.current.keys()]) dropPeer(key);
    streamRef.current?.getTracks().forEach(tr => tr.stop());
    streamRef.current = null;
    setLocal(null);
    setPeers([]);
    setJoined(false);
  }, [send, dropPeer]);

  useEffect(() => () => { streamRef.current?.getTracks().forEach(tr => tr.stop()); }, []);

  const toggle = (kind: "mic" | "cam") => {
    const stream = streamRef.current;
    if (!stream) return;
    const tracks = kind === "mic" ? stream.getAudioTracks() : stream.getVideoTracks();
    if (tracks.length === 0) return;
    const on = !stateRef.current[kind];
    tracks.forEach(tr => { tr.enabled = on; });
    stateRef.current = { ...stateRef.current, [kind]: on };
    if (kind === "mic") setMic(on); else setCam(on);
    send({ type: "state", from: keyRef.current, ...stateRef.current });
  };

  const fullscreen = () => { void gridRef.current?.requestFullscreen?.(); };

  // ---------- Floating panel (small, movable, so the whiteboard keeps the page) ----------

  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [view, setView] = useState<PanelView>(loadView);
  const [isFull, setIsFull] = useState(false);

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
            {error && <p className="mt-0.5 text-[12px] font-bold text-[#ffd7d7]">{error}</p>}
          </div>
        </div>
        <button type="button" onClick={join} disabled={joining} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-4 py-1.5 text-[12px] font-extrabold text-primary-2 hover:bg-tint disabled:opacity-70">
          {joining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />} {t("Intră în apel")}
        </button>
      </section>
    );
  }

  const count = peers.length + 1;
  const tileW = isFull ? "" : view.large ? "w-[220px] sm:w-[260px]" : "w-[120px] sm:w-[150px]";
  const cols = isFull
    ? count <= 1 ? "grid-cols-1" : count <= 4 ? "grid-cols-2" : "grid-cols-3"
    : count <= 2 ? "grid-cols-1" : "grid-cols-2";
  const place = view.pos ? undefined : "right-3 bottom-20 md:right-5 md:bottom-5";

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
          <Tile className={tileW} stream={local} name={t("Tu")} muted mirror mic={mic} cam={cam && hasCamera} label={me.role === "teacher" ? t("Profesor") : undefined} />
          {peers.map(p => (
            <Tile key={p.key} className={tileW} stream={p.stream} name={p.name || t("Participant")} mic={p.mic} cam={p.cam} connecting={!p.connected && !p.failed} failed={p.failed} label={p.role === "teacher" ? t("Profesor") : undefined} />
          ))}
        </div>
        {!live && <p className="mt-1 max-w-[260px] px-1 text-[10px] leading-snug text-white/65">{t("Mod local: vezi doar camera ta. Apelul cu elevii pornește după configurarea Supabase.")}</p>}
        {live && peers.length === 0 && <p className="mt-1 max-w-[260px] px-1 text-[10px] leading-snug text-white/70">{t("Aștepți ceilalți participanți. Ei intră din pagina lecției, cu „Intră în apel”.")}</p>}
      </div>

      <div className="flex items-center justify-center gap-1.5 px-2 py-1.5">
        <CallButton onClick={() => toggle("mic")} active={mic} label={mic ? t("Oprește microfonul") : t("Pornește microfonul")} icon={mic ? Mic : MicOff} />
        <CallButton onClick={() => toggle("cam")} active={cam && hasCamera} disabled={!hasCamera} label={cam ? t("Oprește camera") : t("Pornește camera")} icon={cam && hasCamera ? Video : VideoOff} />
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

function MiniButton({ onClick, label, icon: Icon }: { onClick: () => void; label: string; icon: typeof Mic }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="grid h-6 w-6 cursor-pointer place-items-center rounded-md text-white/80 hover:bg-white/15 hover:text-white">
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

function Tile({ stream, name, muted, mirror, mic, cam, connecting, failed, label, className = "" }: {
  stream: MediaStream | null; name: string; muted?: boolean; mirror?: boolean; mic: boolean; cam: boolean; connecting?: boolean; failed?: boolean; label?: string; className?: string;
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
      <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${mirror ? "-scale-x-100" : ""} ${cam ? "" : "invisible"}`} />
      {!cam && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-[13px] font-extrabold text-white">{initials || "?"}</span>
        </span>
      )}
      {connecting && <span className="absolute inset-0 grid place-items-center bg-black/30"><Loader2 className="h-5 w-5 animate-spin text-white" /></span>}
      {failed && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 px-2 text-center text-[10px] font-bold leading-tight text-white" title={t("Rețeaua blochează conexiunea directă. Încercați din nou sau configurați un server TURN.")}>
          <WifiOff className="h-4 w-4 text-[#ff8b8b]" />
          {t("Nu se poate conecta")}
        </span>
      )}
      <span className="absolute bottom-1 left-1 flex max-w-[90%] items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
        {!mic && <MicOff className="h-2.5 w-2.5 shrink-0 text-[#ff8b8b]" />}
        <span className="truncate">{name}</span>
        {label && <span className="rounded bg-primary px-1 text-[8px] font-extrabold uppercase">{label}</span>}
      </span>
    </div>
  );
}
