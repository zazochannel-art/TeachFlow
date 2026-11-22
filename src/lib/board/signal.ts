"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { ICE_SERVERS, userOfKey } from "./rtc";
import { RateLimiter } from "./call";
import {
  SequenceGuard, importPeerKey, isPublicJwk, newConnKey, newSigningKey, openEnvelope, parseEnvelope, sealEnvelope,
  type PublicJwk
} from "@/lib/call/peer-auth";

// One private Realtime channel per topic ("screen:<lesson>"), shared by every component of the
// page that signals on it (supabase-js returns the same channel object for the same topic, so
// each component cannot subscribe on its own). Messages are routed by broadcast event name.
//
// Messages are signed (src/lib/call/peer-auth.ts, migration 0024): the bus makes a signing key
// for this tab, registers it for the lesson, and only then joins the channel. Every received
// message is checked against the sender's registered key; the handler gets the verified sender
// (user, role and name from the database) and `from` is always the real sender's key. Before
// migration 0024 the bus falls back to the old unsigned messages.

const EVENTS = ["rtc", "call", "access"] as const;
export type SignalEvent = (typeof EVENTS)[number];

/** Who sent a message. `verified`: signature checked; user, role and name come from the database. */
export interface Sender { key: string; userId: string; role: "teacher" | "student" | null; name: string | null; verified: boolean }

type Handler = (payload: unknown, sender: Sender) => void;

export interface SignalHandle {
  /** This tab's connection key ("<user id>:<random>"); the same for every component on the topic. */
  readonly key: string;
  send: (payload: object) => void;
  leave: () => void;
}

/** The signed-in user (as the page knows them); the test harness also passes its role and name. */
export interface SignalSelf { id: string; role?: "teacher" | "student"; name?: string }

interface Transport {
  start: (deliver: (event: string, payload: unknown) => void, status: (ready: boolean) => void) => void;
  send: (event: string, payload: unknown) => void;
  stop: () => void;
}

interface PeerRecord { userId: string; role: "teacher" | "student"; name: string; jwk: PublicJwk }

interface Directory {
  /** "legacy": the database has no signed signalling yet (migration 0024 missing). Throws on other failures. */
  register: (key: string, jwk: PublicJwk) => Promise<"ok" | "legacy">;
  lookup: (key: string) => Promise<PeerRecord | null>;
}

interface Bus {
  topic: string;
  transport: Transport;
  directory: Directory;
  key: string;
  mode: "pending" | "signed" | "legacy";
  signer: CryptoKey | null;
  counter: number;
  sendChain: Promise<void>;
  handlers: Map<string, Set<Handler>>;
  ready: Set<() => void>;
  isReady: boolean;
  refs: number;
  closed: boolean;
  peers: Map<string, { at: number; ok: boolean; p: Promise<(PeerRecord & { key: CryptoKey }) | null> }>;
  chains: Map<string, Promise<void>>;
  seq: SequenceGuard;
  /** Unknown senders cost a database lookup each: a flood of made-up keys must not become a flood of requests. */
  lookups: RateLimiter;
  incoming: RateLimiter;
}

const buses = new Map<string, Bus>();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Joins the shared channel `topic`. `onReady` runs on every (re)subscribe. Returns null without
 * Supabase (demo mode). Nothing is sent or received before this tab's signing key is registered.
 */
export function joinSignal(topic: string, event: SignalEvent, onMessage: Handler, onReady: (() => void) | undefined, self: SignalSelf): SignalHandle | null {
  let bus = buses.get(topic);
  if (!bus) {
    const created = createBus(topic, self);
    if (!created) return null;
    bus = created;
    buses.set(topic, bus);
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
    get key() { return b.key; },
    send: payload => {
      if (left || b.closed || !b.isReady) return;
      if (b.mode === "legacy") { b.transport.send(event, { ...payload, from: b.key }); return; }
      const signer = b.signer;
      if (b.mode !== "signed" || !signer) return;
      // Counter and order are fixed now; signing is asynchronous, so the sends are chained.
      const n = ++b.counter;
      const message = { ...payload, from: b.key };
      b.sendChain = b.sendChain
        .then(async () => {
          const env = await sealEnvelope(signer, b.topic, event, b.key, n, message);
          if (!b.closed) b.transport.send(event, env);
        })
        .catch(() => {});
    },
    leave: () => {
      if (left) return;
      left = true;
      b.handlers.get(event)?.delete(onMessage);
      if (onReady) b.ready.delete(onReady);
      if (--b.refs > 0) return;
      b.closed = true;
      buses.delete(topic);
      b.transport.stop();
    }
  };
}

