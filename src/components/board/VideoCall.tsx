"use client";

import { useMemo } from "react";
import { CallView } from "@/components/call/CallView";
import { useMeshCall } from "@/components/call/useMeshCall";
import { useLiveKitCall } from "@/components/call/useLiveKitCall";
import { useCallAttendance } from "@/components/call/useCallAttendance";
import { useScreenAccess } from "@/components/call/useScreenAccess";
import { useKeepAwake } from "@/components/call/useKeepAwake";
import type { CallEngine, CallProps, CallTransport } from "@/components/call/types";
import { userOfKey } from "@/lib/board/rtc";

/**
 * TeachFlow's own lesson video call. The media path is chosen on the server per lesson:
 * - "p2p": WebRTC peer-to-peer (1:1 lessons; STUN, TURN only when a direct path fails);
 * - "sfu": LiveKit SFU (group lessons, when LIVEKIT_* is configured).
 * Both feed the same UI (CallView) and the same attendance log.
 */
export function VideoCall(props: CallProps & { transport?: CallTransport }) {
  return props.transport === "sfu" ? <SfuCall {...props} /> : <MeshCall {...props} />;
}

function MeshCall(props: CallProps) {
  return <Call engine={useMeshCall(props)} {...props} />;
}

function SfuCall(props: CallProps) {
  return <Call engine={useLiveKitCall(props)} {...props} />;
}

function Call({ engine, ...props }: CallProps & { engine: CallEngine }) {
  useCallAttendance({ lessonId: props.lessonId, live: props.live, joined: engine.joined, transport: engine.transport });
  const screen = useScreenAccess(props, engine);
  // Phones: the screen stays on during the call (otherwise it goes dark and the camera stops).
  useKeepAwake(engine.joined);
  // A student who shares without the teacher's permission (a modified browser) does not take over
  // the stage: their video stays a normal tile. Keys start with the (verified) user id.
  const { mayShare } = screen;
  const peers = useMemo(
    () => engine.peers.map(p => (p.screen && p.role !== "teacher" && !mayShare(userOfKey(p.key)) ? { ...p, screen: false } : p)),
    [engine.peers, mayShare]
  );
  const shown = useMemo(() => ({ ...engine, peers }), [engine, peers]);
  return <CallView engine={shown} me={props.me} live={props.live} lessonTitle={props.lessonTitle} screen={screen} />;
}
