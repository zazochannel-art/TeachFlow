-- TeachFlow 0014: AI test builder on top of the quizzes of 0013 (no new parallel test tables).
--
-- 1. quizzes gets the test settings (subject, level, language, topic, difficulty, duration,
--    pass mark), a status (draft / published / finished / archived), versions and a share code.
--    Questions stay in quizzes.questions (jsonb) and gain new types:
--      single | multi | truefalse | short | open | fill | match | order | numeric
--    plus explanation, difficulty and an optional image (storage path qz/<teacher>/<quiz>/<file>).
-- 2. quiz_assignments gets the publishing settings per student (start, deadline, time limit,
--    attempts, shuffled order, when to show the correct answers) and a summary of the attempts.
-- 3. quiz_attempts (new): every attempt, with a snapshot of the questions taken when the student
--    starts, the auto-saved answers, the score per question and the teacher's marks for open
--    questions. Students cannot read this table (it holds the correct answers); they go through
--    quiz_for_student(), quiz_start(), quiz_save_draft(), submit_quiz() and quiz_review_for_student().
--    The answer snapshot no longer lives in quiz_assignments.questions (students can read that table).
--
-- Safe to run more than once.

-- 1. Quizzes -----------------------------------------------------------------------------------
alter table public.quizzes add column if not exists subject text check (subject is null or char_length(subject) <= 80);
alter table public.quizzes add column if not exists level text check (level is null or char_length(level) <= 80);
alter table public.quizzes add column if not exists language text check (language is null or char_length(language) <= 40);
alter table public.quizzes add column if not exists topic text check (topic is null or char_length(topic) <= 200);
alter table public.quizzes add column if not exists difficulty text check (difficulty is null or difficulty in ('easy', 'medium', 'hard', 'mixed'));
alter table public.quizzes add column if not exists time_limit_min int check (time_limit_min is null or time_limit_min between 1 and 240);
alter table public.quizzes add column if not exists pass_percent int not null default 50 check (pass_percent between 0 and 100);
alter table public.quizzes add column if not exists status text not null default 'draft' check (status in ('draft', 'published', 'finished', 'archived'));
alter table public.quizzes add column if not exists version int not null default 1 check (version between 1 and 1000);
alter table public.quizzes add column if not exists parent_id uuid references public.quizzes(id) on delete set null;
alter table public.quizzes add column if not exists share_code text unique check (share_code is null or share_code ~ '^[A-Za-z0-9]{8,24}$');
alter table public.quizzes add column if not exists ai_prompt text check (ai_prompt is null or char_length(ai_prompt) <= 4000);
alter table public.quizzes add column if not exists question_types jsonb not null default '[]'::jsonb check (jsonb_typeof(question_types) = 'array');
alter table public.quizzes add column if not exists max_attempts int not null default 1 check (max_attempts between 1 and 20);
alter table public.quizzes add column if not exists shuffle boolean not null default false;
alter table public.quizzes add column if not exists show_answers text not null default 'after_submit' check (show_answers in ('after_submit', 'after_due', 'never'));
create index if not exists quizzes_parent_idx on public.quizzes(parent_id);

-- Quizzes that were already given to students count as published.
update public.quizzes q set status = 'published'
 where q.status = 'draft' and exists (select 1 from public.quiz_assignments a where a.quiz_id = q.id);

-- 2. Assignments -------------------------------------------------------------------------------
alter table public.quiz_assignments add column if not exists starts_at timestamptz;
alter table public.quiz_assignments add column if not exists time_limit_min int check (time_limit_min is null or time_limit_min between 1 and 240);
alter table public.quiz_assignments add column if not exists max_attempts int not null default 1 check (max_attempts between 1 and 20);
alter table public.quiz_assignments add column if not exists shuffle boolean not null default false;
alter table public.quiz_assignments add column if not exists show_answers text not null default 'after_submit' check (show_answers in ('after_submit', 'after_due', 'never'));
alter table public.quiz_assignments add column if not exists attempts_used int not null default 0 check (attempts_used >= 0);
alter table public.quiz_assignments add column if not exists needs_review boolean not null default false;
alter table public.quiz_assignments add column if not exists last_attempt_id uuid;
alter table public.quiz_assignments add column if not exists time_spent_sec int;
create index if not exists quiz_assignments_quiz_idx on public.quiz_assignments(quiz_id);

