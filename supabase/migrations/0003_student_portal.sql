-- TeachFlow: student accounts and the student portal.
--
-- A teacher invites a student with a one-time link. The student signs in (or signs up)
-- and accepts it; their auth user is then linked to the teacher's `students` row.
-- Students only READ their own rows through RLS. Every write a student can make goes
-- through a SECURITY DEFINER function below that checks ownership and limits the columns.

-- 1. Link students to auth users (one account can be a student of several teachers).
alter table public.students add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists students_teacher_user_uniq on public.students(teacher_id, user_id) where user_id is not null;
create index if not exists students_user_idx on public.students(user_id) where user_id is not null;

-- Teachers may unlink a student (set user_id to null) but never link an arbitrary account:
-- linking happens only inside accept_student_invite().
create or replace function private.guard_student_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is not null
     and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id)
     and coalesce(current_setting('teachflow.linking', true), '') <> 'on' then
    raise exception 'students.user_id can only be set by accepting an invite';
  end if;
  return new;
end;
$$;

drop trigger if exists students_guard_link on public.students;
create trigger students_guard_link before insert or update of user_id on public.students
for each row execute procedure private.guard_student_link();

-- 2. Homework submissions written by the student.
alter table public.homework add column if not exists submission text
  check (submission is null or char_length(submission) <= 8000);

-- 3. Invites. Only a SHA-256 hash of the token is stored.
create table if not exists public.student_invites (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists student_invites_student_idx on public.student_invites(student_id);
alter table public.student_invites enable row level security;

create policy "student_invites_teacher_all" on public.student_invites
for all to authenticated using ((select auth.uid()) = teacher_id)
with check (
  (select auth.uid()) = teacher_id
  and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
);
grant select, insert, delete on public.student_invites to authenticated;

-- 4. Helpers used by the student read policies (SECURITY DEFINER avoids RLS recursion).
grant usage on schema private to authenticated;

create or replace function private.my_student_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$ select s.id from public.students s where s.user_id = (select auth.uid()) $$;

create or replace function private.my_course_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select e.course_id from public.course_enrollments e
  where e.status in ('active', 'paused')
    and e.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
$$;

create or replace function private.my_teacher_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$ select s.teacher_id from public.students s where s.user_id = (select auth.uid()) $$;

revoke all on function private.my_student_ids(), private.my_course_ids(), private.my_teacher_ids() from public;
grant execute on function private.my_student_ids(), private.my_course_ids(), private.my_teacher_ids() to authenticated;

-- 5. Read-only policies for students.
create policy "students_self_select" on public.students
for select to authenticated using (user_id = (select auth.uid()));

create policy "courses_student_select" on public.courses
for select to authenticated using (id in (select private.my_course_ids()));

create policy "enrollments_student_select" on public.course_enrollments
for select to authenticated using (student_id in (select private.my_student_ids()));

-- Individual lessons of the student, plus group lessons (no student_id) of their courses.
create policy "lessons_student_select" on public.lessons
for select to authenticated using (
  student_id in (select private.my_student_ids())
  or (student_id is null and course_id in (select private.my_course_ids()))
);

create policy "homework_student_select" on public.homework
for select to authenticated using (student_id in (select private.my_student_ids()));

create policy "messages_student_select" on public.messages
for select to authenticated using (student_id in (select private.my_student_ids()));

create policy "payments_student_select" on public.payments
for select to authenticated using (student_id in (select private.my_student_ids()));

-- Students can see their teachers' name and avatar.
create policy "profiles_teacher_for_student" on public.profiles
for select to authenticated using (id in (select private.my_teacher_ids()));

-- 6. Functions the portal calls (exposed through PostgREST RPC).

-- Public preview shown on the invite page before sign-in.
create or replace function public.student_invite_preview(p_token text)
returns table (teacher_name text, student_name text, status text)
language plpgsql stable security definer set search_path = ''
as $$
declare inv public.student_invites;
begin
  select * into inv from public.student_invites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then
    return query select null::text, null::text, 'invalid'::text; return;
  end if;
  return query
    select p.full_name, s.full_name,
      case when inv.accepted_at is not null then 'used'
           when inv.expires_at < now() then 'expired'
           else 'valid' end
    from public.students s left join public.profiles p on p.id = inv.teacher_id
    where s.id = inv.student_id;
end;
$$;

create or replace function public.accept_student_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.student_invites;
  linked uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into inv from public.student_invites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;
  if not found or inv.expires_at < now() then raise exception 'invite_invalid'; end if;
  if inv.accepted_at is not null then
    if inv.accepted_by = uid then return inv.student_id; end if;
    raise exception 'invite_used';
  end if;
  if inv.teacher_id = uid then raise exception 'own_invite'; end if;

  -- A teacher account that already has data cannot silently become a student account.
  if exists (select 1 from public.user_roles r where r.user_id = uid and r.role = 'admin')
     or exists (select 1 from public.students s where s.teacher_id = uid)
     or exists (select 1 from public.courses c where c.teacher_id = uid)
     or exists (select 1 from public.lessons l where l.teacher_id = uid) then
    raise exception 'teacher_account';
  end if;

  select s.user_id into linked from public.students s where s.id = inv.student_id;
  if linked is not null and linked <> uid then raise exception 'invite_used'; end if;

  perform set_config('teachflow.linking', 'on', true);
  update public.students set user_id = uid where id = inv.student_id;
  update public.student_invites set accepted_at = now(), accepted_by = uid where id = inv.id;

  -- Accounts created through an invite start as teachers (see private.handle_new_user); switch them.
  update public.user_roles set role = 'student' where user_id = uid and role = 'teacher';
  delete from public.teacher_profiles where user_id = uid;
  delete from public.subscriptions where teacher_id = uid;

  return inv.student_id;
end;
$$;

create or replace function public.submit_homework(p_homework_id uuid, p_submission text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_submission is null or char_length(btrim(p_submission)) = 0 then raise exception 'empty_submission'; end if;
  if char_length(p_submission) > 8000 then raise exception 'submission_too_long'; end if;
  update public.homework
     set submission = btrim(p_submission), status = 'submitted', submitted_at = now()
   where id = p_homework_id
     and status in ('assigned', 'submitted')
     and student_id in (select s.id from public.students s where s.user_id = (select auth.uid()));
  if not found then raise exception 'homework_not_found'; end if;
end;
$$;

create or replace function public.send_student_message(p_student_id uuid, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare t uuid;
begin
  if p_body is null or char_length(btrim(p_body)) = 0 then raise exception 'empty_message'; end if;
  if char_length(p_body) > 4000 then raise exception 'message_too_long'; end if;
  select s.teacher_id into t from public.students s where s.id = p_student_id and s.user_id = (select auth.uid());
  if not found then raise exception 'student_not_found'; end if;
  insert into public.messages (teacher_id, student_id, direction, body) values (t, p_student_id, 'incoming', btrim(p_body));
end;
$$;

-- Marks the teacher's messages as read by the student.
create or replace function public.mark_student_messages_read()
returns void
language sql security definer set search_path = ''
as $$
  update public.messages set read_at = now()
   where direction = 'outgoing' and read_at is null
     and student_id in (select s.id from public.students s where s.user_id = (select auth.uid()));
$$;

revoke all on function public.student_invite_preview(text), public.accept_student_invite(text),
  public.submit_homework(uuid, text), public.send_student_message(uuid, text), public.mark_student_messages_read() from public;
grant execute on function public.student_invite_preview(text) to anon, authenticated;
grant execute on function public.accept_student_invite(text), public.submit_homework(uuid, text),
  public.send_student_message(uuid, text), public.mark_student_messages_read() to authenticated;
