-- TeachFlow 0013: materials library, quizzes with automatic grading, monthly parent reports
-- and push notifications.
--
-- 1. library_items: reusable materials (files or links) per course. Files live in the existing
--    private bucket under lib/<teacher_user_id>/<file>. A material marked "shared" is visible to
--    the students enrolled in its course. Library files can also be attached to homework.
-- 2. quizzes + quiz_assignments: the teacher builds a quiz (single choice, multiple choice,
--    short answer), assigns it to a course or a student, and the database grades it on submit.
--    Students never read the quizzes table (it holds the correct answers): they get the
--    questions without answers from quiz_for_student() and hand in through submit_quiz().
-- 3. Monthly parent reports: an on/off setting per teacher and a log so a report is never sent
--    twice. The e-mails are built and sent by the server job /api/cron/parent-reports.
-- 4. push_subscriptions: browsers/phones of a user that accept push notifications. Each user
--    manages only their own; the server (secret key) reads them to send notifications.
--
-- Safe to run more than once.

-- 1. Materials library ------------------------------------------------------------------------
create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  kind text not null check (kind in ('file', 'link')),
  -- kind = 'file': { "path", "name", "size", "type" } with path under lib/<teacher_id>/
  file jsonb,
  url text check (url is null or (char_length(url) <= 1000 and url ~* '^https?://')),
  shared boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_items_content_check check (
    (kind = 'file' and file is not null and jsonb_typeof(file) = 'object'
      and coalesce(file->>'path', '') like 'lib/' || teacher_id::text || '/%')
    or (kind = 'link' and url is not null)
  )
);
create index if not exists library_items_teacher_idx on public.library_items(teacher_id);
create index if not exists library_items_course_idx on public.library_items(course_id);
alter table public.library_items enable row level security;

drop policy if exists "library_teacher_all" on public.library_items;
create policy "library_teacher_all" on public.library_items
for all to authenticated using ((select auth.uid()) = teacher_id)
with check (
  (select auth.uid()) = teacher_id
  and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = (select auth.uid())))
);

-- Students see the shared materials of the courses they are enrolled in.
drop policy if exists "library_student_select" on public.library_items;
create policy "library_student_select" on public.library_items
for select to authenticated using (shared and course_id in (select private.my_course_ids()));

grant select, insert, update, delete on public.library_items to authenticated;

create or replace function private.can_read_library_file(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.library_items i
    where i.kind = 'file' and i.shared and i.file->>'path' = p_name
      and i.course_id in (
        select e.course_id from public.course_enrollments e
        where e.status in ('active', 'paused')
          and e.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
      )
  )
$$;
revoke all on function private.can_read_library_file(text) from public;
grant execute on function private.can_read_library_file(text) to authenticated;

-- Storage policies of the files bucket (0010), now with the lib/ folder.
drop policy if exists "tf_files_select" on storage.objects;
drop policy if exists "tf_files_insert" on storage.objects;

create policy "tf_files_select" on storage.objects
for select to authenticated using (
  bucket_id = 'teachflow-files' and (
    ((storage.foldername(name))[1] = 'lesson' and private.can_use_lesson_board(private.uuid_or_null((storage.foldername(name))[2])))
    or ((storage.foldername(name))[1] in ('hw', 'sub', 'lib') and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] in ('hw', 'sub', 'lib') and private.can_read_homework_file(name))
    or ((storage.foldername(name))[1] = 'lib' and private.can_read_library_file(name))
  )
);

create policy "tf_files_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'teachflow-files' and (
    ((storage.foldername(name))[1] = 'lesson' and private.can_use_lesson_board(private.uuid_or_null((storage.foldername(name))[2])))
    or ((storage.foldername(name))[1] in ('hw', 'lib') and (storage.foldername(name))[2] = (select auth.uid())::text
        and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role::text in ('teacher', 'admin')))
    or ((storage.foldername(name))[1] = 'sub' and (storage.foldername(name))[2] = (select auth.uid())::text
        and private.can_hand_in(private.uuid_or_null((storage.foldername(name))[3])))
  )
);