function createBus(topic: string, self: SignalSelf): Bus | null {
  // Automated two-browser tests only (scripts/rtc-e2e): a local relay instead of Supabase.
  // The variable is inlined at build time and never set for real deployments.
  const testBus = process.env.NEXT_PUBLIC_RTC_TEST_BUS;
  const lessonId = topic.split(":")[1] ?? "";
  let transport: Transport;
  let directory: Directory;
  if (testBus) {
    transport = relayTransport(testBus, topic);
    directory = relayDirectory(testBus, topic, self);
  } else {
    const supabase = createClient();
    if (!supabase) return null;
    transport = realtimeTransport(supabase, topic);
    directory = databaseDirectory(supabase, lessonId);
  }

  const b: Bus = {
    topic, transport, directory,
    key: newConnKey(self.id),
    mode: "pending", signer: null, counter: 0, sendChain: Promise.resolve(),
    handlers: new Map(), ready: new Set(), isReady: false, refs: 0, closed: false,
    peers: new Map(), chains: new Map(), seq: new SequenceGuard(),
    lookups: new RateLimiter(40, 10_000), incoming: new RateLimiter(800, 10_000)
  };

  void (async () => {
    await setUpIdentity(b);
    if (b.closed) return;
    b.transport.start(
      (ev, payload) => receive(b, ev, payload),
      ready => {
        if (b.closed) return;
        b.isReady = ready;
        if (ready) b.ready.forEach(f => f());
      }
    );
  })();
  return b;
}

/** Makes and registers this tab's signing key; retries until it works (or the page leaves). */
async function setUpIdentity(b: Bus) {
  // Without WebCrypto (an insecure http:// page) there is no signing; calls need https anyway.
  if (!globalThis.crypto?.subtle) { b.mode = "legacy"; return; }
  let signing: Awaited<ReturnType<typeof newSigningKey>>;
  try {
    signing = await newSigningKey();
  } catch {
    b.mode = "legacy";
    return;
  }
  for (let attempt = 0; !b.closed; attempt++) {
    try {
      const r = await b.directory.register(b.key, signing.publicJwk);
      if (r === "legacy") {
        b.mode = "legacy";
        console.warn("[signal] migration 0024 is not applied: call messages are not signed");
        return;
      }
      b.signer = signing.privateKey;
      b.mode = "signed";
      return;
    } catch (err) {
      if (attempt === 0) console.warn("[signal] could not register the call key:", err instanceof Error ? err.message : err);
      await sleep(Math.min(30_000, 1000 * 2 ** attempt));
    }
  }
}

function deliver(b: Bus, event: string, payload: unknown, sender: Sender) {
  b.handlers.get(event)?.forEach(h => h(payload, sender));
}

function receive(b: Bus, event: string, raw: unknown) {
  if (b.closed) return;
  if (b.mode === "legacy") {
    if (!raw || typeof raw !== "object" || "s" in raw) return;
    const from = (raw as { from?: unknown }).from;
    if (typeof from !== "string" || from === b.key) return;
    deliver(b, event, raw, { key: from, userId: userOfKey(from), role: null, name: null, verified: false });
    return;
  }
  if (b.mode !== "signed") return;
  const env = parseEnvelope(raw);
  if (!env || env.k === b.key || !b.incoming.allow(env.k)) return;

  // One sender's messages are checked and handled in order (an offer before its ICE candidates).
  const prev = b.chains.get(env.k) ?? Promise.resolve();
  const next = prev
    .then(async () => {
      const peer = await lookupPeer(b, env.k);
      if (!peer || b.closed) return;
      const msg = await openEnvelope(peer.key, b.topic, event, env);
      if (!msg || !b.seq.accept(env.k, env.n)) return;
      // The verified key, not whatever the message claims.
      msg.from = env.k;
      deliver(b, event, msg, { key: env.k, userId: peer.userId, role: peer.role, name: peer.name, verified: true });
    })
    .catch(() => {});
  b.chains.set(env.k, next);
  if (b.chains.size > 300) b.chains.delete(b.chains.keys().next().value as string);
}

/** The registered key of a sender (cached; an unknown key is asked again after a few seconds). */
function lookupPeer(b: Bus, key: string) {
  const hit = b.peers.get(key);
  if (hit && (hit.ok || Date.now() - hit.at < 3000)) return hit.p;
  if (!b.lookups.allow("lookup")) return Promise.resolve(null);
  const entry = {
    at: Date.now(),
    ok: false,
    p: b.directory.lookup(key)
      .then(async r => (r && userOfKey(key) === r.userId ? { ...r, key: await importPeerKey(r.jwk) } : null))
      .catch(() => null)
  };
  void entry.p.then(v => { entry.ok = !!v; });
  b.peers.set(key, entry);
  if (b.peers.size > 300) b.peers.delete(b.peers.keys().next().value as string);
  return entry.p;
}

