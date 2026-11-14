-- TeachFlow 0009: enforce the plan's active-student limit in the database.
--
-- Until now only the app's "save student" action checked the limit, so a request sent straight to
-- the Supabase API could add more active students than the plan allows. This trigger runs on every
-- insert, and on every update that makes a student active, whatever client sends it.
-- Limits must match src/lib/plans.ts (tests/student-limit-sql.test.ts checks this):
--   free 5 · starter 20 · pro 60 · premium unlimited. Admin accounts have no limit.
-- A paid plan counts only while its status is active/trialing and it is not past current_period_end;
-- otherwise the Free limit applies (same rule as effectivePlan() in the app).
-- Students who are already active above the limit are kept; only new activations are refused.
-- Safe to run more than once.

create or replace function private.enforce_student_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  plan text;
  lim integer;
  active_count integer;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' and old.teacher_id = new.teacher_id then return new; end if;
  if exists (select 1 from public.user_roles r where r.user_id = new.teacher_id and r.role = 'admin') then return new; end if;

  select s.plan_code into plan from public.subscriptions s
  where s.teacher_id = new.teacher_id
    and s.status in ('active', 'trialing')
    and (s.current_period_end is null or s.current_period_end > now());

  lim := case coalesce(plan, 'free')
           when 'premium' then null
           when 'pro' then 60
           when 'starter' then 20
           else 5
         end;
  if lim is null then return new; end if;

  -- One teacher's activations run one at a time, so two parallel requests cannot both slip in.
  perform pg_advisory_xact_lock(hashtextextended('teachflow.student_limit:' || new.teacher_id::text, 0));

  select count(*) into active_count from public.students s
  where s.teacher_id = new.teacher_id and s.status = 'active' and s.id <> new.id;

  if active_count >= lim then
    raise exception 'student_limit_reached' using errcode = 'P0001', detail = format('limit=%s', lim);
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_student_limit() from public, anon, authenticated;

drop trigger if exists students_enforce_limit on public.students;
create trigger students_enforce_limit before insert or update of status, teacher_id on public.students
for each row execute procedure private.enforce_student_limit();
