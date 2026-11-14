export type AppRole = "teacher" | "student" | "admin";
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
}

export interface Student {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "active" | "inactive";
  created_at: string;
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
}

export interface Message {
  id: string;
  student_id: string;
  direction: "outgoing" | "incoming";
  body: string;
  read_at: string | null;
  created_at: string;
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
