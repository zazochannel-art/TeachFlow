import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/data/workspace";
import { aiConfigured, aiErrorMessage } from "@/lib/ai/claude";
import { assistQuestion, generateQuestions, suggestOpenMark, variantQuestions } from "@/lib/ai/quiz-ai";
import { QUIZ_TYPES, storedQuestions } from "@/lib/quiz";
import type { QuizType } from "@/types/database";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ctx = z.object({
  title: z.string().max(160).optional(),
  subject: z.string().max(80).optional(),
  level: z.string().max(80).optional(),
  language: z.string().max(40).optional(),
  topic: z.string().max(200).optional(),
  difficulty: z.string().max(10).optional()
});

const body = z.discriminatedUnion("action", [
  ctx.extend({
    action: z.literal("generate"),
    description: z.string().max(4000),
    count: z.number().int().min(1).max(50),
    types: z.array(z.string()).max(9),
    keep: z.array(z.string().max(2000)).max(100).optional()
  }),
  ctx.extend({ action: z.literal("assist"), question: z.unknown(), command: z.string().trim().min(1).max(1000) }),
  ctx.extend({ action: z.literal("variant"), questions: z.unknown() }),
  ctx.extend({ action: z.literal("grade"), question: z.unknown(), answer: z.string().max(5000) })
]);

/**
 * AI help for the test builder (teachers only). POST JSON with `action`:
 * generate (new questions), assist (change one question on request), variant (second version of the
 * test) or grade (suggested mark for an open answer). Returns { error } with a readable message
 * when the AI key is missing or the call fails; there is no simulated output.
 */
export async function POST(request: NextRequest) {
  const { supabase, userId } = await requireTeacher();
  if (!supabase || !userId) return NextResponse.json({ error: "Mod demonstrativ: configurează Supabase pentru a folosi AI." }, { status: 503 });
  if (!aiConfigured()) return NextResponse.json({ error: "AI nu este configurat: adaugă variabila ANTHROPIC_API_KEY în Vercel.", code: "not_configured" }, { status: 503 });

  let input: z.infer<typeof body>;
  try {
    const parsed = body.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }
  const context = { title: input.title, subject: input.subject, level: input.level, language: input.language, topic: input.topic, difficulty: input.difficulty };

  try {
    if (input.action === "generate") {
      const types = input.types.filter((t): t is QuizType => (QUIZ_TYPES as string[]).includes(t));
      if (!input.description.trim() && !input.topic?.trim()) return NextResponse.json({ error: "Descrie testul sau scrie tema." }, { status: 400 });
      return NextResponse.json(await generateQuestions({ ...context, description: input.description, count: input.count, types, keep: input.keep }));
    }
    if (input.action === "variant") {
      const qs = storedQuestions(input.questions).slice(0, 50);
      if (!qs.length) return NextResponse.json({ error: "Adaugă cel puțin o întrebare." }, { status: 400 });
      return NextResponse.json(await variantQuestions(qs, context));
    }
    // The question may still be half-written while the teacher edits it, so it is read leniently.
    const question = storedQuestions([input.question])[0];
    if (!question || (!question.text.trim() && input.action === "grade")) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
    if (input.action === "assist") return NextResponse.json(await assistQuestion(question, input.command, context));
    if (question.type !== "open") return NextResponse.json({ error: "Date invalide." }, { status: 400 });
    return NextResponse.json(await suggestOpenMark(question, input.answer, context));
  } catch (e) {
    const { message, status } = aiErrorMessage(e);
    return NextResponse.json({ error: message }, { status });
  }
}
