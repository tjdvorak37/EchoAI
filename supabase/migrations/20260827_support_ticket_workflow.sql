-- The service board supports explicit workflow stages. Keep this database
-- constraint aligned with the statuses presented to administrators.
alter table public.support_tickets
  drop constraint if exists support_tickets_status_check;

alter table public.support_tickets
  add constraint support_tickets_status_check
  check (status in ('open', 'new', 'triage', 'in_progress', 'waiting_customer', 'escalated', 'resolved', 'closed'));