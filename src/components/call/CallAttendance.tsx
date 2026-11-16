import { Clock, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, summarizeAttendance, type Stay } from "@/lib/call/attendance";
import { formatTime } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

/**
 * Teacher only: who was in the lesson's call and for how long (migration 0018). Rendered on the
 * server from lesson_call_attendance; RLS lets only the lesson's teacher read everybody's rows.
 * Shows nothing before the migration or before anybody joined.
 */
export async function CallAttendance({ lessonId, timezone }: { lessonId: string; timezone: string }) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("lesson_call_attendance")
    .select("user_id, role, display_name, joined_at, last_seen_at, left_at")
    .eq("lesson_id", lessonId)
    .order("joined_at")
    .limit(500);
  if (error || !data?.length) return null;

  const t = await getT();
  const s = summarizeAttendance(data as Stay[]);
  const range = s.startedAt && s.endedAt ? `${formatTime(s.startedAt, timezone, t.locale)} – ${formatTime(s.endedAt, timezone, t.locale)}` : "";

  return (
    <details className="mb-4 rounded-[16px] border border-line/70 bg-white px-4 py-3 shadow-card" data-testid="call-attendance">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <span className="flex items-center gap-1.5 font-extrabold text-ink"><UserCheck className="h-4 w-4 text-primary" /> {t("Prezența la apel")}</span>
        <span className="flex items-center gap-1 text-muted"><Clock className="h-3.5 w-3.5" /> {t("Lecție cu elevii")}: <b className="text-ink">{formatDuration(s.lessonSeconds)}</b></span>
        {range && <span className="text-muted">{range}</span>}
        <span className="ml-auto text-[12px] font-bold text-primary">{t.n("{n} participant|{n} participanți|{n} de participanți", s.people.length)}</span>
      </summary>
      <ul className="mt-3 divide-y divide-line/60 text-[13px]">
        {s.people.map(p => (
          <li key={p.userId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${p.present ? "bg-[#2fb37b]" : "bg-line"}`} title={p.present ? t("Acum în apel") : undefined} />
            <span className="min-w-0 flex-1 truncate font-bold text-ink">{p.name}{p.role === "teacher" ? ` · ${t("Profesor")}` : ""}</span>
            <span className="text-muted">{formatTime(p.firstJoin, timezone, t.locale)} – {p.present ? t("acum") : formatTime(p.lastSeen, timezone, t.locale)}</span>
            <span className="w-[86px] text-right font-extrabold text-ink">{formatDuration(p.seconds)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">{t("Se numără doar timpul petrecut efectiv în apel. Actualizează pagina pentru cifrele de acum.")}</p>
    </details>
  );
}
