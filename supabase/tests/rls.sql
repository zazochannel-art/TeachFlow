-- TeachFlow: behaviour tests of the access rules (RLS, grants and SECURITY DEFINER functions).
--
-- Runs after every migration has been applied (scripts/check-migrations.sh, CI). Each check signs
-- in as one user, the way the Data API does (role "authenticated" plus the JWT claims), and tries
-- what that user should or should not be able to do. Everything happens in one transaction that is
-- rolled back, so the database is left as it was. Any failed check stops with "RLS check failed".

\set ON_ERROR_STOP on
-- Only errors and the final line are printed.
\o /dev/null
begin;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------
create function pg_temp.ok(passed boolean, what text) returns void language plpgsql as $$
begin
  if passed is distinct from true then raise exception 'RLS check failed: %', what; end if;
end $$;

-- Sign in as `uid` (null = signed out) for the following statements of this transaction.
create function pg_temp.sign_in(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
end $$;

-- True when `sql` fails with an error (permission, RLS or a check in a function).
create function pg_temp.refused(sql text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  return true;
end $$;

do $$ begin
  execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace);
  execute format('grant execute on all functions in schema %I to authenticated', pg_my_temp_schema()::regnamespace);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Fixtures (as the database owner): teachers A and B, A's student S, B's student X
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'teacher-a@example.test'),
  ('b0000000-0000-4000-8000-00000000000b', 'teacher-b@example.test'),
  ('c0000000-0000-4000-8000-00000000000c', 'student-s@example.test'),
  ('d0000000-0000-4000-8000-00000000000d', 'student-x@example.test');
-- New accounts are teachers (trigger); make S and X students.
update public.user_roles set role = 'student' where user_id in ('c0000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-00000000000d');
delete from public.teacher_profiles where user_id in ('c0000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-00000000000d');
update public.profiles set full_name = 'Profesor A' where id = 'a0000000-0000-4000-8000-00000000000a';

select set_config('teachflow.linking', 'on', true);
insert into public.students (id, teacher_id, full_name, user_id, notes) values
  ('5a000000-0000-4000-8000-00000000005a', 'a0000000-0000-4000-8000-00000000000a', 'Ana', 'c0000000-0000-4000-8000-00000000000c', 'private note of A'),
  ('5b000000-0000-4000-8000-00000000005b', 'b0000000-0000-4000-8000-00000000000b', 'Xenia', 'd0000000-0000-4000-8000-00000000000d', null);
select set_config('teachflow.linking', 'off', true);

insert into public.courses (id, teacher_id, title) values ('ca000000-0000-4000-8000-0000000000ca', 'a0000000-0000-4000-8000-00000000000a', 'Engleză B2');
insert into public.course_enrollments (teacher_id, course_id, student_id) values
  ('a0000000-0000-4000-8000-00000000000a', 'ca000000-0000-4000-8000-0000000000ca', '5a000000-0000-4000-8000-00000000005a');
-- L_A: group lesson of A's course (S takes part). L_B: B's 1:1 lesson with X.
insert into public.lessons (id, teacher_id, course_id, student_id, title, starts_at, ends_at, status) values
  ('1a000000-0000-4000-8000-0000000001aa', 'a0000000-0000-4000-8000-00000000000a', 'ca000000-0000-4000-8000-0000000000ca', null, 'Engleză', now(), now() + interval '1 hour', 'scheduled'),
  ('1a000000-0000-4000-8000-0000000002aa', 'a0000000-0000-4000-8000-00000000000a', 'ca000000-0000-4000-8000-0000000000ca', null, 'Engleză', now() - interval '7 days', now() - interval '7 days' + interval '1 hour', 'completed'),
  ('1b000000-0000-4000-8000-0000000001bb', 'b0000000-0000-4000-8000-00000000000b', null, '5b000000-0000-4000-8000-00000000005b', 'Pian', now(), now() + interval '1 hour', 'scheduled');
-- B's homework for X, with a hand-in file; and A's own homework for S.
insert into public.homework (id, teacher_id, student_id, title, status, attachments, submission_files) values
  ('4b000000-0000-4000-8000-0000000004bb', 'b0000000-0000-4000-8000-00000000000b', '5b000000-0000-4000-8000-00000000005b', 'Gama', 'submitted',
   '[{"path": "hw/b0000000-0000-4000-8000-00000000000b/b-sheet.pdf"}]',
   '[{"path": "sub/d0000000-0000-4000-8000-00000000000d/4b000000-0000-4000-8000-0000000004bb/x-secret.pdf"}]'),
  ('4a000000-0000-4000-8000-0000000004aa', 'a0000000-0000-4000-8000-00000000000a', '5a000000-0000-4000-8000-00000000005a', 'Eseu', 'assigned', '[]', '[]');
