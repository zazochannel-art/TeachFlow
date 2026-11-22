-- TeachFlow 0024: signed call signalling, and file reads limited to the owner's folders.
--
-- 1. Lesson call signalling (P2P calls and the teacher's screen share) travels over the lesson's
--    private Realtime channel. RLS decides who may join the channel, but the messages themselves
--    were not tied to their sender: any participant could write another participant's key into
--    `from`, pose as the teacher, or send a "bye" in someone else's name. Now every browser tab
--    makes its own signing key (ECDSA P-256, the private half never leaves the browser) and
--    registers the public half here for its connection key. The database checks that the caller
--    belongs to the lesson and that the key starts with the caller's own user id, and stores the
--    role and display name from the lesson (not from the browser). Receivers look the key up with
--    public.call_peer() and drop every message whose signature does not match.
-- 2. A homework lists files in JSON (attachments, submission_files). The read check trusted those
--    paths, so a crafted homework row written straight through the API could point at a file in
--    another account's folder. A homework now only opens files in its own teacher's folders
--    (hw/<teacher>/, lib/<teacher>/) and hand-ins in its own folder (sub/<student>/<homework>/).
--    Question pictures likewise only open from the quiz teacher's folder (qz/<teacher>/<quiz>/).
--
-- 3. Teacher pages now load only the lessons around today (src/lib/data/workspace.ts); totals over
--    the whole history ("12 of 20 lessons held") come from the view public.lesson_status_counts.
--    It runs with the rights of the reader (security_invoker), so the lessons policies still apply.
--
-- Safe to run more than once.

-- 0. Lesson totals per course, student and status -------------------------------------------------
create or replace view public.lesson_status_counts with (security_invoker = on) as
  select l.teacher_id, l.course_id, l.student_id, l.status, count(*)::integer as n
  from public.lessons l
  group by l.teacher_id, l.course_id, l.student_id, l.status;
revoke all on public.lesson_status_counts from anon;
grant select on public.lesson_status_counts to authenticated;

-- 1. Call peers ----------------------------------------------------------------------------------
create table if not exists public.lesson_call_peers (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  conn_key text not null check (char_length(conn_key) between 38 and 80),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  display_name text not null default '' check (char_length(display_name) <= 120),
  public_key jsonb not null check (jsonb_typeof(public_key) = 'object' and octet_length(public_key::text) <= 400),
  created_at timestamptz not null default now(),
  primary key (lesson_id, conn_key)
);
create index if not exists lesson_call_peers_user_idx on public.lesson_call_peers(user_id);
create index if not exists lesson_call_peers_created_idx on public.lesson_call_peers(created_at);
alter table public.lesson_call_peers enable row level security;
-- No policies and no grants: only the two functions below read or write it.
revoke all on public.lesson_call_peers from anon, authenticated;

-- Registers the signing key of one browser tab (connection key "<auth user id>:<random>") for a
-- lesson the caller belongs to. Role and name come from public.lesson_call_identity (0018).
create or replace function public.register_call_peer(p_lesson_id uuid, p_conn_key text, p_public_key jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
  v_name text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_conn_key is null or p_conn_key !~ ('^' || v_uid::text || ':[A-Za-z0-9_-]{1,40}$') then
    raise exception 'bad_conn_key' using errcode = '22023';
  end if;
  if p_public_key is null or jsonb_typeof(p_public_key) <> 'object'
     or p_public_key->>'kty' is distinct from 'EC' or p_public_key->>'crv' is distinct from 'P-256'
     or coalesce(p_public_key->>'x', '') !~ '^[A-Za-z0-9_-]{43}$'
     or coalesce(p_public_key->>'y', '') !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'bad_public_key' using errcode = '22023';
  end if;

  select i.role, i.display_name into v_role, v_name from public.lesson_call_identity(p_lesson_id) i limit 1;
  if v_role is null then raise exception 'not_in_lesson' using errcode = '42501'; end if;

  -- Old keys are useless after a day (a tab makes a new one each time it opens the lesson).
  delete from public.lesson_call_peers where created_at < now() - interval '1 day';

  insert into public.lesson_call_peers (lesson_id, conn_key, user_id, role, display_name, public_key)
  values (p_lesson_id, p_conn_key, v_uid, v_role, left(coalesce(v_name, ''), 120),
          jsonb_build_object('kty', 'EC', 'crv', 'P-256', 'x', p_public_key->>'x', 'y', p_public_key->>'y'))
  on conflict (lesson_id, conn_key) do nothing;
  -- The key is random and starts with the caller's id, so a row that already exists is the caller's own.
end;
$$;

-- The registered signing key, user, role and name behind a connection key, for members of the lesson.
create or replace function public.call_peer(p_lesson_id uuid, p_conn_key text)
returns table (user_id uuid, role text, display_name text, public_key jsonb)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, p.role, p.display_name, p.public_key
  from public.lesson_call_peers p
  where p.lesson_id = p_lesson_id
    and p.conn_key = p_conn_key
    and private.can_use_lesson_board(p_lesson_id)
$$;

revoke all on function public.register_call_peer(uuid, text, jsonb), public.call_peer(uuid, text) from public, anon;
grant execute on function public.register_call_peer(uuid, text, jsonb), public.call_peer(uuid, text) to authenticated;

-- 2. Homework files: only from the homework's own folders ---------------------------------------
create or replace function private.can_read_homework_file(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.homework h
    where (
      -- a student reading a file the teacher attached to their homework (own files or library files)
      h.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
      and (storage.foldername(p_name))[1] in ('hw', 'lib')
      and (storage.foldername(p_name))[2] = h.teacher_id::text
      and h.attachments @> jsonb_build_array(jsonb_build_object('path', p_name))
    ) or (
      -- a teacher reading a file a student handed in for this homework
      h.teacher_id = (select auth.uid())
      and (storage.foldername(p_name))[1] = 'sub'
      and (storage.foldername(p_name))[3] = h.id::text
      and h.submission_files @> jsonb_build_array(jsonb_build_object('path', p_name))
    )
  )
$$;
revoke all on function private.can_read_homework_file(text) from public;
grant execute on function private.can_read_homework_file(text) to authenticated;

-- 3. Question pictures: only from the folder of the quiz's own teacher ----------------------------
create or replace function private.can_read_quiz_file(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.quiz_assignments a
    join public.quizzes q on q.id = a.quiz_id
    where a.quiz_id = private.uuid_or_null((storage.foldername(p_name))[3])
      and q.teacher_id::text = (storage.foldername(p_name))[2]
      and a.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
  )
$$;
revoke all on function private.can_read_quiz_file(text) from public;
grant execute on function private.can_read_quiz_file(text) to authenticated;
