-- TeachFlow: files on the lesson whiteboard and on homework.
--
-- One private Storage bucket, `teachflow-files` (max 25 MB per file). Files are never public:
-- the app shows them through short-lived signed links, and the policies below decide who may
-- upload or read each folder.
--
--   lesson/<lesson_id>/<file>             files and images of a lesson (whiteboard)
--                                         -> the lesson's teacher and its students
--   hw/<teacher_user_id>/<file>           files the teacher attaches to homework
--                                         -> the teacher, and students whose homework lists the file
--   sub/<student_user_id>/<homework_id>/<file>  files a student hands in
--                                         -> that student, and the teacher of the homework

-- 1. Bucket
insert into storage.buckets (id, name, public, file_size_limit)
values ('teachflow-files', 'teachflow-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- 2. Columns for the attachment lists: [{ "path", "name", "size", "type" }, ...]
alter table public.homework add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.homework add column if not exists submission_files jsonb not null default '[]'::jsonb;
alter table public.homework drop constraint if exists homework_attachments_check;
alter table public.homework add constraint homework_attachments_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10
     and jsonb_typeof(submission_files) = 'array' and jsonb_array_length(submission_files) <= 10);

-- 3. Helpers (SECURITY DEFINER: they read homework/lessons without RLS recursion)
create or replace function private.uuid_or_null(p text)
returns uuid language sql immutable set search_path = ''
as $$ select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end $$;

create or replace function private.can_read_homework_file(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.homework h
    where (
      -- a student reading a file the teacher attached to their homework
      h.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
      and h.attachments @> jsonb_build_array(jsonb_build_object('path', p_name))
    ) or (
      -- a teacher reading a file a student handed in
      h.teacher_id = (select auth.uid())
      and h.submission_files @> jsonb_build_array(jsonb_build_object('path', p_name))
    )
  )
$$;

create or replace function private.can_hand_in(p_homework_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.homework h
    where h.id = p_homework_id
      and h.status in ('assigned', 'submitted')
      and h.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
  )
$$;

create or replace function private.is_lesson_teacher(p_lesson_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.lessons l where l.id = p_lesson_id and l.teacher_id = (select auth.uid())) $$;

revoke all on function private.uuid_or_null(text), private.can_read_homework_file(text), private.can_hand_in(uuid), private.is_lesson_teacher(uuid) from public;
grant execute on function private.uuid_or_null(text), private.can_read_homework_file(text), private.can_hand_in(uuid), private.is_lesson_teacher(uuid) to authenticated;

-- 4. Storage policies
drop policy if exists "tf_files_select" on storage.objects;
drop policy if exists "tf_files_insert" on storage.objects;
drop policy if exists "tf_files_delete" on storage.objects;

create policy "tf_files_select" on storage.objects
for select to authenticated using (
  bucket_id = 'teachflow-files' and (
    ((storage.foldername(name))[1] = 'lesson' and private.can_use_lesson_board(private.uuid_or_null((storage.foldername(name))[2])))
    or ((storage.foldername(name))[1] in ('hw', 'sub') and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] in ('hw', 'sub') and private.can_read_homework_file(name))
  )
);

create policy "tf_files_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'teachflow-files' and (
    ((storage.foldername(name))[1] = 'lesson' and private.can_use_lesson_board(private.uuid_or_null((storage.foldername(name))[2])))
    or ((storage.foldername(name))[1] = 'hw' and (storage.foldername(name))[2] = (select auth.uid())::text
        and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role <> 'student'))
    or ((storage.foldername(name))[1] = 'sub' and (storage.foldername(name))[2] = (select auth.uid())::text
        and private.can_hand_in(private.uuid_or_null((storage.foldername(name))[3])))
  )
);

-- Uploaders can remove their own files; the teacher can also remove any file of their lesson.
create policy "tf_files_delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'teachflow-files' and (
    owner_id = (select auth.uid())::text
    or ((storage.foldername(name))[1] = 'lesson' and private.is_lesson_teacher(private.uuid_or_null((storage.foldername(name))[2])))
  )
);

-- 5. Handing in homework with files (the text answer becomes optional when files are attached).
create or replace function public.submit_homework_files(p_homework_id uuid, p_submission text, p_files jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  f jsonb;
begin
  if p_files is null then p_files := '[]'::jsonb; end if;
  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) > 10 then raise exception 'too_many_files'; end if;
  for f in select * from jsonb_array_elements(p_files) loop
    if jsonb_typeof(f) <> 'object' or coalesce(f->>'path', '') not like 'sub/' || uid || '/' || p_homework_id::text || '/%' then
      raise exception 'bad_file';
    end if;
  end loop;
  if (p_submission is null or char_length(btrim(p_submission)) = 0) and jsonb_array_length(p_files) = 0 then
    raise exception 'empty_submission';
  end if;
  if char_length(coalesce(p_submission, '')) > 8000 then raise exception 'submission_too_long'; end if;

  update public.homework
     set submission = nullif(btrim(coalesce(p_submission, '')), ''),
         submission_files = p_files,
         status = 'submitted',
         submitted_at = now()
   where id = p_homework_id
     and status in ('assigned', 'submitted')
     and student_id in (select s.id from public.students s where s.user_id = (select auth.uid()));
  if not found then raise exception 'homework_not_found'; end if;
end;
$$;

revoke all on function public.submit_homework_files(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_homework_files(uuid, text, jsonb) to authenticated;
