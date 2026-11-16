import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ICE_SERVERS } from "@/lib/board/rtc";
import { CREDENTIAL_TTL_S, coturnCredentials, lessonCallIdentity, parseTurnUrls } from "@/lib/call/tokens";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * ICE servers for a lesson call: STUN always, plus short-lived TURN relay credentials when a TURN
 * server is configured. Only the lesson's teacher and its students get TURN credentials
 * (checked in the database, migration 0018). Options, first match wins:
 * - CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_KEY_API_TOKEN: Cloudflare Realtime TURN;
 * - TURN_URLS + TURN_SECRET: own coturn server with `use-auth-secret` (time-limited HMAC credentials);
 * - TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL: fixed account (development only; not time-limited).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return json({ iceServers: ICE_SERVERS, relay: false });

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return json({ error: "unauthorized" }, 401);

  const lessonId = req.nextUrl.searchParams.get("lesson") ?? "";
  const who = await lessonCallIdentity(supabase, userId, lessonId);
  // Before migration 0018 the membership check is not available: fall back to "signed in".
  if (who === null) return json({ error: "forbidden" }, 403);

  // Values pasted into the dashboard often carry a stray space or newline.
  const cfId = process.env.CLOUDFLARE_TURN_KEY_ID?.trim();
  const cfToken = process.env.CLOUDFLARE_TURN_KEY_API_TOKEN?.trim();
  if (cfId && cfToken) {
    try {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cfId)}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL_S }),
        cache: "no-store"
      });
      if (res.ok) {
        const body = (await res.json()) as { iceServers?: RTCIceServer[] | RTCIceServer };
        const servers = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
        if (servers.length) return json({ iceServers: [...ICE_SERVERS, ...servers], relay: true, ttl: CREDENTIAL_TTL_S });
        console.error("[turn] Cloudflare answered without iceServers");
      } else {
        // Status and Cloudflare's error text only (never the token), so a wrong key shows in the logs.
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        console.error(`[turn] Cloudflare TURN refused: HTTP ${res.status} ${detail}`);
      }
    } catch (err) {
      console.error("[turn] Cloudflare TURN unreachable:", err instanceof Error ? err.message : err);
      // fall through to the other options
    }
  }

  const urls = parseTurnUrls(process.env.TURN_URLS);
  if (urls.length && process.env.TURN_SECRET) {
    const cred = coturnCredentials(process.env.TURN_SECRET, userId);
    return json({ iceServers: [...ICE_SERVERS, { urls, ...cred }], relay: true, ttl: CREDENTIAL_TTL_S });
  }
  if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    return json({ iceServers: [...ICE_SERVERS, { urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }], relay: true });
  }
  return json({ iceServers: ICE_SERVERS, relay: false });
}
