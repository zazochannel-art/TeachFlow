import Anthropic from "@anthropic-ai/sdk";

// Server-only access to Claude (Anthropic API). The key lives in an environment variable and
// never reaches the browser: ANTHROPIC_API_KEY (or AI_API_KEY). AI_MODEL can pick another model.

export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5-5";

export function aiKey() {
  return process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || "";
}

export const aiConfigured = () => aiKey().length > 0;

let client: Anthropic | null = null;
export function claude() {
  if (!client) client = new Anthropic({ apiKey: aiKey(), maxRetries: 2, timeout: 280_000 });
  return client;
}

/** Error raised for problems the teacher should see; `message` is a Romanian message key. */
export class AiError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

/** Maps SDK errors to messages a teacher understands. */
export function aiErrorMessage(e: unknown): { message: string; status: number } {
  if (e instanceof AiError) return { message: e.message, status: e.status };
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return { message: "Cheia AI nu este validă. Verifică variabila ANTHROPIC_API_KEY în Vercel.", status: 503 };
  }
  if (e instanceof Anthropic.RateLimitError) return { message: "Prea multe cereri către AI. Încearcă din nou peste un minut.", status: 429 };
  if (e instanceof Anthropic.BadRequestError) {
    const credit = /credit|billing|balance/i.test(e.message);
    return { message: credit ? "Contul AI nu are credit. Verifică facturarea în consola Anthropic." : "Cererea către AI nu a fost acceptată. Încearcă o descriere mai scurtă.", status: 400 };
  }
  if (e instanceof Anthropic.APIConnectionError) return { message: "Serviciul AI nu răspunde acum. Încearcă din nou.", status: 503 };
  if (e instanceof Anthropic.InternalServerError) return { message: "Serviciul AI este ocupat. Încearcă din nou peste câteva momente.", status: 503 };
  if (e instanceof Anthropic.APIError) return { message: "Serviciul AI a răspuns cu o eroare. Încearcă din nou.", status: 502 };
  console.error("ai error", e instanceof Error ? e.message : e);
  return { message: "Generarea nu a reușit. Încearcă din nou.", status: 500 };
}
