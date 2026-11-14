"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";
import { AuthMessage } from "@/components/auth/AuthMessage";
import { useT } from "@/lib/i18n/client";

export function ResetPasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    if (password !== confirm) { setError(t("Parolele nu coincid.")); return; }
    setLoading(true);
    const supabase = createClient();
    if (!supabase) { setError(t("Configurează Supabase în .env.local.")); setLoading(false); return; }
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(authErrorMessage(error.message, t)); return; }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-[380px]">
      <h1 className="text-[24px] font-extrabold tracking-tight text-ink">{t("Setează o parolă nouă")}</h1>
      <p className="mb-7 mt-1.5 text-[13px] text-muted">{t("Pentru contul")} <b className="text-ink">{email}</b>.</p>
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <label className="tf-label" htmlFor="password">{t("Parolă nouă (minimum 8 caractere)")}</label>
      <input id="password" className="tf-input mb-4" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />
      <label className="tf-label" htmlFor="confirm">{t("Repetă parola")}</label>
      <input id="confirm" className="tf-input mb-5" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)} />
      {error && <AuthMessage tone="error">{error}</AuthMessage>}
      <button className="tf-btn w-full" disabled={loading}>{loading ? t("Se salvează...") : t("Salvează parola")}</button>
    </form>
  );
}
