"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CopyPlus, Eye, Loader2, Plus, Save, Send, Sparkles, X } from "lucide-react";
import { Card } from "@/components/ui-base";
import { QuestionEditor } from "./QuestionEditor";
import { QuizPlayer } from "./QuizPlayer";
import { TYPE_ICONS } from "./icons";
import { QUIZ_TYPES, QUIZ_TYPE_INFO, blankQuestion, correctText, newQuestionId, parseQuestions, toPublic, totalPoints } from "@/lib/quiz";
import { saveQuizDraft } from "@/lib/actions/quizzes";
import { useT } from "@/lib/i18n/client";
import type { Quiz, QuizQuestion, QuizType } from "@/types/database";

type Difficulty = "easy" | "medium" | "hard" | "mixed";
interface Settings {
  title: string; description: string; course_id: string; subject: string; level: string; language: string; languageOther: string;
  topic: string; count: number; difficulty: Difficulty; timed: boolean; time_limit_min: number; pass_percent: number;
  types: QuizType[]; ai_prompt: string;
}

const DIFFICULTIES: Array<{ key: Difficulty; label: string }> = [
  { key: "easy", label: "Ușor" }, { key: "medium", label: "Mediu" }, { key: "hard", label: "Dificil" }, { key: "mixed", label: "Mixt" }
];
const LANGS = [{ key: "ro", label: "Română" }, { key: "ru", label: "Rusă" }, { key: "en", label: "Engleză" }, { key: "other", label: "Altă limbă" }];
const ASSIST_PRESETS = [
  "Fă această întrebare mai dificilă.",
  "Simplifică întrebarea.",
  "Generează încă o întrebare asemănătoare.",
  "Corectează formularea.",
  "Adaugă explicația răspunsului corect.",
  "Verifică dacă răspunsul este corect."
];
const GEN_STEPS = ["Analizez cerințele…", "Scriu întrebările…", "Pregătesc variantele de răspuns…", "Verific răspunsurile corecte…", "Adaug explicațiile…"];

interface AssistState { command: string; loading: boolean; error: string; message: string; mode?: "replace" | "add" | "none"; proposals: QuizQuestion[] }

