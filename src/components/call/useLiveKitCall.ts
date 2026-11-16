"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Participant, RemoteParticipant, Room } from "livekit-client";
import { MAX_CHAT } from "@/lib/board/rtc";
import { RateLimiter, SeenIds, canCall, mediaProblem } from "@/lib/board/call";
import { newId } from "@/lib/board/model";
import type { Quality } from "@/lib/call/quality";
import { useT } from "@/lib/i18n/client";
import type { CallEngine, CallParticipant, CallProps, ChatLine } from "./types";
import { useMediaProblemText } from "./media";

const CHAT_TOPIC = "chat";

/**
 * Group lesson call through the LiveKit SFU: every participant uploads one stream (simulcast:
 * several resolutions) and the server forwards to each viewer the layer their network can take.
 * The access token comes from /api/rtc/token, which checks lesson membership; name and role in the
 * call are the ones the server put in the token.
 */
export function useLiveKitCall({ lessonId, live, me, tokenUrl = "/api/rtc/token" }: CallProps): CallEngine {
  const t = useT();
  const problemText = useMediaProblemText();
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState<"av" | "audio" | null>(null);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [peers, setPeers] = useState<CallParticipant[]>([]);
  const [online, setOnline] = useState(true);
  const [myQuality, setMyQuality] = useState<Quality>("unknown");
  const [reconnecting, setReconnecting] = useState(false);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [unread, setUnread] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const chatOpenRef = useRef(false);
  const streamsRef = useRef(new Map<string, { sig: string; stream: MediaStream }>());
  const leavingRef = useRef(false);

  /** One MediaStream per person, replaced only when its tracks change (keeps <video> from flickering). */
  const streamFor = (key: string, tracks: MediaStreamTrack[]) => {
    const sig = tracks.map(tr => tr.id).join(",");
    const cached = streamsRef.current.get(key);
    if (cached && cached.sig === sig) return cached.stream;
    const stream = new MediaStream(tracks);
    streamsRef.current.set(key, { sig, stream });
    return stream;
  };

  const rebuild = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const lk = await import("livekit-client");
    const list: CallParticipant[] = [];
    for (const p of room.remoteParticipants.values()) list.push(toParticipant(lk, p, room.state === lk.ConnectionState.Reconnecting));
    setPeers(list);

    const lp = room.localParticipant;
    const tracks: MediaStreamTrack[] = [];
    const camTrack = lp.getTrackPublication(lk.Track.Source.Camera)?.track?.mediaStreamTrack;
    const micTrack = lp.getTrackPublication(lk.Track.Source.Microphone)?.track?.mediaStreamTrack;
    if (micTrack) tracks.push(micTrack);
    if (camTrack) tracks.push(camTrack);
    setLocal(streamFor("me", tracks));
    setMic(lp.isMicrophoneEnabled);
    setCam(lp.isCameraEnabled);
    setSharing(lp.isScreenShareEnabled);
    setMyQuality(mapQuality(lp.connectionQuality));

    function toParticipant(lkm: typeof lk, p: RemoteParticipant, rec: boolean): CallParticipant {
      const role = roleOf(p);
      const audio = p.getTrackPublication(lkm.Track.Source.Microphone);
      const screen = p.getTrackPublication(lkm.Track.Source.ScreenShare);
      const camera = p.getTrackPublication(lkm.Track.Source.Camera);
      const video = screen?.isSubscribed && screen.track ? screen : camera;
      const tr: MediaStreamTrack[] = [];
      if (audio?.isSubscribed && audio.track) tr.push(audio.track.mediaStreamTrack);
      if (video?.isSubscribed && video.track && !video.isMuted) tr.push(video.track.mediaStreamTrack);
      return {
        key: p.identity,
        name: p.name || p.identity,
        role,
        mic: p.isMicrophoneEnabled,
        cam: !!camera && !camera.isMuted && p.isCameraEnabled,
        screen: !!screen?.track && !screen.isMuted,
        stream: streamFor(p.identity, tr),
        status: rec ? "reconnecting" : "connected",
        quality: mapQuality(p.connectionQuality),
        speaking: p.isSpeaking
      };
    }
  }, []);

  useEffect(() => {
    const off = () => setOnline(false);
    const on = () => setOnline(true);
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => { window.removeEventListener("offline", off); window.removeEventListener("online", on); };
  }, []);

  const reset = useCallback(() => {
    roomRef.current = null;
    streamsRef.current.clear();
    setJoined(false);
    setJoinedAt(null);
    setPeers([]);
    setLocal(null);
    setSharing(false);
    setReconnecting(false);
    setMyQuality("unknown");
  }, []);

  const join = async (mode: "av" | "audio") => {
    setError(null);
    setNotice(null);
    if (!canCall()) { setError(problemText("unsupported", "both")); return; }
    if (!live) { setError(t("Apelul de grup pornește după configurarea Supabase.")); return; }
    setJoining(mode);
    try {
      const res = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId }), cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { url?: string; token?: string; error?: string };
      if (!res.ok || !body.url || !body.token) {
        setError(res.status === 403 ? t("Nu ai acces la apelul acestei lecții.") : t("Nu am putut porni apelul de grup. Încearcă din nou peste câteva secunde."));
        return;
      }
      const lk = await import("livekit-client");
      const room = new lk.Room({
        adaptiveStream: false,
        dynacast: true,
        disconnectOnPageLeave: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        videoCaptureDefaults: { resolution: lk.VideoPresets.h540.resolution },
        publishDefaults: {
          simulcast: true,
          videoEncoding: lk.VideoPresets.h540.encoding,
          videoSimulcastLayers: [lk.VideoPresets.h180, lk.VideoPresets.h360],
          screenShareEncoding: lk.ScreenSharePresets.h1080fps15.encoding,
          dtx: true,
          red: true
        }
      });
      roomRef.current = room;
      leavingRef.current = false;
      const seenChat = new SeenIds();
      const chatLimit = new RateLimiter(12, 10_000);
      const update = () => { void rebuild(); };
      const E = lk.RoomEvent;
      room
        .on(E.ParticipantConnected, update)
        .on(E.ParticipantDisconnected, (p: RemoteParticipant) => {
          streamsRef.current.delete(p.identity);
          if (roleOf(p) === "teacher" && me.role === "student") setNotice(t("Profesorul a ieșit din apel."));
          update();
        })
        .on(E.TrackSubscribed, update)
        .on(E.TrackUnsubscribed, update)
        .on(E.TrackMuted, update)
        .on(E.TrackUnmuted, update)
        .on(E.LocalTrackPublished, update)
        .on(E.LocalTrackUnpublished, update)
        .on(E.ConnectionQualityChanged, update)
        .on(E.ActiveSpeakersChanged, update)
        .on(E.Reconnecting, () => { setReconnecting(true); update(); })
        .on(E.Reconnected, () => { setReconnecting(false); update(); })
        .on(E.MediaDevicesError, (e: Error) => setNotice(problemText(mediaProblem(e), "both")))
        .on(E.DataReceived, (payload: Uint8Array, p?: RemoteParticipant, _kind?: unknown, topic?: string) => {
          if (topic !== CHAT_TOPIC || !p || !chatLimit.allow(p.identity)) return;
          let msg: { id?: unknown; text?: unknown };
          try { msg = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
          if (typeof msg.id !== "string" || msg.id.length > 80 || typeof msg.text !== "string") return;
          const text = msg.text.trim().slice(0, MAX_CHAT);
          if (!text || !seenChat.add(msg.id)) return;
          setChat(list => [...list.slice(-99), { id: msg.id as string, from: p.identity, name: p.name || t("Participant"), text, mine: false, at: Date.now() }]);
          if (!chatOpenRef.current) setUnread(n => n + 1);
        })
        .on(E.Disconnected, () => {
          if (!leavingRef.current) setNotice(t("Conexiunea cu serverul video s-a închis. Intră din nou în apel."));
          reset();
        });

      await room.connect(body.url, body.token);
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (e) {
        setNotice(problemText(mediaProblem(e), "mic"));
      }
      if (mode === "av") {
        try {
          await room.localParticipant.setCameraEnabled(true);
        } catch (e) {
          setNotice(`${problemText(mediaProblem(e), "cam")} ${t("Ai intrat doar cu audio.")}`);
        }
      }
      setJoined(true);
      setJoinedAt(Date.now());
      await rebuild();
    } catch {
      setError(t("Nu am putut porni apelul de grup. Încearcă din nou peste câteva secunde."));
      leavingRef.current = true;
      void roomRef.current?.disconnect();
      reset();
    } finally {
      setJoining(null);
    }
  };

  const leave = useCallback(() => {
    leavingRef.current = true;
    void roomRef.current?.disconnect();
    reset();
    setNotice(null);
  }, [reset]);

  useEffect(() => () => { leavingRef.current = true; void roomRef.current?.disconnect(); }, []);

  const toggleMic = () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    void lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled).then(() => rebuild()).catch(e => setNotice(problemText(mediaProblem(e), "mic")));
  };
  const toggleCam = async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    try {
      await lp.setCameraEnabled(!lp.isCameraEnabled);
      setNotice(null);
    } catch (e) {
      setNotice(problemText(mediaProblem(e), "cam"));
    }
    await rebuild();
  };
  const toggleScreen = async () => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    if (!lp.isScreenShareEnabled && !navigator.mediaDevices?.getDisplayMedia) { setNotice(problemText("unsupported", "screen")); return; }
    try {
      await lp.setScreenShareEnabled(!lp.isScreenShareEnabled, { audio: false });
    } catch (e) {
      const p = mediaProblem(e);
      if (p !== "denied") setNotice(problemText(p, "screen"));
    }
    await rebuild();
  };

  const sendChat = (text: string) => {
    const clean = text.trim().slice(0, MAX_CHAT);
    const room = roomRef.current;
    if (!clean || !room) return;
    const id = newId();
    setChat(list => [...list.slice(-99), { id, from: "me", name: t("Tu"), text: clean, mine: true, at: Date.now() }]);
    void room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ id, text: clean })), { reliable: true, topic: CHAT_TOPIC }).catch(() => {});
  };

  const setChatOpen = useCallback((open: boolean) => {
    chatOpenRef.current = open;
    if (open) setUnread(0);
  }, []);

  return {
    transport: "sfu", joined, joining, joinedAt, error, notice, local, mic, cam, sharing, peers,
    othersInCall: 0, online, myQuality, relay: false, reconnecting, chat, unread,
    join, leave, toggleMic, toggleCam, toggleScreen, sendChat, setChatOpen
  };
}

/** Role from the token metadata (set by the server, not by the browser). */
function roleOf(p: Participant): "teacher" | "student" {
  try {
    return (JSON.parse(p.metadata || "{}") as { role?: string }).role === "teacher" ? "teacher" : "student";
  } catch {
    return "student";
  }
}

function mapQuality(q: string): Quality {
  return q === "excellent" ? "good" : q === "good" ? "fair" : q === "poor" || q === "lost" ? "poor" : "unknown";
}
