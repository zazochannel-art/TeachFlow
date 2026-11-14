import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import type { AppRole } from "./types";

interface AuthState {
  session: Session | null;
  /** undefined while loading, null when the account has no role row. */
  role: AppRole | null | undefined;
  ready: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [roleState, setRoleState] = useState<{ userId: string; role: AppRole | null } | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (!cancelled) setRoleState({ userId, role: (data?.role as AppRole | undefined) ?? null });
    });
    return () => { cancelled = true; };
  }, [userId]);

  const role = userId && roleState?.userId === userId ? roleState.role : undefined;
  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);
  const ready = sessionReady && (!session || role !== undefined);

  return <AuthContext.Provider value={{ session, role, ready, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
