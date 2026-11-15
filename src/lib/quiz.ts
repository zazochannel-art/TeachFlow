import { z } from "zod";
import type { PublicQuestion, QuizDifficulty, QuizQuestion, QuizStatus, QuizType } from "@/types/database";

// Quizzes (migrations 0013 + 0014). The database grades a submission in submit_quiz() with
// private.quiz_check(); gradeQuiz() below follows the same rules so the app can explain a result
// and the rules are covered by tests.

export const MAX_QUESTIONS = 100;
export const MAX_OPTIONS = 10;

export const QUIZ_TYPES: QuizType[] = ["single", "multi", "truefalse", "short", "open", "fill", "match", "order", "numeric"];
export const isQuizType = (v: unknown): v is QuizType => typeof v === "string" && (QUIZ_TYPES as string[]).includes(v);

/** Label and short description of each question type (Romanian source text, translated with t()). */
export const QUIZ_TYPE_INFO: Record<QuizType, { label: string; hint: string }> = {
  single: { label: "Alegere multiplă", hint: "Un singur răspuns corect" },
  multi: { label: "Răspunsuri multiple", hint: "Mai multe variante corecte" },
  truefalse: { label: "Adevărat sau fals", hint: "Elevul alege între două variante" },
  short: { label: "Răspuns scurt", hint: "Un cuvânt sau o expresie" },
  open: { label: "Întrebare deschisă", hint: "Răspuns liber, notat de profesor" },
  fill: { label: "Completează spațiile", hint: "Cuvinte lipsă marcate cu ___" },
  match: { label: "Asociază perechile", hint: "Leagă fiecare element de perechea lui" },
  order: { label: "Ordonează pașii", hint: "Aranjează în ordinea corectă" },
  numeric: { label: "Problemă cu calcul", hint: "Rezultat numeric, cu toleranță" }
};

export const STATUS_LABEL: Record<QuizStatus, string> = { draft: "Ciornă", published: "Publicat", finished: "Finalizat", archived: "Arhivat" };
export const STATUS_TONE: Record<QuizStatus, "gray" | "blue" | "green" | "amber"> = { draft: "gray", published: "blue", finished: "green", archived: "amber" };

export const TRUE_FALSE = ["Adevărat", "Fals"];
export const BLANK_RE = /_{3,}/g;
export const countBlanks = (text: string) => (text.match(BLANK_RE) ?? []).length;
/** "a ___ b" -> ["a ", " b"]: text pieces around the blanks. */
export const fillParts = (text: string) => text.split(BLANK_RE);

export function newQuestionId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function blankQuestion(type: QuizType): QuizQuestion {
  const base: QuizQuestion = {
    id: newQuestionId(), type, text: "", options: [], correct: [], accept: [], blanks: [], pairs: [],
    answer_num: null, tolerance: 0, unit: "", model_answer: "", explanation: "", difficulty: null, image: null, points: 1
  };
  if (type === "single" || type === "multi") return { ...base, options: ["", ""], correct: [0] };
  if (type === "truefalse") return { ...base, options: [...TRUE_FALSE], correct: [0] };
  if (type === "fill") return { ...base, blanks: [[""]] };
  if (type === "match") return { ...base, pairs: [{ left: "", right: "" }, { left: "", right: "" }] };
  if (type === "order") return { ...base, options: ["", "", ""] };
  if (type === "open") return { ...base, points: 2 };
  return base;
}

