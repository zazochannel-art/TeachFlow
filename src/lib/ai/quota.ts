import type { SupabaseClient } from "@supabase/supabase-js";

export type QuotaResult =
  | { ok: true; used: number; limit: number | null }
  | { ok: false; status: number; error: string; code: "quota_exceeded" | "migration_missing" | "quota_error" };

export const QUOTA_EXCEEDED_MSG = "Ai folosit toate cererile AI incluse azi în planul tău. Încearcă din nou mâine sau treci la un plan superior din pagina Abonament.";
export const QUOTA_MIGRATION_MSG = "Limita AI nu este configurată: aplică migrarea supabase/migrations/0023_ai_quota.sql.";
export const QUOTA_ERROR_MSG = "Nu am putut verifica limita AI. Încearcă din nou.";

/**
 * Charges `cost` units of the signed-in teacher's daily AI quota (migration 0023) before an AI call.
 * Fails closed: without the migration, or when the check itself fails, no AI call is made, because
 * every call is paid for on the Anthropic account.
 */
export async function consumeAiQuota(supabase: SupabaseClient, cost: number): Promise<QuotaResult> {
  const { data, error } = await supabase.rpc("consume_ai_quota", { p_cost: cost });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return { ok: false, status: 503, error: QUOTA_MIGRATION_MSG, code: "migration_missing" };
    console.error("ai quota error", error.code ?? "", error.message);
    return { ok: false, status: 503, error: QUOTA_ERROR_MSG, code: "quota_error" };
  }
  const r = (data ?? {}) as { allowed?: boolean; used?: number; limit?: number | null };
  if (!r.allowed) return { ok: false, status: 429, error: QUOTA_EXCEEDED_MSG, code: "quota_exceeded" };
  return { ok: true, used: Number(r.used ?? 0), limit: r.limit == null ? null : Number(r.limit) };
}
