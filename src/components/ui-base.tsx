import type { ReactNode } from "react";
import { BookOpen, Calculator, Code, FlaskConical, Languages, Music, Palette, type LucideIcon } from "lucide-react";
import type { SubjectKind } from "@/lib/data/derive";

const subjectIcons: Record<SubjectKind, LucideIcon> = {
  language: Languages, math: Calculator, music: Music, art: Palette,
  science: FlaskConical, code: Code, other: BookOpen
};

export function SubjectIcon({ kind, className }: { kind: SubjectKind; className?: string }) {
  const Icon = subjectIcons[kind];
  return <Icon className={className} strokeWidth={2.2} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-line/70 bg-white shadow-card ${className}`}>{children}</div>;
}

