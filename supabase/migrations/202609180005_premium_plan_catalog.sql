-- New customer subscriptions use one Premium package. Existing subscriptions
-- retain their historical plan values until they are changed or cancelled.
insert into public.plan_catalog (plan, label, storage_gb, monthly_price_usd, annual_price_usd, sort_order)
values ('premium', 'Premium', 0, 39, 390, 10)
on conflict (plan) do update
set label = excluded.label,
    storage_gb = excluded.storage_gb,
    monthly_price_usd = excluded.monthly_price_usd,
    annual_price_usd = excluded.annual_price_usd,
    sort_order = excluded.sort_order;

create or replace function public.echo_plan_credit_allowance(p_plan text)
returns integer
language sql
immutable
as $$
  select 0;
$$;