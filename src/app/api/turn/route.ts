import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ICE_SERVERS } from "@/lib/board/rtc";

export const dynamic = "force-dynamic";

/**
 * ICE servers for the lesson video call and screen share, for signed-in users only.
 * - CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_KEY_API_TOKEN: short-lived Cloudflare TURN credentials.
 * - or TURN_URLS (comma separated) + TURN_USERNAME + TURN_CREDENTIAL: a fixed TURN server.
 * - otherwise: public STUN only (works on most home networks, not behind strict firewalls).
 */
export async function GET() {
  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cfId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const cfToken = process.env.CLOUDFLARE_TURN_KEY_API_TOKEN;
  if (cfId && cfToken) {
    try {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cfId)}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 8 * 3600 }),
        cache: "no-store"
      });
      if (res.ok) {
        const body = (await res.json()) as { iceServers?: RTCIceServer[] };
        if (body.iceServers?.length) return NextResponse.json({ iceServers: body.iceServers }, { headers: { "Cache-Control": "no-store" } });
      }
    } catch {
      // fall through to the other options
    }
  }

  const urls = process.env.TURN_URLS?.split(",").map(s => s.trim()).filter(Boolean);
  if (urls?.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    return NextResponse.json(
      { iceServers: [...ICE_SERVERS, { urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json({ iceServers: ICE_SERVERS }, { headers: { "Cache-Control": "no-store" } });
}
