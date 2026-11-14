import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TZ } from "@/lib/time";
import { buildDemoWorkspace } from "./demo";
import type { Course, Enrollment, Lesson, Profile, Student, Subscription, TeacherProfile } from "@/types/database";

export interface Workspace {
  /** "demo" only when Supabase env vars are missing (local preview, clearly labelled in the UI). */
  mode: "live" | "demo";
  userId: string | null;
  email: string | null;
  timezone: string;
  profile: Pick<Profile, "full_name" | "avatar_url" | "preferred_language" | "timezone"> | null;
  teacherProfile: TeacherProfile | null;
  subscription: Subscription | null;
  students: Student[];
  courses: Course[];
  enrollments: Enrollment[];
  lessons: Lesson[];
}

/**
 * Auth + role guard shared by every page in the app shell.
 * Same rules as the original dashboard page: signed-in user with role teacher/admin.
 */
export const requireTeacher = cache(async () => {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, userId: null, email: null } as const;

  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/login");

  const { data: roleRecord } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (!roleRecord || !["teacher", "admin"].includes(roleRecord.role)) redirect("/login");

  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  return { supabase, userId, email } as const;
});

/** Loads the signed-in teacher's data. RLS limits every query to rows owned by the teacher. */
export const loadWorkspace = cache(async (): Promise<Workspace> => {
  const { supabase, userId, email } = await requireTeacher();
  if (!supabase || !userId) return buildDemoWorkspace();

  const [profile, teacherProfile, subscription, students, courses, enrollments, lessons] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url, preferred_language, timezone").eq("id", userId).maybeSingle(),
    supabase.from("teacher_profiles").select("user_id, headline, bio, subject_specialties, hourly_rate, currency").eq("user_id", userId).maybeSingle(),
    supabase.from("subscriptions").select("plan_code, status, current_period_end").eq("teacher_id", userId).maybeSingle(),
    supabase.from("students").select("id, full_name, email, phone, notes, status, created_at").eq("teacher_id", userId).order("full_name"),
    supabase.from("courses").select("id, title, description, subject, level, format, price, currency, is_active, created_at").eq("teacher_id", userId).order("created_at"),
    supabase.from("course_enrollments").select("id, course_id, student_id, enrolled_at, status").eq("teacher_id", userId),
    supabase.from("lessons").select("id, course_id, student_id, title, description, starts_at, ends_at, status, meeting_url").eq("teacher_id", userId).order("starts_at").limit(2000)
  ]);

  const p = profile.data as Workspace["profile"];
  return {
    mode: "live",
    userId,
    email,
    timezone: p?.timezone || DEFAULT_TZ,
    profile: p,
    teacherProfile: (teacherProfile.data as TeacherProfile | null) ?? null,
    subscription: (subscription.data as Subscription | null) ?? null,
    students: (students.data as Student[] | null) ?? [],
    courses: (courses.data as Course[] | null) ?? [],
    enrollments: (enrollments.data as Enrollment[] | null) ?? [],
    lessons: (lessons.data as Lesson[] | null) ?? []
  };
});
