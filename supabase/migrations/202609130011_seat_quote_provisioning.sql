-- Seat package quoting: staff price seat packages annually, quote the customer
-- through their support ticket, then provision the approved package. Once
-- provisioned, a designated seat manager at the customer's company can add and
-- remove their own employees without further staff involvement.

alter table public.company_seat_packages add column if not exists price_per_seat_year numeric;
alter table public.company_seat_packages add column if not exists billing_period text not null default 'annual';
alter table public.company_seat_packages add column if not exists quote_notes text;

alter table public.profiles add column if not exists seat_manager boolean not null default false;

create or replace function public.staff_provision_company_seats(
  p_company_key text,
  p_seat_limit integer,
  p_price_per_seat_year numeric default null,
  p_notes text default null,
  p_manager_email text default null
)
returns public.company_seat_packages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company text := lower(trim(coalesce(p_company_key, '')));
  v_pkg public.company_seat_packages;
begin
  if app.current_role() not in ('admin', 'manager', 'it') then
    raise exception 'Only EchoAI staff can provision a seat package for a customer.';
  end if;
  if v_company = '' or p_seat_limit is null or p_seat_limit < 1 then
    raise exception 'A company and a positive whole-number seat limit are required.';
  end if;

  insert into public.company_seat_packages (company_key, seat_limit, price_per_seat_year, billing_period, quote_notes, created_by)
  values (v_company, p_seat_limit, p_price_per_seat_year, 'annual', p_notes, auth.uid())
  on conflict (company_key) do update
    set seat_limit = excluded.seat_limit,
        price_per_seat_year = excluded.price_per_seat_year,
        quote_notes = excluded.quote_notes,
        status = 'active'
  returning * into v_pkg;

  if trim(coalesce(p_manager_email, '')) <> '' then
    update public.profiles
    set seat_manager = true
    where lower(trim(email)) = lower(trim(p_manager_email));
  end if;

  return v_pkg;
end;
$$;

revoke all on function public.staff_provision_company_seats(text, integer, numeric, text, text) from public;
grant execute on function public.staff_provision_company_seats(text, integer, numeric, text, text) to authenticated;

-- Seat managers (designated per company by staff) can view and manage their
-- own company's seats without needing the internal admin/manager/it role.
drop policy if exists company_seat_packages_manager_read on public.company_seat_packages;
create policy company_seat_packages_manager_read
  on public.company_seat_packages for select
  using (
    company_key = app.current_company_key()
    and exists (select 1 from public.profiles where id = auth.uid() and seat_manager = true)
  );

drop policy if exists company_seats_manager_read on public.company_seats;
create policy company_seats_manager_read
  on public.company_seats for select
  using (
    company_key = app.current_company_key()
    and exists (select 1 from public.profiles where id = auth.uid() and seat_manager = true)
  );

drop policy if exists company_seats_manager_insert on public.company_seats;
create policy company_seats_manager_insert
  on public.company_seats for insert
  with check (
    company_key = app.current_company_key()
    and assigned_by = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and seat_manager = true)
    and exists (
      select 1 from public.company_seat_packages p
      where p.id = package_id
        and p.company_key = app.current_company_key()
        and p.status = 'active'
        and (select count(*) from public.company_seats s where s.package_id = p.id and s.status <> 'revoked') < p.seat_limit
    )
  );

drop policy if exists company_seats_manager_update on public.company_seats;
create policy company_seats_manager_update
  on public.company_seats for update
  using (
    company_key = app.current_company_key()
    and exists (select 1 from public.profiles where id = auth.uid() and seat_manager = true)
  )
  with check (
    company_key = app.current_company_key()
    and exists (select 1 from public.profiles where id = auth.uid() and seat_manager = true)
  );
