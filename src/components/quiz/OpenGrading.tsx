"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { gradeOpenAnswers } from "@/lib/actions/quizzes";
import type { FormState } from "@/lib/actions/common";
import { useT } from "@/lib/i18n/client";
import type { QuizQuestion } from "@/types/database";

/**
 * Marks for the open questions of one attempt. "AI suggestion" fills in points and a comment;
 * nothing counts until the teacher saves (that is the approval).
 */
export function OpenGrading({ attemptId, questions, answers, scores, feedback, aiReady, context }: {
  attemptId: string; questions: QuizQuestion[]; answers: Record<string, unknown>; scores: Record<string, number>; feedback: Record<string, string>;
  aiReady: boolean; context: Record<string, string | null | undefined>;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(gradeOpenAnswers, {});
  const open = questions.filter(q => q.type === "open");
  const [vals, setVals] = useState<Record<string, { s: string; f: string }>>(() =>
    Object.fromEntries(open.map(q => [q.id, { s: q.id in scores ? String(scores[q.id]) : "", f: feedback[q.id] ?? "" }])));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  if (!open.length) return null;

  const suggest = async (q: QuizQuestion) => {
    setBusy(q.id); setErr("");
    const answer = Array.isArray(answers[q.id]) ? String((answers[q.id] as unknown[])[0] ?? "") : "";
    try {
      const res = await fetch("/api/ai/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "grade", ...context, question: q, answer }) });
      const data = await res.json();
      if (!res.ok || data.error) setErr(data.error || "Serviciul AI a răspuns cu o eroare. Încearcă din nou.");
      else setVals(v => ({ ...v, [q.id]: { s: String(data.points), f: data.feedback } }));
    } catch {
      setErr("Serviciul AI nu răspunde acum. Încearcă din nou.");
    }
    setBusy(null);
  };

  return (
    <form action={action} className="rounded-[20px] border border-[#c9cfee] bg-white p-4 sm:p-5">
      <input type="hidden" name="attempt_id" value={attemptId} />
      <p className="mb-1 text-[14px] font-extrabold text-ink">{t("Notează întrebările deschise")}</p>
      <p className="mb-4 text-[12px] text-muted">{t("Sugestia AI completează nota și comentariul; nota finală se aplică doar după ce salvezi.")}</p>
      <div className="space-y-4">
        {open.map(q => {
          const a = Array.isArray(answers[q.id]) ? String((answers[q.id] as unknown[])[0] ?? "") : "";
          return (
            <div key={q.id} className="rounded-2xl bg-soft p-3 sm:p-4">
              <p className="text-[13px] font-bold text-ink">{q.text}</p>
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 text-[13px] text-ink">{a || <span className="text-muted">{t("Fără răspuns")}</span>}</p>
              {q.model_answer && <p className="mt-2 text-[11px] text-muted"><span className="font-bold">{t("Răspuns model")}:</span> {q.model_answer}</p>}
              <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr_auto] sm:items-start">
                <label className="flex items-center gap-2 text-[12px] font-bold text-muted">
                  <input name={`s_${q.id}`} value={vals[q.id]?.s ?? ""} onChange={e => setVals(v => ({ ...v, [q.id]: { ...v[q.id], s: e.target.value } }))} inputMode="decimal"
                    className="tf-input w-20 bg-white py-2" aria-label={t("Puncte")} placeholder="0" /> / {q.points}
                </label>
                <textarea name={`f_${q.id}`} value={vals[q.id]?.f ?? ""} onChange={e => setVals(v => ({ ...v, [q.id]: { ...v[q.id], f: e.target.value } }))} rows={2} maxLength={2000}
                  className="tf-input bg-white py-2 text-[12px]" placeholder={t("Comentariu pentru elev (opțional)")} aria-label={t("Comentariu pentru elev (opțional)")} />
                {aiReady && (
                  <button type="button" onClick={() => suggest(q)} disabled={busy === q.id || !a}
                    className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-tint px-3 text-[11px] font-bold text-primary-2 hover:bg-[#dfe3ff] disabled:opacity-50">
                    {busy === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {t("Sugestie AI")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {err && <p role="alert" className="mt-3 text-[12px] font-semibold text-[#c03a3a]">{t(err)}</p>}
      {state.error && <p role="alert" className="mt-3 text-[12px] font-semibold text-[#c03a3a]">{t(state.error)}</p>}
      {state.ok && <p role="status" className="mt-3 text-[12px] font-semibold text-[#1b8a5a]">{t(state.ok)}</p>}
      <button className="tf-btn mt-4" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t("Aprobă și salvează notele")}</button>
    </form>
  );
}
