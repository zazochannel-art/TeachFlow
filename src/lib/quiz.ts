import { z } from "zod";
import type { QuizQuestion } from "@/types/database";

// Quizzes (migration 0013). The database grades a submission in submit_quiz(); gradeQuiz() below
// follows the same rules so the app can explain a result and the rules are covered by tests.

export const MAX_QUESTIONS = 100;
export const MAX_OPTIONS = 10;

const questionSchema = z.object({
  id: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(["single", "multi", "short"]),
  text: z.string().trim().min(1, "Fiecare întrebare are nevoie de un text.").max(1000, "O întrebare e prea lungă."),
  options: z.array(z.string().trim().max(300, "O variantă de răspuns e prea lungă.")).max(MAX_OPTIONS, "Cel mult 10 variante la o întrebare.").default([]),
  correct: z.array(z.number().int().min(0).max(MAX_OPTIONS - 1)).max(MAX_OPTIONS).default([]),
  accept: z.array(z.string().trim().max(200)).max(20).default([]),
  points: z.number().min(0).max(100).default(1)
});

/** Validates the question list sent by the editor (JSON). Returns a Romanian message key on error. */
export function parseQuestions(raw: unknown): { questions: QuizQuestion[] } | { error: string } {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try { list = JSON.parse(raw || "[]"); } catch { return { error: "Întrebările nu au putut fi citite." }; }
  }
  const parsed = z.array(questionSchema).max(MAX_QUESTIONS, "Cel mult 100 de întrebări.").safeParse(list);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Întrebările nu au putut fi citite." };
  if (!parsed.data.length) return { error: "Adaugă cel puțin o întrebare." };

  const ids = new Set<string>();
  const out: QuizQuestion[] = [];
  for (const q of parsed.data) {
    if (ids.has(q.id)) return { error: "Întrebările nu au putut fi citite." };
    ids.add(q.id);
    if (q.type === "short") {
      const accept = [...new Set(q.accept.filter(Boolean))];
      if (!accept.length) return { error: "La un răspuns scurt, scrie cel puțin un răspuns corect." };
      out.push({ ...q, options: [], correct: [], accept });
      continue;
    }
    // Empty options are dropped; the correct indexes follow the kept options.
    const keep = q.options.map((o, i) => ({ o, i })).filter(x => x.o);
    if (keep.length < 2) return { error: "O întrebare cu variante are nevoie de cel puțin 2 variante." };
    const correct = keep.map((x, n) => (q.correct.includes(x.i) ? n : -1)).filter(n => n >= 0);
    if (!correct.length) return { error: "Marchează răspunsul corect la fiecare întrebare." };
    if (q.type === "single" && correct.length !== 1) return { error: "O întrebare cu un singur răspuns are exact o variantă corectă." };
    out.push({ ...q, options: keep.map(x => x.o), correct, accept: [] });
  }
  return { questions: out };
}

/** Same normalisation as private.norm_answer() in SQL: case, spaces, final dot and diacritics are ignored. */
export function normAnswer(s: string | null | undefined): string {
  const from = "\u0103\u00e2\u00ee\u0219\u015f\u021b\u0163\u00e1\u00e0\u00e4\u00e9\u00e8\u00eb\u00ed\u00ef\u00f3\u00f6\u00fa\u00fc\u00e7\u00f1\u0451"; // ăâîșşțţáàäéèëíïóöúüçñё
  const to = "aaissttaaaeeeiioouucnе";
  const lowered = [...(s ?? "").toLowerCase()].map(c => { const i = from.indexOf(c); return i >= 0 ? to[i] : c; }).join("");
  return lowered.replace(/\s+/g, " ").replace(/^[ .!]+|[ .!]+$/g, "");
}

/** Answers as sent to submit_quiz: question id -> [option indexes] or [text]. */
export type QuizAnswers = Record<string, Array<number | string>>;

export function isCorrect(q: QuizQuestion, answer: Array<number | string> | undefined): boolean {
  const a = answer ?? [];
  if (q.type === "short") {
    const given = normAnswer(String(a[0] ?? ""));
    return given !== "" && q.accept.some(x => normAnswer(x) === given);
  }
  const picked = [...new Set(a.map(Number).filter(n => Number.isInteger(n) && n >= 0))].sort((x, y) => x - y);
  const want = [...new Set(q.correct)].sort((x, y) => x - y);
  return want.length > 0 && picked.length === want.length && picked.every((v, i) => v === want[i]);
}

export function gradeQuiz(questions: QuizQuestion[], answers: QuizAnswers) {
  let score = 0;
  let max = 0;
  const correctIds: string[] = [];
  for (const q of questions) {
    const pts = Math.max(0, Number.isFinite(q.points) ? q.points : 1);
    max += pts;
    if (isCorrect(q, answers[q.id])) { score += pts; correctIds.push(q.id); }
  }
  return { score, max, correctIds };
}

/** Score as a percentage (0–100), or null when there is nothing to score. */
export function percent(score: number | null | undefined, max: number | null | undefined) {
  if (score == null || !max) return null;
  return Math.round((Number(score) / Number(max)) * 100);
}

/** Reads the answers a student filled in on the quiz form (q_<id> fields). */
export function answersFromForm(questions: Array<Pick<QuizQuestion, "id" | "type">>, form: FormData): QuizAnswers {
  const out: QuizAnswers = {};
  for (const q of questions) {
    const values = form.getAll(`q_${q.id}`).map(String);
    if (q.type === "short") out[q.id] = [String(values[0] ?? "").slice(0, 500)];
    else out[q.id] = values.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < MAX_OPTIONS);
  }
  return out;
}

/** Stored questions from the database (jsonb), defensively typed. */
export function storedQuestions(raw: unknown): QuizQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(q => q && typeof q === "object").map(q => {
    const x = q as Record<string, unknown>;
    return {
      id: String(x.id ?? ""),
      type: x.type === "multi" || x.type === "short" ? x.type : "single",
      text: String(x.text ?? ""),
      options: Array.isArray(x.options) ? x.options.map(String) : [],
      correct: Array.isArray(x.correct) ? x.correct.map(Number) : [],
      accept: Array.isArray(x.accept) ? x.accept.map(String) : [],
      points: typeof x.points === "number" ? x.points : 1
    } satisfies QuizQuestion;
  });
}
