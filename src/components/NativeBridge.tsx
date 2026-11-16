"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { NATIVE_EVENT, nativeState, postNative } from "@/lib/native";

const SAVED_KEY = "tf-native-push-saved";

/**
 * Talks to the Android app when the site runs inside it (renders nothing in a browser):
 * tells the app the colour theme (for the status bar), and once someone is signed in, lets the app
 * ask for the notification permission and saves the phone's push token for that account
 * (save_native_push_token, migration 0022).
 */
export function NativeBridge() {
  useEffect(() => {
    if (!nativeState()) return;
    const root = document.documentElement;
    const sendTheme = () => postNative({ type: "theme", dark: root.classList.contains("dark") });
    sendTheme();
    const themeObserver = new MutationObserver(sendTheme);
    themeObserver.observe(root, { attributes: true, attributeFilter: ["class"] });

    const supabase = createClient();
    let readySent = false;
    const sync = async () => {
      const state = nativeState();
      if (!supabase || !state) return;
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      if (!readySent) { readySent = true; postNative({ type: "ready" }); }
      const token = state.push.token;
      if (!token) return;
      const key = `${uid}:${token}`;
      try { if (sessionStorage.getItem(SAVED_KEY) === key) return; } catch { /* storage blocked */ }
      const { error } = await supabase.rpc("save_native_push_token", { p_token: token, p_platform: state.platform, p_app_version: state.version });
      if (!error) { try { sessionStorage.setItem(SAVED_KEY, key); } catch { /* storage blocked */ } }
    };
    void sync();
    const onNative = () => { void sync(); };
    window.addEventListener(NATIVE_EVENT, onNative);
    const auth = supabase?.auth.onAuthStateChange(event => {
      if (event === "SIGNED_IN") { readySent = false; void sync(); }
      if (event === "SIGNED_OUT") { try { sessionStorage.removeItem(SAVED_KEY); } catch { /* storage blocked */ } }
    });
    return () => {
      themeObserver.disconnect();
      window.removeEventListener(NATIVE_EVENT, onNative);
      auth?.data.subscription.unsubscribe();
    };
  }, []);
  return null;
}
