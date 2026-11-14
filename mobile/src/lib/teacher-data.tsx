import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { supabase } from "./supabase";
import { DEFAULT_TZ } from "./time";
import type { Course, Homework, Lesson, Message, Payment, Student, Subscription } from "./types";
import { useAutoRefresh } from "./use-auto-refresh";

export interface TeacherData {
  userId: string;
  email: string | null;
  fullName: string;
  timezone: string;
  currency: string;
  subscription: Subscription | null;
  students: Student[];
  courses: Course[];
  lessons: Lesson[];
  homework: Homework[];
  messages: Message[];
  payments: Payment[];
}

interface Ctx {
  data: TeacherData | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const TeacherDataContext = createContext<Ctx | null>(null);

/** Loads the signed-in teacher's data. RLS limits every query to rows the teacher owns. */
async function fetchTeacherData(userId: string, email: string | null): Promise<TeacherData> {
  const [profile, teacherProfile, subscription, students, courses, lessons, homework, messages, payments] = await Promise.all([
    supabase.from("profiles").select("full_name, timezone").eq("id", userId).maybeSingle(),
    supabase.from("teacher_profiles").select("currency").eq("user_id", userId).maybeSingle(),
    supabase.from("subscriptions").select("plan_code, status, current_period_end").eq("teacher_id", userId).maybeSingle(),
    supabase.from("students").select("id, full_name, email, phone, notes, status, created_at, user_id").eq("teacher_id", userId).order("full_name"),
    supabase.from("courses").select("id, title, description, subject, level, format, price, currency, is_active, created_at").eq("teacher_id", userId).order("created_at"),
    supabase.from("lessons").select("id, course_id, student_id, title, description, starts_at, ends_at, status, meeting_url").eq("teacher_id", userId).order("starts_at").limit(2000),
    supabase.from("homework").select("id, student_id, course_id, lesson_id, title, description, due_at, status, submitted_at, grade, feedback, created_at, submission").eq("teacher_id", userId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("messages").select("id, student_id, direction, body, read_at, created_at").eq("teacher_id", userId).order("created_at").limit(3000),
    supabase.from("payments").select("id, student_id, course_id, amount, currency, status, due_date, paid_at, method, note, created_at").eq("teacher_id", userId).order("created_at", { ascending: false }).limit(2000)
  ]);
  const firstError = [students, lessons].find(r => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  return {
    userId,
    email,
    fullName: profile.data?.full_name ?? "",
    timezone: profile.data?.timezone || DEFAULT_TZ,
    currency: teacherProfile.data?.currency || "MDL",
    subscription: (subscription.data as Subscription | null) ?? null,
    students: (students.data as Student[] | null) ?? [],
    courses: (courses.data as Course[] | null) ?? [],
    lessons: (lessons.data as Lesson[] | null) ?? [],
    homework: (homework.data as Homework[] | null) ?? [],
    messages: (messages.data as Message[] | null) ?? [],
    payments: ((payments.data as Payment[] | null) ?? []).map(p => ({ ...p, amount: Number(p.amount) }))
  };
}

export function TeacherDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const email = session?.user.email ?? null;
  const [data, setData] = useState<TeacherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (!userId || inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await fetchTeacherData(userId, email));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [userId, email]);

  // reload() only sets state after its first await, so this does not render synchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, [reload]);
  useAutoRefresh(reload);

  return <TeacherDataContext.Provider value={{ data, loading, error, reload }}>{children}</TeacherDataContext.Provider>;
}

export function useTeacherData() {
  const ctx = useContext(TeacherDataContext);
  if (!ctx) throw new Error("useTeacherData must be used inside TeacherDataProvider");
  return ctx;
}

/** Same as useTeacherData but only for screens rendered after the first load. */
export function useTeacher() {
  const ctx = useTeacherData();
  if (!ctx.data) throw new Error("Teacher data not loaded");
  return { ...ctx, data: ctx.data };
}
