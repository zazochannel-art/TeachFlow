-- TeachFlow 0012: richer student profile and parent accounts.
--
-- 1. students: birth date, class/level, goals and one parent contact (filled in by the teacher).
-- 2. A new role `parent`. A teacher invites a parent from the student's card with a one-time
--    link (parent_invites, only the SHA-256 of the token is stored, like student_invites).
--    Accepting it creates a parent_links row: one parent account can follow several children,
--    of one or several teachers, and one child can have several parents.
-- 3. Parents only READ their children's lessons, homework, payments and courses through RLS.
--    Their only writes are messages to the teacher, through send_parent_message().
-- 4. messages.channel separates the teacher<->student conversation ('student') from the
--    teacher<->parents one ('parent'). Students no longer see the parents' channel.
-- 5. Students may edit their own phone number (update_my_phone) from "Profilul meu".
--
-- Safe to run more than once. The new enum value is compared as text everywhere in this file,
-- so the whole script can run in one go in the SQL Editor.

-- 1. Student profile fields ---------------------------------------------------------------
alter table public.students add column if not exists birth_date date;
alter table public.students add column if not exists grade_level text;
alter table public.students add column if not exists goals text;
alter table public.students add column if not exists parent_name text;
alter table public.students add column if not exists parent_phone text;
alter table public.students add column if not exists parent_email text;

alter table public.students drop constraint if exists students_profile_len_check;
alter table public.students add constraint students_profile_len_check check (
  (grade_level is null or char_length(grade_level) <= 60)
  and (goals is null or char_length(goals) <= 1000)
  and (parent_name is null or char_length(parent_name) <= 120)
  and (parent_phone is null or char_length(parent_phone) <= 40)
  and (parent_email is null or char_length(parent_email) <= 200)
  and (birth_date is null or birth_date between date '1900-01-01' and date '2100-01-01')
);

-- 2. Parent role ----------------------------------------------------------------------------
alter type public.app_role add value if not exists 'parent';

-- 3. Parent links and invites ----------------------------------------------------------------
create table if not exists public.parent_links (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, user_id)
);
create index if not exists parent_links_user_idx on public.parent_links(user_id);
create index if not exists parent_links_teacher_idx on public.parent_links(teacher_id);
alter table public.parent_links enable row level security;

-- Links are created only by accept_parent_invite(); the teacher can see and remove them.
drop policy if exists "parent_links_teacher_select" on public.parent_links;
create policy "parent_links_teacher_select" on public.parent_links
for select to authenticated using ((select auth.uid()) = teacher_id);
drop policy if exists "parent_links_teacher_delete" on public.parent_links;
create policy "parent_links_teacher_delete" on public.parent_links
for delete to authenticated using ((select auth.uid()) = teacher_id);
drop policy if exists "parent_links_parent_select" on public.parent_links;
create policy "parent_links_parent_select" on public.parent_links
for select to authenticated using ((select auth.uid()) = user_id);
grant select, delete on public.parent_links to authenticated;

