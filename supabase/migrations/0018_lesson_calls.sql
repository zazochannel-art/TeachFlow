-- TeachFlow: lesson video calls — who may join, attendance and call duration.
--
-- The "room" of a call is the lesson itself (lessons.id). Media never passes through Supabase:
-- P2P calls only use the private Realtime channel `screen:<lesson_id>` for signalling (0006), and
-- group calls go through an SFU (LiveKit) whose access token is signed by the app server after
-- the checks below.
--
-- 1. public.lesson_call_identity(lesson): role + display name of the caller for that lesson,
--    or no row when the caller is not the lesson's teacher or one of its students.
--    Used by /api/turn and /api/rtc/token before handing out TURN credentials or SFU tokens.
-- 2. public.lesson_call_attendance: one row per stay in a call (join → leave), written only by
--    the RPCs call_join / call_heartbeat / call_leave (no write policies at all).
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Identity / authorization
-- ---------------------------------------------------------------------------

create or replace function public.lesson_call_identity(p_lesson_id uuid)
returns table (role text, display_name text, student_id uuid, teacher_id uuid)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lesson public.lessons%rowtype;
begin
  if v_uid is null or p_lesson_id is null then
    return;
  end if;
  select * into v_lesson from public.lessons l where l.id = p_lesson_id;
  if not found or not private.can_use_lesson_board(p_lesson_id) then
    return;
  end if;

  if v_lesson.teacher_id = v_uid then
    return query
      select 'teacher'::text,
             coalesce(nullif(trim(p.full_name), ''), split_part(u.email, '@', 1), 'Profesor')::text,
             null::uuid,
             v_lesson.teacher_id
      from auth.users u
      left join public.profiles p on p.id = u.id
      where u.id = v_uid;
    return;
  end if;

  return query
    select 'student'::text, s.full_name::text, s.id, v_lesson.teacher_id
    from public.students s
    where s.user_id = v_uid
      and s.teacher_id = v_lesson.teacher_id
      and (
        s.id = v_lesson.student_id
        or (v_lesson.student_id is null and exists (
          select 1 from public.course_enrollments e
          where e.student_id = s.id and e.course_id = v_lesson.course_id and e.status in ('active', 'paused')
        ))
      )
    limit 1;
end;
$$;

revoke all on function public.lesson_call_identity(uuid) from public, anon;
grant execute on function public.lesson_call_identity(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Attendance
-- ---------------------------------------------------------------------------

create table if not exists public.lesson_call_attendance (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  -- Copied from the lesson so the teacher's read policy needs no join.
  teacher_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  role text not null check (role in ('teacher', 'student')),
  display_name text not null default '',
  transport text not null default 'p2p' check (transport in ('p2p', 'sfu')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  check (last_seen_at >= joined_at),
  check (left_at is null or left_at >= joined_at)
);

create index if not exists lesson_call_attendance_lesson_idx on public.lesson_call_attendance(lesson_id, joined_at);
create index if not exists lesson_call_attendance_user_idx on public.lesson_call_attendance(user_id, lesson_id);
create index if not exists lesson_call_attendance_teacher_idx on public.lesson_call_attendance(teacher_id);
create index if not exists lesson_call_attendance_student_idx on public.lesson_call_attendance(student_id) where student_id is not null;

alter table public.lesson_call_attendance enable row level security;

-- Teachers read the attendance of their lessons, everybody reads their own rows.
-- No insert/update/delete policies: rows are written only by the functions below.
drop policy if exists "lesson_call_attendance_select" on public.lesson_call_attendance;
create policy "lesson_call_attendance_select" on public.lesson_call_attendance
  for select to authenticated
  using (teacher_id = (select auth.uid()) or user_id = (select auth.uid()));

revoke insert, update, delete on public.lesson_call_attendance from anon, authenticated;
grant select on public.lesson_call_attendance to authenticated;

-- A stay counts as ended when no heartbeat arrived for this long (the client beats every 30 s).
-- Its end is then its last heartbeat, so a closed tab or a lost network is not counted as presence.

-- Starts a stay in the lesson's call. Returns its id.
create or replace function public.call_join(p_lesson_id uuid, p_transport text default 'p2p')
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_me record;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_me from public.lesson_call_identity(p_lesson_id) limit 1;
  if v_me.role is null then
    raise exception 'not a participant of this lesson' using errcode = '42501';
  end if;

  -- Close my stays that stopped beating (closed tab, lost network).
  update public.lesson_call_attendance a
     set left_at = a.last_seen_at
   where a.user_id = v_uid and a.lesson_id = p_lesson_id and a.left_at is null
     and a.last_seen_at < now() - interval '90 seconds';

  -- Abuse guard: a reload loop must not fill the table.
  if (select count(*) from public.lesson_call_attendance a
       where a.user_id = v_uid and a.lesson_id = p_lesson_id and a.joined_at > now() - interval '10 minutes') >= 40 then
    raise exception 'too many joins, try again later' using errcode = '54000';
  end if;

  insert into public.lesson_call_attendance (lesson_id, teacher_id, user_id, student_id, role, display_name, transport)
  values (p_lesson_id, v_me.teacher_id, v_uid, v_me.student_id, v_me.role, left(coalesce(v_me.display_name, ''), 120),
          case when p_transport = 'sfu' then 'sfu' else 'p2p' end)
  returning id into v_id;
  return v_id;
end;
$$;

-- Keeps a stay open. Returns false when the stay is already closed (gap > 90 s): the client
-- then starts a new stay with call_join, so the gap is not counted.
create or replace function public.call_heartbeat(p_id uuid)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  update public.lesson_call_attendance a
     set last_seen_at = now()
   where a.id = p_id and a.user_id = v_uid and a.left_at is null
     and a.last_seen_at >= now() - interval '90 seconds'
     and a.joined_at > now() - interval '12 hours';
  if found then
    return true;
  end if;
  update public.lesson_call_attendance a
     set left_at = a.last_seen_at
   where a.id = p_id and a.user_id = v_uid and a.left_at is null;
  return false;
end;
$$;

-- Ends a stay (leave button, page closed while online).
create or replace function public.call_leave(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.lesson_call_attendance a
     set last_seen_at = case when a.last_seen_at >= now() - interval '90 seconds' then now() else a.last_seen_at end,
         left_at = case when a.last_seen_at >= now() - interval '90 seconds' then now() else a.last_seen_at end
   where a.id = p_id and a.user_id = (select auth.uid()) and a.left_at is null;
end;
$$;

revoke all on function public.call_join(uuid, text), public.call_heartbeat(uuid), public.call_leave(uuid) from public, anon;
grant execute on function public.call_join(uuid, text), public.call_heartbeat(uuid), public.call_leave(uuid) to authenticated;
