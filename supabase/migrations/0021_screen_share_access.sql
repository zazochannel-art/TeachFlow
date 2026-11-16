-- 0021: in the lesson call only the teacher shares the screen; the teacher can allow each student
-- separately (one row in lesson_screen_access = that student may share the screen in that lesson).
-- Needs 0019 (private.is_lesson_teacher). Safe to run more than once.

create table if not exists public.lesson_screen_access (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (lesson_id, user_id)
);
create index if not exists lesson_screen_access_user_idx on public.lesson_screen_access(user_id);
create index if not exists lesson_screen_access_granted_by_idx on public.lesson_screen_access(granted_by);
alter table public.lesson_screen_access enable row level security;

-- Everybody in the lesson sees who may share; only the lesson's teacher changes it.
drop policy if exists "lesson_screen_access_select" on public.lesson_screen_access;
create policy "lesson_screen_access_select" on public.lesson_screen_access
for select to authenticated using (private.can_use_lesson_board(lesson_id));
drop policy if exists "lesson_screen_access_insert" on public.lesson_screen_access;
create policy "lesson_screen_access_insert" on public.lesson_screen_access
for insert to authenticated with check (private.is_lesson_teacher(lesson_id));
drop policy if exists "lesson_screen_access_delete" on public.lesson_screen_access;
create policy "lesson_screen_access_delete" on public.lesson_screen_access
for delete to authenticated using (private.is_lesson_teacher(lesson_id));

revoke all on public.lesson_screen_access from anon, authenticated;
grant select, insert, delete on public.lesson_screen_access to authenticated;
