-- CI only: the pieces of the Supabase Realtime and Storage services that the migrations reference. On a real project
-- those services create them themselves; the plain supabase/postgres image used in CI has none.
create schema if not exists realtime;
create table if not exists realtime.messages (
  id bigserial primary key,
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default false,
  inserted_at timestamp not null default now()
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable
as $$ select nullif(current_setting('realtime.topic', true), '')::text $$;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to authenticated;
grant usage on all sequences in schema realtime to authenticated;

-- Storage: the image ships an early storage schema; the Storage service adds these columns later.
alter table storage.buckets add column if not exists public boolean default false;
alter table storage.buckets add column if not exists file_size_limit bigint;
alter table storage.buckets add column if not exists allowed_mime_types text[];
alter table storage.objects add column if not exists owner_id text;
alter table storage.objects add column if not exists version text;
alter table storage.objects add column if not exists user_metadata jsonb;
