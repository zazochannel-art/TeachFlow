-- TeachFlow: who may draw on a lesson's whiteboard.
--
-- Until now every student of a lesson could draw, erase and add pictures like the teacher.
-- From here on only the teacher draws by default, and gives drawing access to each student
-- separately (one row in lesson_board_access = that student may draw in that lesson).
-- Students without access still see the board live.

-- 1. The lesson belongs to the signed-in teacher.
create or replace function private.is_lesson_teacher(p_lesson_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.lessons l where l.id = p_lesson_id and l.teacher_id = (select auth.uid()))
$$;

-- 2. Drawing access, per lesson and per student account.
create table if not exists public.lesson_board_access (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (lesson_id, user_id)
);
create index if not exists lesson_board_access_user_idx on public.lesson_board_access(user_id);
create index if not exists lesson_board_access_granted_by_idx on public.lesson_board_access(granted_by);
alter table public.lesson_board_access enable row level security;

-- Everybody in the lesson sees who may draw; only the lesson's teacher changes it.
drop policy if exists "lesson_board_access_select" on public.lesson_board_access;
create policy "lesson_board_access_select" on public.lesson_board_access
for select to authenticated using (private.can_use_lesson_board(lesson_id));
drop policy if exists "lesson_board_access_insert" on public.lesson_board_access;
create policy "lesson_board_access_insert" on public.lesson_board_access
for insert to authenticated with check (private.is_lesson_teacher(lesson_id));
drop policy if exists "lesson_board_access_delete" on public.lesson_board_access;
create policy "lesson_board_access_delete" on public.lesson_board_access
for delete to authenticated using (private.is_lesson_teacher(lesson_id));

revoke all on public.lesson_board_access from anon, authenticated;
grant select, insert, delete on public.lesson_board_access to authenticated;

-- 3. May the signed-in user change the board of this lesson?
create or replace function private.can_draw_on_board(p_lesson_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_lesson_teacher(p_lesson_id)
    or (
      private.can_use_lesson_board(p_lesson_id)
      and exists (
        select 1 from public.lesson_board_access a
        where a.lesson_id = p_lesson_id and a.user_id = (select auth.uid())
      )
    )
$$;

-- Realtime: may the signed-in user SEND on this topic?
--   screen:<lesson>  call and screen-share signalling: every lesson member, as before;
--   board:<lesson>   presence ("who is here"): every lesson member;
--                    broadcast (strokes): only who may draw.
create or replace function private.can_send_board_topic(p_topic text, p_extension text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_lesson uuid;
begin
  if p_topic is null or p_topic !~ '^(board|screen):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  v_lesson := split_part(p_topic, ':', 2)::uuid;
  if split_part(p_topic, ':', 1) = 'board' and p_extension = 'broadcast' then
    return private.can_draw_on_board(v_lesson);
  end if;
  return private.can_use_lesson_board(v_lesson);
end;
$$;

revoke all on function private.is_lesson_teacher(uuid), private.can_draw_on_board(uuid), private.can_send_board_topic(text, text) from public;
grant execute on function private.is_lesson_teacher(uuid), private.can_draw_on_board(uuid), private.can_send_board_topic(text, text) to authenticated;

-- 4. The saved board: everybody in the lesson reads it, only who may draw writes it.
drop policy if exists "lesson_boards_insert" on public.lesson_boards;
create policy "lesson_boards_insert" on public.lesson_boards
for insert to authenticated with check (private.can_draw_on_board(lesson_id));
drop policy if exists "lesson_boards_update" on public.lesson_boards;
create policy "lesson_boards_update" on public.lesson_boards
for update to authenticated using (private.can_draw_on_board(lesson_id))
with check (private.can_draw_on_board(lesson_id));

-- 5. Live strokes: sending on the board channel needs drawing access.
drop policy if exists "board_realtime_write" on realtime.messages;
create policy "board_realtime_write" on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.can_send_board_topic((select realtime.topic()), realtime.messages.extension)
);
