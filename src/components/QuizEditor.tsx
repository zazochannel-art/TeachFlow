"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Circle, ListChecks, Plus, Square, SquareCheck, TextCursorInput, Trash2, X } from "lucide-react";
import { newId } from "@/lib/board/model";
import { useT } from "@/lib/i18n/client";
import type { QuizQuestion } from "@/types/database";

const TYPES = [
  { key: "single", label: "Un singur răspuns", icon: CheckCircle2 },
  { key: "multi", label: "Mai multe răspunsuri", icon: ListChecks },
  { key: "short", label: "Răspuns scurt", icon: TextCursorInput }
] as const;

const blank = (type: QuizQuestion["type"]): QuizQuestion => ({
  id: newId().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12) || String(Date.now()),
  type, text: "", options: type === "short" ? [] : ["", ""], correct: type === "short" ? [] : [0], accept: [], points: 1
});

/** Question builder of the quiz form; the list travels with the form as JSON in `questions`. */
export function QuizEditor({ initial }: { initial: QuizQuestion[] }) {
  const t = useT();
  const [qs, setQs] = useState<QuizQuestion[]>(initial.length ? initial : [blank("single")]);
  const update = (i: number, patch: Partial<QuizQuestion>) => setQs(list => list.map((q, n) => (n === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) => setQs(list => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });
  const setType = (i: number, type: QuizQuestion["type"]) => {
    const q = qs[i];
    if (type === "short") update(i, { type, accept: q.accept.length ? q.accept : [] });
    else update(i, { type, options: q.options.length >= 2 ? q.options : ["", ""], correct: type === "single" ? q.correct.slice(0, 1).concat(q.correct.length ? [] : [0]) : q.correct });
  };
  const toggleCorrect = (i: number, o: number) => {
    const q = qs[i];
    if (q.type === "single") update(i, { correct: [o] });
    else update(i, { correct: q.correct.includes(o) ? q.correct.filter(x => x !== o) : [...q.correct, o].sort((a, b) => a - b) });
  };
  const removeOption = (i: number, o: number) => {
    const q = qs[i];
    update(i, { options: q.options.filter((_, n) => n !== o), correct: q.correct.filter(x => x !== o).map(x => (x > o ? x - 1 : x)) });
  };
  const total = qs.reduce((s, q) => s + (Number(q.points) || 0), 0);

  return (
    <div className="sm:col-span-2">
      <input type="hidden" name="questions" value={JSON.stringify(qs)} />
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12px] font-bold text-ink">{t.n("{n} întrebare|{n} întrebări|{n} de întrebări", qs.length)} · {t.n("{n} punct|{n} puncte|{n} de puncte", total)}</p>
      </div>
      <ol className="space-y-3">
        {qs.map((q, i) => (
          <li key={q.id} className="rounded-[18px] border border-line bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-tint text-[12px] font-extrabold text-primary-2">{i + 1}</span>
              <div className="flex flex-wrap gap-1">
                {TYPES.map(({ key, label, icon: Icon }) => (
                  <button key={key} type="button" onClick={() => setType(i, key)} aria-pressed={q.type === key}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${q.type === key ? "bg-primary text-white" : "bg-soft text-muted hover:text-ink"}`}>
                    <Icon className="h-3.5 w-3.5" /> {t(label)}
                  </button>
                ))}
              </div>
              <span className="ml-auto flex items-center gap-1">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
                  {t("Puncte")}
                  <input type="number" min={0} max={100} step={0.5} value={q.points} onChange={e => update(i, { points: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                    className="tf-input w-16 px-2 py-1 text-[12px]" aria-label={t("Puncte")} />
                </label>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("Mută în sus")} className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-muted hover:bg-soft disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === qs.length - 1} aria-label={t("Mută în jos")} className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-muted hover:bg-soft disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setQs(list => list.filter((_, n) => n !== i))} disabled={qs.length === 1} aria-label={t("Șterge întrebarea")} className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-muted hover:bg-[#fdecec] hover:text-[#c03a3a] disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            </div>
            <textarea value={q.text} onChange={e => update(i, { text: e.target.value })} rows={2} maxLength={1000} required
              className="tf-input" placeholder={t("Scrie întrebarea…")} aria-label={t("Întrebarea {n}", { n: i + 1 })} />

            {q.type === "short" ? (
              <div className="mt-3">
                <label className="tf-label" htmlFor={`acc-${q.id}`}>{t("Răspunsuri acceptate (câte unul pe rând)")}</label>
                <textarea id={`acc-${q.id}`} rows={2} value={q.accept.join("\n")} onChange={e => update(i, { accept: e.target.value.split("\n").slice(0, 20) })}
                  className="tf-input" placeholder={t("ex. Chișinău")} />
                <p className="mt-1 text-[11px] text-muted">{t("Nu contează literele mari, spațiile sau diacriticele.")}</p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {q.options.map((o, n) => {
                  const right = q.correct.includes(n);
                  const Mark = q.type === "single" ? (right ? CheckCircle2 : Circle) : (right ? SquareCheck : Square);
                  return (
                    <div key={n} className="flex items-center gap-2">
                      <button type="button" onClick={() => toggleCorrect(i, n)} aria-pressed={right} title={t("Marchează ca răspuns corect")} aria-label={t("Marchează ca răspuns corect")}
                        className={`grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg ${right ? "bg-[#e7f7ef] text-[#1b8a5a]" : "text-muted hover:bg-soft"}`}><Mark className="h-[18px] w-[18px]" /></button>
                      <input value={o} onChange={e => update(i, { options: q.options.map((x, k) => (k === n ? e.target.value : x)) })} maxLength={300}
                        className={`tf-input py-2 ${right ? "border-[#9fdcbf]" : ""}`} placeholder={t("Varianta {n}", { n: n + 1 })} />
                      <button type="button" onClick={() => removeOption(i, n)} disabled={q.options.length <= 2} aria-label={t("Șterge varianta")} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-soft disabled:opacity-30"><X className="h-4 w-4" /></button>
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center gap-3">
                  {q.options.length < 10 && (
                    <button type="button" onClick={() => update(i, { options: [...q.options, ""] })} className="flex cursor-pointer items-center gap-1.5 text-[12px] font-bold text-primary-2"><Plus className="h-3.5 w-3.5" /> {t("Adaugă variantă")}</button>
                  )}
                  <span className="text-[11px] text-muted">{q.type === "single" ? t("Apasă pe cerc ca să marchezi răspunsul corect.") : t("Bifează toate răspunsurile corecte.")}</span>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      {qs.length < 100 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {TYPES.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setQs(list => [...list, blank(key)])}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-[#c9cfee] px-3 py-2 text-[12px] font-bold text-primary-2 hover:border-primary hover:bg-soft">
              <Plus className="h-3.5 w-3.5" /><Icon className="h-3.5 w-3.5" /> {t(label)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
