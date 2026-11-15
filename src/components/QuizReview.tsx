"use client";

import { Check, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { QuizQuestion } from "@/types/database";

/** A submitted quiz: every question with the given answer, the correct one and the points. */
export function QuizReview({ questions, answers, correctIds }: { questions: QuizQuestion[]; answers: Record<string, unknown> | null; correctIds: string[] }) {
  const t = useT();
  const right = new Set(correctIds);
  return (
    <ol className="space-y-3">
      {questions.map((q, i) => {
        const ok = right.has(q.id);
        const given = Array.isArray(answers?.[q.id]) ? (answers![q.id] as unknown[]) : [];
        const picked = new Set(given.map(Number));
        return (
          <li key={q.id} className={`rounded-[18px] border p-4 ${ok ? "border-[#bfe8d3] bg-[#f3fbf7]" : "border-[#f1caca] bg-[#fdf6f6]"}`}>
            <div className="flex items-start gap-3">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${ok ? "bg-[#1b8a5a]" : "bg-[#c03a3a]"}`}>{ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}</span>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-[13px] font-bold text-ink">{i + 1}. {q.text}</p>
                {q.type === "short" ? (
                  <div className="mt-2 space-y-1 text-[12px]">
                    <p><span className="text-muted">{t("Răspuns dat")}:</span> <span className="font-bold text-ink">{String(given[0] ?? "") || "—"}</span></p>
                    {!ok && <p><span className="text-muted">{t("Răspuns corect")}:</span> <span className="font-bold text-[#1b8a5a]">{q.accept.join(" / ")}</span></p>}
                  </div>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {q.options.map((o, n) => {
                      const isRight = q.correct.includes(n);
                      const chosen = picked.has(n);
                      return (
                        <li key={n} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] ${isRight ? "bg-[#e7f7ef] font-bold text-[#1b8a5a]" : chosen ? "bg-[#fdecec] text-[#c03a3a]" : "text-muted"}`}>
                          <span className="w-4 shrink-0">{chosen ? "●" : "○"}</span>
                          <span className="min-w-0 flex-1">{o}</span>
                          {isRight && <Check className="h-3.5 w-3.5 shrink-0" />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <span className="shrink-0 text-[11px] font-extrabold text-muted">{ok ? q.points : 0}/{q.points}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
