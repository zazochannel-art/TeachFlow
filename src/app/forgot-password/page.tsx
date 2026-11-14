"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";
import { AuthMessage } from "@/components/auth/AuthMessage";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setLoading(true);
    const supabase = createClient();
    if (!supabase) { setError("Configurează Supabase în .env.local."); setLoading(false); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`
    });
    setLoading(false);
    if (error) { setError(authErrorMessage(error.message)); return; }
    setSent(true);
  }

  return (
    <AuthShell>
      {sent ? (
        <div className="mx-auto w-full max-w-[380px] text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-tint text-primary"><MailCheck className="h-7 w-7" /></span>
          <h1 className="mt-5 text-[22px] font-extrabold tracking-tight text-ink">Verifică-ți emailul</h1>
          <p className="mt-2 text-[13px] text-muted">Dacă există un cont pentru <b className="text-ink">{email}</b>, vei primi un link pentru a seta o parolă nouă.</p>
          <Link href="/login" className="tf-btn-ghost mt-6 inline-flex">Înapoi la autentificare</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mx-auto w-full max-w-[380px]">
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink">Ai uitat parola?</h1>
          <p className="mb-7 mt-1.5 text-[13px] text-muted">Introdu emailul contului și îți trimitem un link de resetare.</p>
          <label className="tf-label" htmlFor="email">Email</label>
          <input id="email" className="tf-input mb-5" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
          {error && <AuthMessage tone="error">{error}</AuthMessage>}
          <button className="tf-btn w-full" disabled={loading}>{loading ? "Se trimite..." : "Trimite linkul"}</button>
          <p className="mt-5 text-center text-[12px] text-muted"><Link href="/login" className="font-bold text-primary">Înapoi la autentificare</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
