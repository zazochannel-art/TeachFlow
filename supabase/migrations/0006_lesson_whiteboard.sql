-- TeachFlow: shared whiteboard for online lessons.
--
-- One board per lesson. The teacher who owns the lesson and the students of that lesson
-- (individual lesson, or group lesson of a course they are enrolled in) can read and draw.
-- Live drawing travels over a private Supabase Realtime channel `board:<lesson_id>`;
-- the policies on realtime.messages below limit who may join it.

-- 1. Who may use a lesson's board (SECURITY DEFINER avoids RLS recursion on lessons).
create or replace function private.can_use_lesson_board(p_lesson_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lessons l
    where l.id = p_lesson_id
      and (
        l.teacher_id = (select auth.uid())
        or l.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
        or (l.student_id is null and l.course_id in (
          select e.course_id from public.course_enrollments e
          join public.students s on s.id = e.student_id
          where s.user_id = (select auth.uid()) and e.status in ('active', 'paused')
        ))
      )
  )
$$;

-- Same check from a Realtime topic name ("board:<uuid>"); malformed topics are refused.
create or replace function private.can_use_board_topic(p_topic text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_topic is null or p_topic !~ '^board:[0-9a-fA-F-]{36}$' then return false; end if;
  return private.can_use_lesson_board(substr(p_topic, 7)::uuid);
end;
$$;

revoke all on function private.can_use_lesson_board(uuid), private.can_use_board_topic(text) from public;
grant execute on function private.can_use_lesson_board(uuid), private.can_use_board_topic(text) to authenticated;

-- 2. Saved board contents (the latest snapshot of all strokes).
create table if not exists public.lesson_boards (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  data jsonb not null default '{"v":1,"strokes":[]}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(data) = 'object'),
  check (octet_length(data::text) <= 3000000)
);
alter table public.lesson_boards enable row level security;

create policy "lesson_boards_select" on public.lesson_boards
for select to authenticated using (private.can_use_lesson_board(lesson_id));
create policy "lesson_boards_insert" on public.lesson_boards
for insert to authenticated with check (private.can_use_lesson_board(lesson_id));
create policy "lesson_boards_update" on public.lesson_boards
for update to authenticated using (private.can_use_lesson_board(lesson_id))
with check (private.can_use_lesson_board(lesson_id));

grant select, insert, update on public.lesson_boards to authenticated;

drop trigger if exists lesson_boards_updated_at on public.lesson_boards;
create trigger lesson_boards_updated_at before update on public.lesson_boards
for each row execute procedure public.set_updated_at();

-- Every write records who made it.
create or replace function private.stamp_board_author()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_by := (select auth.uid()); return new; end; $$;

drop trigger if exists lesson_boards_author on public.lesson_boards;
create trigger lesson_boards_author before insert or update on public.lesson_boards
for each row execute procedure private.stamp_board_author();

-- 3. Realtime authorization for the private channel "board:<lesson_id>"
--    (broadcast for strokes, presence for "who is in the room").
drop policy if exists "board_realtime_read" on realtime.messages;
create policy "board_realtime_read" on realtime.messages
for select to authenticated using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.can_use_board_topic((select realtime.topic()))
);

drop policy if exists "board_realtime_write" on realtime.messages;
create policy "board_realtime_write" on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.can_use_board_topic((select realtime.topic()))
);
