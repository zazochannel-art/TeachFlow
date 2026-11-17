import type { SupabaseClient } from "@supabase/supabase-js";
import { AVATARS_BUCKET } from "@/lib/avatars";
import { FILES_BUCKET } from "@/lib/files";

/**
 * Tables included in "Descarcă datele mele". Each one is read with the user's own session,
 * so row-level security decides what is in the file: a teacher gets their whole school,
 * a student or parent gets what their portal shows.
 */
export const EXPORT_TABLES = [
  "profiles", "user_roles", "teacher_profiles", "subscriptions", "plan_requests",
  "students", "courses", "course_enrollments", "lessons", "homework", "messages", "payments",
  "library_items", "quizzes", "quiz_assignments", "quiz_attempts", "student_rewards",
  "parent_links", "student_invites", "parent_invites", "signup_requests", "push_subscriptions", "ai_usage"
] as const;

const PAGE = 1000;
const MAX_ROWS = 50_000;

/** All rows the signed-in user can read, per table. A table that fails (not migrated, no access) is left out. */
export async function exportUserData(supabase: SupabaseClient) {
  const tables: Record<string, unknown[]> = {};
  await Promise.all(EXPORT_TABLES.map(async name => {
    const rows: unknown[] = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await supabase.from(name).select("*").range(from, from + PAGE - 1);
      if (error) return;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    // Push keys identify a device; the export keeps only that a subscription exists.
    tables[name] = name === "push_subscriptions"
      ? rows.map(r => Object.fromEntries(Object.entries(r as Record<string, unknown>).filter(([k]) => !["endpoint", "p256dh", "auth"].includes(k))))
      : rows;
  }));
  return tables;
}

/** Every object under `prefix` in a bucket (Storage lists one folder level at a time). */
async function listAll(admin: SupabaseClient, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      // Folders come back without an id.
      if (item.id) out.push(path);
      else out.push(...await listAll(admin, bucket, path, depth + 1));
    }
    if (data.length < 1000) break;
  }
  return out;
}

/**
 * Removes the files a user uploaded: profile photos, homework and hand-ins, quiz pictures,
 * and (for a teacher) the files of their lessons' whiteboards. Best effort: a failure here
 * must not keep the account alive.
 */
export async function removeUserFiles(admin: SupabaseClient, userId: string, lessonIds: string[]) {
  const jobs: Array<[string, string]> = [
    [AVATARS_BUCKET, userId],
    [FILES_BUCKET, `hw/${userId}`],
    [FILES_BUCKET, `sub/${userId}`],
    [FILES_BUCKET, `qz/${userId}`],
    ...lessonIds.map(id => [FILES_BUCKET, `lesson/${id}`] as [string, string])
  ];
  for (const [bucket, prefix] of jobs) {
    try {
      const paths = await listAll(admin, bucket, prefix);
      for (let i = 0; i < paths.length; i += 100) await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
    } catch (e) {
      console.error("file cleanup failed", bucket, prefix, e instanceof Error ? e.message : e);
    }
  }
}
