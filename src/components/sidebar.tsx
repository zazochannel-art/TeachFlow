import Link from "next/link";
import {
  LayoutDashboard, Users, BookOpen, CalendarDays, Video,
  Presentation, FolderOpen, ClipboardList, Wallet, Bot,
  ChartNoAxesCombined, Settings, GraduationCap
} from "lucide-react";

const groups = [
  { label: "GENERAL", items: [
    ["Dashboard", "/dashboard", LayoutDashboard],
    ["Elevii mei", "/students", Users],
    ["Cursuri și grupe", "/courses", BookOpen],
    ["Calendar", "/calendar", CalendarDays]
  ]},
  { label: "PREDare", items: [
    ["Lecții online", "/classroom", Video],
    ["Tablă interactivă", "/whiteboard", Presentation],
    ["Materiale", "/materials", FolderOpen],
    ["Teme și teste", "/homework", ClipboardList]
  ]},
  { label: "BUSINESS", items: [
    ["Plăți și venituri", "/payments", Wallet],
    ["AI Assistant", "/ai", Bot],
    ["Statistici", "/analytics", ChartNoAxesCombined],
    ["Setări", "/settings", Settings]
  ]}
] as const;

export function Sidebar() {
  return <aside className="sidebar">
    <Link href="/dashboard" className="brand">
      <div className="brand-mark"><GraduationCap size={21}/></div>
      <div><div className="brand-name">TeachFlow</div><div className="brand-sub">ONLINE TEACHING</div></div>
    </Link>
    {groups.map(group => <div key={group.label}>
      <div className="nav-label">{group.label}</div>
      {group.items.map(([label, href, Icon]) => <Link key={href} href={href} className={`nav-link ${href === "/dashboard" ? "active" : ""}`}>
        <Icon size={17}/><span>{label}</span>
      </Link>)}
    </div>)}
    <div className="sidebar-bottom">
      <div style={{fontSize:12,fontWeight:700}}>Planul tău</div>
      <div style={{fontSize:11,color:"#7a8494",marginTop:5}}>Free · 5 elevi incluși</div>
      <div style={{height:5,background:"#e9edf5",borderRadius:10,marginTop:12,overflow:"hidden"}}><div style={{height:5,width:"40%",background:"#4263eb",borderRadius:10}}/></div>
      <div style={{fontSize:10,color:"#7a8494",marginTop:7}}>2 din 5 elevi utilizați</div>
    </div>
  </aside>;
}
