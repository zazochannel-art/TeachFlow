"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { ICE_SERVERS } from "./rtc";

// One private Realtime channel per topic, shared by every component of the page that signals
// on it (supabase-js returns the same channel object for the same topic, so each component
// cannot subscribe on its own). Messages are routed by broadcast event name.

type Handler = (payload: unknown) => void;
const EVENTS = ["rtc", "call"] as const;
export type SignalEvent = (typeof EVENTS)[number];

interface Bus {
  channel: RealtimeChannel | null;
  handlers: Map<string, Set<Handler>>;
  ready: Set<() => void>;
  isReady: boolean;
  refs: number;
  closed: boolean;
}

const buses = new Map<string, Bus>();

export interface SignalHandle { send: (payload: unknown) => void; leave: () => void }

/** Joins the shared channel `topic`. `onReady` runs on every (re)subscribe. Returns null without Supabase. */
export function joinSignal(topic: string, event: SignalEvent, onMessage: Handler, onReady?: () => void): SignalHandle | null {
  const supabase = createClient();
  if (!supabase) return null;

  let bus = buses.get(topic);
  if (!bus) {
    const b: Bus = { channel: null, handlers: new Map(), ready: new Set(), isReady: false, refs: 0, closed: false };
    buses.set(topic, b);
    bus = b;
    void (async () => {
      await supabase.realtime.setAuth();
      if (b.closed) return;
      const ch = supabase.channel(topic, { config: { private: true, broadcast: { self: false } } });
      b.channel = ch;
      for (const ev of EVENTS) {
        ch.on("broadcast", { event: ev }, ({ payload }) => b.handlers.get(ev)?.forEach(h => h(payload)));
      }
      ch.subscribe(status => {
        if (b.closed) return;
        b.isReady = status === "SUBSCRIBED";
        if (b.isReady) b.ready.forEach(f => f());
      });
    })();
  }

  const b = bus;
  let left = false;
  b.refs++;
  if (!b.handlers.has(event)) b.handlers.set(event, new Set());
  b.handlers.get(event)!.add(onMessage);
  if (onReady) {
    b.ready.add(onReady);
    if (b.isReady) queueMicrotask(() => { if (!left) onReady(); });
  }

  return {
    send: payload => {
      if (!left && b.channel && b.isReady) void b.channel.send({ type: "broadcast", event, payload });
    },
    leave: () => {
      if (left) return;
      left = true;
      b.handlers.get(event)?.delete(onMessage);
      if (onReady) b.ready.delete(onReady);
      if (--b.refs > 0) return;
      b.closed = true;
      buses.delete(topic);
      if (b.channel) void supabase.removeChannel(b.channel);
    }
  };
}

let iceCache: Promise<RTCIceServer[]> | null = null;

/** STUN plus, when configured on the server (/api/turn), short-lived TURN relay credentials. */
export function getIceServers(): Promise<RTCIceServer[]> {
  if (!iceCache) {
    iceCache = fetch("/api/turn", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { iceServers?: RTCIceServer[] } | null) => (d?.iceServers?.length ? d.iceServers : ICE_SERVERS))
      .catch(() => ICE_SERVERS);
    // Credentials expire; refresh them for calls started much later.
    setTimeout(() => { iceCache = null; }, 6 * 3600 * 1000);
  }
  return iceCache;
}