-- 3. Attempts ----------------------------------------------------------------------------------
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.quiz_assignments(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attempt_no int not null check (attempt_no between 1 and 20),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  question_scores jsonb not null default '{}'::jsonb,
  manual_scores jsonb not null default '{}'::jsonb,
  feedback jsonb not null default '{}'::jsonb,
  auto_score numeric(8,2),
  score numeric(8,2),
  max_score numeric(8,2),
  needs_review boolean not null default false,
  started_at timestamptz not null default now(),
  deadline_at timestamptz,
  saved_at timestamptz,
  submitted_at timestamptz,
  unique (assignment_id, attempt_no)
);
create index if not exists quiz_attempts_teacher_idx on public.quiz_attempts(teacher_id);
create index if not exists quiz_attempts_quiz_idx on public.quiz_attempts(quiz_id);
create index if not exists quiz_attempts_assignment_idx on public.quiz_attempts(assignment_id);
alter table public.quiz_attempts enable row level security;

-- Teachers read and remove the attempts of their own students; changes go through functions.
drop policy if exists "quiz_attempts_teacher_select" on public.quiz_attempts;
create policy "quiz_attempts_teacher_select" on public.quiz_attempts
for select to authenticated using ((select auth.uid()) = teacher_id);
drop policy if exists "quiz_attempts_teacher_delete" on public.quiz_attempts;
create policy "quiz_attempts_teacher_delete" on public.quiz_attempts
for delete to authenticated using ((select auth.uid()) = teacher_id);
revoke all on public.quiz_attempts from anon, authenticated;
grant select, delete on public.quiz_attempts to authenticated;

-- Move the snapshots of 0013 into attempts, so students can no longer read correct answers.
insert into public.quiz_attempts (assignment_id, quiz_id, teacher_id, student_id, attempt_no, status, questions, answers,
  question_scores, auto_score, score, max_score, started_at, submitted_at)
select a.id, a.quiz_id, a.teacher_id, a.student_id, 1, 'submitted', coalesce(a.questions, '[]'::jsonb), coalesce(a.answers, '{}'::jsonb),
  coalesce((select jsonb_object_agg(x->>'id', case when coalesce(a.correct_ids, '[]'::jsonb) ? (x->>'id') then coalesce((x->>'points')::numeric, 1) else 0 end)
            from jsonb_array_elements(coalesce(a.questions, '[]'::jsonb)) x), '{}'::jsonb),
  a.score, a.score, a.max_score, coalesce(a.submitted_at, a.created_at), a.submitted_at
from public.quiz_assignments a
where a.status = 'submitted'
  and not exists (select 1 from public.quiz_attempts t where t.assignment_id = a.id);

update public.quiz_assignments a
   set attempts_used = greatest(a.attempts_used, 1),
       last_attempt_id = coalesce(a.last_attempt_id, (select t.id from public.quiz_attempts t where t.assignment_id = a.id order by t.attempt_no desc limit 1))
 where a.status = 'submitted';
update public.quiz_assignments set questions = null where questions is not null;

-- 4. Grading -----------------------------------------------------------------------------------
create or replace function private.quiz_points(x jsonb)
returns numeric language sql immutable set search_path = ''
as $$
  select case when jsonb_typeof(x->'points') = 'number' then greatest((x->>'points')::numeric, 0) else 1 end
$$;

create or replace function private.quiz_num(p text)
returns numeric language sql immutable set search_path = ''
as $$
  select case when replace(replace(coalesce(p, ''), ',', '.'), ' ', '') ~ '^[-+]?\d+(\.\d+)?$'
              then replace(replace(p, ',', '.'), ' ', '')::numeric end