const str = (max: number) => z.string().trim().max(max);
const questionSchema = z.object({
  id: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(["single", "multi", "truefalse", "short", "open", "fill", "match", "order", "numeric"]),
  text: z.string().trim().min(1, "Fiecare întrebare are nevoie de un text.").max(2000, "O întrebare e prea lungă."),
  options: z.array(str(300)).max(MAX_OPTIONS, "Cel mult 10 variante la o întrebare.").default([]),
  correct: z.array(z.number().int().min(0).max(MAX_OPTIONS - 1)).max(MAX_OPTIONS).default([]),
  accept: z.array(str(200)).max(20).default([]),
  blanks: z.array(z.array(str(200)).max(10)).max(10, "Cel mult 10 spații libere la o întrebare.").default([]),
  pairs: z.array(z.object({ left: str(200), right: str(200) })).max(MAX_OPTIONS, "Cel mult 10 perechi la o întrebare.").default([]),
  answer_num: z.number().finite().nullable().default(null),
  tolerance: z.number().finite().min(0).max(1e9).default(0),
  unit: str(30).default(""),
  model_answer: str(3000).default(""),
  explanation: str(3000).default(""),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().default(null),
  image: z.string().max(400).regex(/^qz\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/).nullable().default(null),
  points: z.number().min(0).max(100).default(1)
});

/** Validates the question list sent by the editor (JSON). Returns a Romanian message key on error. */
export function parseQuestions(raw: unknown, opts: { allowEmpty?: boolean } = {}): { questions: QuizQuestion[] } | { error: string } {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try { list = JSON.parse(raw || "[]"); } catch { return { error: "Întrebările nu au putut fi citite." }; }
  }
  const parsed = z.array(questionSchema).max(MAX_QUESTIONS, "Cel mult 100 de întrebări.").safeParse(list);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Întrebările nu au putut fi citite." };
  if (!parsed.data.length && !opts.allowEmpty) return { error: "Adaugă cel puțin o întrebare." };

  const ids = new Set<string>();
  const out: QuizQuestion[] = [];
  for (const raw of parsed.data) {
    const q: QuizQuestion = { ...raw, options: [], correct: [], accept: [], blanks: [], pairs: [], answer_num: null, tolerance: 0 };
    if (ids.has(raw.id)) return { error: "Întrebările nu au putut fi citite." };
    ids.add(raw.id);
    const r = checkQuestion(raw, q);
    if (r) return { error: r };
    out.push(q);
  }
  return { questions: out };
}

/** Fills `q` with the cleaned answer key of `raw`; returns an error message key if it is incomplete. */
function checkQuestion(raw: z.infer<typeof questionSchema>, q: QuizQuestion): string | null {
  switch (raw.type) {
    case "short": {
      q.accept = [...new Set(raw.accept.filter(Boolean))];
      return q.accept.length ? null : "La un răspuns scurt, scrie cel puțin un răspuns corect.";
    }
    case "open":
      return null;
    case "numeric": {
      if (raw.answer_num == null) return "La o problemă cu calcul, scrie rezultatul corect.";
      q.answer_num = raw.answer_num;
      q.tolerance = raw.tolerance;
      return null;
    }
    case "fill": {
      const n = countBlanks(raw.text);
      if (!n) return "Marchează spațiile libere cu ___ în textul întrebării.";
      const blanks = Array.from({ length: n }, (_, i) => [...new Set((raw.blanks[i] ?? []).filter(Boolean))]);
      if (blanks.some(b => !b.length)) return "Scrie răspunsul corect pentru fiecare spațiu liber.";
      q.blanks = blanks;
      return null;
    }
    case "match": {
      const pairs = raw.pairs.filter(p => p.left || p.right);
      if (pairs.length < 2) return "Asocierea are nevoie de cel puțin 2 perechi.";
      if (pairs.some(p => !p.left || !p.right)) return "Completează ambele părți ale fiecărei perechi.";
      if (new Set(pairs.map(p => normAnswer(p.right))).size !== pairs.length) return "Partea dreaptă a perechilor trebuie să fie diferită.";
      q.pairs = pairs;
      return null;
    }
    case "order": {
      const steps = raw.options.filter(Boolean);
      if (steps.length < 2) return "Ordonarea are nevoie de cel puțin 2 pași.";
      if (new Set(steps.map(normAnswer)).size !== steps.length) return "Pașii trebuie să fie diferiți.";
      q.options = steps;
      return null;
    }
    default: {
      // single, multi, truefalse. Empty options are dropped; the correct indexes follow the kept options.
      const source = raw.type === "truefalse" ? (raw.options.filter(Boolean).length === 2 ? raw.options : TRUE_FALSE) : raw.options;
      const keep = source.map((o, i) => ({ o, i })).filter(x => x.o);
      if (keep.length < 2) return "O întrebare cu variante are nevoie de cel puțin 2 variante.";
      const correct = keep.map((x, n) => (raw.correct.includes(x.i) ? n : -1)).filter(n => n >= 0);
      if (!correct.length) return "Marchează răspunsul corect la fiecare întrebare.";
      if (raw.type !== "multi" && correct.length !== 1) return "O întrebare cu un singur răspuns are exact o variantă corectă.";
      q.options = keep.map(x => x.o);
      q.correct = correct;
      return null;
    }
  }
}