-- 2. Quizzes ------------------------------------------------------------------------------------
-- questions: [{ "id", "type": "single"|"multi"|"short", "text", "options": [..], "correct": [indexes],
--              "accept": [accepted answers], "points" }]
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quizzes_teacher_idx on public.quizzes(teacher_id);
create index if not exists quizzes_course_idx on public.quizzes(course_id);
alter table public.quizzes enable row level security;

drop policy if exists "quizzes_teacher_all" on public.quizzes;
create policy "quizzes_teacher_all" on public.quizzes
for all to authenticated using ((select auth.uid()) = teacher_id)
with check (
  (select auth.uid()) = teacher_id
  and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = (select auth.uid())))
);
grant select, insert, update, delete on public.quizzes to authenticated;

-- One row per quiz and student. `title` is copied so students and parents can list their quizzes
-- without reading the quizzes table; `questions` is a snapshot taken at submission (with the
-- correct answers, shown to the student only after they hand in).
create table if not exists public.quiz_assignments (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned', 'submitted')),
  answers jsonb,
  questions jsonb,
  correct_ids jsonb,
  score numeric(8,2),
  max_score numeric(8,2),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (quiz_id, student_id)
);
create index if not exists quiz_assignments_teacher_idx on public.quiz_assignments(teacher_id);
create index if not exists quiz_assignments_student_idx on public.quiz_assignments(student_id);
alter table public.quiz_assignments enable row level security;

drop policy if exists "quiz_assignments_teacher_all" on public.quiz_assignments;
create policy "quiz_assignments_teacher_all" on public.quiz_assignments
for all to authenticated using ((select auth.uid()) = teacher_id)
with check (
  (select auth.uid()) = teacher_id
  and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
  and exists (select 1 from public.quizzes q where q.id = quiz_id and q.teacher_id = (select auth.uid()))
);
drop policy if exists "quiz_assignments_student_select" on public.quiz_assignments;
create policy "quiz_assignments_student_select" on public.quiz_assignments
for select to authenticated using (student_id in (select private.my_student_ids()));
drop policy if exists "quiz_assignments_parent_select" on public.quiz_assignments;
create policy "quiz_assignments_parent_select" on public.quiz_assignments
for select to authenticated using (student_id in (select private.my_child_ids()));
grant select, insert, update, delete on public.quiz_assignments to authenticated;

-- Answer comparison for short answers: case, spaces, final dot and diacritics do not matter.
create or replace function private.norm_answer(p text)
returns text language sql immutable set search_path = ''
as $$
  select btrim(regexp_replace(translate(lower(coalesce(p, '')), 'ăâîșşțţáàäéèëíïóöúüçñё', 'aaissttaaaeeeiioouucnе'), '[\s]+', ' ', 'g'), ' .!')
$$;

-- The questions of an assignment for the student who has to answer it, without the answers.
create or replace function public.quiz_for_student(p_assignment_id uuid)
returns table (title text, description text, due_at timestamptz, status text, questions jsonb)
language sql stable security definer set search_path = ''
as $$
  select a.title, q.description, a.due_at, a.status,
    case when a.status = 'submitted' then a.questions else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', x->>'id', 'type', x->>'type', 'text', x->>'text',
        'options', coalesce(x->'options', '[]'::jsonb), 'points', coalesce(x->'points', '1'::jsonb)
      ) order by n), '[]'::jsonb)
      from jsonb_array_elements(q.questions) with ordinality as e(x, n)
    ) end
  from public.quiz_assignments a
  join public.quizzes q on q.id = a.quiz_id
  where a.id = p_assignment_id
    and a.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
$$;