$$;

-- true / false for automatically graded questions, null for open questions (the teacher marks them).
-- Answers: option indexes (single, multi, truefalse), [text] (short, numeric, open),
-- [text per blank] (fill), [right side per left item] (match), [items in order] (order).
create or replace function private.quiz_check(x jsonb, ans jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare
  t text := coalesce(x->>'type', 'single');
  n int;
  i int;
  want numeric;
  got numeric;
begin
  if ans is null or jsonb_typeof(ans) <> 'array' then ans := '[]'::jsonb; end if;
  if t = 'open' then return null; end if;
  if t = 'short' then
    return private.norm_answer(ans->>0) <> '' and exists (
      select 1 from jsonb_array_elements_text(coalesce(x->'accept', '[]'::jsonb)) acc
      where private.norm_answer(acc) = private.norm_answer(ans->>0));
  end if;
  if t = 'numeric' then
    want := private.quiz_num(x->>'answer_num');
    got := private.quiz_num(ans->>0);
    return want is not null and got is not null
       and abs(got - want) <= greatest(coalesce(private.quiz_num(x->>'tolerance'), 0), 0.000001);
  end if;
  if t = 'fill' then
    n := jsonb_array_length(coalesce(x->'blanks', '[]'::jsonb));
    if n = 0 then return false; end if;
    for i in 0 .. n - 1 loop
      if private.norm_answer(ans->>i) = '' or not exists (
        select 1 from jsonb_array_elements_text(coalesce(x->'blanks'->i, '[]'::jsonb)) acc
        where private.norm_answer(acc) = private.norm_answer(ans->>i)) then
        return false;
      end if;
    end loop;
    return true;
  end if;
  if t = 'match' then
    n := jsonb_array_length(coalesce(x->'pairs', '[]'::jsonb));
    if n = 0 then return false; end if;
    for i in 0 .. n - 1 loop
      if private.norm_answer(ans->>i) <> private.norm_answer(x->'pairs'->i->>'right') then return false; end if;
    end loop;
    return true;
  end if;
  if t = 'order' then
    n := jsonb_array_length(coalesce(x->'options', '[]'::jsonb));
    if n = 0 or jsonb_array_length(ans) <> n then return false; end if;
    for i in 0 .. n - 1 loop
      if private.norm_answer(ans->>i) <> private.norm_answer(x->'options'->>i) then return false; end if;
    end loop;
    return true;
  end if;
  -- single, multi, truefalse
  return jsonb_array_length(coalesce(x->'correct', '[]'::jsonb)) > 0 and
    (select coalesce(array_agg(distinct v::int order by v::int), '{}') from jsonb_array_elements_text(ans) v where v ~ '^\d{1,3}$')
    = (select coalesce(array_agg(distinct v::int order by v::int), '{}') from jsonb_array_elements_text(coalesce(x->'correct', '[]'::jsonb)) v where v ~ '^\d{1,3}$');
end;
$$;

-- Grades a whole attempt: { score, max, scores: {id: points}, correct: [ids], review: bool }.
-- manual: the teacher's points for open questions ({id: points}).
create or replace function private.quiz_grade(qs jsonb, answers jsonb, manual jsonb)
returns jsonb language plpgsql immutable set search_path = ''
as $$
declare
  x jsonb;
  pts numeric;
  ok boolean;
  m numeric;
  total numeric := 0;
  got numeric := 0;
  auto numeric := 0;
  scores jsonb := '{}'::jsonb;
  ids jsonb := '[]'::jsonb;
  review boolean := false;
begin
  if answers is null or jsonb_typeof(answers) <> 'object' then answers := '{}'::jsonb; end if;
  if manual is null or jsonb_typeof(manual) <> 'object' then manual := '{}'::jsonb; end if;
  for x in select * from jsonb_array_elements(coalesce(qs, '[]'::jsonb)) loop
    pts := private.quiz_points(x);
    total := total + pts;
    ok := private.quiz_check(x, answers -> (x->>'id'));
    if ok is null then
      m := private.quiz_num(manual->>(x->>'id'));
      if m is null then
        review := true;
      else
        m := least(greatest(m, 0), pts);
        got := got + m;
        scores := scores || jsonb_build_object(x->>'id', m);
        if m >= pts then ids := ids || jsonb_build_array(x->>'id'); end if;
      end if;
    elsif ok then
      got := got + pts;
      auto := auto + pts;
      scores := scores || jsonb_build_object(x->>'id', pts);
      ids := ids || jsonb_build_array(x->>'id');
    else
      scores := scores || jsonb_build_object(x->>'id', 0);
    end if;
  end loop;
  return jsonb_build_object('score', got, 'auto', auto, 'max', total, 'scores', scores, 'correct', ids, 'review', review);
end;
$$;

-- A question as the student sees it: no correct answers, sides of a match and order steps shuffled.
create or replace function private.quiz_public_question(x jsonb, seed text)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', x->>'id',
    'type', coalesce(x->>'type', 'single'),
    'text', x->>'text',
    'points', private.quiz_points(x),
    'image', x->>'image',
    'unit', x->>'unit',
    'options', case
      when x->>'type' in ('single', 'multi', 'truefalse') then coalesce(x->'options', '[]'::jsonb)
      when x->>'type' = 'order' then (
        select coalesce(jsonb_agg(o order by md5(seed || (x->>'id') || o)), '[]'::jsonb)
        from jsonb_array_elements_text(coalesce(x->'options', '[]'::jsonb)) o)
      when x->>'type' = 'match' then (
        select coalesce(jsonb_agg(p->>'right' order by md5(seed || (x->>'id') || (p->>'right'))), '[]'::jsonb)
        from jsonb_array_elements(coalesce(x->'pairs', '[]'::jsonb)) p)
      end,
    'left', case when x->>'type' = 'match' then (
        select coalesce(jsonb_agg(p->>'left' order by n), '[]'::jsonb)
        from jsonb_array_elements(coalesce(x->'pairs', '[]'::jsonb)) with ordinality as e(p, n)) end,
    'blanks_count', case when x->>'type' = 'fill' then jsonb_array_length(coalesce(x->'blanks', '[]'::jsonb)) end
  ))
