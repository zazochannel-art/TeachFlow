-- 0022: push notifications for the Android app.
--
-- The Android app (mobile/) shows the TeachFlow site and gets an Expo push token from the phone.
-- The site saves that token for the signed-in user here; the server (secret key) reads the tokens
-- and sends lessons, homework, quizzes and messages through Expo's push service, next to web push
-- (push_subscriptions, migration 0013). Signing out in the app removes the phone's token.
--
-- Safe to run more than once.

create table if not exists public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) between 10 and 300 and token ~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$'),
  platform text not null default 'android' check (platform in ('android', 'ios')),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists native_push_tokens_user_idx on public.native_push_tokens(user_id);
alter table public.native_push_tokens enable row level security;

drop policy if exists "native_push_own_select" on public.native_push_tokens;
create policy "native_push_own_select" on public.native_push_tokens
for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "native_push_own_delete" on public.native_push_tokens;
create policy "native_push_own_delete" on public.native_push_tokens
for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.native_push_tokens from anon;
grant select, delete on public.native_push_tokens to authenticated;

-- Registers this phone for the signed-in user (a phone that changes account moves with it).
create or replace function public.save_native_push_token(p_token text, p_platform text, p_app_version text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_signed_in'; end if;
  insert into public.native_push_tokens (user_id, token, platform, app_version)
  values ((select auth.uid()), p_token, coalesce(p_platform, 'android'), left(p_app_version, 40))
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform,
        app_version = excluded.app_version, created_at = now();
end;
$$;
revoke all on function public.save_native_push_token(text, text, text) from public, anon;
grant execute on function public.save_native_push_token(text, text, text) to authenticated;
