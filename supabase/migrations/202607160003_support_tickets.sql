create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  details text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_status_check check (status in ('open', 'in_progress', 'resolved', 'closed'))
);

create or replace function public.support_tickets_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_support_tickets_updated_at on public.support_tickets;
create trigger trg_support_tickets_updated_at
before update on public.support_tickets
for each row
execute procedure public.support_tickets_set_updated_at();

alter table public.support_tickets enable row level security;

drop policy if exists support_tickets_select_own on public.support_tickets;
create policy support_tickets_select_own
on public.support_tickets
for select
using (user_id = auth.uid());

drop policy if exists support_tickets_insert_own on public.support_tickets;
create policy support_tickets_insert_own
on public.support_tickets
for insert
with check (user_id = auth.uid());

drop policy if exists support_tickets_admin_manage on public.support_tickets;
create policy support_tickets_admin_manage
on public.support_tickets
for all
using (app.current_role() = 'admin' and app.current_company_key() <> '')
with check (app.current_role() = 'admin' and app.current_company_key() <> '');
