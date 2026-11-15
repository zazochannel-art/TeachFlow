import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blankQuestion, cleanAnswers, correctText, gradeQuiz, isCorrect, normAnswer, parseQuestions, percent, quizStats, storedQuestions, toPublic } from "@/lib/quiz";
import type { QuizQuestion } from "@/types/database";

const q = (over: Partial<QuizQuestion>): QuizQuestion => ({ ...blankQuestion(over.type ?? "single"), id: "q1", text: "?", options: ["a", "b"], correct: [1], ...over });
const sql14 = readFileSync(new URL("../supabase/migrations/0014_ai_quiz_builder.sql", import.meta.url), "utf8");

describe("quiz grading", () => {
  it("grades single, multi and short answers", () => {
    const qs = [
      q({ id: "a" }),
      q({ id: "b", type: "multi", options: ["1", "2", "4"], correct: [1, 2], points: 2 }),
      q({ id: "c", type: "short", options: [], correct: [], accept: ["Chișinău"] })
    ];
    const r = gradeQuiz(qs, { a: [1], b: [2, 1], c: ["  CHISINAU. "] });
    expect(r).toMatchObject({ score: 4, max: 4, correctIds: ["a", "b", "c"], review: false });
    expect(gradeQuiz(qs, { a: [0], b: [1], c: [""] }).score).toBe(0);
  });
  it("multi needs exactly the right set", () => {
    const m = q({ type: "multi", options: ["1", "2", "3"], correct: [0, 2] });
    expect(isCorrect(m, [0, 2])).toBe(true);
    expect(isCorrect(m, [0, 1, 2])).toBe(false);
    expect(isCorrect(m, [0])).toBe(false);
  });
  it("grades fill, match, order and numeric", () => {
    expect(isCorrect(q({ type: "fill", text: "Capitala e ___ și râul ___", blanks: [["Chișinău"], ["Bîc", "Bac"]] }), ["chisinau", "bac"])).toBe(true);
    expect(isCorrect(q({ type: "fill", text: "___ ___", blanks: [["a"], ["b"]] }), ["a", ""])).toBe(false);
    const match = q({ type: "match", pairs: [{ left: "câine", right: "dog" }, { left: "pisică", right: "cat" }] });
    expect(isCorrect(match, ["dog", "cat"])).toBe(true);
    expect(isCorrect(match, ["cat", "dog"])).toBe(false);
    const order = q({ type: "order", options: ["unu", "doi", "trei"] });
    expect(isCorrect(order, ["unu", "doi", "trei"])).toBe(true);
    expect(isCorrect(order, ["doi", "unu", "trei"])).toBe(false);
    const num = q({ type: "numeric", answer_num: 1.5, tolerance: 0.1 });
    expect(isCorrect(num, ["1,55"])).toBe(true);
    expect(isCorrect(num, ["2"])).toBe(false);
  });
  it("open questions wait for the teacher, whose mark is clamped", () => {
    const qs = [q({ id: "a" }), q({ id: "o", type: "open", points: 3 })];
    expect(gradeQuiz(qs, { a: [1], o: ["text"] })).toMatchObject({ score: 1, max: 4, review: true });
    expect(gradeQuiz(qs, { a: [1], o: ["text"] }, { o: 9 })).toMatchObject({ score: 4, review: false, scores: { a: 1, o: 3 } });
  });
  it("normalises like private.norm_answer in SQL", () => {
    expect(normAnswer("ȘTIINȚĂ  Ăla!")).toBe("stiinta ala");
    const sql = readFileSync(new URL("../supabase/migrations/0013_library_quizzes_reports_push.sql", import.meta.url), "utf8");
    expect(sql).toContain("'ăâîșşțţáàäéèëíïóöúüçñё', 'aaissttaaaeeeiioouucnе'");
  });
  it("percent", () => {
    expect(percent(3, 4)).toBe(75);
    expect(percent(null, 4)).toBeNull();
  });
});

