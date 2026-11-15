export type AppRole = "teacher" | "student" | "admin" | "parent";
export type LessonStatus = "scheduled" | "completed" | "cancelled" | "no_show";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled" | "expired";
export type Currency = "MDL" | "EUR" | "RON" | "USD";

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  preferred_language: "ro" | "ru" | "en";
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface TeacherProfile {
  user_id: string;
  headline: string | null;
  bio: string | null;
  subject_specialties: string[];
  hourly_rate: number | null;
  currency: Currency;
  /** Migration 0004; undefined before it is applied. */
  email_reminders?: boolean;
  /** Migration 0013; undefined before it is applied. */
  parent_reports?: boolean;
}

export interface Student {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "active" | "inactive";
  created_at: string;
  /** Linked auth user once the student accepted an invite (migration 0003). */
  user_id?: string | null;
  /** Photo set by the teacher (migration 0011). */
  avatar_url?: string | null;
  /** Profile fields (migration 0012). */
  birth_date?: string | null;
  grade_level?: string | null;
  goals?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  level: string | null;
  format: "individual" | "group";
  price: number | null;
  currency: Currency;
  is_active: boolean;
  created_at: string;
  /** Colour picked by the teacher, #rrggbb (migration 0011); null = automatic. */
  color?: string | null;
}

export interface Enrollment {
  id: string;
  course_id: string;
  student_id: string;
  enrolled_at: string;
  status: "active" | "completed" | "paused";
}

export interface Lesson {
  id: string;
  course_id: string | null;
  student_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: LessonStatus;
  meeting_url: string | null;
}

export interface Subscription {
  plan_code: "free" | "starter" | "pro" | "premium";
  status: SubscriptionStatus;
  current_period_end: string | null;
}

export type HomeworkStatus = "assigned" | "submitted" | "reviewed";

export interface Homework {
  id: string;
  student_id: string;
  course_id: string | null;
  lesson_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  status: HomeworkStatus;
  submitted_at: string | null;
  grade: string | null;
  feedback: string | null;
  created_at: string;
  /** Text the student submitted from the portal (migration 0003). */
  submission?: string | null;
  /** Files the teacher attached / the student handed in (migration 0010). */
  attachments?: unknown;
  submission_files?: unknown;
}

export interface Message {
  id: string;
  student_id: string;
  direction: "outgoing" | "incoming";
  body: string;
  read_at: string | null;
  created_at: string;
  /** Conversation with the student or with the student's parents (migration 0012; missing = "student"). */
  channel?: "student" | "parent";
  /** Parent account that wrote an incoming parent message (migration 0012). */
  author_id?: string | null;
}

export interface Payment {
  id: string;
  student_id: string;
  course_id: string | null;
  amount: number;
  currency: Currency;
  status: "paid" | "pending";
  due_date: string | null;
  paid_at: string | null;
  method: "cash" | "card" | "transfer" | "other" | null;
  note: string | null;
  created_at: string;
}

/** Reusable course material (migration 0013). */
export interface LibraryItem {
  id: string;
  course_id: string | null;
  title: string;
  description: string | null;
  kind: "file" | "link";
  file: unknown;
  url: string | null;
  shared: boolean;
  created_at: string;
}

/** A quiz question (migration 0013). `correct` = option indexes, `accept` = accepted short answers. */
export interface QuizQuestion {
  id: string;
  type: "single" | "multi" | "short";
  text: string;
  options: string[];
  correct: number[];
  accept: string[];
  points: number;
}

export interface Quiz {
  id: string;
  course_id: string | null;
  title: string;
  description: string | null;
  questions: QuizQuestion[];
  created_at: string;
  updated_at: string;
}

export interface QuizAssignment {
  id: string;
  quiz_id: string;
  student_id: string;
  course_id: string | null;
  title: string;
  due_at: string | null;
  status: "assigned" | "submitted";
  answers: Record<string, unknown> | null;
  questions: QuizQuestion[] | null;
  correct_ids: string[] | null;
  score: number | null;
  max_score: number | null;
  submitted_at: string | null;
  created_at: string;
}
