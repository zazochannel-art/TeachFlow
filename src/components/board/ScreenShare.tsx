"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Maximize2, MonitorUp, MonitorX, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ICE_SERVERS, sanitizeSignal, userOfKey, type RtcSignal } from "@/lib/board/rtc";
import { newId } from "@/lib/board/model";

interface Props {
  lessonId: string;
  /** false in demo mode / before migration 0006: the teacher only sees a local preview. */
  live: boolean;
  me: { id: string; role: "teacher" | "student" };
  teacherId: string;
}

type Status = "idle" | "starting" | "sharing" | "error";

const noopSubscribe = () => () => {};
const hasDisplayMedia = () => !!navigator.mediaDevices?.getDisplayMedia;

/**
 * Teacher's screen share for the lesson room. Media goes peer-to-peer (WebRTC, one connection
 * per student); the offer/answer/ICE messages travel over the private channel "screen:<lesson>".
 */
export function ScreenShare({ lessonId, live, me, teacherId }: Props) {
  const isTeacher = me.role === "teacher";
  const canShare = useSyncExternalStore(noopSubscribe, hasDisplayMedia, () => true);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [viewers, setViewers] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const keyRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef(new Map<string, RTCPeerConnection>());
  const iceQueueRef = useRef(new Map<string, RTCIceCandidateInit[]>());

  // Show whichever stream applies in the single <video>.
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.srcObject = isTeacher ? localStream : remoteStream;
  }, [isTeacher, localStream, remoteStream]);

  const send = useCallback((msg: RtcSignal) => {
    const ch = channelRef.current;
    if (ch) void ch.send({ type: "broadcast", event: "rtc", payload: msg });
  }, []);

  const countViewers = useCallback(() => {
    let n = 0;
    for (const pc of pcsRef.current.values()) if (pc.connectionState === "connected") n++;
    setViewers(n);
  }, []);

  const closePeer = useCallback((key: string) => {
    const pc = pcsRef.current.get(key);
    if (pc) { pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null; pc.close(); }
    pcsRef.current.delete(key);
    iceQueueRef.current.delete(key);
  }, []);

  const closeAll = useCallback(() => {
    for (const key of [...pcsRef.current.keys()]) closePeer(key);
    setViewers(0);
  }, [closePeer]);

  const flushIce = async (key: string, pc: RTCPeerConnection) => {
    const queued = iceQueueRef.current.get(key) ?? [];
    iceQueueRef.current.delete(key);
    for (const c of queued) await pc.addIceCandidate(c).catch(() => {});
  };

  const newPeer = useCallback((key: string) => {
    closePeer(key);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcsRef.current.set(key, pc);
    pc.onicecandidate = e => {
      if (e.candidate) send({ type: "ice", from: keyRef.current, to: key, candidate: e.candidate.toJSON() });
    };
    return pc;
  }, [closePeer, send]);

  // ---------- teacher ----------

  const offerTo = useCallback(async (key: string) => {
    const stream = streamRef.current;
    if (!stream) return;
    const pc = newPeer(key);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer(key);
      countViewers();
    };
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "offer", from: keyRef.current, to: key, sdp: offer.sdp ?? "" });
  }, [newPeer, closePeer, countViewers, send]);

  const stopSharing = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    closeAll();
    setStatus("idle");
    send({ type: "stop", from: keyRef.current });
  }, [closeAll, send]);

  const startSharing = async () => {
    setError(null);
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: true });
      streamRef.current = stream;
      // The browser's own "Stop sharing" button ends the video track.
      stream.getVideoTracks()[0]?.addEventListener("ended", stopSharing);
      setLocalStream(stream);
      setStatus("sharing");
      send({ type: "start", from: keyRef.current });
    } catch (e) {
      setStatus("idle");
      if (!(e instanceof DOMException && e.name === "NotAllowedError")) {
        setError("Nu am putut porni partajarea ecranului.");
        setStatus("error");
      }
    }
  };

  // ---------- channel ----------

  useEffect(() => {
    keyRef.current = `${me.id}:${newId().slice(0, 8)}`;
    if (!live) return;
    const supabase = createClient();
    if (!supabase) return;
    let cancelled = false;
    const pcs = pcsRef.current;

    const onSignal = async (raw: unknown) => {
      const msg = sanitizeSignal(raw);
      if (!msg) return;
      if ("to" in msg && msg.to !== keyRef.current) return;

      if (isTeacher) {
        if (msg.type === "want" && streamRef.current) await offerTo(msg.from);
        else if (msg.type === "answer") {
          const pc = pcs.get(msg.from);
          if (!pc || pc.signalingState !== "have-local-offer") return;
          await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          await flushIce(msg.from, pc);
        }
      } else {
        // Students only accept a share from the lesson's teacher.
        if (msg.type !== "want" && msg.type !== "ice" && userOfKey(msg.from) !== teacherId) return;
        if (msg.type === "start") send({ type: "want", from: keyRef.current });
        else if (msg.type === "stop") { closePeer(msg.from); setRemoteStream(null); }
        else if (msg.type === "offer") {
          for (const key of [...pcs.keys()]) if (key !== msg.from) closePeer(key);
          const pc = newPeer(msg.from);
          pc.ontrack = e => setRemoteStream(e.streams[0] ?? new MediaStream([e.track]));
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed") { closePeer(msg.from); setRemoteStream(null); }
          };
          await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: "answer", from: keyRef.current, to: msg.from, sdp: answer.sdp ?? "" });
          await flushIce(msg.from, pc);
        }
      }

      if (msg.type === "ice") {
        const pc = pcs.get(msg.from);
        if (pc?.remoteDescription) await pc.addIceCandidate(msg.candidate).catch(() => {});
        else {
          const q = iceQueueRef.current.get(msg.from) ?? [];
          if (q.length < 50) q.push(msg.candidate);
          iceQueueRef.current.set(msg.from, q);
        }
      }
    };

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      const channel = supabase.channel(`screen:${lessonId}`, { config: { private: true, broadcast: { self: false } } });
      channelRef.current = channel;
      channel
        .on("broadcast", { event: "rtc" }, ({ payload }) => { void onSignal(payload).catch(() => {}); })
        .subscribe(status => {
          if (cancelled || status !== "SUBSCRIBED") return;
          // A student joining mid-lesson asks for the share; a teacher already sharing re-announces it.
          if (!isTeacher) send({ type: "want", from: keyRef.current });
          else if (streamRef.current) send({ type: "start", from: keyRef.current });
        });
    })();

    return () => {
      cancelled = true;
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) void supabase.removeChannel(ch);
      for (const pc of pcs.values()) pc.close();
      pcs.clear();
    };
  }, [live, lessonId, me.id, isTeacher, teacherId, offerTo, newPeer, closePeer, send]);

  // Stop capturing when leaving the page.
  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const fullscreen = () => { void videoRef.current?.requestFullscreen?.(); };

  // ---------- UI ----------

  if (!isTeacher) {
    if (!remoteStream) return null;
    return (
      <section className="mb-5 overflow-hidden rounded-[20px] border border-line/70 bg-navy shadow-card">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-white">
          <p className="flex items-center gap-2 text-[13px] font-extrabold"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Ecranul profesorului</p>
          <button type="button" onClick={fullscreen} aria-label="Ecran complet" title="Ecran complet" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-white/10 hover:bg-white/20"><Maximize2 className="h-4 w-4" /></button>
        </div>
        <video ref={videoRef} autoPlay playsInline muted controls className="block aspect-video max-h-[70vh] w-full bg-black object-contain" />
      </section>
    );
  }

  return (
    <section className="mb-5">
      <div className="flex flex-wrap items-center gap-3">
        {status === "sharing" ? (
          <button type="button" onClick={stopSharing} className="tf-btn bg-[#e5484d] hover:bg-[#c93a3f]"><MonitorX className="h-4 w-4" /> Oprește partajarea</button>
        ) : (
          <button type="button" onClick={startSharing} disabled={!canShare || status === "starting"} className="tf-btn-ghost disabled:cursor-not-allowed disabled:opacity-50">
            <MonitorUp className="h-4 w-4 text-primary" /> {status === "starting" ? "Se pornește…" : "Partajează ecranul"}
          </button>
        )}
        {status === "sharing" && (
          <span className="flex items-center gap-1.5 text-[12px] font-bold text-muted">
            <Users className="h-3.5 w-3.5" /> {live ? (viewers === 1 ? "1 elev vede ecranul" : `${viewers} elevi văd ecranul`) : "Doar previzualizare (mod local)"}
          </span>
        )}
        {!canShare && <span className="text-[12px] text-muted">Browserul acesta nu permite partajarea ecranului (pe telefon nu e disponibilă).</span>}
        {error && <span className="text-[12px] font-bold text-[#c03a3a]">{error}</span>}
      </div>
      {localStream && (
        <div className="mt-3 w-full max-w-[360px] overflow-hidden rounded-[16px] border border-line/70 bg-black shadow-card">
          <video ref={videoRef} autoPlay playsInline muted className="block aspect-video w-full object-contain" aria-label="Previzualizarea ecranului partajat" />
        </div>
      )}
    </section>
  );
}