describe("parseQuestions", () => {
  it("drops empty options and remaps the correct index", () => {
    const r = parseQuestions(JSON.stringify([q({ options: ["a", "", "c"], correct: [2] })]));
    expect("questions" in r && r.questions[0]).toMatchObject({ options: ["a", "c"], correct: [1] });
  });
  it("rejects incomplete answer keys", () => {
    expect(parseQuestions("[]")).toEqual({ error: "Adaugă cel puțin o întrebare." });
    expect(parseQuestions("[]", { allowEmpty: true })).toEqual({ questions: [] });
    expect("error" in parseQuestions([q({ correct: [] })])).toBe(true);
    expect("error" in parseQuestions([q({ correct: [0, 1] })])).toBe(true);
    expect("error" in parseQuestions([q({ type: "short", accept: [] })])).toBe(true);
    expect("error" in parseQuestions([q({ type: "fill", text: "fără spații" })])).toBe(true);
    expect("error" in parseQuestions([q({ type: "match", pairs: [{ left: "a", right: "x" }] })])).toBe(true);
    expect("error" in parseQuestions([q({ type: "order", options: ["a", "a"] })])).toBe(true);
    expect("error" in parseQuestions([q({ type: "numeric", answer_num: null })])).toBe(true);
    expect("questions" in parseQuestions([q({ type: "open", options: [], correct: [] })])).toBe(true);
  });
  it("keeps only the answer key of the chosen type", () => {
    const r = parseQuestions([q({ type: "numeric", answer_num: 4, options: ["x"], correct: [0] })]);
    expect("questions" in r && r.questions[0]).toMatchObject({ answer_num: 4, options: [], correct: [] });
  });
});

describe("student view", () => {
  it("never sends the answer key", () => {
    const qs = [
      q({ id: "a", explanation: "secret" }),
      q({ id: "m", type: "match", pairs: [{ left: "1", right: "unu" }, { left: "2", right: "doi" }] }),
      q({ id: "f", type: "fill", text: "___", blanks: [["x"]] }),
      q({ id: "n", type: "numeric", answer_num: 7 })
    ];
    const pub = JSON.stringify(qs.map(x => toPublic(x)));
    for (const k of ["correct", "accept", "blanks\"", "pairs", "answer_num", "explanation", "model_answer"]) expect(pub).not.toContain(k);
    expect(toPublic(qs[1]).left).toEqual(["1", "2"]);
    expect(toPublic(qs[1]).options?.sort()).toEqual(["doi", "unu"]);
  });
  it("cleans answers to the expected shape", () => {
    expect(cleanAnswers([{ id: "a", type: "single" }, { id: "s", type: "short" }], { a: ["1"], s: ["x".repeat(5000)], z: [1] }))
      .toEqual({ a: [1], s: ["x".repeat(500)] });
  });
  it("reads stored questions leniently", () => {
    expect(storedQuestions([{ id: "x", text: "t" }])[0]).toMatchObject({ type: "single", points: 1, blanks: [], pairs: [] });
    expect(correctText(q({ type: "match", pairs: [{ left: "a", right: "b" }] }))).toBe("a → b");
  });
});

describe("statistics", () => {
  it("average, extremes, pass rate and hardest questions", () => {
    const qs = [q({ id: "a" }), q({ id: "b" })];
    const s = quizStats(qs, [
      { score: 2, max_score: 2, question_scores: { a: 1, b: 1 }, needs_review: false },
      { score: 1, max_score: 2, question_scores: { a: 1, b: 0 }, needs_review: true },
      { score: 0, max_score: 2, question_scores: { a: 0, b: 0 }, needs_review: false }
    ], 50);
    expect(s).toMatchObject({ submitted: 3, average: 50, best: 100, worst: 0, passRate: 67, toReview: 1 });
    expect(s.questions.map(x => [x.id, x.rate])).toEqual([["b", 33], ["a", 67]]);
  });
});

describe("migration 0014", () => {
  it("gives students no access to attempts (they hold the answer key)", () => {
    const policies = sql14.match(/create policy [^;]+on public\.quiz_attempts[^;]+;/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) expect(p).not.toMatch(/my_student_ids|students s|for (insert|update|all)/);
  });
  it("moves the snapshot out of quiz_assignments, which students can read", () => {
    expect(sql14).toMatch(/update public\.quiz_assignments set questions = null/);
  });
  it("keeps the public functions away from anonymous users", () => {
    expect(sql14).toMatch(/from public, anon;/);
  });
});
