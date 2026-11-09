export type AppRole = "teacher" | "student" | "admin";

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  preferred_language: "ro" | "ru" | "en";
  timezone: string;
  created_at: string;
  updated_at: string;
}
