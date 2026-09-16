create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  direction text not null check (direction in ('customer', 'staff')),
  sender_name text not null default '',
  sender_email text not null default '',
  body text not null check (length(trim(body)) > 0 and length(body) <= 10000),
  provider_message_id text unique,
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_messages_ticket_created_idx
  on public.support_ticket_messages (ticket_id, created_at);

create or replace function public.record_support_ticket_opening_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.support_ticket_messages (
    ticket_id,
    direction,
    sender_name,
    sender_email,
    body,
    created_at
  ) values (
    new.id,
    'customer',
    coalesce(new.requester_name, new.contact_name, ''),
    coalesce(new.requester_email, new.contact_email, ''),
    new.details,
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists trg_record_support_ticket_opening_message on public.support_tickets;
create trigger trg_record_support_ticket_opening_message
after insert on public.support_tickets
for each row execute procedure public.record_support_ticket_opening_message();

insert into public.support_ticket_messages (ticket_id, direction, sender_name, sender_email, body, created_at)
select
  ticket.id,
  'customer',
  coalesce(ticket.requester_name, ticket.contact_name, ''),
  coalesce(ticket.requester_email, ticket.contact_email, ''),
  ticket.details,
  ticket.created_at
from public.support_tickets ticket
where not exists (
  select 1 from public.support_ticket_messages message
  where message.ticket_id = ticket.id and message.direction = 'customer'
);

insert into public.support_ticket_messages (ticket_id, direction, sender_name, body, created_at)
select ticket.id, 'staff', 'EchoAI Support', ticket.admin_response, coalesce(ticket.responded_at, ticket.updated_at)
from public.support_tickets ticket
where nullif(trim(ticket.admin_response), '') is not null
and not exists (
  select 1 from public.support_ticket_messages message
  where message.ticket_id = ticket.id and message.direction = 'staff'
);

alter table public.support_ticket_messages enable row level security;

drop policy if exists support_ticket_messages_select on public.support_ticket_messages;
create policy support_ticket_messages_select
on public.support_ticket_messages
for select
to authenticated
using (
  exists (
    select 1 from public.support_tickets ticket
    where ticket.id = support_ticket_messages.ticket_id
      and (
        ticket.user_id = auth.uid()
        or (app.current_role() in ('admin', 'manager', 'it') and app.current_company_key() <> '')
      )
  )
);

revoke all on public.support_ticket_messages from anon;
grant select on public.support_ticket_messages to authenticated;