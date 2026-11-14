"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Plus, TrendingUp } from "lucide-react";
import type { CourseCard } from "@/lib/data/derive";
import { useT } from "@/lib/i18n/client";
import { Card, SubjectIcon } from "./ui-base";

// Shared UI pieces that carry their own text; client components so they can read the language.

const tileColors = ["bg-course-1", "bg-course-2", "bg-course-3", "bg-course-4"];

/** Compact blue course/group card, as in the reference "classes" row. */
export function CourseTile({ card, index }: { card: CourseCard; index: number }) {
  const t = useT();
  return (
    <Link
      href={`/courses#${card.id}`}
      className={`${tileColors[index % tileColors.length]} flex h-[138px] min-w-0 flex-col justify-between rounded-[20px] p-4 text-white shadow-md transition-transform hover:-translate-y-0.5`}
    >
      <div className="line-clamp-2 text-[16px] font-extrabold leading-[1.15]" title={card.title}>{card.title}</div>

      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-white/90">
        <span className="flex min-w-0 items-center gap-1.5" title={t("{done} din {total} lecții ținute", { done: card.lessonsDone, total: card.lessonsTotal })}>
          <SubjectIcon kind={card.subject} className="h-3.5 w-3.5 shrink-0" /> {card.lessonsDone}/{card.lessonsTotal}
        </span>
        <span className="flex items-center gap-1.5" title={t("Progresul cursului")}>
          <TrendingUp className="h-3.5 w-3.5" /> {card.progress == null ? "—" : `${card.progress}%`}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {card.avatars.length ? card.avatars.map((a, i) => (
            <span key={i} className="grid h-7 w-7 place-items-center rounded-full bg-white text-[9px] font-extrabold text-primary-2 ring-2 ring-white/25">{a}</span>
          )) : <span className="text-[10px] text-white/70">{t("Fără elevi")}</span>}
        </div>
        <div className="text-right text-[10px] leading-tight text-white/85">
          <strong className="block text-[11px] font-extrabold text-white">{card.studentCount}</strong>
          {t.n("elev|elevi|de elevi", card.studentCount)}
        </div>
      </div>
    </Link>
  );
}

export function CreateCourseTile({ label }: { label?: string }) {
  const t = useT();
  return (
    <Link href="/courses/new" className="flex h-[138px] flex-col items-center justify-center rounded-[20px] bg-tint p-4 text-ink transition-colors hover:bg-[#dfe4fb]">
      <Plus className="mb-2 h-5 w-5" strokeWidth={2.4} />
      <span className="whitespace-pre-line text-center text-[11px] font-bold leading-snug text-[#3b4268]">{label ?? t("Creează un curs\nsau o grupă nouă")}</span>
    </Link>
  );
}

export function DemoNotice() {
  const t = useT();
  return <p className="mt-6 text-[11px] text-muted">{t("Mod demonstrativ · Supabase nu este configurat, iar datele afișate sunt exemple. Configurează .env.local pentru datele tale reale.")}</p>;
}

/** Inline editor panel opened via a URL parameter (?new=1, ?edit=id), closed by a link. */
export function Panel({ title, closeHref, children, aside }: { title: string; closeHref: string; children: ReactNode; aside?: ReactNode }) {
  const t = useT();
  return (
    <Card className="mb-6 p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-extrabold text-ink">{title}</h2>
        <div className="flex items-center gap-2">{aside}<Link href={closeHref} className="tf-btn-ghost px-3 py-1.5 text-[12px]">{t("Închide")}</Link></div>
      </div>
      {children}
    </Card>
  );
}

export function MigrationNotice({ table }: { table: string }) {
  const t = useT();
  return (
    <div className="mb-6 rounded-[20px] border border-[#f3dfb3] bg-[#fff8e8] p-4 text-[12px] text-[#7a5410]">
      {t("Tabelul {table} nu există încă în baza ta de date. Aplică supabase/migrations/0002_homework_messages_payments.sql în Supabase SQL Editor pentru a activa această pagină.", { table })}
    </div>
  );
}

