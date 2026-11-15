-- TeachFlow 0015: gamification for students, PDF invoices for parents, public teacher page.
--
-- 1. Gamification: points, levels, badges and streaks are computed by the app from homework,
--    quizzes and lessons; this adds the teacher's on/off switch and bonus points the teacher gives.
-- 2. Invoices: every payment gets a number (PREFIX-YEAR-0001, per teacher and year) and the
--    teacher's billing details; invoice_data() returns everything a PDF needs to the teacher,
--    the student and the student's parents only.
-- 3. Public page: /p/<slug> shows the teacher, their courses and a sign-up form. Visitors never
--    read tables directly: public_teacher_page() and public_signup() check everything.
-- Safe to run more than once.

-- 1. Gamification -------------------------------------------------------------------------------
alter table public.teacher_profiles add column if not exists gamification boolean not null default true;

create table if not exists public.student_rewards (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  points int not null check (points between -100 and 100 and points <> 0),
  reason text not null check (char_length(reason) between 1 and 120),
  created_at timestamptz not null default now()
);
create index if not exists student_rewards_student_idx on public.student_rewards(student_id, created_at);
create index if not exists student_rewards_teacher_idx on public.student_rewards(teacher_id);
alter table public.student_rewards enable row level security;

drop policy if exists "student_rewards_teacher_all" on public.student_rewards;
create policy "student_rewards_teacher_all" on public.student_rewards
for all to authenticated using ((select auth.uid()) = teacher_id)
with check (
  (select auth.uid()) = teacher_id
  and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
);
drop policy if exists "student_rewards_student_select" on public.student_rewards;
create policy "student_rewards_student_select" on public.student_rewards
for select to authenticated using (student_id in (select private.my_student_ids()));
drop policy if exists "student_rewards_parent_select" on public.student_rewards;
create policy "student_rewards_parent_select" on public.student_rewards
for select to authenticated using (student_id in (select private.my_child_ids()));
grant select, insert, update, delete on public.student_rewards to authenticated;

-- Students and parents cannot read teacher_profiles: this says which of their teachers use points.
create or replace function public.gamification_teachers()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select tp.user_id from public.teacher_profiles tp
  where tp.gamification
    and tp.user_id in (
      select s.teacher_id from public.students s where s.user_id = (select auth.uid())
      union select l.teacher_id from public.parent_links l where l.user_id = (select auth.uid())
    )
$$;
revoke all on function public.gamification_teachers() from public, anon;
grant execute on function public.gamification_teachers() to authenticated;

-- 2. Invoices -----------------------------------------------------------------------------------
alter table public.teacher_profiles add column if not exists invoice_name text check (invoice_name is null or char_length(invoice_name) <= 160);
alter table public.teacher_profiles add column if not exists invoice_code text check (invoice_code is null or char_length(invoice_code) <= 40);
alter table public.teacher_profiles add column if not exists invoice_address text check (invoice_address is null or char_length(invoice_address) <= 240);
alter table public.teacher_profiles add column if not exists invoice_bank text check (invoice_bank is null or char_length(invoice_bank) <= 120);
alter table public.teacher_profiles add column if not exists invoice_iban text check (invoice_iban is null or char_length(invoice_iban) <= 40);
alter table public.teacher_profiles add column if not exists invoice_note text check (invoice_note is null or char_length(invoice_note) <= 300);
alter table public.teacher_profiles add column if not exists invoice_prefix text not null default 'TF' check (invoice_prefix ~ '^[A-Z0-9]{1,8}$');
alter table public.teacher_profiles add column if not exists invoice_email boolean not null default true;

alter table public.payments add column if not exists invoice_no text check (invoice_no is null or char_length(invoice_no) <= 40);
alter table public.payments add column if not exists invoice_at timestamptz;
create unique index if not exists payments_invoice_no_idx on public.payments(teacher_id, invoice_no);

-- Last number used per teacher and year. Only the trigger below writes it.
create table if not exists public.invoice_counters (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  last int not null default 0,
  primary key (teacher_id, year)
);
alter table public.invoice_counters enable row level security;
revoke all on public.invoice_counters from anon, authenticated;

-- Invoice e-mails already sent to parents (kind: 'issued' when recorded, 'paid' when paid).
create table if not exists public.invoice_email_log (
  payment_id uuid not null references public.payments(id) on delete cascade,
  recipient text not null,
  kind text not null check (kind in ('issued', 'paid')),
  sent_at timestamptz not null default now(),
  primary key (payment_id, recipient, kind)
);
alter table public.invoice_email_log enable row level security;
revoke all on public.invoice_email_log from anon, authenticated;

