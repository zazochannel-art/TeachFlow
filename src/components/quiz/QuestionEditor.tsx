"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowDown, ArrowUp, Circle, CheckCircle2, Copy, GripVertical, ImagePlus, Loader2, Lock, LockOpen, Plus, Sparkles, Square, SquareCheck, Trash2, X
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FILES_BUCKET, storageName } from "@/lib/files";
import { QUIZ_TYPES, QUIZ_TYPE_INFO, TRUE_FALSE, blankQuestion, countBlanks, quizNum } from "@/lib/quiz";
import { useT } from "@/lib/i18n/client";
import { TYPE_ICONS } from "./icons";
import type { QuizDifficulty, QuizQuestion, QuizType } from "@/types/database";

const DIFFICULTY: Array<{ key: QuizDifficulty; label: string }> = [
  { key: "easy", label: "Ușor" }, { key: "medium", label: "Mediu" }, { key: "hard", label: "Dificil" }
];

/** Converts a question to another type, keeping what both types share. */
export function convertQuestion(q: QuizQuestion, type: QuizType): QuizQuestion {
  if (q.type === type) return q;
  const fresh = blankQuestion(type);
  const keepOptions = (type === "single" || type === "multi") && ["single", "multi", "order"].includes(q.type) && q.options.length >= 2;
  return {
    ...fresh, id: q.id, text: q.text, points: q.points, explanation: q.explanation, difficulty: q.difficulty, image: q.image,
    ...(keepOptions ? { options: q.options, correct: type === "single" ? [q.correct[0] ?? 0] : q.correct.length ? q.correct : [0] } : {})
  };
}

function NumberInput({ value, onChange, className, label, step }: { value: number | null; onChange: (v: number | null) => void; className?: string; label: string; step?: string }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  return (
    <input value={text} inputMode="decimal" step={step} aria-label={label} className={className}
      onChange={e => { setText(e.target.value); onChange(quizNum(e.target.value)); }} />
  );
}

const iconBtn = "grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-soft hover:text-ink disabled:cursor-default disabled:opacity-30";

/**
 * Editor of one question of any type. Changes go up through `onChange`; the builder keeps the list.
 * Images are uploaded straight to Storage under qz/<teacher>/<quiz>/.
 */
