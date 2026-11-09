-- TeachFlow foundation schema.
-- Apply in a Supabase project. All public tables have RLS enabled.

create extension if not exists pgcrypto;

create type public.app_role as enum ('teacher', 'student', 'admin');
create type public.lesson_status as enum ('scheduled', 'completed', 'cancelled', 'no_show');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'expired');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  preferred_language text not null default 'ro' check (preferred_language in ('ro','ru','en')),
  timezone text not null default 'Europe/Chisinau',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Roles are deliberately separate from editable profile data.
-- No authenticated INSERT/UPDATE/DELETE policies are granted on this table.
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'teacher',
  created_at timestamptz not null default now()
);

create table public.teacher_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  headline text,
  bio text,
  subject_specialties text[] not null default '{}',
  hourly_rate numeric(10,2) check (hourly_rate is null or hourly_rate >= 0),
  currency text not null default 'MDL' check (currency in ('MDL','EUR','RON','USD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  notes text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index students_teacher_id_idx on public.students(teacher_id);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  subject text,
  level text,
  format text not null default 'individual' check (format in ('individual','group')),
  price numeric(10,2) check (price is null or price >= 0),
  currency text not null default 'MDL' check (currency in ('MDL','EUR','RON','USD')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_teacher_id_idx on public.courses(teacher_id);

create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','completed','paused')),
  unique(course_id, student_id)
);
create index enrollments_teacher_id_idx on public.course_enrollments(teacher_id);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.lesson_status not null default 'scheduled',
  meeting_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (course_id is not null or student_id is not null)
);
create index lessons_teacher_start_idx on public.lessons(teacher_id, starts_at);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null default 'free' check (plan_code in ('free','starter','pro','premium')),
  status public.subscription_status not null default 'trialing',
  current_period_start timestamptz,
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(teacher_id)
);

-- New users become teachers by default. Role changes are not accepted from user metadata.
create schema if not exists private;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  insert into public.user_roles (user_id, role) values (new.id, 'teacher');
  insert into public.teacher_profiles (user_id) values (new.id);
  insert into public.subscriptions (teacher_id, plan_code, status) values (new.id, 'free', 'active');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure private.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();
create trigger teacher_profiles_updated_at before update on public.teacher_profiles
for each row execute procedure public.set_updated_at();
create trigger students_updated_at before update on public.students
for each row execute procedure public.set_updated_at();
create trigger courses_updated_at before update on public.courses
for each row execute procedure public.set_updated_at();
create trigger lessons_updated_at before update on public.lessons
for each row execute procedure public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions
for each row execute procedure public.set_updated_at();

-- Enable RLS on all exposed tables.
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.teacher_profiles enable row level security;
alter table public.students enable row level security;
alter table public.courses enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.lessons enable row level security;
alter table public.subscriptions enable row level security;

-- Profiles: users may read and update their own non-role profile.
create policy "profiles_select_own" on public.profiles
for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Users can read their role, but cannot assign or change roles.
create policy "user_roles_select_own" on public.user_roles
for select to authenticated using ((select auth.uid()) = user_id);

create policy "teacher_profiles_select_own" on public.teacher_profiles
for select to authenticated using ((select auth.uid()) = user_id);
create policy "teacher_profiles_update_own" on public.teacher_profiles
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "students_teacher_all" on public.students
for all to authenticated using ((select auth.uid()) = teacher_id)
with check ((select auth.uid()) = teacher_id);

create policy "courses_teacher_all" on public.courses
for all to authenticated using ((select auth.uid()) = teacher_id)
with check ((select auth.uid()) = teacher_id);

create policy "enrollments_teacher_all" on public.course_enrollments
for all to authenticated using ((select auth.uid()) = teacher_id)
with check (
  (select auth.uid()) = teacher_id
  and exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = (select auth.uid()))
  and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
);

create policy "lessons_teacher_all" on public.lessons
for all to authenticated using ((select auth.uid()) = teacher_id)
with check (
  (select auth.uid()) = teacher_id
  and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = (select auth.uid())))
  and (student_id is null or exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid())))
);

create policy "subscriptions_select_own" on public.subscriptions
for select to authenticated using ((select auth.uid()) = teacher_id);

-- Minimal grants. RLS remains the row-level authorization layer.
grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, update on public.teacher_profiles to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.courses to authenticated;
grant select, insert, update, delete on public.course_enrollments to authenticated;
grant select, insert, update, delete on public.lessons to authenticated;
grant select on public.subscriptions to authenticated;
