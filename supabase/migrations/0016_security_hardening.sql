-- TeachFlow: security hardening after the full audit (16 Nov 2026).
--
-- 1. A student no longer reads their own `students` row directly. The row holds the teacher's
--    private notes (`notes`) and the parents' contacts, which the old policy exposed through the
--    API. Students now get their safe columns from public.my_student_records().
-- 2. Writes to teacher tables also require the teacher (or admin) role. Before, the policies only
--    checked teacher_id = auth.uid(), so a student or parent account could create its own
--    students, courses or lessons through the API.
-- 3. The files bucket accepts only the file types the app offers (no HTML, SVG or scripts, which
--    a browser could run when the file is opened).
-- 4. Indexes for four foreign keys reported by the Supabase performance advisor.
--
-- Safe to run more than once.

-- 1. Students: own record through a function that leaves out notes and parent contacts -------
drop policy if exists students_self_select on public.students;

create or replace function public.my_student_records()
returns table (
  id uuid, teacher_id uuid, full_name text, email text, phone text, status text,
  created_at timestamptz, user_id uuid, avatar_url text, grade_level text
)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.teacher_id, s.full_name, s.email, s.phone, s.status,
         s.created_at, s.user_id, s.avatar_url, s.grade_level
  from public.students s
  where s.user_id = (select auth.uid())
  order by s.created_at
$$;
revoke all on function public.my_student_records() from public, anon;
grant execute on function public.my_student_records() to authenticated;

-- 2. Teacher role on every teacher write --------------------------------------------------------
create or replace function private.is_teacher()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role in ('teacher', 'admin')
  )
$$;
revoke all on function private.is_teacher() from public, anon;
grant execute on function private.is_teacher() to authenticated;

alter policy students_teacher_all on public.students
  with check ((select auth.uid()) = teacher_id and (select private.is_teacher()));

alter policy courses_teacher_all on public.courses
  with check ((select auth.uid()) = teacher_id and (select private.is_teacher()));

alter policy enrollments_teacher_all on public.course_enrollments
  with check (
    (select auth.uid()) = teacher_id and (select private.is_teacher())
    and exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = (select auth.uid()))
    and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
  );

alter policy lessons_teacher_all on public.lessons
  with check (
    (select auth.uid()) = teacher_id and (select private.is_teacher())
    and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = (select auth.uid())))
    and (student_id is null or exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid())))
  );

alter policy homework_teacher_all on public.homework
  with check (
    (select auth.uid()) = teacher_id and (select private.is_teacher())
    and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
    and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = (select auth.uid())))
    and (lesson_id is null or exists (select 1 from public.lessons l where l.id = lesson_id and l.teacher_id = (select auth.uid())))
  );

alter policy messages_teacher_all on public.messages
  with check (
    (select auth.uid()) = teacher_id and (select private.is_teacher())
    and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
  );

alter policy payments_teacher_all on public.payments
  with check (
    (select auth.uid()) = teacher_id and (select private.is_teacher())
    and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
    and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = (select auth.uid())))
  );

alter policy library_teacher_all on public.library_items
  with check (
    (select auth.uid()) = teacher_id and (select private.is_teacher())
    and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = (select auth.uid())))
  );

alter policy quizzes_teacher_all on public.quizzes
  with check (
    (select auth.uid()) = teacher_id and (select private.is_teacher())
    and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = (select auth.uid())))
  );

alter policy quiz_assignments_teacher_all on public.quiz_assignments
  with check (
    (select auth.uid()) = teacher_id and (select private.is_teacher())
    and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
    and exists (select 1 from public.quizzes q where q.id = quiz_id and q.teacher_id = (select auth.uid()))
  );

alter policy student_rewards_teacher_all on public.student_rewards
  with check (
    (select auth.uid()) = teacher_id and (select private.is_teacher())
    and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
  );

alter policy student_invites_teacher_all on public.student_invites
  with check (
    (select auth.uid()) = teacher_id and (select private.is_teacher())
    and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
  );

alter policy parent_invites_teacher_all on public.parent_invites
  with check (
    (select auth.uid()) = teacher_id and (select private.is_teacher())
    and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
  );

-- 3. File types for the files bucket ------------------------------------------------------------
-- The app uploads unknown types as application/octet-stream (always downloaded, never opened).
update storage.buckets set allowed_mime_types = array[
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/avif', 'image/heic', 'image/heif',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/rtf', 'text/rtf', 'text/plain', 'text/csv',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/flac',
  'application/octet-stream'
]
where id = 'teachflow-files';

-- 4. Foreign keys without an index ----------------------------------------------------------------
create index if not exists quiz_assignments_course_idx on public.quiz_assignments(course_id);
create index if not exists quiz_attempts_student_idx on public.quiz_attempts(student_id);
create index if not exists signup_requests_course_idx on public.signup_requests(course_id);
create index if not exists signup_requests_student_idx on public.signup_requests(student_id);