export function QuestionEditor({
  q, index, total, onChange, onDuplicate, onDelete, onMove, onAssist, assistOpen, locked, onToggleLock, imageFolder, imageUrl, onImageUrl, drag, children
}: {
  q: QuizQuestion; index: number; total: number;
  onChange: (q: QuizQuestion) => void; onDuplicate: () => void; onDelete: () => void; onMove: (d: -1 | 1) => void;
  onAssist: () => void; assistOpen: boolean; locked: boolean; onToggleLock: () => void;
  imageFolder: string | null; imageUrl?: string; onImageUrl: (path: string, url: string) => void;
  drag: { onDragStart: (e: DragEvent) => void; onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void; onDragEnd: () => void; over: boolean };
  children?: ReactNode;
}) {
  const t = useT();
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [handle, setHandle] = useState(false);
  const set = (patch: Partial<QuizQuestion>) => onChange({ ...q, ...patch });
  const Icon = TYPE_ICONS[q.type];

  const toggleCorrect = (o: number) => {
    if (q.type === "multi") set({ correct: q.correct.includes(o) ? q.correct.filter(x => x !== o) : [...q.correct, o].sort((a, b) => a - b) });
    else set({ correct: [o] });
  };
  const removeOption = (o: number) => set({ options: q.options.filter((_, n) => n !== o), correct: q.correct.filter(x => x !== o).map(x => (x > o ? x - 1 : x)) });
  const moveStep = (o: number, d: -1 | 1) => {
    const j = o + d;
    if (j < 0 || j >= q.options.length) return;
    const copy = [...q.options];
    [copy[o], copy[j]] = [copy[j], copy[o]];
    set({ options: copy });
  };

  const upload = async (file: File | undefined) => {
    if (!file || !imageFolder) return;
    setImgError("");
    if (!file.type.startsWith("image/")) { setImgError(t("Alege o imagine (JPG, PNG, WebP).")); return; }
    if (file.size > 5 * 1024 * 1024) { setImgError(t("Imaginea e prea mare (maxim 5 MB).")); return; }
    const supabase = createClient();
    if (!supabase) { setImgError(t("Fișierele nu se pot încărca în modul demonstrativ.")); return; }
    setUploading(true);
    const path = `${imageFolder}/${storageName(file.name, crypto.randomUUID())}`;
    const { error } = await supabase.storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) { setUploading(false); setImgError(t("Nu s-a putut încărca „{name}”.", { name: file.name })); return; }
    const { data } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(path, 3600);
    setUploading(false);
    if (data?.signedUrl) onImageUrl(path, data.signedUrl);
    set({ image: path });
    if (fileRef.current) fileRef.current.value = "";
  };

  const blanks = q.type === "fill" ? countBlanks(q.text) : 0;

  return (
    <li draggable={handle} onDragStart={drag.onDragStart} onDragOver={drag.onDragOver} onDrop={drag.onDrop} onDragEnd={() => { setHandle(false); drag.onDragEnd(); }}
      className={`rounded-[20px] border bg-white p-4 shadow-card transition-colors sm:p-5 ${drag.over ? "border-primary ring-2 ring-primary/20" : "border-line"}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onMouseDown={() => setHandle(true)} onMouseUp={() => setHandle(false)} onTouchStart={() => setHandle(true)}
          className="hidden h-8 w-6 cursor-grab place-items-center text-muted hover:text-ink active:cursor-grabbing sm:grid" aria-label={t("Trage pentru a schimba ordinea")} title={t("Trage pentru a schimba ordinea")}>
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-tint text-[12px] font-extrabold text-primary-2">{index + 1}</span>
        <label className="relative flex items-center">
          <Icon className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-primary-2" />
          <select value={q.type} onChange={e => onChange(convertQuestion(q, e.target.value as QuizType))} aria-label={t("Tipul întrebării")}
            className="tf-input w-auto py-1.5 pl-8 pr-8 text-[12px] font-bold">
            {QUIZ_TYPES.map(k => <option key={k} value={k}>{t(QUIZ_TYPE_INFO[k].label)}</option>)}
          </select>
        </label>
        <select value={q.difficulty ?? ""} onChange={e => set({ difficulty: (e.target.value || null) as QuizDifficulty | null })} aria-label={t("Dificultate")}
          className="tf-input w-auto py-1.5 text-[12px]">
          <option value="">{t("Dificultate")}</option>
          {DIFFICULTY.map(d => <option key={d.key} value={d.key}>{t(d.label)}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
          {t("Puncte")}
          <NumberInput value={q.points} onChange={v => set({ points: Math.max(0, Math.min(100, v ?? 0)) })} label={t("Puncte")} className="tf-input w-16 px-2 py-1.5 text-[12px]" />
        </label>
        <span className="ml-auto flex flex-wrap items-center gap-0.5">
          <button type="button" onClick={onAssist} aria-pressed={assistOpen} title={t("Asistent AI")}
            className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold ${assistOpen ? "bg-primary text-white" : "bg-tint text-primary-2 hover:bg-[#dfe3ff]"}`}>
            <Sparkles className="h-3.5 w-3.5" /> {t("AI")}
          </button>
          <button type="button" onClick={onToggleLock} className={iconBtn} title={locked ? t("Păstrată la regenerare") : t("Poate fi înlocuită la regenerare")} aria-label={locked ? t("Păstrată la regenerare") : t("Poate fi înlocuită la regenerare")}>
            {locked ? <Lock className="h-3.5 w-3.5 text-primary-2" /> : <LockOpen className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className={iconBtn} aria-label={t("Mută în sus")}><ArrowUp className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className={iconBtn} aria-label={t("Mută în jos")}><ArrowDown className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onDuplicate} className={iconBtn} aria-label={t("Duplică întrebarea")} title={t("Duplică întrebarea")}><Copy className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onDelete} className={`${iconBtn} hover:bg-[#fdecec] hover:text-[#c03a3a]`} aria-label={t("Șterge întrebarea")} title={t("Șterge întrebarea")}><Trash2 className="h-3.5 w-3.5" /></button>
        </span>
      </div>

      <textarea value={q.text} onChange={e => set({ text: e.target.value })} rows={2} maxLength={2000}
        className="tf-input" placeholder={q.type === "fill" ? t("ex. Capitala Franței este ___.") : t("Scrie întrebarea…")} aria-label={t("Întrebarea {n}", { n: index + 1 })} />

      {(q.image || imageFolder) && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {q.image && (
            <span className="relative inline-block">
              {imageUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={imageUrl} alt="" className="max-h-40 rounded-xl border border-line object-contain" />
                : <span className="block rounded-xl bg-soft px-3 py-2 text-[11px] text-muted">{t("Imagine atașată")}</span>}
              <button type="button" onClick={() => set({ image: null })} aria-label={t("Scoate imaginea")}
                className="absolute -right-2 -top-2 grid h-6 w-6 cursor-pointer place-items-center rounded-full bg-white text-muted shadow-card hover:text-[#c03a3a]"><X className="h-3.5 w-3.5" /></button>
            </span>
          )}
          {!q.image && imageFolder && (
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold text-muted hover:bg-soft hover:text-ink">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} {t("Adaugă imagine")}
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={e => upload(e.target.files?.[0])} disabled={uploading} />
            </label>
          )}
          {imgError && <span className="text-[11px] font-semibold text-[#c03a3a]">{imgError}</span>}
        </div>
      )}

      <div className="mt-3">
        {(q.type === "single" || q.type === "multi" || q.type === "truefalse") && (
          <div className="space-y-2">
            {q.options.map((o, n) => {
              const right = q.correct.includes(n);
              const Mark = q.type === "multi" ? (right ? SquareCheck : Square) : (right ? CheckCircle2 : Circle);
              return (
                <div key={n} className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleCorrect(n)} aria-pressed={right} title={t("Marchează ca răspuns corect")} aria-label={t("Marchează ca răspuns corect")}
                    className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg ${right ? "bg-[#e7f7ef] text-[#1b8a5a]" : "text-muted hover:bg-soft"}`}><Mark className="h-[18px] w-[18px]" /></button>
                  <input value={o} onChange={e => set({ options: q.options.map((x, k) => (k === n ? e.target.value : x)) })} maxLength={300}
                    className={`tf-input py-2 ${right ? "border-[#9fdcbf]" : ""}`} placeholder={q.type === "truefalse" ? t(TRUE_FALSE[n] ?? "") : t("Varianta {n}", { n: n + 1 })} />
                  {q.type !== "truefalse" && (
                    <button type="button" onClick={() => removeOption(n)} disabled={q.options.length <= 2} className={iconBtn} aria-label={t("Șterge varianta")}><X className="h-4 w-4" /></button>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-3">
              {q.type !== "truefalse" && q.options.length < 10 && (
                <button type="button" onClick={() => set({ options: [...q.options, ""] })} className="flex cursor-pointer items-center gap-1.5 text-[12px] font-bold text-primary-2"><Plus className="h-3.5 w-3.5" /> {t("Adaugă variantă")}</button>
              )}
              <span className="text-[11px] text-muted">{q.type === "multi" ? t("Bifează toate răspunsurile corecte.") : t("Apasă pe cerc ca să marchezi răspunsul corect.")}</span>
            </div>
          </div>
        )}

        {q.type === "short" && (
          <>
            <label className="tf-label" htmlFor={`acc-${q.id}`}>{t("Răspunsuri acceptate (câte unul pe rând)")}</label>
            <textarea id={`acc-${q.id}`} rows={2} value={q.accept.join("\n")} onChange={e => set({ accept: e.target.value.split("\n").slice(0, 20) })} className="tf-input" placeholder={t("ex. Chișinău")} />
            <p className="mt-1 text-[11px] text-muted">{t("Nu contează literele mari, spațiile sau diacriticele.")}</p>
          </>
        )}

        {q.type === "open" && (
          <>
            <label className="tf-label" htmlFor={`model-${q.id}`}>{t("Răspuns model și criterii de notare")}</label>
            <textarea id={`model-${q.id}`} rows={3} maxLength={3000} value={q.model_answer} onChange={e => set({ model_answer: e.target.value })} className="tf-input"
              placeholder={t("Ce trebuie să conțină un răspuns bun. AI-ul folosește textul pentru a propune o notă.")} />
            <p className="mt-1 text-[11px] text-muted">{t("Răspunsurile deschise le notezi tu; AI-ul poate propune o notă pe care o aprobi.")}</p>
          </>
        )}

        {q.type === "fill" && (
          <div className="space-y-2">
            {blanks === 0 && <p className="rounded-xl bg-[#fff8e8] px-3 py-2 text-[11px] text-[#7a5410]">{t("Scrie ___ (trei liniuțe jos) în text acolo unde elevul completează.")}</p>}
            {Array.from({ length: blanks }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-[11px] font-bold text-muted">{t("Spațiul {n}", { n: i + 1 })}</span>
                <input value={(q.blanks[i] ?? []).join(" / ")} maxLength={600}
                  onChange={e => { const next = Array.from({ length: blanks }, (_, k) => q.blanks[k] ?? [""]); next[i] = e.target.value.split("/").map(s => s.trim()).slice(0, 10); set({ blanks: next }); }}
                  className="tf-input py-2" placeholder={t("Răspuns corect (variante separate prin /)")} />
              </div>
            ))}
          </div>
        )}

        {q.type === "match" && (
          <div className="space-y-2">
            {q.pairs.map((p, n) => (
              <div key={n} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                <input value={p.left} maxLength={200} onChange={e => set({ pairs: q.pairs.map((x, k) => (k === n ? { ...x, left: e.target.value } : x)) })} className="tf-input py-2" placeholder={t("Element")} />
                <span className="text-[12px] font-bold text-muted">→</span>
                <input value={p.right} maxLength={200} onChange={e => set({ pairs: q.pairs.map((x, k) => (k === n ? { ...x, right: e.target.value } : x)) })} className="tf-input py-2" placeholder={t("Perechea corectă")} />
                <button type="button" onClick={() => set({ pairs: q.pairs.filter((_, k) => k !== n) })} disabled={q.pairs.length <= 2} className={iconBtn} aria-label={t("Șterge perechea")}><X className="h-4 w-4" /></button>
              </div>
            ))}
            {q.pairs.length < 10 && <button type="button" onClick={() => set({ pairs: [...q.pairs, { left: "", right: "" }] })} className="flex cursor-pointer items-center gap-1.5 text-[12px] font-bold text-primary-2"><Plus className="h-3.5 w-3.5" /> {t("Adaugă pereche")}</button>}
            <p className="text-[11px] text-muted">{t("Elevul vede partea dreaptă amestecată.")}</p>
          </div>
        )}

        {q.type === "order" && (
          <div className="space-y-2">
            {q.options.map((o, n) => (
              <div key={n} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-[12px] font-extrabold text-primary-2">{n + 1}.</span>
                <input value={o} maxLength={300} onChange={e => set({ options: q.options.map((x, k) => (k === n ? e.target.value : x)) })} className="tf-input py-2" placeholder={t("Pasul {n}", { n: n + 1 })} />
                <button type="button" onClick={() => moveStep(n, -1)} disabled={n === 0} className={iconBtn} aria-label={t("Mută în sus")}><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => moveStep(n, 1)} disabled={n === q.options.length - 1} className={iconBtn} aria-label={t("Mută în jos")}><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => set({ options: q.options.filter((_, k) => k !== n) })} disabled={q.options.length <= 2} className={iconBtn} aria-label={t("Șterge pasul")}><X className="h-4 w-4" /></button>
              </div>
            ))}
            {q.options.length < 10 && <button type="button" onClick={() => set({ options: [...q.options, ""] })} className="flex cursor-pointer items-center gap-1.5 text-[12px] font-bold text-primary-2"><Plus className="h-3.5 w-3.5" /> {t("Adaugă pas")}</button>}
            <p className="text-[11px] text-muted">{t("Scrie pașii în ordinea corectă; elevul îi vede amestecați.")}</p>
          </div>
        )}

        {q.type === "numeric" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="tf-label">{t("Rezultat corect")}</label>
              <NumberInput value={q.answer_num} onChange={v => set({ answer_num: v })} label={t("Rezultat corect")} className="tf-input" />
            </div>
            <div>
              <label className="tf-label">{t("Toleranță (±)")}</label>
              <NumberInput value={q.tolerance} onChange={v => set({ tolerance: Math.max(0, v ?? 0) })} label={t("Toleranță (±)")} className="tf-input" />
            </div>
            <div>
              <label className="tf-label" htmlFor={`unit-${q.id}`}>{t("Unitate (opțional)")}</label>
              <input id={`unit-${q.id}`} value={q.unit} maxLength={30} onChange={e => set({ unit: e.target.value })} className="tf-input" placeholder={t("ex. cm²")} />
            </div>
          </div>
        )}
      </div>

      <details className="mt-3 group" open={!!q.explanation}>
        <summary className="cursor-pointer text-[11px] font-bold text-muted hover:text-ink">{t("Explicația răspunsului")}</summary>
        <textarea value={q.explanation} onChange={e => set({ explanation: e.target.value })} rows={2} maxLength={3000} className="tf-input mt-2"
          placeholder={t("De ce este corect răspunsul (elevul o vede după test, dacă permiți).")} />
      </details>
      {children}
    </li>
  );
}
