"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";
import { AuthMessage } from "@/components/auth/AuthMessage";
import { setLanguage } from "@/lib/actions/language";
import { useT } from "@/lib/i18n/client";

export function RegisterForm({ next = "/dashboard" }: { next?: string }) {
  const asStudent = next.startsWith("/invite/");
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setLoading(true);
    const supabase = createClient();
    if (!supabase) { setError(t("Configurează Supabase în .env.local pentru înregistrare.")); setLoading(false); return; }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` }
    });
    setLoading(false);
    if (error) { setError(authErrorMessage(error.message, t)); return; }
    // Email confirmation disabled in Supabase: the user is signed in right away.
    if (data.session) {
      // Keep the language picked on this screen for the new account.
      const fd = new FormData(); fd.set("lang", t.lang); await setLanguage(fd);
      router.replace(next); router.refresh(); return;
    }
    // Supabase hides existing accounts by returning a user without identities.
    if (data.user && data.user.identities?.length === 0) { setError(authErrorMessage("User already registered", t)); return; }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="mx-auto w-full max-w-[380px] text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-tint text-primary"><MailCheck className="h-7 w-7" /></span>
        <h1 className="mt-5 text-[22px] font-extrabold tracking-tight text-ink">{t("Verifică-ți emailul")}</h1>
        <p className="mt-2 text-[13px] text-muted">{t("Am trimis un link de confirmare la")} <b className="text-ink">{sentTo}</b>. {t("Deschide-l ca să-ți activezi contul.")}</p>
        <p className="mt-6 text-[12px] text-muted">{t("Nu a ajuns? Verifică folderul Spam sau")} <button type="button" onClick={() => setSentTo("")} className="font-bold text-primary">{t("încearcă din nou")}</button>.</p>
        <Link href="/login" className="tf-btn-ghost mt-6 inline-flex">{t("Înapoi la autentificare")}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-[380px]">
      <Link href="/" className="text-[20px] font-extrabold text-primary md:hidden">TeachFlow</Link>
      <h1 className="mt-6 text-[24px] font-extrabold tracking-tight text-ink md:mt-0">{asStudent ? t("Creează contul de elev") : t("Creează cont de profesor")}</h1>
      <p className="mb-7 mt-1.5 text-[13px] text-muted">{asStudent ? t("După confirmare, revii la invitație și o accepți.") : t("Începe să-ți organizezi lecțiile într-un singur loc.")}</p>
      <label className="tf-label" htmlFor="name">{t("Nume complet")}</label>
      <input id="name" className="tf-input mb-4" autoComplete="name" required value={name} onChange={e => setName(e.target.value)} />
      <label className="tf-label" htmlFor="email">{t("Email")}</label>
      <input id="email" className="tf-input mb-4" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <label className="tf-label" htmlFor="password">{t("Parolă (minimum 8 caractere)")}</label>
      <input id="password" className="tf-input mb-5" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />
      {error && <AuthMessage tone="error">{error}</AuthMessage>}
      <button className="tf-btn w-full" disabled={loading}>{loading ? t("Se creează contul...") : t("Creează cont")}</button>
      <p className="mt-5 text-center text-[12px] text-muted">{t("Ai deja cont?")} <Link href={next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`} className="font-bold text-primary">{t("Autentifică-te")}</Link></p>
    </form>
  );
}
