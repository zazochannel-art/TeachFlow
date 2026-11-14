"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
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

interface Peer extends CallMeta { key: string; stream: MediaStream | null; connected: boolean }

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

  /** Peer connection to `key` carrying our camera and microphone. */
  const connect = useCallback((key: string) => {
    const old = pcsRef.current.get(key);
    if (old) { old.onconnectionstatechange = null; old.close(); }
    const pc = new RTCPeerConnection({ iceServers: iceRef.current });
    pcsRef.current.set(key, pc);
    const stream = streamRef.current;
    if (stream) for (const track of stream.getTracks()) pc.addTrack(track, stream);
    pc.onicecandidate = e => { if (e.candidate) send({ type: "ice", from: keyRef.current, to: key, candidate: e.candidate.toJSON() }); };
    pc.ontrack = e => upsertPeer(key, { stream: e.streams[0] ?? new MediaStream([e.track]) });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") upsertPeer(key, { connected: true });
      if (pc.connectionState === "failed" || pc.connectionState === "closed") dropPeer(key);
    };
    return pc;
  }, [send, upsertPeer, dropPeer]);

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
          const pc = connect(from);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send({ type: "offer", from: keyRef.current, to: from, sdp: offer.sdp ?? "", ...myMeta() });
          break;
        }
        case "offer": {
          upsertPeer(from, { name: msg.name, role: roleOf(from), mic: msg.mic, cam: msg.cam });
          const pc = connect(from);
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
          upsertPeer(from, { mic: msg.mic, cam: msg.cam });
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

  // ---------- UI ----------

  const othersInCall = Object.keys(inCall).length;
  const hasCamera = (local?.getVideoTracks().length ?? 0) > 0;

  if (!joined) {
    return (
      <section className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-primary p-5 text-white shadow-lift">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/20"><Video className="h-5 w-5" fill="currentColor" /></span>
          <div>
            <p className="text-[16px] font-extrabold">{t("Lecția video")}</p>
            <p className="text-[12px] text-white/80">
              {othersInCall > 0
                ? t.n("{n} participant este deja în apel|{n} participanți sunt deja în apel|{n} de participanți sunt deja în apel", othersInCall)
                : t("Cameră și microfon direct în TeachFlow, fără Zoom sau Meet.")}
            </p>
            {error && <p className="mt-1 text-[12px] font-bold text-[#ffd7d7]">{error}</p>}
          </div>
        </div>
        <button type="button" onClick={join} disabled={joining} className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[13px] font-extrabold text-primary-2 hover:bg-tint disabled:opacity-70">
          {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />} {t("Intră în apel")}
        </button>
      </section>
    );
  }

  const count = peers.length + 1;
  const cols = count <= 1 ? "grid-cols-1" : count <= 4 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3";

  return (
    <section className="mb-5 overflow-hidden rounded-[20px] bg-navy p-3 shadow-card">
      <div ref={gridRef} className={`mx-auto grid max-w-[960px] gap-3 bg-navy ${cols}`}>
        <Tile stream={local} name={t("Tu")} muted mirror mic={mic} cam={cam && hasCamera} label={me.role === "teacher" ? t("Profesor") : undefined} />
        {peers.map(p => (
          <Tile key={p.key} stream={p.stream} name={p.name || t("Participant")} mic={p.mic} cam={p.cam} connecting={!p.connected} label={p.role === "teacher" ? t("Profesor") : undefined} />
        ))}
      </div>
      {!live && <p className="mt-3 text-center text-[11px] text-white/70">{t("Mod local: vezi doar camera ta. Apelul cu elevii pornește după configurarea Supabase.")}</p>}
      {live && peers.length === 0 && <p className="mt-3 text-center text-[12px] text-white/75">{t("Aștepți ceilalți participanți. Ei intră din pagina lecției, cu „Intră în apel”.")}</p>}
      <div className="mt-3 flex items-center justify-center gap-2">
        <CallButton onClick={() => toggle("mic")} active={mic} label={mic ? t("Oprește microfonul") : t("Pornește microfonul")} icon={mic ? Mic : MicOff} />
        <CallButton onClick={() => toggle("cam")} active={cam && hasCamera} disabled={!hasCamera} label={cam ? t("Oprește camera") : t("Pornește camera")} icon={cam && hasCamera ? Video : VideoOff} />
        <CallButton onClick={fullscreen} active label={t("Ecran complet")} icon={Maximize2} />
        <button type="button" onClick={leave} className="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-[#e5484d] px-5 text-[13px] font-extrabold text-white hover:bg-[#c93a3f]">
          <PhoneOff className="h-4 w-4" /> {t("Ieși din apel")}
        </button>
      </div>
    </section>
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
      className={`grid h-11 w-11 cursor-pointer place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-[#c03a3a]"}`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

function Tile({ stream, name, muted, mirror, mic, cam, connecting, label }: {
  stream: MediaStream | null; name: string; muted?: boolean; mirror?: boolean; mic: boolean; cam: boolean; connecting?: boolean; label?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v && v.srcObject !== stream) v.srcObject = stream;
  }, [stream]);
  const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="relative aspect-video overflow-hidden rounded-[16px] bg-[#1c1f6e]">
      <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${mirror ? "-scale-x-100" : ""} ${cam ? "" : "invisible"}`} />
      {!cam && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-[20px] font-extrabold text-white">{initials || "?"}</span>
        </span>
      )}
      {connecting && <span className="absolute inset-0 grid place-items-center bg-black/30"><Loader2 className="h-6 w-6 animate-spin text-white" /></span>}
      <span className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 text-[11px] font-bold text-white">
        {!mic && <MicOff className="h-3 w-3 shrink-0 text-[#ff8b8b]" />}
        <span className="truncate">{name}</span>
        {label && <span className="rounded bg-primary px-1.5 text-[9px] font-extrabold uppercase">{label}</span>}
      </span>
    </div>
  );
}
