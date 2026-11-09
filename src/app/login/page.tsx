"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:20}}>
    <form onSubmit={submit} className="card" style={{width:"100%",maxWidth:420,padding:32}}>
      <Link href="/" style={{fontSize:22,fontWeight:800,color:"#4263eb"}}>TeachFlow</Link>
      <h1 style={{fontSize:24,margin:"25px 0 7px"}}>Bine ai revenit!</h1>
      <p className="muted" style={{fontSize:13,marginBottom:25}}>Autentifică-te în contul tău de profesor.</p>
      <label style={{fontSize:12,fontWeight:700}}>Email</label>
      <input className="input" type="email" required value={email} onChange={e=>setEmail(e.target.value)} style={{margin:"8px 0 18px"}}/>
      <label style={{fontSize:12,fontWeight:700}}>Parolă</label>
      <input className="input" type="password" required value={password} onChange={e=>setPassword(e.target.value)} style={{margin:"8px 0 18px"}}/>
      {message && <p role="alert" style={{fontSize:12,color:"#c24141"}}>{message}</p>}
      <button className="primary-btn" disabled={loading} style={{width:"100%"}}>{loading?"Se conectează...":"Intră în cont"}</button>
      <p className="muted" style={{fontSize:12,textAlign:"center",marginTop:20}}>Nu ai cont? <Link href="/register" style={{color:"#4263eb",fontWeight:700}}>Creează cont</Link></p>
    </form>
  </main>;
}
