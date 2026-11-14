import { describe, expect, it } from "vitest";
import { newInviteToken, pendingInviteToken } from "@/lib/invite-token";

describe("pendingInviteToken", () => {
  it("reads the token saved at sign-up", () => {
    const { token } = newInviteToken();
    expect(pendingInviteToken({ user_metadata: { full_name: "Ana", invite_token: token } })).toBe(token);
  });
  it("ignores accounts without one", () => {
    expect(pendingInviteToken({ user_metadata: { full_name: "Ana" } })).toBeNull();
    expect(pendingInviteToken({})).toBeNull();
    expect(pendingInviteToken(null)).toBeNull();
  });
  it("rejects malformed values", () => {
    expect(pendingInviteToken({ user_metadata: { invite_token: "short" } })).toBeNull();
    expect(pendingInviteToken({ user_metadata: { invite_token: 42 } })).toBeNull();
    expect(pendingInviteToken({ user_metadata: { invite_token: "x".repeat(30) + "'; drop" } })).toBeNull();
  });
});
