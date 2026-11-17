/**
 * Small fixed-window rate limiter kept in memory. On serverless hosting every instance has its own
 * counters, so this only stops bursts from one client to one instance; it is meant for cheap,
 * unauthenticated endpoints (error reports), not for anything that costs money (that is in the database).
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, { start: number; count: number }>();
  const maxKeys = opts.maxKeys ?? 5000;
  return {
    /** True when the request is allowed (and counts it). */
    take(key: string, now = Date.now()): boolean {
      const cur = hits.get(key);
      if (!cur || now - cur.start >= opts.windowMs) {
        if (!cur && hits.size >= maxKeys) {
          for (const [k, v] of hits) if (now - v.start >= opts.windowMs) hits.delete(k);
          if (hits.size >= maxKeys) hits.clear();
        }
        hits.set(key, { start: now, count: 1 });
        return true;
      }
      if (cur.count >= opts.limit) return false;
      cur.count++;
      return true;
    }
  };
}

/** The client's IP as seen by the host (Vercel sets x-forwarded-for; the first entry is the client). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/**
 * True when a browser request comes from another site. Browsers send Sec-Fetch-Site and Origin;
 * a request without either (curl, scripts) is not cross-site by this test and is limited by rate only.
 */
export function isCrossSite(headers: Headers, host: string | null): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = headers.get("origin");
  if (!origin || !host) return false;
  try { return new URL(origin).host !== host; } catch { return true; }
}