$$;

create or replace function private.quiz_public_questions(qs jsonb, seed text, shuffle boolean)
returns jsonb language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(private.quiz_public_question(x, seed)
           order by case when shuffle then md5(seed || (x->>'id')) end, n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(qs, '[]'::jsonb)) with ordinality as e(x, n)
$$;

revoke all on function private.quiz_points(jsonb), private.quiz_num(text), private.quiz_check(jsonb, jsonb),
  private.quiz_grade(jsonb, jsonb, jsonb), private.quiz_public_question(jsonb, text), private.quiz_public_questions(jsonb, text, boolean) from public;
grant execute on function private.quiz_points(jsonb), private.quiz_num(text), private.quiz_check(jsonb, jsonb),
  private.quiz_grade(jsonb, jsonb, jsonb), private.quiz_public_question(jsonb, text), private.quiz_public_questions(jsonb, text, boolean) to authenticated;

-- 5. Student functions -------------------------------------------------------------------------
-- Everything the student page needs. Questions are returned only while an attempt is running.
drop function if exists public.quiz_for_student(uuid);
create function public.quiz_for_student(p_assignment_id uuid)
returns table (
  title text, description text, due_at timestamptz, starts_at timestamptz, status text,
  time_limit_min int, max_attempts int, attempts_used int, show_answers text,
  score numeric, max_score numeric, needs_review boolean, submitted_at timestamptz, pass_percent int,
  question_count int, total_points numeric, quiz_state text,
  attempt_id uuid, attempt_started_at timestamptz, deadline_at timestamptz, questions jsonb, draft jsonb
)
language sql stable security definer set search_path = ''
as $$
  select a.title, q.description, a.due_at, a.starts_at, a.status,
    a.time_limit_min, a.max_attempts, a.attempts_used, a.show_answers,
    a.score, a.max_score, a.needs_review, a.submitted_at, q.pass_percent,
    jsonb_array_length(q.questions), (select coalesce(sum(private.quiz_points(x)), 0) from jsonb_array_elements(q.questions) x), q.status,
    t.id, t.started_at, t.deadline_at,
    case when t.id is null then '[]'::jsonb else private.quiz_public_questions(t.questions, t.id::text, a.shuffle) end,
    coalesce(t.answers, '{}'::jsonb)
  from public.quiz_assignments a
  join public.quizzes q on q.id = a.quiz_id
  left join public.quiz_attempts t on t.assignment_id = a.id and t.status = 'in_progress'
  where a.id = p_assignment_id
    and a.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
