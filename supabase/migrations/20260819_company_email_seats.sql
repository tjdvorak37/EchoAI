-- Company seat packages assign individual paid seats to employee email addresses.
-- A seat is claimed once by the matching authenticated profile.

create table if not exists public.company_seat_packages (
  id uuid primary key default gen_random_uuid(),
  company_key text not null unique,
  seat_limit integer not null check (seat_limit > 0),
  status text not null default 'active' check (status in ('active', 'suspended', 'expired')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.company_seats (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.company_seat_packages(id) on delete cascade,
  company_key text not null,
  employee_email text not null,
  profile_id uuid unique references auth.users(id) on delete set null,
  status text not null default 'assigned' check (status in ('assigned', 'active', 'revoked')),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  claimed_at timestamptz,
  constraint company_seats_email_not_blank check (length(trim(employee_email)) > 3)
);

create unique index if not exists company_seats_email_idx
  on public.company_seats (package_id, lower(trim(employee_email)));
create index if not exists company_seats_company_idx
  on public.company_seats (company_key, status);

create or replace function app.current_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select app.current_role() = 'admin'
    and app.current_company_key() <> ''
$$;

alter table public.company_seat_packages enable row level security;
alter table public.company_seats enable row level security;

drop policy if exists company_seat_packages_admin_read on public.company_seat_packages;
create policy company_seat_packages_admin_read
  on public.company_seat_packages for select
  using (app.current_company_admin() and company_key = app.current_company_key());

drop policy if exists company_seat_packages_admin_insert on public.company_seat_packages;
create policy company_seat_packages_admin_insert
  on public.company_seat_packages for insert
  with check (
    app.current_company_admin()
    and company_key = app.current_company_key()
    and created_by = auth.uid()
  );

drop policy if exists company_seat_packages_admin_update on public.company_seat_packages;
create policy company_seat_packages_admin_update
  on public.company_seat_packages for update
  using (app.current_company_admin() and company_key = app.current_company_key())
  with check (app.current_company_admin() and company_key = app.current_company_key());

drop policy if exists company_seats_admin_read on public.company_seats;
create policy company_seats_admin_read
  on public.company_seats for select
  using (app.current_company_admin() and company_key = app.current_company_key());

drop policy if exists company_seats_admin_insert on public.company_seats;
create policy company_seats_admin_insert
  on public.company_seats for insert
  with check (
    app.current_company_admin()
    and company_key = app.current_company_key()
    and assigned_by = auth.uid()
    and exists (
      select 1
      from public.company_seat_packages p
      where p.id = package_id
        and p.company_key = app.current_company_key()
        and p.status = 'active'
        and (select count(*) from public.company_seats s where s.package_id = p.id and s.status <> 'revoked') < p.seat_limit
    )
  );

drop policy if exists company_seats_admin_update on public.company_seats;
create policy company_seats_admin_update
  on public.company_seats for update
  using (app.current_company_admin() and company_key = app.current_company_key())
  with check (app.current_company_admin() and company_key = app.current_company_key());

create or replace function public.claim_company_seat(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_seat public.company_seats;
begin
  if auth.uid() is null or p_user_id <> auth.uid() then
    raise exception 'You can only claim a seat for your own account.';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if v_profile.id is null then
    return false;
  end if;

  select * into v_seat
  from public.company_seats
  where lower(trim(employee_email)) = lower(trim(v_profile.email))
    and status = 'assigned'
  order by assigned_at
  limit 1
  for update;

  if v_seat.id is null then
    return false;
  end if;

  update public.company_seats
  set profile_id = p_user_id, status = 'active', claimed_at = now()
  where id = v_seat.id;

  update public.profiles
  set company = v_seat.company_key, access_status = 'active'
  where id = p_user_id;

  return true;
end;
$$;

revoke all on function public.claim_company_seat(uuid) from public;
grant execute on function public.claim_company_seat(uuid) to authenticated;
