-- Update Subscription Plan Catalog and Monthly Token Allowances
-- New Pricing & Token Tiers:
-- Standard: $29/mo ($295/yr) -> 500 Tokens, 2 GB
-- Storage +: $39/mo ($398/yr) -> 1,000 Tokens, 10 GB
-- Storage Pro: $59/mo ($599/yr) -> 2,500 Tokens, 25 GB
-- Storage Max: $89/mo ($899/yr) -> 4,500 Tokens, 50 GB
-- Creator Studio: $129/mo ($1,299/yr) -> 7,500 Tokens, 100 GB

insert into public.plan_catalog (plan, label, storage_gb, monthly_price_usd, annual_price_usd, sort_order)
values
  ('standard', 'Standard', 2, 29, 295, 10),
  ('storage_plus', 'Storage +', 10, 39, 398, 20),
  ('storage_pro', 'Storage Pro', 25, 59, 599, 30),
  ('storage_max', 'Storage Max', 50, 89, 899, 40),
  ('creator', 'Creator Studio', 100, 129, 1299, 50)
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
  select case p_plan
    when 'storage_plus' then 1000
    when 'storage_pro' then 2500
    when 'storage_max' then 4500
    when 'creator' then 7500
    else 500
  end;
$$;
