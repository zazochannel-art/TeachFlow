import { Card } from "@/components/ui";
import { ActionForm, ConfirmSubmit } from "@/components/forms";
import { ProgressSummary } from "@/components/ProgressView";
import { deleteReward, giveReward } from "@/lib/actions/rewards";
import { loadProgress } from "@/lib/data/progress";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";
import type { T } from "@/lib/i18n/core";

/** Points and badges of one student, with the teacher's bonus points (student card, migration 0015). */
export async function StudentPoints({ studentId, timezone, t }: { studentId: string; timezone: string; t: T }) {
  const supabase = await createClient();
  if (!supabase) return null;
  const [{ ready, progress }, bonuses] = await Promise.all([
    loadProgress(supabase, [studentId], timezone),
    supabase.from("student_rewards").select("id, points, reason, created_at").eq("student_id", studentId).order("created_at", { ascending: false }).limit(8)
  ]);
  if (!ready || !progress) return null;
  const earned = progress.badges.filter(b => b.earned);

  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="mb-1 text-[13px] font-extrabold">{t("Puncte și insigne")}</h3>
      <p className="mb-3 text-[12px] text-muted">{t("Elevul câștigă puncte singur pentru teme, teste și lecții. Poți adăuga și puncte bonus, de exemplu pentru activitate la lecție.")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <ProgressSummary p={progress} t={t} compact />
          <p className="mt-3 text-[12px]"><b>{t("Insigne:")}</b> {earned.length ? earned.map(b => t(b.title)).join(", ") : t("niciuna încă")}</p>
        </div>
        <Card className="p-4">
          <ActionForm action={giveReward} submitLabel={t("Adaugă puncte")} className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)]" resetOnOk>
            <input type="hidden" name="student_id" value={studentId} />
            <input name="points" type="number" min={-100} max={100} step={1} required defaultValue={10} aria-label={t("Puncte")} className="tf-input" />
            <input name="reason" required maxLength={120} placeholder={t("ex. activ la lecție")} aria-label={t("Motiv")} className="tf-input" />
          </ActionForm>
          {(bonuses.data ?? []).length > 0 && (
            <div className="mt-4 divide-y divide-line text-[12px]">
              {(bonuses.data ?? []).map(b => (
                <div key={b.id} className="flex items-center gap-2 py-2">
                  <span className={`w-12 shrink-0 font-extrabold ${b.points > 0 ? "text-[#1b8a5a]" : "text-[#c03a3a]"}`}>{b.points > 0 ? "+" : ""}{b.points}</span>
                  <span className="min-w-0 flex-1 truncate">{b.reason} <span className="text-muted">· {formatDate(b.created_at, timezone, t.locale)}</span></span>
                  <form action={deleteReward}><input type="hidden" name="id" value={b.id} /><ConfirmSubmit label="×" confirm={t("Șterge")} className="px-2 py-1" /></form>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