-- Numbers are given once, in order, and never change afterwards.
create or replace function private.assign_invoice_no()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  y int;
  n int;
  pfx text;
begin
  if tg_op = 'UPDATE' and old.invoice_no is not null then
    new.invoice_no := old.invoice_no;
    new.invoice_at := old.invoice_at;
    return new;
  end if;
  -- New payments (and old ones without a number) always get the next number, whatever was sent.
  y := extract(year from (coalesce(new.paid_at, new.created_at, now()) at time zone 'Europe/Chisinau'))::int;
  select coalesce(tp.invoice_prefix, 'TF') into pfx from public.teacher_profiles tp where tp.user_id = new.teacher_id;
  insert into public.invoice_counters as c (teacher_id, year, last) values (new.teacher_id, y, 1)
  on conflict (teacher_id, year) do update set last = c.last + 1
  returning c.last into n;
  new.invoice_no := coalesce(pfx, 'TF') || '-' || y || '-' || lpad(n::text, 4, '0');
  new.invoice_at := now();
  return new;
end;
$$;

drop trigger if exists payments_invoice_no on public.payments;
create trigger payments_invoice_no before insert or update on public.payments
for each row execute procedure private.assign_invoice_no();

-- Number the payments recorded before this migration, oldest first (without touching updated_at).
alter table public.payments disable trigger payments_updated_at;
do $$
declare r record;
begin
  for r in select id from public.payments where invoice_no is null order by created_at, id loop
    update public.payments set invoice_no = null where id = r.id;
  end loop;
end $$;
alter table public.payments enable trigger payments_updated_at;

-- Everything one invoice shows, for the teacher, the student or a parent of the student.
create or replace function public.invoice_data(p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  pay public.payments;
  res jsonb;
begin
  if me is null then return null; end if;
  select * into pay from public.payments where id = p_payment_id;
  if not found then return null; end if;
  if not (pay.teacher_id = me
          or exists (select 1 from public.students s where s.id = pay.student_id and s.user_id = me)
          or exists (select 1 from public.parent_links l where l.student_id = pay.student_id and l.user_id = me)) then
    return null;
  end if;
  select jsonb_build_object(
    'id', pay.id, 'invoice_no', pay.invoice_no, 'invoice_at', pay.invoice_at, 'created_at', pay.created_at,
    'amount', pay.amount, 'currency', pay.currency, 'status', pay.status, 'due_date', pay.due_date,
    'paid_at', pay.paid_at, 'method', pay.method, 'note', pay.note,
    'student_name', s.full_name, 'parent_name', s.parent_name,
    'course_title', c.title,
    'teacher_name', coalesce(nullif(p.full_name, ''), ''),
    'teacher_email', u.email,
    'timezone', coalesce(p.timezone, 'Europe/Chisinau'),
    'invoice_name', tp.invoice_name, 'invoice_code', tp.invoice_code, 'invoice_address', tp.invoice_address,
    'invoice_bank', tp.invoice_bank, 'invoice_iban', tp.invoice_iban, 'invoice_note', tp.invoice_note
  ) into res
  from public.students s
  left join public.courses c on c.id = pay.course_id
  left join public.profiles p on p.id = pay.teacher_id
  left join public.teacher_profiles tp on tp.user_id = pay.teacher_id
  left join auth.users u on u.id = pay.teacher_id
  where s.id = pay.student_id;
  return res;
end;
$$;
revoke all on function public.invoice_data(uuid) from public, anon;
grant execute on function public.invoice_data(uuid) to authenticated;

-- 3. Public teacher page ------------------------------------------------------------------------
alter table public.teacher_profiles add column if not exists public_enabled boolean not null default false;
alter table public.teacher_profiles add column if not exists public_slug text;
alter table public.teacher_profiles drop constraint if exists teacher_profiles_public_slug_check;
alter table public.teacher_profiles add constraint teacher_profiles_public_slug_check
  check (public_slug is null or (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(public_slug) between 3 and 40));
create unique index if not exists teacher_profiles_public_slug_idx on public.teacher_profiles(public_slug);
alter table public.teacher_profiles add column if not exists public_city text check (public_city is null or char_length(public_city) <= 80);
alter table public.teacher_profiles add column if not exists public_phone text check (public_phone is null or char_length(public_phone) <= 40);
alter table public.teacher_profiles add column if not exists public_prices boolean not null default true;

alter table public.courses add column if not exists is_public boolean not null default true;

create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  student_name text check (student_name is null or char_length(student_name) <= 120),
  email text check (email is null or char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'new' check (status in ('new', 'accepted', 'declined')),
  student_id uuid references public.students(id) on delete set null,
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create index if not exists signup_requests_teacher_idx on public.signup_requests(teacher_id, created_at desc);
alter table public.signup_requests enable row level security;

-- Teachers read and handle their own requests; new ones only come through public_signup().
drop policy if exists "signup_requests_teacher_select" on public.signup_requests;
create policy "signup_requests_teacher_select" on public.signup_requests
for select to authenticated using ((select auth.uid()) = teacher_id);
drop policy if exists "signup_requests_teacher_update" on public.signup_requests;
create policy "signup_requests_teacher_update" on public.signup_requests
for update to authenticated using ((select auth.uid()) = teacher_id)
with check (
  (select auth.uid()) = teacher_id
  and (student_id is null or exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid())))
);
drop policy if exists "signup_requests_teacher_delete" on public.signup_requests;
create policy "signup_requests_teacher_delete" on public.signup_requests
for delete to authenticated using ((select auth.uid()) = teacher_id);
revoke all on public.signup_requests from anon, authenticated;
grant select, update, delete on public.signup_requests to authenticated;

