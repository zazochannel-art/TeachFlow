-- TeachFlow: homework, messages and payments.
-- Same ownership model as 0001: every row belongs to one teacher, RLS restricts it to that teacher,
-- and related students/courses/lessons must belong to the same teacher.

create type public.homework_status as enum ('assigned', 'submitted', 'reviewed');
create type public.payment_status as enum ('paid', 'pending');

create table public.homework (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  description text,
  due_at timestamptz,
  status public.homework_status not null default 'assigned',
  submitted_at timestamptz,
  grade text check (grade is null or char_length(grade) <= 20),
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index homework_teacher_idx on public.homework(teacher_id, status);

-- Conversation log per student. direction = who wrote it (teacher or student/parent).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  direction text not null check (direction in ('outgoing', 'incoming')),
  body text not null check (char_length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_teacher_student_idx on public.messages(teacher_id, student_id, created_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'MDL' check (currency in ('MDL','EUR','RON','USD')),
  status public.payment_status not null default 'paid',
  due_date date,
  paid_at timestamptz,
  method text check (method is null or method in ('cash','card','transfer','other')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'paid' or paid_at is not null)
);
create index payments_teacher_idx on public.payments(teacher_id, status);

create trigger homework_updated_at before update on public.homework
for each row execute procedure public.set_updated_at();
create trigger payments_updated_at before update on public.payments
for each row execute procedure public.set_updated_at();

alter table public.homework enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;

create policy "homework_teacher_all" on public.homework
for all to authenticated using ((select auth.uid()) = teacher_id)
with check (
  (select auth.uid()) = teacher_id
  and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
  and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = (select auth.uid())))
  and (lesson_id is null or exists (select 1 from public.lessons l where l.id = lesson_id and l.teacher_id = (select auth.uid())))
);

create policy "messages_teacher_all" on public.messages
for all to authenticated using ((select auth.uid()) = teacher_id)
with check (
  (select auth.uid()) = teacher_id
  and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
);

create policy "payments_teacher_all" on public.payments
for all to authenticated using ((select auth.uid()) = teacher_id)
with check (
  (select auth.uid()) = teacher_id
  and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = (select auth.uid()))
  and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.teacher_id = (select auth.uid())))
);

grant select, insert, update, delete on public.homework to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
