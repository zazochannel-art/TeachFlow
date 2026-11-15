"use client";

import { Check, CircleHelp, Minus, X } from "lucide-react";
import { QUIZ_TYPE_INFO, answerText, correctText } from "@/lib/quiz";
import { useT } from "@/lib/i18n/client";
import { TYPE_ICONS } from "./icons";
import type { QuizQuestion } from "@/types/database";

/**
 * A handed-in attempt: each question with the student's answer, the points and, when `reveal` is
 * on, the correct answer and the explanation. Open questions without a mark show "to be checked".
 */
export function AnswerView({ questions, answers, scores, feedback = {}, reveal, images = {} }: {
  questions: QuizQuestion[]; answers: Record<string, unknown>; scores: Record<string, number>; feedback?: Record<string, string>;
  reveal: boolean; images?: Record<string, string>;
}) {
  const t = useT();
  return (
    <ol className="space-y-3">
      {questions.map((q, i) => {
        const got = q.id in scores ? Number(scores[q.id]) : null;
        const state = got == null ? "pending" : got >= q.points && q.points > 0 ? "right" : got > 0 ? "partial" : "wrong";
        const tone = { right: "border-[#bfe8d3] bg-[#f3fbf7]", partial: "border-[#f3dfb3] bg-[#fffaf0]", wrong: "border-[#f1caca] bg-[#fdf6f6]", pending: "border-line bg-soft" }[state];
        const badge = { right: "bg-[#1b8a5a]", partial: "bg-[#d38b12]", wrong: "bg-[#c03a3a]", pending: "bg-muted" }[state];
        const Mark = { right: Check, partial: Minus, wrong: X, pending: CircleHelp }[state];
        const Icon = TYPE_ICONS[q.type];
        const given = answerText(q, answers[q.id]);
        return (
          <li key={q.id} className={`rounded-[18px] border p-4 ${tone}`}>
            <div className="flex items-start gap-3">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${badge}`}><Mark className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted"><Icon className="h-3 w-3" /> {t(QUIZ_TYPE_INFO[q.type].label)}</p>
                <p className="whitespace-pre-wrap text-[13px] font-bold text-ink">{i + 1}. {q.text}</p>
                {q.image && images[q.image] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={images[q.image]} alt="" className="mt-2 max-h-40 rounded-xl border border-line object-contain" />
                )}
                <div className="mt-2 space-y-1 text-[12px]">
                  <p><span className="text-muted">{t("Răspuns dat")}:</span> <span className="whitespace-pre-wrap font-bold text-ink">{given || "—"}</span></p>
                  {reveal && state !== "right" && q.type !== "open" && correctText(q) && <p><span className="text-muted">{t("Răspuns corect")}:</span> <span className="font-bold text-[#1b8a5a]">{correctText(q)}</span></p>}
                  {reveal && q.explanation && <p className="rounded-lg bg-white/70 px-2.5 py-1.5 text-ink"><span className="font-bold">{t("Explicație")}:</span> {q.explanation}</p>}
                  {feedback[q.id] && <p className="rounded-lg bg-white/70 px-2.5 py-1.5 text-ink"><span className="font-bold">{t("Comentariul profesorului")}:</span> {feedback[q.id]}</p>}
                  {state === "pending" && <p className="font-bold text-muted">{t("Se verifică de profesor")}</p>}
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-extrabold text-muted">{got ?? "?"}/{q.points}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
