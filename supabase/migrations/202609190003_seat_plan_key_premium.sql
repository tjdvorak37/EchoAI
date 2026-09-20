-- Plans collapsed to a single Premium tier (see src/data/plans.js), but
-- staff_provision_company_seats still only accepted the old storage-tier
-- plan keys, so every seat package quote failed with "Unknown plan level:
-- premium". Realign the function (and existing rows/defaults) with Premium.
update public.company_seat_packages set plan_key = 'premium' where plan_key <> 'premium';
alter table public.company_seat_packages alter column plan_key set default 'premium';

create or replace function public.staff_provision_company_seats(
  p_company_key text,
  p_seat_limit integer,
  p_price_per_seat_year numeric default null,
  p_notes text default null,
  p_manager_email text default null,
  p_plan_key text default 'premium'
)
returns public.company_seat_packages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company text := lower(trim(coalesce(p_company_key, '')));
  v_plan text := lower(trim(coalesce(p_plan_key, 'premium')));
  v_pkg public.company_seat_packages;
begin
  if app.current_role() not in ('admin', 'manager', 'it') then
    raise exception 'Only EchoAI staff can provision a seat package for a customer.';
  end if;
  if v_company = '' or p_seat_limit is null or p_seat_limit < 1 then
    raise exception 'A company and a positive whole-number seat limit are required.';
  end if;
  if v_plan not in ('premium') then
    raise exception 'Unknown plan level: %', v_plan;
  end if;

  insert into public.company_seat_packages (company_key, seat_limit, price_per_seat_year, billing_period, quote_notes, plan_key, created_by)
  values (v_company, p_seat_limit, p_price_per_seat_year, 'annual', p_notes, v_plan, auth.uid())
  on conflict (company_key) do update
    set seat_limit = excluded.seat_limit,
        price_per_seat_year = excluded.price_per_seat_year,
        quote_notes = excluded.quote_notes,
        plan_key = excluded.plan_key,
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

revoke all on function public.staff_provision_company_seats(text, integer, numeric, text, text, text) from public;
grant execute on function public.staff_provision_company_seats(text, integer, numeric, text, text, text) to authenticated;
