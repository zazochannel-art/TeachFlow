import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * True when the Authorization header is exactly `Bearer <secret>`. Both sides are hashed first, so
 * the comparison takes the same time whatever the header holds (no timing hint about the secret).
 */
export function hasCronSecret(authorization: string | null, secret: string): boolean {
  return timingSafeEqual(digest(authorization ?? ""), digest(`Bearer ${secret}`));
}
