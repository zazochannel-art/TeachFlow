import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { supabase } from "./supabase";
import { DEFAULT_TZ } from "./time";
import type { Course, Homework, Lesson, Message, Payment, Student } from "./types";
import { useAutoRefresh } from "./use-auto-refresh";

export interface StudentRecord extends Student { teacher_id: string }

export interface StudentData {
  fullName: string;
  timezone: string;
  /** One row per teacher that invited this account. */
  records: StudentRecord[];
  teachers: Record<string, string>;
  courses: Course[];
  lessons: Lesson[];
  homework: Homework[];
  messages: Message[];
  payments: Payment[];
}

interface Ctx { data: StudentData | null; loading: boolean; error: string | null; reload: () => Promise<void> }
const StudentDataContext = createContext<Ctx | null>(null);

/** Read-only portal data. RLS policies from migration 0003 limit rows to the student's own. */
async function fetchStudentData(userId: string): Promise<StudentData> {
  const [profile, records, courses, lessons, homework, messages, payments] = await Promise.all([
    supabase.from("profiles").select("full_name, timezone").eq("id", userId).maybeSingle(),
    supabase.from("students").select("id, teacher_id, full_name, email, phone, notes, status, created_at, user_id").eq("user_id", userId),
    supabase.from("courses").select("id, title, description, subject, level, format, price, currency, is_active, created_at"),
    supabase.from("lessons").select("id, course_id, student_id, title, description, starts_at, ends_at, status, meeting_url").order("starts_at").limit(1000),
    supabase.from("homework").select("id, student_id, course_id, lesson_id, title, description, due_at, status, submitted_at, grade, feedback, created_at, submission").order("created_at", { ascending: false }),
    supabase.from("messages").select("id, student_id, direction, body, read_at, created_at").order("created_at").limit(2000),
    supabase.from("payments").select("id, student_id, course_id, amount, currency, status, due_date, paid_at, method, note, created_at").order("created_at", { ascending: false })
  ]);
  if (records.error) throw new Error(records.error.message);
  const recs = (records.data as StudentRecord[] | null) ?? [];
  const teacherIds = [...new Set(recs.map(r => r.teacher_id))];
  const teachers: Record<string, string> = {};
  if (teacherIds.length) {
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", teacherIds);
    for (const t of data ?? []) teachers[t.id] = t.full_name || "Profesor";
  }
  return {
    fullName: profile.data?.full_name ?? "",
    timezone: profile.data?.timezone || DEFAULT_TZ,
    records: recs,
    teachers,
    courses: (courses.data as Course[] | null) ?? [],
    lessons: (lessons.data as Lesson[] | null) ?? [],
    homework: (homework.data as Homework[] | null) ?? [],
    messages: (messages.data as Message[] | null) ?? [],
    payments: ((payments.data as Payment[] | null) ?? []).map(p => ({ ...p, amount: Number(p.amount) }))
  };
}

export function StudentDataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [data, setData] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (!userId || inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await fetchStudentData(userId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [userId]);

  // reload() only sets state after its first await, so this does not render synchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, [reload]);
  useAutoRefresh(reload);

  return <StudentDataContext.Provider value={{ data, loading, error, reload }}>{children}</StudentDataContext.Provider>;
}

export function useStudentData() {
  const ctx = useContext(StudentDataContext);
  if (!ctx) throw new Error("useStudentData must be used inside StudentDataProvider");
  return ctx;
}
