"use client";

import { CallView } from "@/components/call/CallView";
import { useMeshCall } from "@/components/call/useMeshCall";
import { useLiveKitCall } from "@/components/call/useLiveKitCall";
import { useCallAttendance } from "@/components/call/useCallAttendance";
import { useScreenAccess } from "@/components/call/useScreenAccess";
import type { CallEngine, CallProps, CallTransport } from "@/components/call/types";

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
  return <CallView engine={engine} me={props.me} live={props.live} lessonTitle={props.lessonTitle} screen={screen} />;
}
