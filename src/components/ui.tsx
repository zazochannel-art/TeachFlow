import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookOpen, Calculator, ClipboardCheck, ClipboardList, Code, FlaskConical, Languages,
  Music, Palette, Plus, TrendingUp, UserRound, Video, Wallet, type LucideIcon
} from "lucide-react";
import type { CourseCard, FeedItem, SubjectKind } from "@/lib/data/derive";
import { initials } from "@/lib/time";

const subjectIcons: Record<SubjectKind, LucideIcon> = {
  language: Languages, math: Calculator, music: Music, art: Palette,
  science: FlaskConical, code: Code, other: BookOpen
};

export function SubjectIcon({ kind, className }: { kind: SubjectKind; className?: string }) {
  const Icon = subjectIcons[kind];
  return <Icon className={className} strokeWidth={2.2} />;
}

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

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-line/70 bg-white shadow-card ${className}`}>{children}</div>;
}

export function Avatar({ name, src, size = 32, className = "" }: { name: string; src?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.34)) };
  if (src) {
    return <span role="img" aria-label={name} className={`inline-block shrink-0 rounded-full bg-tint bg-cover bg-center ${className}`} style={{ ...style, backgroundImage: `url(${JSON.stringify(src)})` }} />;
  }
  return <span aria-hidden className={`inline-grid shrink-0 place-items-center rounded-full bg-tint font-extrabold text-primary-2 ${className}`} style={style}>{initials(name)}</span>;
}

const tileColors = ["bg-course-1", "bg-course-2", "bg-course-3", "bg-course-4"];

/** Compact blue course/group card, as in the reference "classes" row. */
export function CourseTile({ card, index }: { card: CourseCard; index: number }) {
  return (
    <Link
      href={`/courses#${card.id}`}
      className={`${tileColors[index % tileColors.length]} flex h-[138px] min-w-0 flex-col justify-between rounded-[20px] p-4 text-white shadow-md transition-transform hover:-translate-y-0.5`}
    >
      <div className="line-clamp-2 text-[16px] font-extrabold leading-[1.15]" title={card.title}>{card.title}</div>

      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-white/90">
        <span className="flex min-w-0 items-center gap-1.5" title={`${card.lessonsDone} din ${card.lessonsTotal} lecții ținute`}>
          <SubjectIcon kind={card.subject} className="h-3.5 w-3.5 shrink-0" /> {card.lessonsDone}/{card.lessonsTotal}
        </span>
        <span className="flex items-center gap-1.5" title="Progresul cursului">
          <TrendingUp className="h-3.5 w-3.5" /> {card.progress == null ? "—" : `${card.progress}%`}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {card.avatars.length ? card.avatars.map((a, i) => (
            <span key={i} className="grid h-7 w-7 place-items-center rounded-full bg-white text-[9px] font-extrabold text-primary-2 ring-2 ring-white/25">{a}</span>
          )) : <span className="text-[10px] text-white/70">Fără elevi</span>}
        </div>
        <div className="text-right text-[10px] leading-tight text-white/85">
          <strong className="block text-[11px] font-extrabold text-white">{card.studentCount}</strong>
          {card.studentCount === 1 ? "elev" : "elevi"}
        </div>
      </div>
    </Link>
  );
}

export function CreateCourseTile({ label = "Creează un curs\nsau o grupă nouă" }: { label?: string }) {
  return (
    <Link href="/courses/new" className="flex h-[138px] flex-col items-center justify-center rounded-[20px] bg-tint p-4 text-ink transition-colors hover:bg-[#dfe4fb]">
      <Plus className="mb-2 h-5 w-5" strokeWidth={2.4} />
      <span className="whitespace-pre-line text-center text-[11px] font-bold leading-snug text-[#3b4268]">{label}</span>
    </Link>
  );
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

export function DemoNotice() {
  return <p className="mt-6 text-[11px] text-muted">Mod demonstrativ · Supabase nu este configurat, iar datele afișate sunt exemple. Configurează <code>.env.local</code> pentru datele tale reale.</p>;
}