insert into storage.objects (bucket_id, name) values
  ('teachflow-files', 'sub/d0000000-0000-4000-8000-00000000000d/4b000000-0000-4000-8000-0000000004bb/x-secret.pdf'),
  ('teachflow-files', 'hw/b0000000-0000-4000-8000-00000000000b/b-sheet.pdf'),
  ('teachflow-files', 'hw/a0000000-0000-4000-8000-00000000000a/a-sheet.pdf');

set local role authenticated;

-- ---------------------------------------------------------------------------------------------
-- 1. Teachers only see their own school
-- ---------------------------------------------------------------------------------------------
select pg_temp.sign_in('b0000000-0000-4000-8000-00000000000b');
select pg_temp.ok((select count(*) from public.students where teacher_id = 'a0000000-0000-4000-8000-00000000000a') = 0, 'teacher B reads none of teacher A''s students');
select pg_temp.ok((select count(*) from public.lessons where teacher_id = 'a0000000-0000-4000-8000-00000000000a') = 0, 'teacher B reads none of teacher A''s lessons');
select pg_temp.ok((select count(*) from public.lesson_status_counts where teacher_id = 'a0000000-0000-4000-8000-00000000000a') = 0, 'teacher B reads none of teacher A''s lesson totals');
select pg_temp.ok(pg_temp.refused($$insert into public.lessons (teacher_id, title, starts_at, ends_at) values ('a0000000-0000-4000-8000-00000000000a', 'x', now(), now())$$), 'teacher B cannot add a lesson to teacher A');
update public.students set notes = 'changed by B' where id = '5a000000-0000-4000-8000-00000000005a';
select pg_temp.ok(pg_temp.refused($$update public.subscriptions set plan_code = 'premium'$$), 'a teacher cannot change their own plan');

select pg_temp.sign_in('a0000000-0000-4000-8000-00000000000a');
select pg_temp.ok((select notes from public.students where id = '5a000000-0000-4000-8000-00000000005a') = 'private note of A', 'teacher B could not change teacher A''s student');
select pg_temp.ok((select sum(n) from public.lesson_status_counts where teacher_id = 'a0000000-0000-4000-8000-00000000000a') = 2, 'teacher A reads the totals of their own lessons');
select pg_temp.ok(pg_temp.refused($$update public.students set user_id = 'd0000000-0000-4000-8000-00000000000d' where id = '5a000000-0000-4000-8000-00000000005a'$$), 'a teacher cannot link any account to their student');

-- ---------------------------------------------------------------------------------------------
-- 2. Students read through their functions, never the teacher's notes; they cannot write teacher data
-- ---------------------------------------------------------------------------------------------
select pg_temp.sign_in('c0000000-0000-4000-8000-00000000000c');
select pg_temp.ok((select count(*) from public.students) = 0, 'a student does not read the students table (notes, parent contacts)');
select pg_temp.ok((select count(*) from public.my_student_records()) = 1, 'a student reads their own record through my_student_records()');
select pg_temp.ok(pg_temp.refused($$insert into public.courses (teacher_id, title) values ('c0000000-0000-4000-8000-00000000000c', 'x')$$), 'a student cannot create a course');
select pg_temp.ok((select count(*) from public.lessons where id = '1b000000-0000-4000-8000-0000000001bb') = 0, 'a student does not see another teacher''s lessons');

-- ---------------------------------------------------------------------------------------------
-- 3. Files: a homework only opens files from its own folders (migration 0024)
-- ---------------------------------------------------------------------------------------------
-- Legitimate reads.
select pg_temp.sign_in('b0000000-0000-4000-8000-00000000000b');
select pg_temp.ok((select count(*) from storage.objects where name like 'sub/d0000000-%') = 1, 'teacher B reads the hand-in of their student');
select pg_temp.sign_in('d0000000-0000-4000-8000-00000000000d');
select pg_temp.ok((select count(*) from storage.objects where name = 'hw/b0000000-0000-4000-8000-00000000000b/b-sheet.pdf') = 1, 'student X reads the sheet attached to their homework');

-- Teacher A writes the paths of B's files into A's own homework, straight through the API.
select pg_temp.sign_in('a0000000-0000-4000-8000-00000000000a');
update public.homework set
  submission_files = '[{"path": "sub/d0000000-0000-4000-8000-00000000000d/4b000000-0000-4000-8000-0000000004bb/x-secret.pdf"}]',
  attachments = '[{"path": "hw/b0000000-0000-4000-8000-00000000000b/b-sheet.pdf"}, {"path": "hw/a0000000-0000-4000-8000-00000000000a/a-sheet.pdf"}]'
where id = '4a000000-0000-4000-8000-0000000004aa';
select pg_temp.ok((select count(*) from storage.objects where name like 'sub/d0000000-%') = 0, 'teacher A cannot open B''s student''s hand-in through a crafted homework');
select pg_temp.sign_in('c0000000-0000-4000-8000-00000000000c');
select pg_temp.ok((select count(*) from storage.objects where name = 'hw/b0000000-0000-4000-8000-00000000000b/b-sheet.pdf') = 0, 'student S cannot open teacher B''s file through a crafted homework');
select pg_temp.ok((select count(*) from storage.objects where name = 'hw/a0000000-0000-4000-8000-00000000000a/a-sheet.pdf') = 1, 'student S still opens their own teacher''s attached file');

