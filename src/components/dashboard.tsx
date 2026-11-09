import {
  Bell, Search, Plus, CalendarDays, Users, Wallet,
  BookOpen, ArrowUpRight, Clock3, MoreHorizontal
} from "lucide-react";

const stats = [
  { label:"Venituri luna aceasta", value:"8.450 MDL", change:"+12,5% față de luna trecută", Icon:Wallet, color:"#eaf8f1", icon:"#159565" },
  { label:"Elevi activi", value:"24", change:"+3 elevi noi luna aceasta", Icon:Users, color:"#eef2ff", icon:"#4263eb" },
  { label:"Lecții programate", value:"18", change:"5 lecții în următoarele 7 zile", Icon:CalendarDays, color:"#fff5e6", icon:"#c18119" },
  { label:"Cursuri active", value:"6", change:"2 grupe · 4 individuale", Icon:BookOpen, color:"#f4edff", icon:"#8755c7" }
];

const lessons = [
  { name:"Maria Popescu", subject:"Engleză · Nivel B2", time:"09:00 – 10:00", status:"Confirmată", color:"blue", initials:"MP" },
  { name:"Andrei Rusu", subject:"Engleză · Nivel A2", time:"11:30 – 12:30", status:"Confirmată", color:"blue", initials:"AR" },
  { name:"Elena Munteanu", subject:"Pregătire matematică", time:"14:00 – 15:00", status:"În așteptare", color:"amber", initials:"EM" },
  { name:"Grupa Engleză A1", subject:"Lecție de grup · 4 elevi", time:"16:00 – 17:00", status:"Confirmată", color:"blue", initials:"GA" }
];

export function Dashboard() {
  return <div className="main-area">
    <header className="topbar">
      <div style={{display:"flex",alignItems:"center",gap:10,color:"#8a94a4",fontSize:12}}><Search size={16}/><span>Caută elevi, lecții...</span></div>
      <div style={{display:"flex",alignItems:"center",gap:18}}>
        <button aria-label="Notificări" className="secondary-btn" style={{padding:9,position:"relative"}}><Bell size={17}/></button>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div className="avatar">IG</div>
          <div className="hide-mobile"><div style={{fontSize:12,fontWeight:700}}>Igor Gratii</div><div style={{fontSize:10,color:"#8993a2"}}>Profesor</div></div>
        </div>
      </div>
    </header>
    <main className="content">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:15,flexWrap:"wrap",marginBottom:27}}>
        <div><p className="muted" style={{fontSize:12,margin:"0 0 7px"}}>Luni, 9 noiembrie 2026</p><h1 className="page-title">Bun venit, Igor! 👋</h1><p className="muted" style={{fontSize:13,margin:"8px 0 0"}}>Iată ce se întâmplă în activitatea ta astăzi.</p></div>
        <button className="primary-btn" style={{display:"flex",alignItems:"center",gap:8}}><Plus size={16}/> Programează o lecție</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(205px,1fr))",gap:14,marginBottom:22}}>
        {stats.map(({label,value,change,Icon,color,icon})=><section className="card" key={label}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span className="stat-label">{label}</span><span style={{width:35,height:35,borderRadius:11,background:color,display:"grid",placeItems:"center",color:icon}}><Icon size={17}/></span></div>
          <div className="stat-value">{value}</div><div className="stat-change">{change}</div>
        </section>)}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.7fr) minmax(240px,1fr)",gap:16}}>
        <section className="card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:15}}>
            <div><h2 style={{fontSize:15,margin:0,fontWeight:750}}>Lecțiile de astăzi</h2><p className="muted" style={{fontSize:11,margin:"5px 0 0"}}>Programul tău pentru luni, 9 noiembrie</p></div>
            <button className="secondary-btn" style={{padding:"8px 10px"}}>Vezi calendarul</button>
          </div>
          {lessons.map((lesson)=><div key={lesson.name} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 0",borderBottom:"1px solid #f0f2f6"}}>
            <div className="avatar">{lesson.initials}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:700}}>{lesson.name}</div><div className="muted" style={{fontSize:10,marginTop:4}}>{lesson.subject}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:11,fontWeight:650}}>{lesson.time}</div><div style={{marginTop:5}}><span className={`pill ${lesson.color}`}>{lesson.status}</span></div></div>
          </div>)}
        </section>

        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <section className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:15,margin:0,fontWeight:750}}>Acțiuni rapide</h2><MoreHorizontal size={18} color="#8993a2"/></div>
            {[
              ["Adaugă un elev",Users],
              ["Creează un curs",BookOpen],
              ["Programează o lecție",CalendarDays],
              ["Adaugă materiale",BookOpen]
            ].map(([label,Icon])=><button key={label as string} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 0",border:0,borderBottom:"1px solid #f0f2f6",background:"transparent",textAlign:"left",fontSize:12,fontWeight:600,cursor:"pointer"}}><span style={{color:"#4967df"}}><Icon size={16}/></span>{label as string}<ArrowUpRight size={14} style={{marginLeft:"auto",color:"#a0a8b5"}}/></button>)}
          </section>
          <section className="card" style={{background:"linear-gradient(135deg,#eef2ff,#f7f5ff)",borderColor:"#e7eaff"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,color:"#4a61c7",fontWeight:750,fontSize:13}}><Clock3 size={16}/> Următoarea lecție</div>
            <div style={{fontSize:20,fontWeight:800,marginTop:14}}>În 45 minute</div>
            <div style={{fontSize:12,color:"#65718d",marginTop:5}}>Maria Popescu · Engleză B2</div>
            <button className="primary-btn" style={{width:"100%",marginTop:16}}>Deschide sala de clasă</button>
          </section>
        </div>
      </div>
      <p className="muted" style={{fontSize:10,marginTop:20}}>Mod demonstrativ · Datele afișate sunt exemple și nu reprezintă tranzacții reale.</p>
    </main>
  </div>;
}
