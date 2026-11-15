"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Clock3, Flag, Loader2, X } from "lucide-react";
import { fillParts, isAnswered } from "@/lib/quiz";
import { saveQuizAnswers, submitQuizAnswers } from "@/lib/actions/quizzes";
import { useT } from "@/lib/i18n/client";
import type { PublicQuestion } from "@/types/database";

type Answers = Record<string, Array<number | string>>;

function initialAnswers(questions: PublicQuestion[], draft: Record<string, unknown>): Answers {
  const out: Answers = {};
  for (const q of questions) {
    const d = draft[q.id];
    if (Array.isArray(d)) out[q.id] = d as Array<number | string>;
    // Order questions start in the (shuffled) order the student sees.
    else if (q.type === "order") out[q.id] = [...(q.options ?? [])];
  }
  return out;
}

function remaining(deadline: string | null, now: number) {
  return deadline ? Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000)) : null;
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * The student's test, one question at a time: timer, progress, auto-save, warning before leaving
 * and a confirmation before handing in. In `preview` mode (teacher) nothing is saved.
 */
export function QuizPlayer({ assignmentId, title, instructions, questions, draft = {}, deadlineAt = null, images = {}, preview = false, onClose }: {
  assignmentId?: string; title: string; instructions?: string | null; questions: PublicQuestion[]; draft?: Record<string, unknown>;
  deadlineAt?: string | null; images?: Record<string, string>; preview?: boolean; onClose?: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers(questions, draft));
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const dirty = useRef(false);
  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  const left = remaining(deadlineAt, now);
  const q = questions[index];
  const answeredCount = useMemo(() => questions.filter(x => isAnswered(x, answers[x.id])).length, [questions, answers]);

  const save = useCallback(async () => {
    if (preview || !assignmentId || !dirty.current) return;
    dirty.current = false;
    setSaving("saving");
    const r = await saveQuizAnswers(assignmentId, answersRef.current);
    if (r.error) { setSaving("error"); setError(r.error); } else { setSaving("saved"); setError(""); }
  }, [assignmentId, preview]);

  const submit = useCallback(async () => {
    if (preview) { setDone(true); setConfirm(false); return; }
    if (!assignmentId || submitting) return;
    setSubmitting(true);
    const r = await submitQuizAnswers(assignmentId, answersRef.current);
    if (r.error) { setError(r.error); setSubmitting(false); setConfirm(false); return; }
    setDone(true);
    router.refresh();
  }, [assignmentId, preview, router, submitting]);

  // Auto-save shortly after each change, and when the tab is hidden.
  useEffect(() => {
    if (!dirty.current) return;
    const id = setTimeout(save, 1200);
    return () => clearTimeout(id);
  }, [answers, save]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") void save(); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [save]);

  // Warning before leaving an unfinished test.
  useEffect(() => {
    if (preview || done) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [preview, done]);

  // Timer; at zero the answers are handed in automatically.
  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; }, [submit]);
  useEffect(() => {
    if (!deadlineAt || done) return;
    const id = setInterval(() => {
      const ms = Date.now();
      setNow(ms);
      if (remaining(deadlineAt, ms) === 0) { clearInterval(id); void submitRef.current(); }
    }, 1000);
    return () => clearInterval(id);
  }, [deadlineAt, done]);

  const setAnswer = (id: string, value: Array<number | string>) => {
    dirty.current = true;
    setSaving("idle");
    setAnswers(a => ({ ...a, [id]: value }));
  };

  if (done) {
    return (
      <div className="grid place-items-center rounded-[24px] bg-white p-10 text-center shadow-card">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[#e7f7ef] text-[#1b8a5a]"><Check className="h-7 w-7" /></span>
        <p className="mt-4 text-[16px] font-extrabold">{preview ? t("Previzualizare încheiată") : t("Testul a fost trimis")}</p>
        <p className="mt-1 text-[12px] text-muted">{preview ? t("Elevul vede aici nota, după ce trimite.") : t("Se încarcă rezultatul…")}</p>
        {preview && onClose && <button type="button" onClick={onClose} className="tf-btn mt-5">{t("Închide previzualizarea")}</button>}
      </div>
    );
  }
  if (!q) return null;
  const a = answers[q.id] ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-0 z-10 -mx-4 mb-4 bg-canvas/95 px-4 pb-3 pt-2 backdrop-blur sm:mx-0 sm:rounded-2xl sm:px-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold text-ink">{title}</p>
            <p className="text-[11px] text-muted">
              {t("Întrebarea {n} din {total}", { n: index + 1, total: questions.length })} · {t("{done} cu răspuns", { done: answeredCount })}
              {!preview && saving === "saving" && <> · {t("Se salvează…")}</>}
              {!preview && saving === "saved" && <> · <span className="text-[#1b8a5a]">{t("Salvat automat")}</span></>}
              {preview && <> · <span className="font-bold text-primary-2">{t("Previzualizare")}</span></>}
            </p>
          </div>
          {left != null && (
            <span className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-extrabold tabular-nums ${left <= 60 ? "bg-[#fdecec] text-[#c03a3a]" : "bg-white text-ink shadow-card"}`} role="timer" aria-label={t("Timp rămas")}>
              <Clock3 className="h-4 w-4" /> {clock(left)}
            </span>
          )}
          {preview && onClose && <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl bg-white text-muted shadow-card hover:text-ink" aria-label={t("Închide")}><X className="h-4 w-4" /></button>}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answeredCount}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
        </div>
      </div>

      {index === 0 && instructions && <p className="mb-4 whitespace-pre-wrap rounded-2xl bg-soft p-4 text-[13px] text-ink">{instructions}</p>}

      <div className="rounded-[24px] bg-white p-5 shadow-card sm:p-7">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-primary-2">{t("Întrebarea {n}", { n: index + 1 })} · {t.n("{n} punct|{n} puncte|{n} de puncte", q.points)}</p>
        {q.type !== "fill" && <p className="whitespace-pre-wrap text-[16px] font-bold leading-snug text-ink">{q.text}</p>}
        {q.image && images[q.image] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={images[q.image]} alt="" className="mt-4 max-h-72 w-auto rounded-2xl border border-line object-contain" />
        )}
        <div className="mt-5">
          <AnswerInput q={q} value={a} onChange={v => setAnswer(q.id, v)} />
        </div>
      </div>

      {error && <p role="alert" className="mt-3 text-[12px] font-semibold text-[#c03a3a]">{t(error)}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index === 0} className="tf-btn-ghost disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> {t("Înapoi")}</button>
        <span className="flex-1" />
        {index < questions.length - 1
          ? <button type="button" onClick={() => setIndex(i => Math.min(questions.length - 1, i + 1))} className="tf-btn">{t("Următoarea întrebare")} <ChevronRight className="h-4 w-4" /></button>
          : <button type="button" onClick={() => setConfirm(true)} className="tf-btn bg-[#1b8a5a] hover:bg-[#157a4e]"><Flag className="h-4 w-4" /> {t("Finalizează testul")}</button>}
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5" aria-label={t("Întrebări")}>
        {questions.map((x, n) => {
          const ok = isAnswered(x, answers[x.id]);
          return (
            <button key={x.id} type="button" onClick={() => setIndex(n)} aria-current={n === index ? "step" : undefined}
              className={`grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[11px] font-extrabold ${n === index ? "bg-primary text-white" : ok ? "bg-tint text-primary-2" : "bg-white text-muted shadow-card"}`}>{n + 1}</button>
          );
        })}
        {index < questions.length - 1 && (
          <button type="button" onClick={() => setConfirm(true)} className="ml-auto cursor-pointer rounded-lg px-3 text-[11px] font-bold text-[#1b8a5a] hover:bg-[#e7f7ef]">{t("Finalizează testul")}</button>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#1d1b4b]/40 p-4" role="dialog" aria-modal="true" aria-labelledby="quiz-confirm">
          <div className="w-full max-w-sm rounded-[24px] bg-white p-6 shadow-xl">
            <p id="quiz-confirm" className="text-[16px] font-extrabold">{t("Trimiți testul?")}</p>
            <p className="mt-2 text-[13px] text-muted">
              {answeredCount < questions.length
                ? t.n("Ai lăsat {n} întrebare fără răspuns.|Ai lăsat {n} întrebări fără răspuns.|Ai lăsat {n} de întrebări fără răspuns.", questions.length - answeredCount)
                : t("Ai răspuns la toate întrebările.")} {t("După trimitere nu mai poți schimba răspunsurile.")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(false)} className="tf-btn-ghost">{t("Mai verific")}</button>
              <button type="button" onClick={submit} disabled={submitting} className="tf-btn">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t("Trimite")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnswerInput({ q, value, onChange }: { q: PublicQuestion; value: Array<number | string>; onChange: (v: Array<number | string>) => void }) {
  const t = useT();
  const text = (i: number) => String(value[i] ?? "");
  const setAt = (i: number, v: string, len: number) => { const next = Array.from({ length: len }, (_, k) => text(k)); next[i] = v; onChange(next); };

  switch (q.type) {
    case "single": case "truefalse": case "multi": {
      const multi = q.type === "multi";
      const picked = new Set(value.map(Number));
      return (
        <div className={q.type === "truefalse" ? "grid gap-2 sm:grid-cols-2" : "space-y-2"}>
          {multi && <p className="text-[11px] text-muted">{t("Pot fi mai multe răspunsuri corecte.")}</p>}
          {(q.options ?? []).map((o, n) => {
            const on = picked.has(n);
            return (
              <button key={n} type="button" role={multi ? "checkbox" : "radio"} aria-checked={on}
                onClick={() => onChange(multi ? (on ? value.filter(v => Number(v) !== n) : [...value, n]) : [n])}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[14px] transition-colors ${on ? "border-primary bg-tint font-bold text-ink" : "border-transparent bg-soft text-ink hover:border-[#c9cfee]"}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center ${multi ? "rounded-md" : "rounded-full"} border-2 ${on ? "border-primary bg-primary text-white" : "border-[#b9bfe0] bg-white"}`}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                <span className="min-w-0 flex-1">{o}</span>
              </button>
            );
          })}
        </div>
      );
    }
    case "short":
      return <input value={text(0)} onChange={e => onChange([e.target.value])} maxLength={500} autoComplete="off" className="tf-input text-[15px]" placeholder={t("Răspunsul tău")} aria-label={t("Răspunsul tău")} />;
    case "numeric":
      return (
        <div className="flex items-center gap-2">
          <input value={text(0)} onChange={e => onChange([e.target.value])} inputMode="decimal" maxLength={40} autoComplete="off" className="tf-input max-w-xs text-[15px]" placeholder={t("Rezultatul")} aria-label={t("Rezultatul")} />
          {q.unit && <span className="text-[14px] font-bold text-muted">{q.unit}</span>}
        </div>
      );
    case "open":
      return <textarea value={text(0)} onChange={e => onChange([e.target.value])} rows={7} maxLength={5000} className="tf-input text-[14px]" placeholder={t("Scrie răspunsul tău…")} aria-label={t("Răspunsul tău")} />;
    case "fill": {
      const parts = fillParts(q.text);
      const n = q.blanks_count ?? parts.length - 1;
      return (
        <p className="text-[16px] font-bold leading-[2.4] text-ink">
          {parts.map((p, i) => (
            <span key={i}>
              <span className="whitespace-pre-wrap">{p}</span>
              {i < n && <input value={text(i)} onChange={e => setAt(i, e.target.value, n)} maxLength={200} autoComplete="off" aria-label={t("Spațiul {n}", { n: i + 1 })}
                className="mx-1 inline-block w-36 rounded-lg border-b-2 border-primary bg-tint px-2 py-1 text-center text-[14px] font-bold text-ink outline-none focus:bg-white" />}
            </span>
          ))}
        </p>
      );
    }
    case "match": {
      const lefts = q.left ?? [];
      return (
        <div className="space-y-2">
          {lefts.map((l, i) => (
            <div key={i} className="grid items-center gap-2 rounded-2xl bg-soft p-3 sm:grid-cols-[1fr_auto_1fr]">
              <span className="text-[14px] font-bold text-ink">{l}</span>
              <span className="hidden text-muted sm:inline">→</span>
              <select value={text(i)} onChange={e => setAt(i, e.target.value, lefts.length)} className="tf-input bg-white" aria-label={t("Perechea pentru „{item}”", { item: l })}>
                <option value="">{t("Alege…")}</option>
                {(q.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
      );
    }
    case "order": {
      const items = value.length ? value.map(String) : q.options ?? [];
      const move = (i: number, d: -1 | 1) => {
        const j = i + d;
        if (j < 0 || j >= items.length) return;
        const next = [...items];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
      };
      return (
        <ol className="space-y-2">
          <p className="text-[11px] text-muted">{t("Mută elementele în ordinea corectă.")}</p>
          {items.map((it, i) => (
            <li key={it + i} className="flex items-center gap-2 rounded-2xl bg-soft px-3 py-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-[12px] font-extrabold text-primary-2">{i + 1}</span>
              <span className="min-w-0 flex-1 text-[14px] font-bold text-ink">{it}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-white text-muted hover:text-ink disabled:opacity-30" aria-label={t("Mută în sus")}><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl bg-white text-muted hover:text-ink disabled:opacity-30" aria-label={t("Mută în jos")}><ArrowDown className="h-4 w-4" /></button>
            </li>
          ))}
        </ol>
      );
    }
    default:
      return null;
  }
}
