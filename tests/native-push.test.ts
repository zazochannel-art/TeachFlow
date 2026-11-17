import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushToUsers } from "@/lib/push/server";

/** A tiny stand-in for the service client: select(...).in(...) returns rows, delete().in(...) records ids. */
function fakeDb(rows: Record<string, unknown[]>) {
  const deleted: Record<string, string[]> = {};
  const db = {
    from(table: string) {
      return {
        select: () => ({ in: async () => ({ data: rows[table] ?? [], error: null }) }),
        delete: () => ({ in: async (_c: string, ids: string[]) => { deleted[table] = ids; return { error: null }; } })
      };
    }
  };
  return { db: db as unknown as SupabaseClient, deleted };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("push to the Android app (Expo)", () => {
  it("sends without VAPID keys, in the user's language, and removes unregistered phones", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const { db, deleted } = fakeDb({
      native_push_tokens: [
        { id: "t1", user_id: "u1", token: "ExponentPushToken[aaa]" },
        { id: "t2", user_id: "u2", token: "ExponentPushToken[bbb]" }
      ],
      profiles: [{ id: "u1", preferred_language: "en" }, { id: "u2", preferred_language: "ro" }]
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await pushToUsers(db, ["u1", "u2", null], t => ({ title: t("Profesor"), body: "x", url: "/student", tag: "msg" }));

    expect(res.sent).toBe(1);
    expect(deleted.native_push_tokens).toEqual(["t2"]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    const body = JSON.parse(String(init.body));
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ to: "ExponentPushToken[aaa]", title: "Teacher", data: { url: "/student" }, channelId: "default" });
    expect(body[1].title).toBe("Profesor");
  });

  it("does nothing when the users have no devices", async () => {
    const { db } = fakeDb({});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await pushToUsers(db, ["u1"], () => ({ title: "a", body: "b", url: "/" }))).sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
