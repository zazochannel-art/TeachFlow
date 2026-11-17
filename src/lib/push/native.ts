import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Set by the Android app in its WebView (mobile/src/lib/bridge.ts): this phone's Expo push token. */
export const NATIVE_PUSH_COOKIE = "tf-native-push";

/**
 * Before signing out inside the Android app: removes this phone's push token from the account, so
 * the phone stops getting that account's notifications. Call with the still signed-in client.
 */
export async function forgetNativePush(supabase: SupabaseClient) {
  try {
    const raw = (await cookies()).get(NATIVE_PUSH_COOKIE)?.value;
    if (!raw) return;
    await supabase.from("native_push_tokens").delete().eq("token", decodeURIComponent(raw));
  } catch { /* table missing (migration 0022 not run) or no cookie access */ }
}
