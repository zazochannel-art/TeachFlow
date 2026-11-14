-- TeachFlow 0005: manual subscription billing.
-- Teachers request a plan; an admin confirms the payment by hand and sets the plan, status and paid-until date.
-- Make an account admin (once, in the SQL Editor):
--   update public.user_roles set role = 'admin' where user_id = (select id from auth.users where email = 'you@example.com');

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin') $$;

grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

-- A teacher's request to move to a plan. At most one open request per teacher.
create table if not exists public.plan_requests (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_code text not null check (plan_code in ('free','starter','pro','premium')),
  billing_period text not null default 'month' check (billing_period in ('month','year')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','done','cancelled')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create unique index if not exists plan_requests_one_open on public.plan_requests(teacher_id) where status = 'pending';

alter table public.plan_requests enable row level security;

create policy "plan_requests_select_own" on public.plan_requests
  for select to authenticated using (teacher_id = (select auth.uid()) or (select private.is_admin()));
create policy "plan_requests_insert_own" on public.plan_requests
  for insert to authenticated with check (teacher_id = (select auth.uid()) and status = 'pending' and handled_at is null);
create policy "plan_requests_cancel_own" on public.plan_requests
  for delete to authenticated using (teacher_id = (select auth.uid()) and status = 'pending');

revoke all on public.plan_requests from anon;
grant select, insert, delete on public.plan_requests to authenticated;

-- Admins read every subscription (teachers keep reading only their own through 0001's policy).
create policy "subscriptions_select_admin" on public.subscriptions
  for select to authenticated using ((select private.is_admin()));

-- Admin overview: one row per teacher account.
create or replace function public.admin_list_teachers()
returns table (
  teacher_id uuid, full_name text, email text, created_at timestamptz,
  plan_code text, status public.subscription_status, current_period_end timestamptz,
  active_students bigint, request_id uuid, request_plan text, request_period text, request_note text, request_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'not_admin'; end if;
  return query
    select u.id, p.full_name, u.email::text, u.created_at,
           s.plan_code, s.status, s.current_period_end,
           (select count(*) from public.students st where st.teacher_id = u.id and st.status = 'active'),
           r.id, r.plan_code, r.billing_period, r.note, r.created_at
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    left join public.profiles p on p.id = u.id
    left join public.subscriptions s on s.teacher_id = u.id
    left join public.plan_requests r on r.teacher_id = u.id and r.status = 'pending'
    where ur.role in ('teacher', 'admin')
    order by r.created_at desc nulls last, u.created_at desc;
end $$;

-- Sets a teacher's plan by hand (after the payment was received) and closes their open request.
create or replace function public.admin_set_subscription(
  p_teacher uuid, p_plan text, p_status public.subscription_status, p_period_end timestamptz
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'not_admin'; end if;
  if p_plan not in ('free','starter','pro','premium') then raise exception 'invalid_plan'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_teacher and role in ('teacher','admin')) then
    raise exception 'not_a_teacher';
  end if;

  insert into public.subscriptions (teacher_id, plan_code, status, current_period_start, current_period_end, provider)
  values (p_teacher, p_plan, p_status, now(), p_period_end, 'manual')
  on conflict (teacher_id) do update set
    plan_code = excluded.plan_code,
    status = excluded.status,
    current_period_start = case when public.subscriptions.plan_code = excluded.plan_code
                                then public.subscriptions.current_period_start else now() end,
    current_period_end = excluded.current_period_end,
    provider = 'manual';

  update public.plan_requests set status = 'done', handled_at = now()
  where teacher_id = p_teacher and status = 'pending';
end $$;

create or replace function public.admin_close_request(p_request uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'not_admin'; end if;
  update public.plan_requests set status = 'cancelled', handled_at = now() where id = p_request and status = 'pending';
end $$;

revoke all on function public.admin_list_teachers() from public, anon;
revoke all on function public.admin_set_subscription(uuid, text, public.subscription_status, timestamptz) from public, anon;
revoke all on function public.admin_close_request(uuid) from public, anon;
grant execute on function public.admin_list_teachers() to authenticated;
grant execute on function public.admin_set_subscription(uuid, text, public.subscription_status, timestamptz) to authenticated;
grant execute on function public.admin_close_request(uuid) to authenticated;