/** Same normalisation as private.norm_answer() in SQL: case, spaces, final dot and diacritics are ignored. */
export function normAnswer(s: string | null | undefined): string {
  const from = "\u0103\u00e2\u00ee\u0219\u015f\u021b\u0163\u00e1\u00e0\u00e4\u00e9\u00e8\u00eb\u00ed\u00ef\u00f3\u00f6\u00fa\u00fc\u00e7\u00f1\u0451"; // ăâîșşțţáàäéèëíïóöúüçñё
  const to = "aaissttaaaeeeiioouucnе";
  const lowered = [...(s ?? "").toLowerCase()].map(c => { const i = from.indexOf(c); return i >= 0 ? to[i] : c; }).join("");
  return lowered.replace(/\s+/g, " ").replace(/^[ .!]+|[ .!]+$/g, "");
}

/** Same as private.quiz_num(): "1,5" and " 2 " are numbers, anything else is null. */
export function quizNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(",", ".").replace(/ /g, "");
  return /^[-+]?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/** Answers as sent to submit_quiz: question id -> option indexes or texts. */
export type QuizAnswers = Record<string, Array<number | string>>;

/** true / false for automatically graded questions, null for open questions (the teacher marks them). */
export function isCorrect(q: QuizQuestion, answer: unknown): boolean | null {
  const a: unknown[] = Array.isArray(answer) ? answer : [];
  const text = (i: number) => normAnswer(a[i] == null ? "" : String(a[i]));
  switch (q.type) {
    case "open": return null;
    case "short": return text(0) !== "" && q.accept.some(x => normAnswer(x) === text(0));
    case "numeric": {
      const got = quizNum(a[0]);
      return q.answer_num != null && got != null && Math.abs(got - q.answer_num) <= Math.max(q.tolerance || 0, 0.000001);
    }
    case "fill":
      return q.blanks.length > 0 && q.blanks.every((acc, i) => text(i) !== "" && acc.some(x => normAnswer(x) === text(i)));
    case "match":
      return q.pairs.length > 0 && q.pairs.every((p, i) => text(i) === normAnswer(p.right));
    case "order":
      return q.options.length > 0 && a.length === q.options.length && q.options.every((o, i) => text(i) === normAnswer(o));
    default: {
      const picked = [...new Set(a.map(v => String(v)).filter(v => /^\d{1,3}$/.test(v)).map(Number))].sort((x, y) => x - y);
      const want = [...new Set(q.correct)].sort((x, y) => x - y);
      return want.length > 0 && picked.length === want.length && picked.every((v, i) => v === want[i]);
    }
  }
}

/** Mirrors private.quiz_grade(): manual holds the teacher's points for open questions. */
export function gradeQuiz(questions: QuizQuestion[], answers: Record<string, unknown>, manual: Record<string, unknown> = {}) {
  let score = 0;
  let max = 0;
  let review = false;
  const correctIds: string[] = [];
  const scores: Record<string, number> = {};
  for (const q of questions) {
    const pts = Math.max(0, Number.isFinite(q.points) ? q.points : 1);
    max += pts;
    const ok = isCorrect(q, answers[q.id]);
    if (ok === null) {
      const m = quizNum(manual[q.id]);
      if (m == null) { review = true; continue; }
      const got = Math.min(Math.max(m, 0), pts);
      score += got;
      scores[q.id] = got;
      if (got >= pts) correctIds.push(q.id);
    } else if (ok) {
      score += pts; scores[q.id] = pts; correctIds.push(q.id);
    } else scores[q.id] = 0;
  }
  return { score, max, correctIds, scores, review };
}

