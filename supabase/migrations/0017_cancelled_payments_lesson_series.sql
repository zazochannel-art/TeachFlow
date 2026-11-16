-- TeachFlow: cancelled invoices and weekly lesson series (audit package C, 16 Nov 2026).
--
-- 1. A payment with an invoice number is never deleted: it becomes "cancelled". The invoice keeps
--    its number (no gaps in the numbering) and its PDF is marked as cancelled. Deleting a whole
--    student still removes their payments.
-- 2. Lessons created with "repeat weekly" share a series_id, so the teacher can change or delete
--    the rest of the series in one go.
--
-- Safe to run more than once.

-- 1. Cancelled payments ------------------------------------------------------------------------
alter type public.payment_status add value if not exists 'cancelled';
alter table public.payments add column if not exists cancelled_at timestamptz;

-- A direct DELETE of an invoiced payment turns into a cancellation (web and mobile app alike).
-- Deletes cascading from a removed student (trigger depth > 1) go through.
create or replace function private.cancel_instead_of_delete()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.invoice_no is null or pg_trigger_depth() > 1 then return old; end if;
  update public.payments set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now())
  where id = old.id;
  return null;
end;
$$;
revoke all on function private.cancel_instead_of_delete() from public, anon, authenticated;

drop trigger if exists payments_cancel_instead_of_delete on public.payments;
create trigger payments_cancel_instead_of_delete before delete on public.payments
for each row execute procedure private.cancel_instead_of_delete();

-- 2. Lesson series -------------------------------------------------------------------------------
alter table public.lessons add column if not exists series_id uuid;
create index if not exists lessons_series_idx on public.lessons(series_id) where series_id is not null;
