"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/AuthShell";

export default function LoginPage() {
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [message,setMessage] = useState("");
  const [loading,setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setMessage(""); setLoading(true);
    const supabase = createClient();
    if (!supabase) { setMessage("Configurează Supabase în .env.local pentru autentificare."); setLoading(false); return; }
    const {error} = await supabase.auth.signInWithPassword({email,password});
    if (error) setMessage(error.message);
    else window.location.href = "/dashboard";
    setLoading(false);
  }

  return <AuthShell>
    <form onSubmit={submit} className="mx-auto w-full max-w-[380px]">
      <Link href="/" className="text-[20px] font-extrabold text-primary md:hidden">TeachFlow</Link>
      <h1 className="mt-6 text-[24px] font-extrabold tracking-tight text-ink md:mt-0">Bine ai revenit!</h1>
      <p className="mb-7 mt-1.5 text-[13px] text-muted">Autentifică-te în contul tău de profesor.</p>
      <label className="tf-label">Email</label>
      <input className="tf-input mb-5" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
      <label className="tf-label">Parolă</label>
      <input className="tf-input mb-5" type="password" required value={password} onChange={e=>setPassword(e.target.value)}/>
      {message && <p role="alert" className="mb-4 text-[12px] font-semibold text-[#c03a3a]">{message}</p>}
      <button className="tf-btn w-full" disabled={loading}>{loading?"Se conectează...":"Intră în cont"}</button>
      <p className="mt-5 text-center text-[12px] text-muted">Nu ai cont? <Link href="/register" className="font-bold text-primary">Creează cont</Link></p>
    </form>
  </AuthShell>;
}
