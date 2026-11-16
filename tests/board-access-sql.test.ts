import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Migration 0019: students draw on the whiteboard only when the teacher allowed them.
const sql = readFileSync(new URL("../supabase/migrations/0019_board_access.sql", import.meta.url), "utf8");

describe("board access migration", () => {
  it("lets only the lesson's teacher grant or remove access", () => {
    expect(sql).toMatch(/"lesson_board_access_insert"[\s\S]*?with check \(private\.is_lesson_teacher\(lesson_id\)\)/);
    expect(sql).toMatch(/"lesson_board_access_delete"[\s\S]*?using \(private\.is_lesson_teacher\(lesson_id\)\)/);
    expect(sql).not.toMatch(/grant[^;]*update[^;]*lesson_board_access/i);
  });

  it("requires drawing access to save the board and to send strokes", () => {
    expect(sql).toMatch(/"lesson_boards_insert"[\s\S]*?with check \(private\.can_draw_on_board\(lesson_id\)\)/);
    expect(sql).toMatch(/"lesson_boards_update"[\s\S]*?using \(private\.can_draw_on_board\(lesson_id\)\)/);
    expect(sql).toMatch(/"board_realtime_write"[\s\S]*?private\.can_send_board_topic\(/);
  });

  it("keeps the helper functions away from anonymous visitors", () => {
    expect(sql).toMatch(/revoke all on function[^;]*can_draw_on_board\(uuid\)[^;]*from public/);
    expect(sql).toMatch(/revoke all on public\.lesson_board_access from anon, authenticated/);
  });
});

// Migration 0020: uploading a lesson file needs the same drawing access.
describe("lesson file upload migration", () => {
  const files = readFileSync(new URL("../supabase/migrations/0020_lesson_file_upload_access.sql", import.meta.url), "utf8");

  it("requires drawing access to upload into a lesson folder", () => {
    expect(files).toMatch(/"tf_files_insert"[\s\S]*?= 'lesson' and private\.can_draw_on_board\(/);
    expect(files).not.toMatch(/can_use_lesson_board/);
  });
});

// Migration 0021: in the call a student shares the screen only when the teacher allowed it.
describe("screen share access migration", () => {
  const share = readFileSync(new URL("../supabase/migrations/0021_screen_share_access.sql", import.meta.url), "utf8");

  it("lets only the lesson's teacher grant or remove access", () => {
    expect(share).toMatch(/"lesson_screen_access_insert"[\s\S]*?with check \(private\.is_lesson_teacher\(lesson_id\)\)/);
    expect(share).toMatch(/"lesson_screen_access_delete"[\s\S]*?using \(private\.is_lesson_teacher\(lesson_id\)\)/);
    expect(share).toMatch(/revoke all on public\.lesson_screen_access from anon, authenticated/);
    expect(share).not.toMatch(/grant[^;]*update[^;]*lesson_screen_access/i);
  });
});