-- The public page of one teacher (null when it does not exist or is switched off).
create or replace function public.public_teacher_page(p_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'teacher_id', tp.user_id,
    'slug', tp.public_slug,
    'name', coalesce(nullif(p.full_name, ''), ''),
    'avatar_url', p.avatar_url,
    'headline', tp.headline,
    'bio', tp.bio,
    'specialties', to_jsonb(tp.subject_specialties),
    'hourly_rate', case when tp.public_prices then tp.hourly_rate end,
    'currency', tp.currency,
    'city', tp.public_city,
    'phone', tp.public_phone,
    'prices', tp.public_prices,
    'lessons_done', (select count(*) from public.lessons l where l.teacher_id = tp.user_id and l.status = 'completed'),
    'students', (select count(*) from public.students s where s.teacher_id = tp.user_id and s.status = 'active'),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'description', c.description, 'subject', c.subject, 'level', c.level,
        'format', c.format, 'color', c.color,
        'price', case when tp.public_prices then c.price end, 'currency', c.currency
      ) order by c.created_at)
      from public.courses c where c.teacher_id = tp.user_id and c.is_active and c.is_public
    ), '[]'::jsonb)
  )
  from public.teacher_profiles tp
  join public.profiles p on p.id = tp.user_id
  where tp.public_enabled and tp.public_slug = lower(btrim(p_slug))
$$;
revoke all on function public.public_teacher_page(text) from public;
grant execute on function public.public_teacher_page(text) to anon, authenticated;

-- A visitor asks to join. Returns the teacher's id (for the notification) or raises an error.
create or replace function public.public_signup(
  p_slug text, p_name text, p_email text, p_phone text, p_course_id uuid, p_student_name text, p_message text
)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  tid uuid;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_name text := btrim(coalesce(p_name, ''));
begin
  select tp.user_id into tid from public.teacher_profiles tp
  where tp.public_enabled and tp.public_slug = lower(btrim(p_slug));
  if tid is null then raise exception 'page_not_found'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'invalid_name'; end if;
  if v_email is null and v_phone is null then raise exception 'contact_required'; end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200) then raise exception 'invalid_email'; end if;
  if v_phone is not null and (v_phone !~ '^[0-9+() .-]{6,40}$') then raise exception 'invalid_phone'; end if;
  if p_course_id is not null and not exists (
    select 1 from public.courses c where c.id = p_course_id and c.teacher_id = tid and c.is_active and c.is_public
  ) then raise exception 'invalid_course'; end if;

  -- Simple flood protection: the same contact at most 3 times a day, 60 requests a day per teacher.
  if (select count(*) from public.signup_requests r
      where r.teacher_id = tid and r.created_at > now() - interval '1 day'
        and ((v_email is not null and r.email = v_email) or (v_phone is not null and r.phone = v_phone))) >= 3
  then raise exception 'too_many'; end if;
  if (select count(*) from public.signup_requests r where r.teacher_id = tid and r.created_at > now() - interval '1 day') >= 60
  then raise exception 'too_many'; end if;

  insert into public.signup_requests (teacher_id, course_id, name, student_name, email, phone, message)
  values (tid, p_course_id, v_name, nullif(left(btrim(coalesce(p_student_name, '')), 120), ''), v_email, v_phone,
          nullif(left(btrim(coalesce(p_message, '')), 1000), ''));
  return tid;
end;
$$;
revoke all on function public.public_signup(text, text, text, text, uuid, text, text) from public;
grant execute on function public.public_signup(text, text, text, text, uuid, text, text) to anon, authenticated;
