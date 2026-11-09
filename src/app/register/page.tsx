"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:20}}>
    <form onSubmit={submit} className="card" style={{width:"100%",maxWidth:440,padding:32}}>
      <Link href="/" style={{fontSize:22,fontWeight:800,color:"#4263eb"}}>TeachFlow</Link>
      <h1 style={{fontSize:24,margin:"25px 0 7px"}}>Creează cont de profesor</h1>
      <p className="muted" style={{fontSize:13,marginBottom:25}}>Începe să-ți organizezi lecțiile într-un singur loc.</p>
      <label style={{fontSize:12,fontWeight:700}}>Nume complet</label>
      <input className="input" required value={name} onChange={e=>setName(e.target.value)} style={{margin:"8px 0 16px"}}/>
      <label style={{fontSize:12,fontWeight:700}}>Email</label>
      <input className="input" type="email" required value={email} onChange={e=>setEmail(e.target.value)} style={{margin:"8px 0 16px"}}/>
      <label style={{fontSize:12,fontWeight:700}}>Parolă (minimum 8 caractere)</label>
      <input className="input" type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} style={{margin:"8px 0 18px"}}/>
      {message && <p role="status" style={{fontSize:12,color:"#3659df"}}>{message}</p>}
      <button className="primary-btn" disabled={loading} style={{width:"100%"}}>{loading?"Se creează contul...":"Creează cont"}</button>
      <p className="muted" style={{fontSize:12,textAlign:"center",marginTop:20}}>Ai deja cont? <Link href="/login" style={{color:"#4263eb",fontWeight:700}}>Autentifică-te</Link></p>
    </form>
  </main>;
}
