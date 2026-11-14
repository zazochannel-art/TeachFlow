"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/AuthShell";

export default function RegisterPage() {
  const [name,setName] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [message,setMessage] = useState("");
  const [loading,setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setMessage(""); setLoading(true);
    const supabase = createClient();
    if (!supabase) { setMessage("Configurează Supabase în .env.local pentru înregistrare."); setLoading(false); return; }
    const {error} = await supabase.auth.signUp({email,password,options:{data:{full_name:name}}});
    setMessage(error ? error.message : "Cont creat. Verifică emailul pentru confirmarea înregistrării.");
    setLoading(false);
  }

  return <AuthShell>
    <form onSubmit={submit} className="mx-auto w-full max-w-[380px]">
      <Link href="/" className="text-[20px] font-extrabold text-primary md:hidden">TeachFlow</Link>
      <h1 className="mt-6 text-[24px] font-extrabold tracking-tight text-ink md:mt-0">Creează cont de profesor</h1>
      <p className="mb-7 mt-1.5 text-[13px] text-muted">Începe să-ți organizezi lecțiile într-un singur loc.</p>
      <label className="tf-label">Nume complet</label>
      <input className="tf-input mb-4" required value={name} onChange={e=>setName(e.target.value)}/>
      <label className="tf-label">Email</label>
      <input className="tf-input mb-4" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
      <label className="tf-label">Parolă (minimum 8 caractere)</label>
      <input className="tf-input mb-5" type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/>
      {message && <p role="status" className="mb-4 text-[12px] font-semibold text-primary-2">{message}</p>}
      <button className="tf-btn w-full" disabled={loading}>{loading?"Se creează contul...":"Creează cont"}</button>
      <p className="mt-5 text-center text-[12px] text-muted">Ai deja cont? <Link href="/login" className="font-bold text-primary">Autentifică-te</Link></p>
    </form>
  </AuthShell>;
}
