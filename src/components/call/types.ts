import type { Quality } from "@/lib/call/quality";

export type PeerStatus = "connecting" | "connected" | "reconnecting" | "failed";
export type CallTransport = "p2p" | "sfu";

export interface CallParticipant {
  key: string;
  name: string;
  role: "teacher" | "student";
  mic: boolean;
  cam: boolean;
  /** sending a screen instead of the camera */
  screen?: boolean;
  /** audio + the video shown in the tile (screen while sharing, else the camera) */
  stream: MediaStream | null;
  status: PeerStatus;
  quality: Quality;
  /** media goes through a TURN relay */
  relay?: boolean;
  speaking?: boolean;
}

export interface ChatLine { id: string; from: string; name: string; text: string; mine: boolean; at: number }

export interface CallProps {
  lessonId: string;
  /** false in demo mode / before migration 0006: only the local camera preview works. */
  live: boolean;
  me: { id: string; name: string; role: "teacher" | "student" };
  teacherId: string;
  lessonTitle?: string;
  /** SFU token endpoint (the automated test harness uses its own). */
  tokenUrl?: string;
}

/** Everything the call UI needs, whatever carries the media (P2P mesh or the LiveKit SFU). */
export interface CallEngine {
  transport: CallTransport;
  joined: boolean;
  joining: "av" | "audio" | null;
  joinedAt: number | null;
  error: string | null;
  notice: string | null;
  local: MediaStream | null;
  mic: boolean;
  cam: boolean;
  sharing: boolean;
  peers: CallParticipant[];
  /** people already in the call, known before joining */
  othersInCall: number;
  online: boolean;
  /** our own link (worst of our connections) */
  myQuality: Quality;
  relay: boolean;
  /** the SFU connection is being re-established */
  reconnecting: boolean;
  chat: ChatLine[];
  unread: number;
  join: (mode: "av" | "audio") => Promise<void>;
  leave: () => void;
  toggleMic: () => void;
  toggleCam: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  sendChat: (text: string) => void;
  setChatOpen: (open: boolean) => void;
}
