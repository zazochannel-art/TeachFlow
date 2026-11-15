import Link from "next/link";
import { Avatar } from "@/components/ui";
import type { ParentChild } from "@/lib/data/parent";

/** Switches between the parent's children (shown only when there is more than one). */
export function ChildPicker({ items, active, base }: { items: ParentChild[]; active: string; base: string }) {
  if (items.length < 2) return null;
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {items.map(c => (
        <Link key={c.studentId} href={`${base}?c=${c.studentId}`} aria-current={c.studentId === active ? "true" : undefined}
          className={`flex items-center gap-2 rounded-2xl py-1.5 pl-1.5 pr-4 text-[12px] font-bold ${c.studentId === active ? "bg-primary text-white" : "bg-soft text-ink hover:bg-tint"}`}>
          <Avatar name={c.name} src={c.avatarUrl} size={28} />
          <span>{c.name}</span>
          <span className={`text-[11px] font-semibold ${c.studentId === active ? "text-white/75" : "text-muted"}`}>· {c.teacherName}</span>
        </Link>
      ))}
    </div>
  );
}
