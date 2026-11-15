-- TeachFlow: course colours and profile pictures.
--
-- 1. courses.color      a colour the teacher picks for a course (#rrggbb). Empty = automatic.
-- 2. students.avatar_url  a photo of the student, set by the teacher.
--    profiles.avatar_url  (already exists) the user's own photo.
-- 3. Public bucket `teachflow-avatars` (max 3 MB, images only). Profile pictures are not
--    secret, so they are served by public URL; only the owner may upload into its folder:
--      <user_id>/<file>                  own photo
--      <teacher_user_id>/s-<student>/... photos the teacher sets for their students
-- Safe to run more than once.

alter table public.courses add column if not exists color text;
alter table public.courses drop constraint if exists courses_color_check;
alter table public.courses add constraint courses_color_check check (color is null or color ~ '^#[0-9a-f]{6}$');

alter table public.students add column if not exists avatar_url text;
alter table public.students drop constraint if exists students_avatar_url_check;
alter table public.students add constraint students_avatar_url_check check (avatar_url is null or length(avatar_url) <= 500);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teachflow-avatars', 'teachflow-avatars', true, 3145728, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tf_avatars_insert on storage.objects;
create policy tf_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'teachflow-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists tf_avatars_update on storage.objects;
create policy tf_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'teachflow-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists tf_avatars_delete on storage.objects;
create policy tf_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'teachflow-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Listing/reading through the API stays limited to the owner; the public URL works for everyone.
drop policy if exists tf_avatars_select on storage.objects;
create policy tf_avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'teachflow-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- When a student sets their own photo, their teachers see it too (students.avatar_url).
create or replace function private.sync_student_avatar()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.avatar_url is distinct from old.avatar_url then
    update public.students set avatar_url = new.avatar_url where user_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists profiles_sync_student_avatar on public.profiles;
create trigger profiles_sync_student_avatar after update of avatar_url on public.profiles
  for each row execute function private.sync_student_avatar();