-- Hands in a quiz and grades it. p_answers: { "<question id>": [option indexes] | ["text"] }.
create or replace function public.submit_quiz(p_assignment_id uuid, p_answers jsonb)
returns table (score numeric, max_score numeric)
language plpgsql security definer set search_path = ''
as $$
declare
  a public.quiz_assignments;
  qs jsonb;
  x jsonb;
  ans jsonb;
  pts numeric;
  total numeric := 0;
  got numeric := 0;
  ok boolean;
  ids jsonb := '[]'::jsonb;
begin
  select * into a from public.quiz_assignments qa
   where qa.id = p_assignment_id
     and qa.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
   for update;
  if not found then raise exception 'quiz_not_found'; end if;
  if a.status = 'submitted' then raise exception 'quiz_already_submitted'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then p_answers := '{}'::jsonb; end if;
  if octet_length(p_answers::text) > 100000 then raise exception 'answers_too_long'; end if;

  select q.questions into qs from public.quizzes q where q.id = a.quiz_id;
  for x in select * from jsonb_array_elements(coalesce(qs, '[]'::jsonb)) loop
    pts := case when jsonb_typeof(x->'points') = 'number' then greatest((x->>'points')::numeric, 0) else 1 end;
    total := total + pts;
    ans := p_answers -> (x->>'id');
    if ans is null or jsonb_typeof(ans) <> 'array' then ans := '[]'::jsonb; end if;
    if x->>'type' = 'short' then
      ok := private.norm_answer(ans->>0) <> '' and exists (
        select 1 from jsonb_array_elements_text(coalesce(x->'accept', '[]'::jsonb)) acc
        where private.norm_answer(acc) = private.norm_answer(ans->>0)
      );
    else
      ok := jsonb_array_length(coalesce(x->'correct', '[]'::jsonb)) > 0 and
        (select coalesce(array_agg(distinct v::int order by v::int), '{}') from jsonb_array_elements_text(ans) v where v ~ '^\d{1,3}$')
        = (select coalesce(array_agg(distinct v::int order by v::int), '{}') from jsonb_array_elements_text(coalesce(x->'correct', '[]'::jsonb)) v where v ~ '^\d{1,3}$');
    end if;
    if ok then
      got := got + pts;
      ids := ids || jsonb_build_array(x->>'id');
    end if;
  end loop;

  update public.quiz_assignments
     set status = 'submitted', answers = p_answers, questions = coalesce(qs, '[]'::jsonb), correct_ids = ids,
         score = got, max_score = total, submitted_at = now()
   where id = a.id;
  return query select got, total;
end;
$$;

revoke all on function public.quiz_for_student(uuid), public.submit_quiz(uuid, jsonb) from public, anon;
grant execute on function public.quiz_for_student(uuid), public.submit_quiz(uuid, jsonb) to authenticated;
revoke all on function private.norm_answer(text) from public;
grant execute on function private.norm_answer(text) to authenticated;

-- 3. Monthly parent reports ---------------------------------------------------------------------
alter table public.teacher_profiles add column if not exists parent_reports boolean not null default true;

create table if not exists public.parent_report_log (
  student_id uuid not null references public.students(id) on delete cascade,
  recipient text not null,
  month date not null,
  sent_at timestamptz not null default now(),
  primary key (student_id, recipient, month)
);
alter table public.parent_report_log enable row level security;
-- No policies and no grants: only the server job (secret key) reads or writes it.
revoke all on public.parent_report_log from anon, authenticated;

-- 4. Push notifications -----------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000 and endpoint ~ '^https://'),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_own_select" on public.push_subscriptions;
create policy "push_own_select" on public.push_subscriptions
for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "push_own_delete" on public.push_subscriptions;
create policy "push_own_delete" on public.push_subscriptions
for delete to authenticated using ((select auth.uid()) = user_id);
grant select, delete on public.push_subscriptions to authenticated;

-- Registers this browser for the signed-in user (a browser that changes account moves with it).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_signed_in'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Lessons that already got their "starts soon" notification.
create table if not exists public.lesson_push_log (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.lesson_push_log enable row level security;
revoke all on public.lesson_push_log from anon, authenticated;
