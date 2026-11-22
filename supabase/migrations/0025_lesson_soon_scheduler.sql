-- TeachFlow 0025: "the lesson starts in N minutes" push, every 5 minutes, without an outside service.
--
-- /api/cron/lesson-push?mode=soon sends the "starts soon" notification, but Vercel's free plan runs
-- cron jobs only once a day, so nothing called it. Now the database calls it itself: pg_cron runs a
-- job every 5 minutes and pg_net makes the HTTP request.
--
-- The request has to prove it comes from here. Instead of copying CRON_SECRET out of Vercel, this
-- migration makes its own random key and keeps it in Supabase Vault (encrypted). The job sends it as
-- `Authorization: Scheduler <key>`; the route asks public.lesson_scheduler_key_ok() (service role
-- only) whether it matches. That key opens only the ?mode=soon run, nothing else.
--
-- The address is the production site. If the app moves to another domain, run this file again after
-- changing app_url below.
-- Safe to run more than once.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 1. The key, made once and kept in Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'teachflow_lesson_scheduler') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'teachflow_lesson_scheduler',
      'Key for the 5-minute "lesson starts soon" job (migration 0025)');
  end if;
end;
$$;

-- 2. The check the route makes (with the secret key of the server; nobody else can call it).
create or replace function public.lesson_scheduler_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_key), 0) >= 32 and exists (
    select 1 from vault.decrypted_secrets s
    where s.name = 'teachflow_lesson_scheduler' and s.decrypted_secret = p_key
  );
$$;
revoke all on function public.lesson_scheduler_key_ok(text) from public, anon, authenticated;
grant execute on function public.lesson_scheduler_key_ok(text) to service_role;

-- 3. The job: every 5 minutes. Replaced (not doubled) when the file runs again.
do $$
declare
  app_url text := 'https://teach-flow-nine.vercel.app';
begin
  if exists (select 1 from cron.job where jobname = 'teachflow-lesson-soon') then
    perform cron.unschedule('teachflow-lesson-soon');
  end if;
  perform cron.schedule(
    'teachflow-lesson-soon',
    '*/5 * * * *',
    format(
      $job$select net.http_get(
        url := %L,
        headers := jsonb_build_object('Authorization', 'Scheduler ' || (select decrypted_secret from vault.decrypted_secrets where name = 'teachflow_lesson_scheduler')),
        timeout_milliseconds := 60000
      )$job$,
      app_url || '/api/cron/lesson-push?mode=soon'
    )
  );
end;
$$;

-- pg_net keeps a row per response for a while; the job history of pg_cron grows too. Clean both daily.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'teachflow-cron-cleanup') then
    perform cron.unschedule('teachflow-cron-cleanup');
  end if;
  perform cron.schedule('teachflow-cron-cleanup', '30 3 * * *',
    $job$delete from cron.job_run_details where end_time < now() - interval '3 days'$job$);
end;
$$;