// ---------- Supabase ----------

function realtimeTransport(supabase: SupabaseClient, topic: string): Transport {
  let ch: RealtimeChannel | null = null;
  let stopped = false;
  return {
    start(deliverMsg, status) {
      void (async () => {
        await supabase.realtime.setAuth();
        if (stopped) return;
        const channel = supabase.channel(topic, { config: { private: true, broadcast: { self: false } } });
        ch = channel;
        for (const ev of EVENTS) channel.on("broadcast", { event: ev }, ({ payload }) => deliverMsg(ev, payload));
        channel.subscribe(s => { if (!stopped) status(s === "SUBSCRIBED"); });
      })();
    },
    send(event, payload) { void ch?.send({ type: "broadcast", event, payload }); },
    stop() {
      stopped = true;
      if (ch) void supabase.removeChannel(ch);
    }
  };
}

const MISSING_FN = new Set(["PGRST202", "42883"]);

function databaseDirectory(supabase: SupabaseClient, lessonId: string): Directory {
  return {
    async register(key, jwk) {
      const { error } = await supabase.rpc("register_call_peer", { p_lesson_id: lessonId, p_conn_key: key, p_public_key: jwk });
      if (!error) return "ok";
      if (MISSING_FN.has(error.code ?? "")) return "legacy";
      throw new Error(error.message);
    },
    async lookup(key) {
      const { data, error } = await supabase.rpc("call_peer", { p_lesson_id: lessonId, p_conn_key: key });
      if (error) return null;
      const row = (Array.isArray(data) ? data[0] : data) as { user_id?: string; role?: string; display_name?: string; public_key?: unknown } | undefined;
      if (!row?.user_id || (row.role !== "teacher" && row.role !== "student") || !isPublicJwk(row.public_key)) return null;
      return { userId: row.user_id, role: row.role, name: (row.display_name ?? "").slice(0, 60), jwk: row.public_key };
    }
  };
}

// ---------- test relay (scripts/rtc-e2e) ----------

function relayTransport(url: string, topic: string): Transport {
  let ws: WebSocket | null = null;
  let stopped = false;
  return {
    start(deliverMsg, status) {
      const open = () => {
        const sock = new WebSocket(`${url}?topic=${encodeURIComponent(topic)}`);
        ws = sock;
        sock.onopen = () => status(true);
        sock.onmessage = e => {
          try {
            const m = JSON.parse(String(e.data)) as { event?: unknown; payload?: unknown };
            if (typeof m.event === "string") deliverMsg(m.event, m.payload);
          } catch { /* ignore */ }
        };
        sock.onclose = () => {
          status(false);
          if (!stopped) setTimeout(open, 500);
        };
      };
      open();
    },
    send(event, payload) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event, payload })); },
    stop() {
      stopped = true;
      ws?.close();
    }
  };
}

/** The relay keeps the registered keys like the database does (role and name as the harness says). */
function relayDirectory(url: string, topic: string, self: SignalSelf): Directory {
  const base = url.replace(/^ws/, "http").replace(/\/$/, "");
  return {
    async register(key, jwk) {
      const res = await fetch(`${base}/peer`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ topic, key, jwk, role: self.role ?? "student", name: self.name ?? self.id })
      });
      if (!res.ok) throw new Error(`relay ${res.status}`);
      return "ok";
    },
    async lookup(key) {
      const res = await fetch(`${base}/peer?${new URLSearchParams({ topic, key })}`);
      if (!res.ok) return null;
      const row = (await res.json()) as { role?: string; name?: string; jwk?: unknown };
      if ((row.role !== "teacher" && row.role !== "student") || !isPublicJwk(row.jwk)) return null;
      return { userId: userOfKey(key), role: row.role, name: String(row.name ?? "").slice(0, 60), jwk: row.jwk };
    }
  };
}

const iceCache = new Map<string, Promise<RTCIceServer[]>>();

/**
 * STUN plus, when configured on the server, short-lived TURN relay credentials for this lesson
 * (/api/turn checks that the user is the lesson's teacher or one of its students).
 */
export function getIceServers(lessonId: string): Promise<RTCIceServer[]> {
  let p = iceCache.get(lessonId);
  if (!p) {
    p = fetch(`/api/turn?lesson=${encodeURIComponent(lessonId)}`, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { iceServers?: RTCIceServer[] } | null) => (d?.iceServers?.length ? d.iceServers : ICE_SERVERS))
      .catch(() => ICE_SERVERS);
    iceCache.set(lessonId, p);
    // Credentials expire after 4 h; refresh them for calls started much later.
    setTimeout(() => { iceCache.delete(lessonId); }, 3 * 3600 * 1000);
  }
  return p;
}
