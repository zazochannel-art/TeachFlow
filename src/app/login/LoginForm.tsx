"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";
import { AuthMessage } from "@/components/auth/AuthMessage";

export function LoginForm({ next, initialError, initialInfo }: { next: string; initialError: string; initialInfo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setLoading(true);
    const supabase = createClient();
    if (!supabase) { setError("Configurează Supabase în .env.local pentru autentificare."); setLoading(false); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(authErrorMessage(error.message)); setLoading(false); return; }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-[380px]">
      <Link href="/" className="text-[20px] font-extrabold text-primary md:hidden">TeachFlow</Link>
      <h1 className="mt-6 text-[24px] font-extrabold tracking-tight text-ink md:mt-0">Bine ai revenit!</h1>
      <p className="mb-7 mt-1.5 text-[13px] text-muted">Autentifică-te în contul tău de profesor.</p>
      {initialInfo && !error && <AuthMessage tone="info">{initialInfo}</AuthMessage>}
      <label className="tf-label" htmlFor="email">Email</label>
      <input id="email" className="tf-input mb-5" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <div className="flex items-baseline justify-between">
        <label className="tf-label" htmlFor="password">Parolă</label>
        <Link href="/forgot-password" className="text-[11px] font-bold text-primary">Ai uitat parola?</Link>
      </div>
      <input id="password" className="tf-input mb-5" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
      {error && <AuthMessage tone="error">{error}</AuthMessage>}
      <button className="tf-btn w-full" disabled={loading}>{loading ? "Se conectează..." : "Intră în cont"}</button>
      <p className="mt-5 text-center text-[12px] text-muted">Nu ai cont? <Link href="/register" className="font-bold text-primary">Creează cont</Link></p>
    </form>
  );
}
