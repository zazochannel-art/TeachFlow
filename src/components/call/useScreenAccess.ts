"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { joinSignal, type SignalHandle } from "@/lib/board/signal";
import type { CallEngine, CallProps, ScreenAccess } from "./types";

/**
 * Who may share the screen in the lesson call. The list lives in lesson_screen_access (only the
 * lesson's teacher writes it); a change is announced on the lesson's signalling channel and every
 * client reads the list again from the database. A student who loses access stops sharing.
 */
export function useScreenAccess({ lessonId, live, me, access, teacherId }: CallProps, engine: CallEngine): ScreenAccess {
  const enforced = live && !!access?.shareReady;
  const isTeacher = me.role === "teacher";
  const [sharers, setSharers] = useState<string[]>(access?.sharers ?? []);
  const [busy, setBusy] = useState("");
  const [failed, setFailed] = useState(false);
  const bus = useRef<SignalHandle | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase.from("lesson_screen_access").select("user_id").eq("lesson_id", lessonId);
    if (!error) setSharers(((data as { user_id: string }[] | null) ?? []).map(r => r.user_id));
  }, [lessonId]);

  useEffect(() => {
    if (!enforced) return;
    // Also on every (re)subscribe: the list may have changed while this tab was not listening.
    const handle = joinSignal(`screen:${lessonId}`, "access", () => { void refresh(); }, () => { void refresh(); }, { id: me.id, role: me.role, name: me.name });
    bus.current = handle;
    return () => { bus.current = null; handle?.leave(); };
  }, [enforced, lessonId, refresh, me.id, me.role, me.name]);

  const canShare = isTeacher || !enforced || sharers.includes(me.id);
  const mayShare = useCallback((userId: string) => !enforced || userId === teacherId || sharers.includes(userId), [enforced, teacherId, sharers]);

  // Access taken away in the middle of a share: stop it.
  const { sharing, toggleScreen, transport } = engine;
  const stopping = useRef(false);
  useEffect(() => {
    if (canShare || !sharing || stopping.current) return;
    stopping.current = true;
    void toggleScreen().finally(() => { stopping.current = false; });
  }, [canShare, sharing, toggleScreen]);

  const toggle = useCallback((userId: string, allow: boolean) => {
    const supabase = createClient();
    if (!supabase) return;
    setBusy(userId);
    setFailed(false);
    void (async () => {
      const { error } = allow
        ? await supabase.from("lesson_screen_access").upsert({ lesson_id: lessonId, user_id: userId }, { onConflict: "lesson_id,user_id", ignoreDuplicates: true })
        : await supabase.from("lesson_screen_access").delete().eq("lesson_id", lessonId).eq("user_id", userId);
      setBusy("");
      if (error) { setFailed(true); return; }
      setSharers(list => (allow ? [...new Set([...list, userId])] : list.filter(id => id !== userId)));
      bus.current?.send({});
      // Group calls: the LiveKit server enforces the permission, so it is told right away.
      if (transport === "sfu") {
        void fetch("/api/rtc/permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId, userId }) }).catch(() => {});
      }
    })();
  }, [lessonId, transport]);

  return {
    canShare,
    mayShare,
    manage: isTeacher && enforced ? { students: access?.students ?? [], sharers, busy, failed, toggle } : null
  };
}
