/**
 * Content Security Policy for every page. Scripts run only when they come with this request's nonce
 * (Next.js adds it to its own scripts) or are loaded by such a script ('strict-dynamic'), so an
 * injected <script> or inline handler does not run. Styles, images and connections stay open
 * enough for the app (inline style attributes, Supabase, LiveKit/TURN, avatars from Storage).
 */
export function buildCsp(nonce: string, dev = process.env.NODE_ENV === "development"): string {
  return [
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // The push service worker (/sw.js); workers are not covered by the nonce.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; ");
}

/** A fresh random nonce (base64 of 16 random bytes). */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
