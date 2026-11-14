import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTeacher } from "@/lib/data/workspace";
import { DEFAULT_TZ } from "@/lib/time";

export interface FormState { error?: string; ok?: string }

export const DEMO_STATE: FormState = { error: "Mod demonstrativ: configurează Supabase pentru a salva date." };

/** Supabase client + user id for writes; null in demo mode. RLS still checks every row. */
export async function teacherCtx() {
  const { supabase, userId } = await requireTeacher();
  return supabase && userId ? { supabase, userId } : null;
}

export async function teacherTimezone(ctx: NonNullable<Awaited<ReturnType<typeof teacherCtx>>>) {
  const { data } = await ctx.supabase.from("profiles").select("timezone").eq("id", ctx.userId).maybeSingle();
  return (data?.timezone as string | undefined) || DEFAULT_TZ;
}

/** Optional trimmed text: "" becomes null. */
export const optText = (max: number) => z.string().trim().max(max).optional().transform(v => (v ? v : null));
export const optId = z.string().trim().optional().transform(v => (v ? v : null));
export const money = z.string().trim().min(1, "Introdu suma.").transform(v => Number(v.replace(",", "."))).refine(v => !Number.isNaN(v) && v > 0, "Suma trebuie să fie un număr pozitiv.");
export const optMoney = z.string().trim().optional().transform(v => (v ? Number(v.replace(",", ".")) : null)).refine(v => v == null || (!Number.isNaN(v) && v >= 0), "Valoarea trebuie să fie un număr pozitiv.");
export const currency = z.enum(["MDL", "EUR", "RON", "USD"]);
export const optUrl = z.string().trim().optional().transform(v => (v ? v : null)).refine(v => {
  if (!v) return true;
  try { const u = new URL(v); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}, "Linkul trebuie să înceapă cu https://");

export function parseForm<T extends z.ZodType>(schema: T, formData: FormData): { data: z.infer<T> } | { error: string } {
  const result = schema.safeParse(Object.fromEntries(formData));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Date invalide." };
  return { data: result.data };
}

export function refresh() {
  revalidatePath("/", "layout");
}
