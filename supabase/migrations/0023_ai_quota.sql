-- TeachFlow 0023: daily AI quota per teacher, by plan.
--
-- Every call to /api/ai/quiz costs money on the Anthropic account. Until now any signed-in teacher
-- could send as many requests as they liked. The route now calls public.consume_ai_quota() first:
-- it adds the request's cost to today's counter (UTC day) and refuses once the plan's daily units are
-- used up. Generating many questions costs more units than editing one question.
-- Limits must match AI_DAILY_UNITS in src/lib/plans.ts (tests/ai-quota-sql.test.ts checks this):
--   free 10 · starter 40 · pro 100 · premium 250 units a day. Admin accounts have no limit.
-- A paid plan counts only while active/trialing and not past current_period_end (same rule as
-- effectivePlan() in the app and the student limit in 0009).
-- Safe to run more than once.

create table if not exists public.ai_usage (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  units integer not null default 0 check (units >= 0),
  primary key (teacher_id, day)
);
alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_own_select" on public.ai_usage;
create policy "ai_usage_own_select" on public.ai_usage
for select to authenticated using ((select auth.uid()) = teacher_id);
-- Writes only through consume_ai_quota() below.
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- Adds p_cost units to today's counter for the signed-in teacher when they fit in the plan.
-- Returns { allowed, used, limit } (limit null = unlimited). Never charges a refused request.
create or replace function public.consume_ai_quota(p_cost integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  plan text;
  lim integer;
  cost integer := greatest(1, least(coalesce(p_cost, 1), 20));
  today date := (now() at time zone 'utc')::date;
  used integer;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.user_roles r where r.user_id = uid and r.role in ('teacher', 'admin')) then
    raise exception 'not_teacher' using errcode = '42501';
  end if;

  if exists (select 1 from public.user_roles r where r.user_id = uid and r.role = 'admin') then
    lim := null;
  else
    select s.plan_code into plan from public.subscriptions s
    where s.teacher_id = uid
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now());
    lim := case coalesce(plan, 'free')
             when 'premium' then 250
             when 'pro' then 100
             when 'starter' then 40
             else 10
           end;
  end if;

  insert into public.ai_usage (teacher_id, day, units) values (uid, today, 0)
  on conflict (teacher_id, day) do nothing;

  -- The row lock makes parallel requests from one teacher count one after another.
  select u.units into used from public.ai_usage u where u.teacher_id = uid and u.day = today for update;

  if lim is not null and used + cost > lim then
    return jsonb_build_object('allowed', false, 'used', used, 'limit', lim);
  end if;

  update public.ai_usage set units = units + cost where teacher_id = uid and day = today;
  return jsonb_build_object('allowed', true, 'used', used + cost, 'limit', lim);
end;
$$;
revoke all on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;

-- There is deliberately no "refund" function: anyone signed in can call an RPC straight through the
-- Supabase API, so a refund would let a teacher reset their own counter. A failed call still counts.

-- Old counters are only history; keep the table small.
delete from public.ai_usage where day < (now() at time zone 'utc')::date - 90;