create table if not exists public.parent_invites (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists parent_invites_student_idx on public.parent_invites(student_id);
create index if not exists parent_invites_teacher_idx on public.parent_invites(teacher_id);
create index if not exists parent_invites_accepted_by_idx on public.parent_invites(accepted_by);
alter table public.parent_invites enable row level security;

drop policy if exists "parent_invites_teacher_all" on public.parent_invites;
create policy "parent_invites_teacher_all" on public.parent_invites
for all to authenticated using ((select auth.uid()) = teacher_id)
with check (
  (select auth.uid()) = teacher_id
  and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
);
grant select, insert, delete on public.parent_invites to authenticated;

-- 4. Message channels --------------------------------------------------------------------------
alter table public.messages add column if not exists channel text not null default 'student';
alter table public.messages drop constraint if exists messages_channel_check;
alter table public.messages add constraint messages_channel_check check (channel in ('student', 'parent'));
-- Which parent wrote an incoming parent message (several parents share one conversation).
alter table public.messages add column if not exists author_id uuid references auth.users(id) on delete set null;
create index if not exists messages_author_idx on public.messages(author_id);

drop policy if exists "messages_student_select" on public.messages;
create policy "messages_student_select" on public.messages
for select to authenticated using (channel = 'student' and student_id in (select private.my_student_ids()));

create or replace function public.mark_student_messages_read()
returns void
language sql security definer set search_path = ''
as $$
  update public.messages set read_at = now()
   where direction = 'outgoing' and read_at is null and channel = 'student'
     and student_id in (select s.id from public.students s where s.user_id = (select auth.uid()));
$$;

-- 5. Helpers for the parent policies (SECURITY DEFINER avoids RLS recursion) --------------------
create or replace function private.my_child_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$ select l.student_id from public.parent_links l where l.user_id = (select auth.uid()) $$;

create or replace function private.my_child_course_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select e.course_id from public.course_enrollments e
  where e.status in ('active', 'paused')
    and e.student_id in (select l.student_id from public.parent_links l where l.user_id = (select auth.uid()))
$$;

create or replace function private.my_child_teacher_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$ select l.teacher_id from public.parent_links l where l.user_id = (select auth.uid()) $$;

-- Parent accounts linked to the signed-in teacher's students (teachers see their names).
create or replace function private.my_parent_user_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$ select l.user_id from public.parent_links l where l.teacher_id = (select auth.uid()) $$;

revoke all on function private.my_child_ids(), private.my_child_course_ids(), private.my_child_teacher_ids(), private.my_parent_user_ids() from public;
grant execute on function private.my_child_ids(), private.my_child_course_ids(), private.my_child_teacher_ids(), private.my_parent_user_ids() to authenticated;

-- 6. Read-only policies for parents -------------------------------------------------------------
drop policy if exists "courses_parent_select" on public.courses;
create policy "courses_parent_select" on public.courses
for select to authenticated using (id in (select private.my_child_course_ids()));

drop policy if exists "enrollments_parent_select" on public.course_enrollments;
create policy "enrollments_parent_select" on public.course_enrollments
for select to authenticated using (student_id in (select private.my_child_ids()));

drop policy if exists "lessons_parent_select" on public.lessons;
create policy "lessons_parent_select" on public.lessons
for select to authenticated using (
  student_id in (select private.my_child_ids())
  or (student_id is null and course_id in (select private.my_child_course_ids()))
);

drop policy if exists "homework_parent_select" on public.homework;
create policy "homework_parent_select" on public.homework
for select to authenticated using (student_id in (select private.my_child_ids()));

drop policy if exists "payments_parent_select" on public.payments;
create policy "payments_parent_select" on public.payments
for select to authenticated using (student_id in (select private.my_child_ids()));

drop policy if exists "messages_parent_select" on public.messages;
create policy "messages_parent_select" on public.messages
for select to authenticated using (channel = 'parent' and student_id in (select private.my_child_ids()));

drop policy if exists "profiles_teacher_for_parent" on public.profiles;
create policy "profiles_teacher_for_parent" on public.profiles
for select to authenticated using (id in (select private.my_child_teacher_ids()));

drop policy if exists "profiles_parent_for_teacher" on public.profiles;
create policy "profiles_parent_for_teacher" on public.profiles
for select to authenticated using (id in (select private.my_parent_user_ids()));

-- 7. Functions -------------------------------------------------------------------------------

-- Children of the signed-in parent, without the teacher's private notes.
create or replace function public.parent_children()
returns table (student_id uuid, teacher_id uuid, teacher_name text, full_name text, avatar_url text, grade_level text, birth_date date)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.teacher_id, coalesce(nullif(p.full_name, ''), 'Profesor'), s.full_name, s.avatar_url, s.grade_level, s.birth_date
  from public.parent_links l
  join public.students s on s.id = l.student_id
  left join public.profiles p on p.id = s.teacher_id
  where l.user_id = (select auth.uid())
  order by s.full_name
$$;

-- Parent accounts of one of the teacher's students, with their sign-in email.
create or replace function public.student_parents(p_student_id uuid)
returns table (link_id uuid, user_id uuid, full_name text, email text, linked_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select l.id, l.user_id, coalesce(p.full_name, ''), u.email::text, l.created_at
  from public.parent_links l
  join public.students s on s.id = l.student_id and s.teacher_id = (select auth.uid())
  left join public.profiles p on p.id = l.user_id
  left join auth.users u on u.id = l.user_id
  where l.student_id = p_student_id
  order by l.created_at
$$;

-- Public preview shown on the parent invite page before sign-in.
create or replace function public.parent_invite_preview(p_token text)
returns table (teacher_name text, student_name text, status text)
language plpgsql stable security definer set search_path = ''
as $$
declare inv public.parent_invites;
begin
  select * into inv from public.parent_invites
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

create or replace function public.accept_parent_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.parent_invites;
  my_role text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into inv from public.parent_invites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;
  if not found or inv.expires_at < now() then raise exception 'invite_invalid'; end if;
  if inv.accepted_at is not null then
    if inv.accepted_by = uid then return inv.student_id; end if;
    raise exception 'invite_used';
  end if;
  if inv.teacher_id = uid then raise exception 'own_invite'; end if;

  select r.role::text into my_role from public.user_roles r where r.user_id = uid;
  if my_role = 'admin'
     or (my_role = 'teacher' and (
          exists (select 1 from public.students s where s.teacher_id = uid)
       or exists (select 1 from public.courses c where c.teacher_id = uid)
       or exists (select 1 from public.lessons l where l.teacher_id = uid))) then
    raise exception 'teacher_account';
  end if;
  if my_role = 'student' or exists (select 1 from public.students s where s.user_id = uid) then
    raise exception 'student_account';
  end if;

  insert into public.parent_links (teacher_id, student_id, user_id)
  values (inv.teacher_id, inv.student_id, uid)
  on conflict (student_id, user_id) do nothing;
  update public.parent_invites set accepted_at = now(), accepted_by = uid where id = inv.id;

  -- An empty teacher account (signed up before the parent invite existed) becomes a parent.
  if my_role = 'teacher' then
    update public.user_roles set role = 'parent' where user_id = uid;
    delete from public.teacher_profiles where user_id = uid;
    delete from public.subscriptions where teacher_id = uid;
  end if;

  return inv.student_id;
end;
$$;

create or replace function public.send_parent_message(p_student_id uuid, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare t uuid;
begin
  if p_body is null or char_length(btrim(p_body)) = 0 then raise exception 'empty_message'; end if;
  if char_length(p_body) > 4000 then raise exception 'message_too_long'; end if;
  select l.teacher_id into t from public.parent_links l where l.student_id = p_student_id and l.user_id = (select auth.uid());
  if not found then raise exception 'student_not_found'; end if;
  insert into public.messages (teacher_id, student_id, direction, body, channel, author_id)
  values (t, p_student_id, 'incoming', btrim(p_body), 'parent', (select auth.uid()));
end;
$$;

-- Marks the teacher's messages to the parents as read.
create or replace function public.mark_parent_messages_read()
returns void
language sql security definer set search_path = ''
as $$
  update public.messages set read_at = now()
   where direction = 'outgoing' and read_at is null and channel = 'parent'
     and student_id in (select l.student_id from public.parent_links l where l.user_id = (select auth.uid()));
$$;

-- The student edits their own phone number on every teacher's card.
create or replace function public.update_my_phone(p_phone text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v is not null and char_length(v) > 40 then raise exception 'phone_too_long'; end if;
  update public.students set phone = v where user_id = (select auth.uid());
  if not found then raise exception 'student_not_found'; end if;
end;
$$;

revoke all on function public.parent_children(), public.student_parents(uuid), public.parent_invite_preview(text),
  public.accept_parent_invite(text), public.send_parent_message(uuid, text), public.mark_parent_messages_read(),
  public.update_my_phone(text) from public, anon;
grant execute on function public.parent_invite_preview(text) to anon, authenticated;
grant execute on function public.parent_children(), public.student_parents(uuid), public.accept_parent_invite(text),
  public.send_parent_message(uuid, text), public.mark_parent_messages_read(), public.update_my_phone(text) to authenticated;

-- 8. New accounts from a parent invite start as parents ----------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text := new.raw_user_meta_data ->> 'invite_token';
  kind text := 'teacher';
begin
  if token is not null and token ~ '^[A-Za-z0-9_-]{20,64}$' then
    if exists (
      select 1 from public.student_invites i
      where i.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
        and i.accepted_at is null and i.expires_at >= now()
    ) then
      kind := 'student';
    elsif exists (
      select 1 from public.parent_invites i
      where i.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
        and i.accepted_at is null and i.expires_at >= now()
    ) then
      kind := 'parent';
    end if;
  end if;

  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  if kind = 'teacher' then
    insert into public.user_roles (user_id, role) values (new.id, 'teacher');
    insert into public.teacher_profiles (user_id) values (new.id);
    insert into public.subscriptions (teacher_id, plan_code, status) values (new.id, 'free', 'active');
  else
    insert into public.user_roles (user_id, role) values (new.id, kind::public.app_role);
  end if;
  return new;
end;
$$;
