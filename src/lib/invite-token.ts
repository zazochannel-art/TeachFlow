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

/**
 * Invite token saved in the account's metadata when it signed up from an invite link
 * (see RegisterForm). Lets the app finish the invite even if the student never came back
 * to the invite page, e.g. when the confirmation email sent them to the site root.
 */
export function pendingInviteToken(claims: { user_metadata?: unknown } | null | undefined) {
  const meta = claims?.user_metadata;
  const token = meta && typeof meta === "object" ? (meta as Record<string, unknown>).invite_token : undefined;
  return typeof token === "string" && isInviteToken(token) ? token : null;
}
