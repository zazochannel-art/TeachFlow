-- TeachFlow 0008: tighten function access and add missing foreign-key indexes.
-- Safe to run more than once. Nothing here changes data.

-- 1. Supabase grants EXECUTE on new functions to the `anon` role directly, so 0003's
--    "revoke ... from public" left these callable without signing in (the Supabase security
--    advisor flags them). They refuse anonymous callers anyway, but only signed-in users need them.
--    student_invite_preview stays public on purpose: the invite page shows it before sign-in.
revoke execute on function public.accept_student_invite(text) from anon;
revoke execute on function public.submit_homework(uuid, text) from anon;
revoke execute on function public.send_student_message(uuid, text) from anon;
revoke execute on function public.mark_student_messages_read() from anon;

-- 2. Indexes for foreign keys reported by the performance advisor (faster lookups and deletes).
create index if not exists course_enrollments_student_idx on public.course_enrollments(student_id);
create index if not exists homework_student_idx on public.homework(student_id);
create index if not exists homework_course_idx on public.homework(course_id);
create index if not exists homework_lesson_idx on public.homework(lesson_id);
create index if not exists lessons_course_idx on public.lessons(course_id);
create index if not exists lessons_student_idx on public.lessons(student_id);
create index if not exists messages_student_idx on public.messages(student_id);
create index if not exists payments_student_idx on public.payments(student_id);
create index if not exists payments_course_idx on public.payments(course_id);
create index if not exists student_invites_teacher_idx on public.student_invites(teacher_id);
create index if not exists student_invites_accepted_by_idx on public.student_invites(accepted_by);
create index if not exists lesson_boards_updated_by_idx on public.lesson_boards(updated_by);
