"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CallTransport } from "./types";

const BEAT_MS = 30_000;

/**
 * Logs presence in the lesson's call (migration 0018): a stay starts on join, a heartbeat every
 * 30 s keeps it open, and it ends on leave. A closed tab or a lost network simply stops the
 * heartbeats; the server then ends the stay at the last heartbeat, so only real presence counts.
 * Without the migration this does nothing (the call itself still works).
 */
export function useCallAttendance({ lessonId, live, joined, transport }: { lessonId: string; live: boolean; joined: boolean; transport: CallTransport }) {
  useEffect(() => {
    if (!live || !joined) return;
    const supabase = createClient();
    if (!supabase) return;
    let id: string | null = null;
    let stopped = false;
    let disabled = false;

    const start = async () => {
      const { data, error } = await supabase.rpc("call_join", { p_lesson_id: lessonId, p_transport: transport });
      if (error) { if (error.code === "PGRST202" || error.code === "42883") disabled = true; return; }
      if (stopped) { void supabase.rpc("call_leave", { p_id: data }); return; }
      id = typeof data === "string" ? data : null;
    };
    const beat = async () => {
      if (disabled || stopped || !navigator.onLine) return;
      if (!id) { await start(); return; }
      const { data, error } = await supabase.rpc("call_heartbeat", { p_id: id });
      // The stay was closed (long gap, e.g. the laptop slept): start a new one.
      if (!error && data === false) { id = null; await start(); }
    };

    void start();
    const timer = setInterval(() => { void beat(); }, BEAT_MS);
    const onOnline = () => { void beat(); };
    window.addEventListener("online", onOnline);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
      if (id) void supabase.rpc("call_leave", { p_id: id });
    };
  }, [lessonId, live, joined, transport]);
}
