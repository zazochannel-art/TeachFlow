import { createHash, randomBytes } from "node:crypto";

/** Random URL-safe invite token; only its SHA-256 hex digest is stored (see migration 0003). */
export function newInviteToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isInviteToken(value: string) {
  return /^[A-Za-z0-9_-]{20,64}$/.test(value);
}
