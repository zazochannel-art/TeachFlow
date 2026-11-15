import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isLang, makeT, type T } from "@/lib/i18n/core";

/** What a notification shows; `url` is the page opened on tap (a path of the app). */
export interface PushMessage { title: string; body: string; url: string; tag?: string }

/** Public VAPID key for the browser (server env, passed to the page as a prop). */
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;

/** Push needs the VAPID key pair and the Supabase secret key (to read other users' devices). */
export function pushConfigured() {
  return Boolean(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY && process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
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

/**
 * Sends one notification to every device of the given users, each in the user's own language.
 * Devices that the push service reports as gone are removed. Never throws.
 */
export async function pushToUsers(db: SupabaseClient, userIds: Array<string | null | undefined>, build: (t: T) => PushMessage) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length || !setup()) return { sent: 0 };
  try {
    const [{ data: subs }, { data: profiles }] = await Promise.all([
      db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", ids),
      db.from("profiles").select("id, preferred_language").in("id", ids)
    ]);
    if (!subs?.length) return { sent: 0 };
    const lang = new Map((profiles ?? []).map(p => [p.id as string, p.preferred_language]));
    const gone: string[] = [];
    let sent = 0;
    await Promise.all(subs.map(async s => {
      const l = lang.get(s.user_id as string);
      const msg = build(makeT(isLang(l) ? l : "ro"));
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 12, urgency: "high" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id as string);
        else console.error("push failed", code ?? (e instanceof Error ? e.message : e));
      }
    }));
    if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
    return { sent };
  } catch (e) {
    console.error("push error", e instanceof Error ? e.message : e);
    return { sent: 0 };
  }
}