export const totalPoints = (qs: Array<{ points: number }>) => qs.reduce((s, q) => s + (Number(q.points) || 0), 0);

/** Score as a percentage (0–100), or null when there is nothing to score. */
export function percent(score: number | null | undefined, max: number | null | undefined) {
  if (score == null || !max) return null;
  return Math.round((Number(score) / Number(max)) * 100);
}

/** Cleans the answers the player sends before they go to the database. */
export function cleanAnswers(questions: Array<Pick<PublicQuestion, "id" | "type">>, raw: unknown): QuizAnswers {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: QuizAnswers = {};
  for (const q of questions) {
    const v = Array.isArray(src[q.id]) ? (src[q.id] as unknown[]).slice(0, 20) : [];
    if (q.type === "single" || q.type === "multi" || q.type === "truefalse") {
      out[q.id] = [...new Set(v.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < MAX_OPTIONS))];
    } else out[q.id] = v.map(x => String(x ?? "").slice(0, q.type === "open" ? 5000 : 500));
  }
  return out;
}

/** Whether a student answered a question at all (for the progress bar). */
export function isAnswered(q: Pick<PublicQuestion, "type">, a: unknown): boolean {
  if (!Array.isArray(a) || !a.length) return false;
  if (q.type === "single" || q.type === "multi" || q.type === "truefalse") return true;
  return a.some(x => String(x ?? "").trim() !== "");
}

const asStrings = (v: unknown) => (Array.isArray(v) ? v.map(x => String(x ?? "")) : []);
const DIFFS: QuizDifficulty[] = ["easy", "medium", "hard"];

/** Stored questions from the database (jsonb), defensively typed. Old 0013 rows get defaults. */
export function storedQuestions(raw: unknown): QuizQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(q => q && typeof q === "object").map(q => {
    const x = q as Record<string, unknown>;
    return {
      id: String(x.id ?? ""),
      type: isQuizType(x.type) ? x.type : "single",
      text: String(x.text ?? ""),
      options: asStrings(x.options),
      correct: Array.isArray(x.correct) ? x.correct.map(Number).filter(Number.isInteger) : [],
      accept: asStrings(x.accept),
      blanks: Array.isArray(x.blanks) ? x.blanks.map(asStrings) : [],
      pairs: Array.isArray(x.pairs) ? x.pairs.filter(p => p && typeof p === "object").map(p => ({ left: String((p as Record<string, unknown>).left ?? ""), right: String((p as Record<string, unknown>).right ?? "") })) : [],
      answer_num: quizNum(x.answer_num),
      tolerance: quizNum(x.tolerance) ?? 0,
      unit: String(x.unit ?? ""),
      model_answer: String(x.model_answer ?? ""),
      explanation: String(x.explanation ?? ""),
      difficulty: DIFFS.includes(x.difficulty as QuizDifficulty) ? (x.difficulty as QuizDifficulty) : null,
      image: typeof x.image === "string" && x.image ? x.image : null,
      points: typeof x.points === "number" ? x.points : 1
    } satisfies QuizQuestion;
  });
}

/** Questions as the student page receives them (no answers). */
export function publicQuestions(raw: unknown): PublicQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(q => q && typeof q === "object").map(q => {
    const x = q as Record<string, unknown>;
    return {
      id: String(x.id ?? ""),
      type: isQuizType(x.type) ? x.type : "single",
      text: String(x.text ?? ""),
      points: Number(x.points ?? 1),
      image: typeof x.image === "string" ? x.image : undefined,
      unit: typeof x.unit === "string" && x.unit ? x.unit : undefined,
      options: Array.isArray(x.options) ? asStrings(x.options) : undefined,
      left: Array.isArray(x.left) ? asStrings(x.left) : undefined,
      blanks_count: typeof x.blanks_count === "number" ? x.blanks_count : undefined
    };
  });
}

