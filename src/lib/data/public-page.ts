import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "./workspace";
import type { Currency } from "@/types/database";
import { DEMO_PUBLIC_PAGE } from "./demo";

/** What public_teacher_page() returns (migration 0015). */
export interface PublicPage {
  teacher_id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  headline: string | null;
  bio: string | null;
  specialties: string[];
  hourly_rate: number | null;
  currency: Currency;
  city: string | null;
  phone: string | null;
  prices: boolean;
  lessons_done: number;
  students: number;
  courses: Array<{ id: string; title: string; description: string | null; subject: string | null; level: string | null; format: "individual" | "group"; color: string | null; price: number | null; currency: Currency }>;
}

/** The public page for a slug, for anyone (no account). Null when missing or switched off. */
export const loadPublicPage = cache(async (slug: string): Promise<PublicPage | null> => {
  if (!/^[a-z0-9-]{3,40}$/i.test(slug)) return null;
  const supabase = await createClient();
  if (!supabase) return slug === "demo" ? DEMO_PUBLIC_PAGE : null;
  const { data, error } = await supabase.rpc("public_teacher_page", { p_slug: slug });
  if (error || !data || typeof data !== "object") return null;
  const p = data as PublicPage;
  return {
    ...p,
    hourly_rate: p.hourly_rate == null ? null : Number(p.hourly_rate),
    specialties: Array.isArray(p.specialties) ? p.specialties : [],
    courses: (p.courses ?? []).map(c => ({ ...c, price: c.price == null ? null : Number(c.price) }))
  };
});

export interface SignupRequest {
  id: string; course_id: string | null; name: string; student_name: string | null; email: string | null; phone: string | null;
  message: string | null; status: "new" | "accepted" | "declined"; student_id: string | null; created_at: string;
}

/** The teacher's sign-up requests and which courses are shown publicly. `ready: false` before migration 0015. */
export async function loadSignupRequests(): Promise<{ ready: boolean; requests: SignupRequest[]; publicCourses: Set<string> }> {
  const { supabase, userId } = await requireTeacher();
  if (!supabase || !userId) return { ready: false, requests: [], publicCourses: new Set() };
  const [r, c] = await Promise.all([
    supabase.from("signup_requests").select("id, course_id, name, student_name, email, phone, message, status, student_id, created_at").eq("teacher_id", userId).order("created_at", { ascending: false }).limit(300),
    supabase.from("courses").select("id, is_public").eq("teacher_id", userId)
  ]);
  if (r.error || c.error) return { ready: false, requests: [], publicCourses: new Set() };
  return { ready: true, requests: (r.data ?? []) as SignupRequest[], publicCourses: new Set((c.data ?? []).filter(x => x.is_public).map(x => x.id as string)) };
}
