-- Align role names with their intended responsibilities and keep privileged
-- profile changes behind the server-side admin workflow.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'it', 'accountant', 'user'));

drop policy if exists echoai_profiles_update_staff on public.profiles;
create policy echoai_profiles_update_staff
  on public.profiles for update
  using (app.current_role() = 'admin')
  with check (app.current_role() = 'admin');

create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if app.current_role() = 'admin' then
    return new;
  end if;

  new.role := old.role;
  new.access_status := old.access_status;
  new.storage_quota_mb := old.storage_quota_mb;
  new.company := old.company;
  return new;
end;
$$;

drop policy if exists support_tickets_admin_manage on public.support_tickets;
create policy support_tickets_admin_manage
on public.support_tickets
for all
using (app.current_role() in ('admin', 'it') and app.current_company_key() <> '')
with check (app.current_role() in ('admin', 'it') and app.current_company_key() <> '');

drop policy if exists subscriptions_admin_select on public.subscriptions;
create policy subscriptions_admin_select
  on public.subscriptions for select
  using (app.current_role() in ('admin', 'accountant'));

drop policy if exists company_seat_packages_accounting_read on public.company_seat_packages;
create policy company_seat_packages_accounting_read
  on public.company_seat_packages for select
  using (app.current_role() = 'accountant' and company_key = app.current_company_key());

drop policy if exists company_seats_accounting_read on public.company_seats;
create policy company_seats_accounting_read
  on public.company_seats for select
  using (app.current_role() = 'accountant' and company_key = app.current_company_key());