-- Locked-out users cannot authenticate, so support has to reach them before
-- sign-in. user_id becomes nullable and contact details carry the identity for
-- those tickets instead.
alter table public.support_tickets
  alter column user_id drop not null;

alter table public.support_tickets add column if not exists contact_email text;
alter table public.support_tickets add column if not exists contact_name text;
alter table public.support_tickets add column if not exists source text not null default 'app';
alter table public.support_tickets add column if not exists attachment_paths text[] not null default '{}';

alter table public.support_tickets drop constraint if exists support_tickets_identity_check;
alter table public.support_tickets add constraint support_tickets_identity_check
  check (user_id is not null or contact_email is not null);

alter table public.support_tickets drop constraint if exists support_tickets_source_check;
alter table public.support_tickets add constraint support_tickets_source_check
  check (source in ('app', 'landing'));

create index if not exists support_tickets_contact_email_idx
  on public.support_tickets (lower(contact_email), created_at desc);

drop policy if exists support_tickets_select_own on public.support_tickets;
create policy support_tickets_select_own
on public.support_tickets
for select
using (user_id is not null and user_id = auth.uid());

drop policy if exists support_tickets_insert_own on public.support_tickets;
create policy support_tickets_insert_own
on public.support_tickets
for insert
with check (user_id is not null and user_id = auth.uid());

create table if not exists public.public_ticket_throttle (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists public_ticket_throttle_lookup_idx
  on public.public_ticket_throttle (ip_hash, created_at desc);

alter table public.public_ticket_throttle enable row level security;
