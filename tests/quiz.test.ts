import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answersFromForm, gradeQuiz, isCorrect, normAnswer, parseQuestions, percent } from "@/lib/quiz";
import type { QuizQuestion } from "@/types/database";

const q = (over: Partial<QuizQuestion>): QuizQuestion => ({ id: "q1", type: "single", text: "?", options: ["a", "b"], correct: [1], accept: [], points: 1, ...over });

describe("quiz grading", () => {
  it("grades single, multi and short answers", () => {
    const qs = [
      q({ id: "a" }),
      q({ id: "b", type: "multi", options: ["1", "2", "4"], correct: [1, 2], points: 2 }),
      q({ id: "c", type: "short", options: [], correct: [], accept: ["Chișinău"] })
    ];
    expect(gradeQuiz(qs, { a: [1], b: [2, 1], c: ["  CHISINAU. "] })).toEqual({ score: 4, max: 4, correctIds: ["a", "b", "c"] });
    expect(gradeQuiz(qs, { a: [0], b: [1], c: [""] }).score).toBe(0);
  });
  it("multi needs exactly the right set", () => {
    const m = q({ type: "multi", options: ["1", "2", "3"], correct: [0, 2] });
    expect(isCorrect(m, [0, 2])).toBe(true);
    expect(isCorrect(m, [0, 1, 2])).toBe(false);
    expect(isCorrect(m, [0])).toBe(false);
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
    expect(r).toEqual({ questions: [q({ options: ["a", "c"], correct: [1] })] });
  });
  it("rejects missing correct answers and empty lists", () => {
    expect(parseQuestions("[]")).toEqual({ error: "Adaugă cel puțin o întrebare." });
    expect("error" in parseQuestions([q({ correct: [] })])).toBe(true);
    expect("error" in parseQuestions([q({ correct: [0, 1] })])).toBe(true);
    expect("error" in parseQuestions([q({ type: "short", accept: [] })])).toBe(true);
  });
  it("reads answers from a form", () => {
    const f = new FormData();
    f.append("q_a", "1"); f.append("q_b", "0"); f.append("q_b", "2"); f.append("q_c", "Text");
    expect(answersFromForm([{ id: "a", type: "single" }, { id: "b", type: "multi" }, { id: "c", type: "short" }], f)).toEqual({ a: [1], b: [0, 2], c: ["Text"] });
  });
});

describe("migration 0013", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0013_library_quizzes_reports_push.sql", import.meta.url), "utf8");
  it("gives students no direct access to quizzes (they hold the answers)", () => {
    expect(sql).not.toMatch(/on public\.quizzes\s+for select to authenticated using \(.*my_(student|course)_ids/);
  });
});
