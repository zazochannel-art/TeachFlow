import { cache } from "react";
import { requireTeacher } from "./workspace";

/** Teacher settings added by migration 0015 (points, invoices, public page). */
export interface TeacherExtras {
  gamification: boolean;
  invoice_name: string | null;
  invoice_code: string | null;
  invoice_address: string | null;
  invoice_bank: string | null;
  invoice_iban: string | null;
  invoice_note: string | null;
  invoice_prefix: string;
  invoice_email: boolean;
  public_enabled: boolean;
  public_slug: string | null;
  public_city: string | null;
  public_phone: string | null;
  public_prices: boolean;
}

const COLUMNS = "gamification, invoice_name, invoice_code, invoice_address, invoice_bank, invoice_iban, invoice_note, invoice_prefix, invoice_email, public_enabled, public_slug, public_city, public_phone, public_prices";

/** Null when migration 0015 is not applied yet (or in demo mode). */
export const loadTeacherExtras = cache(async (): Promise<TeacherExtras | null> => {
  const { supabase, userId } = await requireTeacher();
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from("teacher_profiles").select(COLUMNS).eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return data as unknown as TeacherExtras;
});
