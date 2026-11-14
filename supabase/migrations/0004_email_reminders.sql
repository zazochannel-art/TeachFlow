-- TeachFlow 0004: daily email reminders for teachers.
-- The reminder job runs server-side with the Supabase secret key (bypasses RLS);
-- teachers only see and change their own on/off setting.

alter table public.teacher_profiles
  add column if not exists email_reminders boolean not null default true;

-- One row per teacher and day, so a retried cron run never sends the same digest twice.
create table if not exists public.reminder_log (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  sent_on date not null,
  sent_at timestamptz not null default now(),
  primary key (teacher_id, sent_on)
);

alter table public.reminder_log enable row level security;
-- No policies and no grants: only the server job (service role) reads or writes it.
revoke all on public.reminder_log from anon, authenticated;