async function callAi<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T & { error?: string }> {
  try {
    const res = await fetch("/api/ai/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    const data = await res.json().catch(() => ({ error: "Serviciul AI a răspuns cu o eroare. Încearcă din nou." }));
    return res.ok ? data : { ...data, error: data.error || "Serviciul AI a răspuns cu o eroare. Încearcă din nou." };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { error: "Generarea a fost oprită." } as T & { error: string };
    return { error: "Serviciul AI nu răspunde acum. Încearcă din nou." } as T & { error: string };
  }
}

/** Compact read-only view of a proposed question (AI suggestions waiting for approval). */
function Proposal({ q }: { q: QuizQuestion }) {
  const t = useT();
  const Icon = TYPE_ICONS[q.type];
  return (
    <div className="rounded-2xl border border-[#c9cfee] bg-white p-3 text-[12px]">
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary-2"><Icon className="h-3.5 w-3.5" /> {t(QUIZ_TYPE_INFO[q.type].label)} · {t.n("{n} punct|{n} puncte|{n} de puncte", q.points)}</p>
      <p className="whitespace-pre-wrap font-bold text-ink">{q.text}</p>
      {(q.type === "single" || q.type === "multi" || q.type === "truefalse") && (
        <ul className="mt-1.5 space-y-0.5">{q.options.map((o, i) => <li key={i} className={q.correct.includes(i) ? "font-bold text-[#1b8a5a]" : "text-muted"}>{q.correct.includes(i) ? "✓" : "○"} {o}</li>)}</ul>
      )}
      {!["single", "multi", "truefalse"].includes(q.type) && correctText(q) && <p className="mt-1.5 text-[#1b8a5a]"><span className="font-bold">{t("Răspuns corect")}:</span> {correctText(q)}</p>}
      {q.explanation && <p className="mt-1.5 text-muted">{q.explanation}</p>}
    </div>
  );
}

/**
 * The AI test builder: settings, question types, generation, the question editor with an AI
 * assistant per question, preview as the student sees it, and saving (draft or go to publishing).
 * AI output is never saved on its own: every change appears in the editor or waits for approval.
 */
export function QuizBuilder({ quiz, quizId, isNew, teacherId, courses, images: initialImages, aiReady, defaultCourse }: {
  quiz: Quiz | null; quizId: string; isNew: boolean; teacherId: string | null; courses: Array<{ id: string; title: string }>;
  images: Record<string, string>; aiReady: boolean; defaultCourse?: string;
}) {
  const t = useT();
  const router = useRouter();
  const knownLang = !quiz?.language || ["ro", "ru", "en"].includes(quiz.language);
  const [s, setS] = useState<Settings>(() => ({
    title: quiz?.title ?? "", description: quiz?.description ?? "", course_id: quiz?.course_id ?? defaultCourse ?? "", subject: quiz?.subject ?? "",
    level: quiz?.level ?? "", language: knownLang ? quiz?.language || (t.lang === "ro" ? "ro" : t.lang) : "other", languageOther: knownLang ? "" : quiz?.language ?? "",
    topic: quiz?.topic ?? "", count: Math.min(50, Math.max(5, quiz?.questions.length || 10)), difficulty: (quiz?.difficulty as Difficulty) ?? "mixed",
    timed: quiz ? quiz.time_limit_min != null : true, time_limit_min: quiz?.time_limit_min ?? 30, pass_percent: quiz?.pass_percent ?? 50,
    types: quiz?.question_types?.length ? quiz.question_types : ["single", "multi", "truefalse", "short"], ai_prompt: quiz?.ai_prompt ?? ""
  }));
  const [questions, setQuestions] = useState<QuizQuestion[]>(quiz?.questions ?? []);
  const [locked, setLocked] = useState<Set<string>>(() => new Set((quiz?.questions ?? []).map(q => q.id)));
  const [images, setImages] = useState(initialImages);
  const [assist, setAssist] = useState<Record<string, AssistState>>({});
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [genError, setGenError] = useState("");
  const [genNote, setGenNote] = useState("");
  const [genMode, setGenMode] = useState<"replace" | "add">("replace");
  const [variant, setVariant] = useState<{ loading: boolean; error: string; questions: QuizQuestion[] } | null>(null);
  const [saving, setSaving] = useState<"" | "draft" | "publish" | "variant">("");
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [newRecord, setNewRecord] = useState(isNew);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewDeadline, setPreviewDeadline] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const total = totalPoints(questions);
  const language = s.language === "other" ? s.languageOther.trim() : s.language;
  const context = { title: s.title, subject: s.subject, level: s.level, language, topic: s.topic, difficulty: s.difficulty };
  const imageFolder = teacherId ? `qz/${teacherId}/${quizId}` : null;
  const validity = useMemo(() => (questions.length ? parseQuestions(questions) : null), [questions]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!generating) return;
    const id = setInterval(() => setGenStep(n => Math.min(GEN_STEPS.length - 1, n + 1)), 6000);
    return () => clearInterval(id);
  }, [generating]);

  const change = (patch: Partial<Settings>) => { setS(v => ({ ...v, ...patch })); setDirty(true); setSaved(false); };
  const editList = (fn: (list: QuizQuestion[]) => QuizQuestion[]) => { setQuestions(fn); setDirty(true); setSaved(false); };
  const lock = (id: string, on = true) => setLocked(set => { const n = new Set(set); if (on) n.add(id); else n.delete(id); return n; });
  const toggleType = (k: QuizType) => change({ types: s.types.includes(k) ? s.types.filter(x => x !== k) : [...s.types, k] });

  const generate = async () => {
    setGenError(""); setGenNote("");
    if (!s.ai_prompt.trim() && !s.topic.trim()) { setGenError("Descrie testul sau scrie tema."); return; }
    if (!s.types.length) { setGenError("Alege cel puțin un tip de întrebări."); return; }
    const keepList = questions.length && genMode === "replace" ? questions.filter(q => locked.has(q.id)) : questions;
    const count = genMode === "replace" ? Math.max(1, s.count - keepList.length) : Math.min(50, s.count);
    if (genMode === "replace" && questions.length && keepList.length >= s.count) { setGenError("Toate întrebările sunt păstrate. Deblochează unele sau mărește numărul de întrebări."); return; }
    abort.current = new AbortController();
    setGenerating(true); setGenStep(0);
    const r = await callAi<{ questions: QuizQuestion[]; dropped: number }>({
      action: "generate", ...context, description: s.ai_prompt, count, types: s.types, keep: keepList.map(q => q.text)
    }, abort.current.signal);
    setGenerating(false);
    if (r.error) { setGenError(r.error); return; }
    const fresh = r.questions ?? [];
    editList(() => [...keepList, ...fresh]);
    if (!s.title.trim() && s.topic.trim()) change({ title: s.topic.trim().slice(0, 160) });
    setGenNote(r.dropped ? t.n("Am eliminat {n} întrebare invalidă.|Am eliminat {n} întrebări invalide.|Am eliminat {n} de întrebări invalide.", r.dropped) : "");
    setTimeout(() => document.getElementById("quiz-questions")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const runAssist = async (q: QuizQuestion, command: string) => {
    if (!command.trim()) return;
    setAssist(a => ({ ...a, [q.id]: { ...(a[q.id] ?? { proposals: [], message: "" }), command, loading: true, error: "", message: "", proposals: [] } }));
    const r = await callAi<{ mode: "replace" | "add" | "none"; message: string; questions: QuizQuestion[] }>({ action: "assist", ...context, question: q, command });
    setAssist(a => ({ ...a, [q.id]: { command, loading: false, error: r.error ?? "", message: r.message ?? "", mode: r.mode, proposals: r.questions ?? [] } }));
  };
  const applyAssist = (q: QuizQuestion) => {
    const st = assist[q.id];
    if (!st?.proposals.length) return;
    if (st.mode === "replace") {
      const next = { ...st.proposals[0], id: q.id, image: q.image };
      editList(list => list.map(x => (x.id === q.id ? next : x)));
    } else {
      editList(list => { const i = list.findIndex(x => x.id === q.id); const copy = [...list]; copy.splice(i + 1, 0, ...st.proposals); return copy; });
    }
    lock(q.id);
    setAssist(a => ({ ...a, [q.id]: { ...st, proposals: [], message: t("Modificarea a fost aplicată.") } }));
  };
  const closeAssist = (id: string) => setAssist(a => { const n = { ...a }; delete n[id]; return n; });

  const makeVariant = async () => {
    setVariant({ loading: true, error: "", questions: [] });
    const r = await callAi<{ questions: QuizQuestion[] }>({ action: "variant", ...context, questions });
    setVariant({ loading: false, error: r.error ?? "", questions: r.questions ?? [] });
  };

  const payload = (extra: Record<string, unknown> = {}) => ({
    id: quizId, is_new: newRecord, title: s.title.trim(), description: s.description.trim() || null, course_id: s.course_id || null,
    subject: s.subject.trim() || null, level: s.level.trim() || null, language: language || null, topic: s.topic.trim() || null, difficulty: s.difficulty,
    time_limit_min: s.timed ? Math.min(240, Math.max(1, Math.round(s.time_limit_min))) : null, pass_percent: Math.min(100, Math.max(0, Math.round(s.pass_percent))),
    question_types: s.types, ai_prompt: s.ai_prompt.trim() || null, max_attempts: quiz?.max_attempts ?? 1, shuffle: quiz?.shuffle ?? false,
    show_answers: quiz?.show_answers ?? "after_submit", questions, ...extra
  });

  const save = async (then: "stay" | "publish") => {
    setSaveError("");
    if (!s.title.trim()) { setSaveError("Adaugă un titlu."); document.getElementById("quiz-title")?.focus(); return; }
    setSaving(then === "publish" ? "publish" : "draft");
    const r = await saveQuizDraft(payload());
    setSaving("");
    if (r.error) { setSaveError(r.error); return; }
    setNewRecord(false); setDirty(false); setSaved(true);
    if (then === "publish") router.push(`/quizzes/${r.id}?tab=publish`);
    else if (isNew) router.replace(`/quizzes/${r.id}/edit`);
    else router.refresh();
  };

  const saveVariant = async () => {
    if (!variant?.questions.length) return;
    setSaving("variant"); setSaveError("");
    const r = await saveQuizDraft(payload({ id: crypto.randomUUID(), is_new: true, variant_of: newRecord ? null : quizId, title: `${s.title.trim() || t("Test")} · B`.slice(0, 160), questions: variant.questions.map(q => ({ ...q, image: null })) }));
    setSaving("");
    if (r.error) { setSaveError(r.error); return; }
    setDirty(false);
    router.push(`/quizzes/${r.id}/edit`);
  };

  // Drag and drop reordering (desktop); the arrows do the same on phones.
  const onDrop = (to: number) => {
    if (dragFrom == null || dragFrom === to) return;
    editList(list => { const copy = [...list]; const [m] = copy.splice(dragFrom, 1); copy.splice(to, 0, m); return copy; });
    setDragFrom(null); setDragOver(null);
  };

  const field = "tf-input";
  return (
    <div className="pb-28">
      {!aiReady && (
        <div className="mb-5 flex items-start gap-3 rounded-[20px] border border-[#f3dfb3] bg-[#fff8e8] p-4 text-[12px] text-[#7a5410]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t("AI nu este configurat: adaugă variabila ANTHROPIC_API_KEY în Vercel.")} {t("Poți crea întrebările și manual, mai jos.")}</p>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-[15px] font-extrabold text-ink">{t("Configurarea testului")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="tf-label" htmlFor="quiz-title">{t("Titlul testului")}</label>
              <input id="quiz-title" value={s.title} onChange={e => change({ title: e.target.value })} maxLength={160} className={field} placeholder={t("ex. Ecuații de gradul doi · test de verificare")} />
            </div>
            <div>
              <label className="tf-label" htmlFor="quiz-subject">{t("Disciplina")}</label>
              <input id="quiz-subject" value={s.subject} onChange={e => change({ subject: e.target.value })} maxLength={80} className={field} placeholder={t("ex. Matematică")} />
            </div>
            <div>
              <label className="tf-label" htmlFor="quiz-course">{t("Cursul sau grupa")}</label>
              <select id="quiz-course" value={s.course_id} onChange={e => change({ course_id: e.target.value })} className={field}>
                <option value="">—</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="tf-label" htmlFor="quiz-level">{t("Clasa / nivelul elevilor")}</label>
              <input id="quiz-level" value={s.level} onChange={e => change({ level: e.target.value })} maxLength={80} className={field} placeholder={t("ex. clasa a IX-a, B1")} />
            </div>
            <div>
              <label className="tf-label" htmlFor="quiz-lang">{t("Limba testului")}</label>
              <div className="flex gap-2">
                <select id="quiz-lang" value={s.language} onChange={e => change({ language: e.target.value })} className={field}>
                  {LANGS.map(l => <option key={l.key} value={l.key}>{t(l.label)}</option>)}
                </select>
                {s.language === "other" && <input value={s.languageOther} onChange={e => change({ languageOther: e.target.value })} maxLength={40} className={field} placeholder={t("ex. franceză")} aria-label={t("Altă limbă")} />}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="tf-label" htmlFor="quiz-topic">{t("Tema sau capitolul")}</label>
              <input id="quiz-topic" value={s.topic} onChange={e => change({ topic: e.target.value })} maxLength={200} className={field} placeholder={t("ex. Ecuații de gradul doi, formula lui Viète")} />
            </div>
            <div>
              <label className="tf-label" htmlFor="quiz-count">{t("Numărul de întrebări")} <span className="font-extrabold text-primary-2">{s.count}</span></label>
              <input id="quiz-count" type="range" min={5} max={50} value={s.count} onChange={e => change({ count: Number(e.target.value) })} className="w-full accent-[#5269e8]" />
            </div>
            <div>
              <span className="tf-label">{t("Dificultatea")}</span>
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-soft p-1">
                {DIFFICULTIES.map(d => (
                  <button key={d.key} type="button" onClick={() => change({ difficulty: d.key })} aria-pressed={s.difficulty === d.key}
                    className={`cursor-pointer rounded-lg py-1.5 text-[11px] font-bold ${s.difficulty === d.key ? "bg-white text-primary-2 shadow-card" : "text-muted hover:text-ink"}`}>{t(d.label)}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="tf-label flex items-center justify-between" htmlFor="quiz-time">
                <span>{t("Durata")} {s.timed && <span className="font-extrabold text-primary-2">{t("{n} min", { n: s.time_limit_min })}</span>}</span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold normal-case text-muted">
                  <input type="checkbox" checked={!s.timed} onChange={e => change({ timed: !e.target.checked })} className="h-3.5 w-3.5 accent-[#5269e8]" /> {t("fără limită")}
                </span>
              </label>
              <input id="quiz-time" type="range" min={10} max={120} step={5} value={s.time_limit_min} disabled={!s.timed} onChange={e => change({ time_limit_min: Number(e.target.value) })} className="w-full accent-[#5269e8] disabled:opacity-40" />
            </div>
            <div>
              <label className="tf-label" htmlFor="quiz-pass">{t("Punctaj minim pentru promovare")} <span className="font-extrabold text-primary-2">{s.pass_percent}%</span></label>
              <input id="quiz-pass" type="range" min={0} max={100} step={5} value={s.pass_percent} onChange={e => change({ pass_percent: Number(e.target.value) })} className="w-full accent-[#5269e8]" />
            </div>
            <div className="sm:col-span-2">
              <label className="tf-label" htmlFor="quiz-instructions">{t("Instrucțiuni pentru elevi (opțional)")}</label>
              <input id="quiz-instructions" value={s.description} onChange={e => change({ description: e.target.value })} maxLength={2000} className={field} placeholder={t("ex. Citește atent fiecare întrebare. Nu folosi calculatorul.")} />
            </div>
          </div>
        </Card>

        <Card className="flex flex-col p-5 sm:p-6">
          <h2 className="mb-1 flex items-center gap-2 text-[15px] font-extrabold text-ink"><Sparkles className="h-4 w-4 text-primary" /> {t("Descrie testul")}</h2>
          <p className="mb-3 text-[12px] text-muted">{t("AI-ul creează întrebările, răspunsurile corecte, punctajul și explicațiile. Tu le verifici înainte de publicare.")}</p>
          <textarea value={s.ai_prompt} onChange={e => change({ ai_prompt: e.target.value })} rows={6} maxLength={4000}
            className="tf-input min-h-[150px] flex-1 text-[13px] leading-relaxed"
            placeholder={t("Descrie testul pe care dorești să îl creezi. Exemplu: Creează un test la matematică despre ecuațiile de gradul doi pentru clasa a IX-a.")} />
          {questions.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-soft p-1 text-[11px] font-bold">
              <button type="button" onClick={() => setGenMode("replace")} aria-pressed={genMode === "replace"} className={`cursor-pointer rounded-lg px-2 py-1.5 ${genMode === "replace" ? "bg-white text-primary-2 shadow-card" : "text-muted"}`}>{t("Regenerează, păstrând întrebările cu lacăt")}</button>
              <button type="button" onClick={() => setGenMode("add")} aria-pressed={genMode === "add"} className={`cursor-pointer rounded-lg px-2 py-1.5 ${genMode === "add" ? "bg-white text-primary-2 shadow-card" : "text-muted"}`}>{t("Adaugă întrebări noi")}</button>
            </div>
          )}
          <button type="button" onClick={generate} disabled={!aiReady || generating}
            className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#354fcb] to-[#5269e8] px-5 py-4 text-[14px] font-extrabold uppercase tracking-wide text-white shadow-lg shadow-[#5269e8]/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            {generating ? t("Se generează…") : questions.length ? (genMode === "replace" ? t("Regenerează cu AI") : t("Generează încă {n} întrebări", { n: s.count })) : t("Generează test cu AI")}
          </button>
          {genError && <p role="alert" className="mt-3 rounded-xl bg-[#fdecec] px-3 py-2 text-[12px] font-semibold text-[#c03a3a]">{t(genError)}</p>}
          {genNote && <p role="status" className="mt-3 text-[11px] text-muted">{genNote}</p>}
        </Card>
      </div>

      <Card className="mt-5 p-5 sm:p-6">
        <h2 className="mb-1 text-[15px] font-extrabold text-ink">{t("Tipuri de întrebări")}</h2>
        <p className="mb-4 text-[12px] text-muted">{t("Alege unul sau mai multe tipuri pentru generarea cu AI.")}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {QUIZ_TYPES.map(k => {
            const Icon = TYPE_ICONS[k];
            const on = s.types.includes(k);
            return (
              <button key={k} type="button" onClick={() => toggleType(k)} aria-pressed={on}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${on ? "border-primary bg-tint" : "border-line bg-white hover:border-[#c9cfee]"}`}>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${on ? "bg-primary text-white" : "bg-soft text-primary-2"}`}><Icon className="h-[18px] w-[18px]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-extrabold text-ink">{t(QUIZ_TYPE_INFO[k].label)}</span>
                  <span className="block text-[11px] text-muted">{t(QUIZ_TYPE_INFO[k].hint)}</span>
                </span>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${on ? "border-primary bg-primary text-white" : "border-[#c9cfee]"}`}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {generating && (
        <Card className="mt-5 overflow-hidden p-0">
          <div className="relative flex flex-col items-center gap-4 px-6 py-10 text-center">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-tint to-transparent opacity-70" />
            <span className="relative grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#354fcb] to-[#5269e8] text-white shadow-lg shadow-[#5269e8]/30">
              <Sparkles className="h-7 w-7 animate-[spin_3s_linear_infinite]" />
            </span>
            <div className="relative">
              <p className="text-[15px] font-extrabold text-ink">{t(GEN_STEPS[genStep])}</p>
              <p className="mt-1 text-[12px] text-muted">{t("Poate dura până la un minut pentru teste lungi.")}</p>
            </div>
            <div className="relative flex gap-1.5">{GEN_STEPS.map((_, i) => <span key={i} className={`h-1.5 w-8 rounded-full transition-colors ${i <= genStep ? "bg-primary" : "bg-line"}`} />)}</div>
            <button type="button" onClick={() => abort.current?.abort()} className="tf-btn-ghost relative px-3 py-1.5 text-[12px]"><X className="h-3.5 w-3.5" /> {t("Oprește")}</button>
          </div>
        </Card>
      )}

      <div id="quiz-questions" className="mt-6 scroll-mt-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-extrabold text-ink">{t("Întrebări")}</h2>
          <span className="rounded-full bg-tint px-2.5 py-1 text-[11px] font-extrabold text-primary-2">{t.n("{n} întrebare|{n} întrebări|{n} de întrebări", questions.length)} · {t("total {n} p", { n: total })}</span>
          <span className="flex-1" />
          {questions.length > 0 && (
            <>
              <button type="button" onClick={() => { setPreviewDeadline(s.timed ? new Date(Date.now() + s.time_limit_min * 60000).toISOString() : null); setPreview(true); }} className="tf-btn-ghost px-3 py-1.5 text-[12px]"><Eye className="h-3.5 w-3.5" /> {t("Previzualizează ca elev")}</button>
              <button type="button" onClick={makeVariant} disabled={!aiReady || variant?.loading} className="tf-btn-ghost px-3 py-1.5 text-[12px] disabled:opacity-50">
                {variant?.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />} {t("Creează a doua variantă cu AI")}
              </button>
            </>
          )}
        </div>

        {variant && !variant.loading && (variant.error || variant.questions.length > 0) && (
          <Card className="mb-4 border border-[#c9cfee] p-4">
            <div className="mb-3 flex items-center gap-2">
              <p className="flex-1 text-[13px] font-extrabold text-ink">{t("A doua variantă a testului (propunere AI)")}</p>
              <button type="button" onClick={() => setVariant(null)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-soft" aria-label={t("Închide")}><X className="h-4 w-4" /></button>
            </div>
            {variant.error && <p className="text-[12px] font-semibold text-[#c03a3a]">{t(variant.error)}</p>}
            {variant.questions.length > 0 && (
              <>
                <div className="grid max-h-[420px] gap-2 overflow-y-auto pr-1 md:grid-cols-2">{variant.questions.map(q => <Proposal key={q.id} q={q} />)}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={saveVariant} disabled={saving === "variant"} className="tf-btn">{saving === "variant" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t("Aprobă și salvează ca versiune nouă")}</button>
                  <span className="text-[11px] text-muted">{t("Testul curent rămâne neschimbat.")}</span>
                </div>
              </>
            )}
          </Card>
        )}

        {questions.length === 0 && !generating && (
          <div className="rounded-[20px] border-2 border-dashed border-[#c9cfee] p-8 text-center">
            <p className="text-[13px] font-bold text-ink">{t("Încă nu ai întrebări")}</p>
            <p className="mt-1 text-[12px] text-muted">{t("Generează testul cu AI sau adaugă întrebări manual.")}</p>
          </div>
        )}

        <ol className="space-y-3">
          {questions.map((q, i) => {
            const st = assist[q.id];
            return (
              <QuestionEditor key={q.id} q={q} index={i} total={questions.length}
                onChange={next => { editList(list => list.map(x => (x.id === q.id ? next : x))); lock(q.id); }}
                onDuplicate={() => editList(list => { const copy = [...list]; copy.splice(i + 1, 0, { ...q, id: newQuestionId() }); return copy; })}
                onDelete={() => editList(list => list.filter(x => x.id !== q.id))}
                onMove={d => editList(list => { const j = i + d; if (j < 0 || j >= list.length) return list; const copy = [...list]; [copy[i], copy[j]] = [copy[j], copy[i]]; return copy; })}
                onAssist={() => (st ? closeAssist(q.id) : setAssist(a => ({ ...a, [q.id]: { command: "", loading: false, error: "", message: "", proposals: [] } })))}
                assistOpen={!!st} locked={locked.has(q.id)} onToggleLock={() => lock(q.id, !locked.has(q.id))}
                imageFolder={imageFolder} imageUrl={q.image ? images[q.image] : undefined} onImageUrl={(p, u) => setImages(m => ({ ...m, [p]: u }))}
                drag={{
                  onDragStart: e => { setDragFrom(i); e.dataTransfer.effectAllowed = "move"; },
                  onDragOver: e => { if (dragFrom != null) { e.preventDefault(); setDragOver(i); } },
                  onDrop: e => { e.preventDefault(); onDrop(i); },
                  onDragEnd: () => { setDragFrom(null); setDragOver(null); },
                  over: dragOver === i && dragFrom !== i
                }}>
                {st && (
                  <div className="mt-4 rounded-2xl bg-soft p-3 sm:p-4">
                    <p className="mb-2 flex items-center gap-1.5 text-[12px] font-extrabold text-ink"><Sparkles className="h-3.5 w-3.5 text-primary" /> {t("Asistent AI")}</p>
                    {!aiReady ? <p className="text-[12px] text-muted">{t("AI nu este configurat: adaugă variabila ANTHROPIC_API_KEY în Vercel.")}</p> : (
                      <>
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {ASSIST_PRESETS.map(p => (
                            <button key={p} type="button" disabled={st.loading} onClick={() => runAssist(q, t(p))}
                              className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-primary-2 shadow-card hover:bg-tint disabled:opacity-50">{t(p)}</button>
                          ))}
                        </div>
                        <form onSubmit={e => { e.preventDefault(); void runAssist(q, st.command); }} className="flex gap-2">
                          <input value={st.command} onChange={e => setAssist(a => ({ ...a, [q.id]: { ...st, command: e.target.value } }))} maxLength={1000}
                            className="tf-input bg-white py-2" placeholder={t("ex. Adaptează întrebarea pentru clasa a VII-a.")} aria-label={t("Cererea pentru AI")} />
                          <button className="tf-btn shrink-0 px-3" disabled={st.loading || !st.command.trim()} aria-label={t("Trimite")}>{st.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
                        </form>
                        {st.loading && <p className="mt-2 text-[11px] text-muted">{t("AI-ul lucrează la întrebare…")}</p>}
                        {st.error && <p role="alert" className="mt-2 text-[12px] font-semibold text-[#c03a3a]">{t(st.error)}</p>}
                        {st.message && <p className="mt-2 rounded-xl bg-white px-3 py-2 text-[12px] text-ink">{st.message}</p>}
                        {st.proposals.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-[11px] font-bold text-muted">{st.mode === "replace" ? t("Propunere (înlocuiește întrebarea):") : t("Propunere (se adaugă după întrebare):")}</p>
                            {st.proposals.map(p => <Proposal key={p.id} q={p} />)}
                            <div className="flex gap-2">
                              <button type="button" onClick={() => applyAssist(q)} className="tf-btn px-3 py-1.5 text-[12px]"><Check className="h-3.5 w-3.5" /> {st.mode === "replace" ? t("Aprobă modificarea") : t("Adaugă în test")}</button>
                              <button type="button" onClick={() => setAssist(a => ({ ...a, [q.id]: { ...st, proposals: [], message: "" } }))} className="tf-btn-ghost px-3 py-1.5 text-[12px]">{t("Respinge")}</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </QuestionEditor>
            );
          })}
        </ol>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUIZ_TYPES.map(k => {
            const Icon = TYPE_ICONS[k];
            return (
              <button key={k} type="button" onClick={() => { const q = blankQuestion(k); editList(list => [...list, q]); lock(q.id); }} disabled={questions.length >= 100}
                className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-[#c9cfee] px-3 py-2 text-[11px] font-bold text-primary-2 hover:border-primary hover:bg-soft disabled:opacity-40">
                <Plus className="h-3.5 w-3.5" /><Icon className="h-3.5 w-3.5" /> {t(QUIZ_TYPE_INFO[k].label)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+70px)] z-30 px-3 md:bottom-4 md:left-[92px] md:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
          <div className="min-w-0 flex-1 text-[12px]">
            <p className="font-extrabold text-ink">{t.n("{n} întrebare|{n} întrebări|{n} de întrebări", questions.length)} · {t("total {n} p", { n: total })}</p>
            <p className={`truncate ${saveError || (validity && "error" in validity) ? "text-[#c03a3a]" : "text-muted"}`}>
              {saveError ? t(saveError) : validity && "error" in validity ? t(validity.error) : saved ? t("Salvat") : dirty ? t("Modificări nesalvate") : t("Ciornă")}
            </p>
          </div>
          <button type="button" onClick={() => save("stay")} disabled={!!saving} className="tf-btn-ghost">{saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("Salvează ciorna")}</button>
          <button type="button" onClick={() => save("publish")} disabled={!!saving || !questions.length} className="tf-btn">{saving === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("Salvează și publică")}</button>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={t("Previzualizare")}>
          <QuizPlayer preview title={s.title || t("Test")} instructions={s.description} questions={questions.map(q => toPublic(q))} images={images}
            deadlineAt={previewDeadline} onClose={() => setPreview(false)} />
        </div>
      )}
    </div>
  );
}
