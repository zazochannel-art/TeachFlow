import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, ClipboardCheck, ClipboardList, UserRound, Video, Wallet, type LucideIcon } from "lucide-react";
import type { FeedItem } from "@/lib/data/derive";
import { initials } from "@/lib/time";
import { Card, SubjectIcon } from "./ui-base";

export { Card, SubjectIcon } from "./ui-base";
export { CourseTile, CreateCourseTile, DemoNotice, MigrationNotice, Panel } from "./ui-text";

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-extrabold tracking-tight text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Avatar({ name, src, size = 32, className = "" }: { name: string; src?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.34)) };
  if (src) {
    return <span role="img" aria-label={name} className={`inline-block shrink-0 rounded-full bg-tint bg-cover bg-center ${className}`} style={{ ...style, backgroundImage: `url(${JSON.stringify(src)})` }} />;
  }
  return <span aria-hidden className={`inline-grid shrink-0 place-items-center rounded-full bg-tint font-extrabold text-primary-2 ${className}`} style={style}>{initials(name)}</span>;
}

const kindIcons: Record<FeedItem["kind"], LucideIcon> = {
  lesson: Video, homework: ClipboardCheck, student: UserRound, payment: Wallet, admin: ClipboardList, prepare: BookOpen
};

/** Compact white notification / task card. */
export function FeedCard({ item }: { item: FeedItem }) {
  const Icon = kindIcons[item.kind];
  const icon = item.subject && (item.kind === "homework" || item.kind === "prepare")
    ? <SubjectIcon kind={item.subject} className="h-[18px] w-[18px]" />
    : <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />;

  const inner = item.highlight ? (
    <div className="flex items-center gap-4 rounded-[20px] bg-primary p-4 text-white shadow-lift">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20">{icon}</span>
      <div className="min-w-0 text-[12px] leading-relaxed">
        <p className="text-white/90">{item.title}</p>
        <p className="truncate"><strong className="font-extrabold">{item.emphasis}</strong> {item.body}</p>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-4 rounded-[20px] bg-white p-4 shadow-card transition-shadow hover:shadow-md">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tint text-primary-2">{icon}</span>
      <div className="min-w-0 text-[12px] leading-relaxed">
        <h4 className="truncate font-extrabold text-ink">{item.title}</h4>
        <p className="truncate text-muted">{item.emphasis && <strong className="font-extrabold text-ink">{item.emphasis} </strong>}{item.body}</p>
      </div>
    </div>
  );

  if (!item.href) return inner;
  return item.external
    ? <a href={item.href} target="_blank" rel="noreferrer" className="block">{inner}</a>
    : <Link href={item.href} className="block">{inner}</Link>;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="rounded-[20px] border border-dashed border-line bg-white/60 p-4 text-[12px] text-muted">{children}</div>;
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-tint text-primary-2"><Icon className="h-6 w-6" /></span>
      <h3 className="text-[15px] font-extrabold text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function Pill({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" | "amber" | "gray" | "red" }) {
  const tones = {
    blue: "bg-tint text-primary-2", green: "bg-[#e7f7ef] text-[#1b8a5a]", amber: "bg-[#fff4de] text-[#a2660a]",
    gray: "bg-soft text-muted", red: "bg-[#fdecec] text-[#c03a3a]"
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold ${tones[tone]}`}>{children}</span>;
}

export function Field({ label, htmlFor, children, wide = false }: { label: string; htmlFor?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="tf-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

export function Tabs({ items, active }: { items: Array<{ key: string; label: string; href: string; count?: number }>; active: string }) {
  return (
    <div className="tf-scroll mb-5 flex gap-2 overflow-x-auto">
      {items.map(t => (
        <Link key={t.key} href={t.href} className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[12px] font-bold ${t.key === active ? "bg-primary text-white" : "bg-white text-muted shadow-card hover:text-ink"}`}>
          {t.label}{t.count != null && <span className={`rounded-full px-1.5 text-[10px] ${t.key === active ? "bg-white/20" : "bg-soft"}`}>{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}