/** A student-safe copy of a full question (used by the teacher's preview). */
export function toPublic(q: QuizQuestion, seed = "preview"): PublicQuestion {
  const shuffle = (items: string[]) => [...items].sort((a, b) => hash(seed + q.id + a) - hash(seed + q.id + b));
  const base = { id: q.id, type: q.type, text: q.text, points: q.points, image: q.image ?? undefined, unit: q.unit || undefined };
  if (q.type === "single" || q.type === "multi" || q.type === "truefalse") return { ...base, options: q.options };
  if (q.type === "order") return { ...base, options: shuffle(q.options) };
  if (q.type === "match") return { ...base, left: q.pairs.map(p => p.left), options: shuffle(q.pairs.map(p => p.right)) };
  if (q.type === "fill") return { ...base, blanks_count: q.blanks.length || countBlanks(q.text) };
  return base;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Short readable form of an answer, for result tables. */
export function answerText(q: Pick<QuizQuestion, "type" | "options">, a: unknown): string {
  const v: unknown[] = Array.isArray(a) ? a : [];
  if (!v.length) return "";
  if (q.type === "single" || q.type === "multi" || q.type === "truefalse") return v.map(i => q.options[Number(i)] ?? "?").join(", ");
  if (q.type === "order") return v.map(String).join(" → ");
  return v.map(String).filter(Boolean).join(" · ");
}

/** The right answer in words (teacher review, revealed student review). */
export function correctText(q: QuizQuestion): string {
  switch (q.type) {
    case "short": return q.accept.join(" / ");
    case "numeric": return `${q.answer_num ?? ""}${q.unit ? ` ${q.unit}` : ""}${q.tolerance ? ` (±${q.tolerance})` : ""}`;
    case "fill": return q.blanks.map(b => b.join(" / ")).join(" · ");
    case "match": return q.pairs.map(p => `${p.left} → ${p.right}`).join(" · ");
    case "order": return q.options.join(" → ");
    case "open": return q.model_answer;
    default: return q.correct.map(i => q.options[i]).join(", ");
  }
}

export interface QuizStats {
  submitted: number;
  average: number | null;
  best: number | null;
  worst: number | null;
  passRate: number | null;
  toReview: number;
  /** Questions sorted from the most to the least missed. */
  questions: Array<{ id: string; text: string; answered: number; right: number; rate: number | null }>;
}

/**
 * Class statistics of one quiz from the last attempt of each student: average / best / worst
 * percentage, pass rate against the pass mark and how often each question was answered right.
 */
export function quizStats(
  questions: QuizQuestion[],
  attempts: Array<{ score: number | null; max_score: number | null; question_scores: Record<string, number>; needs_review: boolean; questions?: QuizQuestion[] }>,
  passPercent: number
): QuizStats {
  const pcs = attempts.map(a => percent(a.score, a.max_score)).filter((p): p is number => p != null);
  const byId = new Map(questions.map(q => [q.id, { id: q.id, text: q.text, answered: 0, right: 0 }]));
  for (const a of attempts) {
    for (const q of a.questions?.length ? a.questions : questions) {
      const row = byId.get(q.id);
      if (!row || !(q.id in a.question_scores)) continue;
      row.answered++;
      if (Number(a.question_scores[q.id]) >= q.points && q.points > 0) row.right++;
    }
  }
  return {
    submitted: attempts.length,
    average: pcs.length ? Math.round(pcs.reduce((s, p) => s + p, 0) / pcs.length) : null,
    best: pcs.length ? Math.max(...pcs) : null,
    worst: pcs.length ? Math.min(...pcs) : null,
    passRate: pcs.length ? Math.round((pcs.filter(p => p >= passPercent).length / pcs.length) * 100) : null,
    toReview: attempts.filter(a => a.needs_review).length,
    questions: [...byId.values()]
      .map(r => ({ ...r, rate: r.answered ? Math.round((r.right / r.answered) * 100) : null }))
      .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101))
  };
}

/** "12 min 5 s" style duration. */
export function durationLabel(sec: number | null | undefined) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}