$$;

-- Starts (or resumes) an attempt and takes the snapshot of the questions.
create or replace function public.quiz_start(p_assignment_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  a public.quiz_assignments;
  q public.quizzes;
  existing uuid;
  new_id uuid;
  limit_at timestamptz;
begin
  select * into a from public.quiz_assignments qa
   where qa.id = p_assignment_id
     and qa.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
   for update;
  if not found then raise exception 'quiz_not_found'; end if;
  select t.id into existing from public.quiz_attempts t where t.assignment_id = a.id and t.status = 'in_progress';
  if existing is not null then return existing; end if;

  select * into q from public.quizzes where id = a.quiz_id;
  if q.status in ('finished', 'archived') then raise exception 'quiz_closed'; end if;
  if a.starts_at is not null and now() < a.starts_at then raise exception 'quiz_not_started'; end if;
  if a.due_at is not null and now() > a.due_at then raise exception 'quiz_past_due'; end if;
  if a.attempts_used >= a.max_attempts then raise exception 'quiz_no_attempts_left'; end if;
  if jsonb_array_length(q.questions) = 0 then raise exception 'quiz_empty'; end if;

  limit_at := case when a.time_limit_min is not null then now() + make_interval(mins => a.time_limit_min) end;
  insert into public.quiz_attempts (assignment_id, quiz_id, teacher_id, student_id, attempt_no, questions, deadline_at)
  values (a.id, a.quiz_id, a.teacher_id, a.student_id, a.attempts_used + 1, q.questions,
          case when limit_at is null then a.due_at when a.due_at is null then limit_at else least(limit_at, a.due_at) end)
  returning id into new_id;
  return new_id;
end;
$$;

-- Auto-save while the student answers. Refused once time is over (1 minute of grace).
create or replace function public.quiz_save_draft(p_assignment_id uuid, p_answers jsonb)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  t public.quiz_attempts;
begin
  select at.* into t from public.quiz_attempts at
    join public.quiz_assignments a on a.id = at.assignment_id
   where at.assignment_id = p_assignment_id and at.status = 'in_progress'
     and a.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
   for update of at;
  if not found then raise exception 'quiz_not_started'; end if;
  if t.deadline_at is not null and now() > t.deadline_at + interval '1 minute' then raise exception 'quiz_time_over'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then p_answers := '{}'::jsonb; end if;
  if octet_length(p_answers::text) > 100000 then raise exception 'answers_too_long'; end if;
  update public.quiz_attempts set answers = p_answers, saved_at = now() where id = t.id;
  return now();
end;
$$;

-- Hands in the running attempt and grades it. After the time limit (2 minutes of grace) the last
-- auto-saved answers count instead of the ones sent.
drop function if exists public.submit_quiz(uuid, jsonb);
create function public.submit_quiz(p_assignment_id uuid, p_answers jsonb)
returns table (score numeric, max_score numeric, needs_review boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  a public.quiz_assignments;
  t public.quiz_attempts;
  g jsonb;
  ans jsonb;
  tid uuid;
begin
  select * into a from public.quiz_assignments qa
   where qa.id = p_assignment_id
     and qa.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
   for update;
  if not found then raise exception 'quiz_not_found'; end if;

  select * into t from public.quiz_attempts at where at.assignment_id = a.id and at.status = 'in_progress' for update;
  if not found then
    if a.status = 'submitted' then raise exception 'quiz_already_submitted'; end if;
    tid := public.quiz_start(a.id);
    select * into t from public.quiz_attempts where id = tid for update;
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then p_answers := '{}'::jsonb; end if;
  if octet_length(p_answers::text) > 100000 then raise exception 'answers_too_long'; end if;
  ans := case when t.deadline_at is not null and now() > t.deadline_at + interval '2 minutes' then t.answers else p_answers end;
  g := private.quiz_grade(t.questions, ans, '{}'::jsonb);

  update public.quiz_attempts
     set status = 'submitted', answers = ans, question_scores = g->'scores', auto_score = (g->>'auto')::numeric,
         score = (g->>'score')::numeric, max_score = (g->>'max')::numeric, needs_review = (g->>'review')::boolean,
         submitted_at = now()
   where id = t.id;
  update public.quiz_assignments
     set status = 'submitted', answers = ans, questions = null, correct_ids = g->'correct',
         score = (g->>'score')::numeric, max_score = (g->>'max')::numeric, needs_review = (g->>'review')::boolean,
         submitted_at = now(), attempts_used = t.attempt_no, last_attempt_id = t.id,
         time_spent_sec = greatest(0, extract(epoch from (now() - t.started_at))::int)
   where id = a.id;
  return query select (g->>'score')::numeric, (g->>'max')::numeric, (g->>'review')::boolean;
end;
$$;

-- The last handed-in attempt for the student. Correct answers and explanations only when allowed:
-- right after handing in (if no attempts are left) or after the deadline, never if the teacher hid them.
create or replace function public.quiz_review_for_student(p_assignment_id uuid)
returns table (questions jsonb, answers jsonb, scores jsonb, feedback jsonb, reveal boolean, attempt_no int)
language sql stable security definer set search_path = ''
as $$
  with x as (
    select a, t,
      (a.show_answers = 'after_submit' and a.attempts_used >= a.max_attempts)
      or (a.show_answers <> 'never' and a.due_at is not null and now() > a.due_at) as reveal
    from public.quiz_assignments a
    join public.quiz_attempts t on t.id = a.last_attempt_id and t.status = 'submitted'
    where a.id = p_assignment_id
      and a.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
  )
  select case when x.reveal then (x.t).questions else private.quiz_public_questions((x.t).questions, (x.t).id::text, false) end,
    (x.t).answers, (x.t).question_scores || (x.t).manual_scores, (x.t).feedback, x.reveal, (x.t).attempt_no
  from x
$$;

-- The share link of a test opens the student's own copy of it.
create or replace function public.quiz_open_by_code(p_code text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select a.id from public.quiz_assignments a
  join public.quizzes q on q.id = a.quiz_id
  where q.share_code = p_code
    and a.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
  order by a.created_at desc limit 1
$$;

-- 6. Teacher: marks for open questions -----------------------------------------------------------
-- p_scores: {question id: points}; p_feedback: {question id: comment}. Only open questions count.
create or replace function public.quiz_grade_open(p_attempt_id uuid, p_scores jsonb, p_feedback jsonb)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  t public.quiz_attempts;
  open_ids text[];
  manual jsonb := '{}'::jsonb;
  fb jsonb;
  k text;
  g jsonb;
begin
  select * into t from public.quiz_attempts where id = p_attempt_id and teacher_id = (select auth.uid()) for update;
  if not found then raise exception 'quiz_not_found'; end if;
  if t.status <> 'submitted' then raise exception 'quiz_not_submitted'; end if;
  select coalesce(array_agg(x->>'id'), '{}') into open_ids from jsonb_array_elements(t.questions) x where x->>'type' = 'open';
  manual := t.manual_scores;
  fb := t.feedback;
  for k in select jsonb_object_keys(coalesce(p_scores, '{}'::jsonb)) loop
    if k = any(open_ids) then
      if private.quiz_num(p_scores->>k) is null then manual := manual - k;
      else manual := manual || jsonb_build_object(k, private.quiz_num(p_scores->>k)); end if;
    end if;
  end loop;
  for k in select jsonb_object_keys(coalesce(p_feedback, '{}'::jsonb)) loop
    if k = any(open_ids) then fb := fb || jsonb_build_object(k, left(coalesce(p_feedback->>k, ''), 2000)); end if;
  end loop;
  g := private.quiz_grade(t.questions, t.answers, manual);
  -- Stored marks are the clamped ones.
  manual := (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(g->'scores') where key = any(open_ids));

  update public.quiz_attempts
     set manual_scores = manual, feedback = fb, question_scores = g->'scores',
         score = (g->>'score')::numeric, needs_review = (g->>'review')::boolean
   where id = t.id;
  update public.quiz_assignments
     set score = (g->>'score')::numeric, needs_review = (g->>'review')::boolean, correct_ids = g->'correct'
   where id = t.assignment_id and last_attempt_id = t.id;
  return (g->>'score')::numeric;
end;
$$;

revoke all on function public.quiz_for_student(uuid), public.quiz_start(uuid), public.quiz_save_draft(uuid, jsonb),
  public.submit_quiz(uuid, jsonb), public.quiz_review_for_student(uuid), public.quiz_open_by_code(text),
  public.quiz_grade_open(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.quiz_for_student(uuid), public.quiz_start(uuid), public.quiz_save_draft(uuid, jsonb),
  public.submit_quiz(uuid, jsonb), public.quiz_review_for_student(uuid), public.quiz_open_by_code(text),
  public.quiz_grade_open(uuid, jsonb, jsonb) to authenticated;

-- 7. Images in questions: qz/<teacher uid>/<quiz id>/<file> ---------------------------------------
create or replace function private.can_read_quiz_file(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.quiz_assignments a
    where a.quiz_id = private.uuid_or_null((storage.foldername(p_name))[3])
      and a.student_id in (select s.id from public.students s where s.user_id = (select auth.uid()))
  )
$$;
revoke all on function private.can_read_quiz_file(text) from public;
grant execute on function private.can_read_quiz_file(text) to authenticated;

drop policy if exists "tf_files_select" on storage.objects;
drop policy if exists "tf_files_insert" on storage.objects;

create policy "tf_files_select" on storage.objects
for select to authenticated using (
  bucket_id = 'teachflow-files' and (
    ((storage.foldername(name))[1] = 'lesson' and private.can_use_lesson_board(private.uuid_or_null((storage.foldername(name))[2])))
    or ((storage.foldername(name))[1] in ('hw', 'sub', 'lib', 'qz') and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] in ('hw', 'sub', 'lib') and private.can_read_homework_file(name))
    or ((storage.foldername(name))[1] = 'lib' and private.can_read_library_file(name))
    or ((storage.foldername(name))[1] = 'qz' and private.can_read_quiz_file(name))
  )
);

create policy "tf_files_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'teachflow-files' and (
    ((storage.foldername(name))[1] = 'lesson' and private.can_use_lesson_board(private.uuid_or_null((storage.foldername(name))[2])))
    or ((storage.foldername(name))[1] in ('hw', 'lib', 'qz') and (storage.foldername(name))[2] = (select auth.uid())::text
        and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role::text in ('teacher', 'admin')))
    or ((storage.foldername(name))[1] = 'sub' and (storage.foldername(name))[2] = (select auth.uid())::text
        and private.can_hand_in(private.uuid_or_null((storage.foldername(name))[3])))
  )
);
