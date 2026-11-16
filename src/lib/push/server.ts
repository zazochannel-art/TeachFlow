import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isLang, makeT, type T } from "@/lib/i18n/core";

/** What a notification shows; `url` is the page opened on tap (a path of the app). */
export interface PushMessage { title: string; body: string; url: string; tag?: string }

/** Public VAPID key for the browser (server env, passed to the page as a prop). */
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;

/** Web push (browsers) needs the VAPID key pair. */
export const webPushConfigured = () => Boolean(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY);

/**
 * Push needs the Supabase secret key (to read other users' devices). Browsers additionally need the
 * VAPID keys; the Android app (Expo push, migration 0022) needs nothing else.
 */
export function pushConfigured() {
  return Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** Server-only client with the secret key (bypasses RLS). Null when not configured. */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

let configured = false;
function setup() {
  if (configured) return true;
  const pub = vapidPublicKey();
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:noreply@teachflow.app", pub, priv);
  configured = true;
  return true;
}

/** Trims a text for a notification line. */
export function clip(text: string, max = 120) {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** A phone with the Android app (native_push_tokens, migration 0022). */
type NativeDevice = { id: string; user: string; token: string };

/** Sends to Android app tokens through Expo's push service (100 per request). Returns sent count and dead token ids. */
async function sendNative(devices: NativeDevice[], msgFor: (user: string) => PushMessage) {
  let sent = 0;
  const gone: string[] = [];
  for (let i = 0; i < devices.length; i += 100) {
    const batch = devices.slice(i, i + 100);
    const body = batch.map(d => {
      const m = msgFor(d.user);
      return { to: d.token, title: m.title, body: m.body, data: { url: m.url, tag: m.tag ?? null }, sound: "default", priority: "high", channelId: "default", ttl: 60 * 60 * 12 };
    });
    try {
      const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
      if (process.env.EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
      const res = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => null)) as { data?: Array<{ status: string; details?: { error?: string }; message?: string }> } | null;
      if (!res.ok || !json?.data) { console.error("expo push failed", res.status); continue; }
      json.data.forEach((ticket, k) => {
        if (ticket.status === "ok") sent++;
        else if (ticket.details?.error === "DeviceNotRegistered") gone.push(batch[k].id);
        else console.error("expo push ticket", ticket.details?.error ?? ticket.message);
      });
    } catch (e) {
      console.error("expo push error", e instanceof Error ? e.message : e);
    }
  }
  return { sent, gone };
}

/**
 * Sends one notification to every device of the given users (browsers through web push, the
 * Android app through Expo), each in the user's own language. Devices reported as gone are
 * removed. Never throws.
 */
export async function pushToUsers(db: SupabaseClient, userIds: Array<string | null | undefined>, build: (t: T) => PushMessage) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return { sent: 0 };
  const web = setup();
  try {
    const [{ data: subs }, { data: tokens }, { data: profiles }] = await Promise.all([
      web ? db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", ids) : Promise.resolve({ data: [] as never[] }),
      db.from("native_push_tokens").select("id, user_id, token").in("user_id", ids),
      db.from("profiles").select("id, preferred_language").in("id", ids)
    ]);
    if (!subs?.length && !tokens?.length) return { sent: 0 };
    const lang = new Map((profiles ?? []).map(p => [p.id as string, p.preferred_language]));
    const msgFor = (user: string) => {
      const l = lang.get(user);
      return build(makeT(isLang(l) ? l : "ro"));
    };
    let sent = 0;
    const goneWeb: string[] = [];
    const native = (tokens ?? []).map(r => ({ id: r.id as string, user: r.user_id as string, token: r.token as string }));
    const [, nativeResult] = await Promise.all([
      Promise.all((subs ?? []).map(async s => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msgFor(s.user_id as string)), { TTL: 60 * 60 * 12, urgency: "high" });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) goneWeb.push(s.id as string);
          else console.error("push failed", code ?? (e instanceof Error ? e.message : e));
        }
      })),
      native.length ? sendNative(native, msgFor) : Promise.resolve({ sent: 0, gone: [] as string[] })
    ]);
    sent += nativeResult.sent;
    await Promise.all([
      goneWeb.length ? db.from("push_subscriptions").delete().in("id", goneWeb) : null,
      nativeResult.gone.length ? db.from("native_push_tokens").delete().in("id", nativeResult.gone) : null
    ]);
    return { sent };
  } catch (e) {
    console.error("push error", e instanceof Error ? e.message : e);
    return { sent: 0 };
  }
}
