import { requireTeacher } from "./workspace";
import { createClient } from "@/lib/supabase/server";
import type { LibraryItem } from "@/types/database";

const COLUMNS = "id, course_id, title, description, kind, file, url, shared, created_at";

/** The signed-in teacher's materials (migration 0013). `ready` is false before the migration. */
export async function loadTeacherLibrary(): Promise<{ ready: boolean; items: LibraryItem[] }> {
  const { supabase, userId } = await requireTeacher();
  if (!supabase || !userId) return { ready: true, items: [] };
  const { data, error } = await supabase.from("library_items").select(COLUMNS).eq("teacher_id", userId).order("created_at", { ascending: false }).limit(1000);
  if (error) return { ready: false, items: [] };
  return { ready: true, items: (data as LibraryItem[]) ?? [] };
}

/** Shared materials of the signed-in student's courses (RLS decides which). */
export async function loadStudentLibrary(): Promise<{ ready: boolean; items: LibraryItem[] }> {
  const supabase = await createClient();
  if (!supabase) return { ready: true, items: [] };
  const { data, error } = await supabase.from("library_items").select(COLUMNS).eq("shared", true).order("created_at", { ascending: false }).limit(500);
  if (error) return { ready: false, items: [] };
  return { ready: true, items: (data as LibraryItem[]) ?? [] };
}