-- ---------------------------------------------------------------------------------------------
-- 4. Signed call signalling (migration 0024)
-- ---------------------------------------------------------------------------------------------
select pg_temp.sign_in('c0000000-0000-4000-8000-00000000000c');
select public.register_call_peer('1a000000-0000-4000-8000-0000000001aa', 'c0000000-0000-4000-8000-00000000000c:tab1',
  '{"kty": "EC", "crv": "P-256", "x": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "y": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}');
select pg_temp.ok(pg_temp.refused($$select public.register_call_peer('1a000000-0000-4000-8000-0000000001aa', 'a0000000-0000-4000-8000-00000000000a:fake',
  '{"kty": "EC", "crv": "P-256", "x": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "y": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}')$$),
  'a student cannot register a key in the teacher''s name');
select pg_temp.ok(pg_temp.refused($$select public.register_call_peer('1a000000-0000-4000-8000-0000000001aa', 'c0000000-0000-4000-8000-00000000000c:tab2', '{"kty": "RSA"}')$$), 'only P-256 public keys are accepted');
select pg_temp.ok(pg_temp.refused($$select * from public.lesson_call_peers$$), 'the key table is not readable directly');

select pg_temp.sign_in('d0000000-0000-4000-8000-00000000000d');
select pg_temp.ok(pg_temp.refused($$select public.register_call_peer('1a000000-0000-4000-8000-0000000001aa', 'd0000000-0000-4000-8000-00000000000d:tab1',
  '{"kty": "EC", "crv": "P-256", "x": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "y": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}')$$),
  'a student of another teacher cannot register for the lesson');
select pg_temp.ok((select count(*) from public.call_peer('1a000000-0000-4000-8000-0000000001aa', 'c0000000-0000-4000-8000-00000000000c:tab1')) = 0, 'outsiders cannot look up the keys of a lesson');

select pg_temp.sign_in('a0000000-0000-4000-8000-00000000000a');
select pg_temp.ok((select role = 'student' and display_name = 'Ana' and user_id = 'c0000000-0000-4000-8000-00000000000c'
  from public.call_peer('1a000000-0000-4000-8000-0000000001aa', 'c0000000-0000-4000-8000-00000000000c:tab1')), 'the teacher sees the student''s key with the role and name from the database');

-- ---------------------------------------------------------------------------------------------
-- 5. Whiteboard: only who may draw sends strokes; everybody in the lesson sees who is there
-- ---------------------------------------------------------------------------------------------
select set_config('realtime.topic', 'board:1a000000-0000-4000-8000-0000000001aa', true);
select pg_temp.sign_in('c0000000-0000-4000-8000-00000000000c');
select pg_temp.ok(pg_temp.refused($$insert into realtime.messages (topic, extension, payload, event) values ('board:1a000000-0000-4000-8000-0000000001aa', 'broadcast', '{}', 'board')$$), 'a student without drawing access cannot send strokes');
insert into realtime.messages (topic, extension, payload, event) values ('board:1a000000-0000-4000-8000-0000000001aa', 'presence', '{}', 'presence');
select pg_temp.sign_in('a0000000-0000-4000-8000-00000000000a');
insert into realtime.messages (topic, extension, payload, event) values ('board:1a000000-0000-4000-8000-0000000001aa', 'broadcast', '{}', 'board');
select pg_temp.sign_in('d0000000-0000-4000-8000-00000000000d');
select set_config('realtime.topic', 'screen:1a000000-0000-4000-8000-0000000001aa', true);
select pg_temp.ok(pg_temp.refused($$insert into realtime.messages (topic, extension, payload, event) values ('screen:1a000000-0000-4000-8000-0000000001aa', 'broadcast', '{}', 'call')$$), 'an outsider cannot signal in the lesson''s call');

-- ---------------------------------------------------------------------------------------------
-- 6. AI quota: the Free plan stops after 10 units a day
-- ---------------------------------------------------------------------------------------------
select pg_temp.sign_in('a0000000-0000-4000-8000-00000000000a');
select pg_temp.ok((public.consume_ai_quota(10) ->> 'allowed')::boolean, 'a Free teacher may spend 10 units');
select pg_temp.ok(not (public.consume_ai_quota(1) ->> 'allowed')::boolean, 'the 11th unit of the day is refused');
select pg_temp.ok(pg_temp.refused($$update public.ai_usage set units = 0$$), 'a teacher cannot reset their own counter');
select pg_temp.sign_in('c0000000-0000-4000-8000-00000000000c');
select pg_temp.ok(pg_temp.refused($$select public.consume_ai_quota(1)$$), 'students have no AI quota');

reset role;
\o
\pset tuples_only on
select 'All RLS checks passed.';
rollback;
