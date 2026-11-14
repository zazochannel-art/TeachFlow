-- TeachFlow: accounts created from a student invite start as students.
--
-- Before this migration every new account became a teacher (private.handle_new_user) and only
-- switched to student when the invite was accepted. A student who confirmed their email and
-- landed anywhere other than the invite page (or simply signed in later) got the teacher
-- dashboard. The register form now stores the invite token in the user metadata; when it
-- belongs to a pending, unexpired invite, the account is created with the student role and
-- without the teacher profile and subscription. Linking to the students row still happens in
-- public.accept_student_invite(), which the app now calls on its own after sign-in.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text := new.raw_user_meta_data ->> 'invite_token';
  is_student boolean := false;
begin
  if token is not null and token ~ '^[A-Za-z0-9_-]{20,64}$' then
    select exists (
      select 1 from public.student_invites i
      where i.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
        and i.accepted_at is null
        and i.expires_at >= now()
    ) into is_student;
  end if;

  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  if is_student then
    insert into public.user_roles (user_id, role) values (new.id, 'student');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'teacher');
    insert into public.teacher_profiles (user_id) values (new.id);
    insert into public.subscriptions (teacher_id, plan_code, status) values (new.id, 'free', 'active');
  end if;
  return new;
end;
$$;
