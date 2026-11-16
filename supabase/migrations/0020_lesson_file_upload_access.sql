-- 0020: uploading a file to a lesson follows whiteboard drawing access (0019).
-- Before: any student of the lesson could upload into lesson/<id>/ through the API even with
-- drawing switched off (the page already hides the button). Reading files is unchanged.
-- Safe to run more than once.

drop policy if exists "tf_files_insert" on storage.objects;

create policy "tf_files_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'teachflow-files' and (
    ((storage.foldername(name))[1] = 'lesson' and private.can_draw_on_board(private.uuid_or_null((storage.foldername(name))[2])))
    or ((storage.foldername(name))[1] in ('hw', 'lib', 'qz') and (storage.foldername(name))[2] = (select auth.uid())::text
        and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role::text in ('teacher', 'admin')))
    or ((storage.foldername(name))[1] = 'sub' and (storage.foldername(name))[2] = (select auth.uid())::text
        and private.can_hand_in(private.uuid_or_null((storage.foldername(name))[3])))
  )
);
