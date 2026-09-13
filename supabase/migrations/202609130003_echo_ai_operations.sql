-- Staff-managed Echo AI provider accounts, pricing, and customer credit packs.

create table if not exists public.echo_credit_products (
  id uuid primary key default gen_random_uuid(),
  product_key text not null unique,
  label text not null,
  credits integer not null check (credits > 0),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  stripe_price_id text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.echo_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique,
  label text not null,
  secret_name text not null,
  enabled boolean not null default true,
  monthly_cap_usd numeric(10, 2) not null default 0 check (monthly_cap_usd >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.echo_ai_pricing (
  id uuid primary key default gen_random_uuid(),
  capability text not null,
  mode text not null default 'standard',
  provider_key text not null default 'openai',
  model text not null default '',
  credit_cost integer not null check (credit_cost >= 0),
  provider_cost_per_unit numeric(12, 8) not null default 0 check (provider_cost_per_unit >= 0),
  unit text not null default 'request',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (capability, mode)
);

insert into public.echo_credit_products (product_key, label, credits, price_usd, sort_order)
values ('credit_500', '500 Echo Credits', 500, 9.99, 10),
       ('credit_1500', '1,500 Echo Credits', 1500, 24.99, 20),
       ('credit_4000', '4,000 Echo Credits', 4000, 49.99, 30)
on conflict (product_key) do nothing;

insert into public.echo_provider_accounts (provider_key, label, secret_name)
values ('openai', 'OpenAI', 'OPENAI_API_KEY'),
       ('runway', 'Runway', 'RUNWAY_API_KEY')
on conflict (provider_key) do nothing;

insert into public.echo_ai_pricing (capability, mode, provider_key, model, credit_cost, provider_cost_per_unit, unit)
values ('message', 'standard', 'openai', 'text-standard', 1, 0.002, 'request'),
      ('image', 'standard', 'openai', 'image-standard', 5, 0.04, 'image'),
      ('image', 'premium', 'openai', 'image-premium', 10, 0.08, 'image'),
      ('video', 'standard', 'runway', 'video-fast', 60, 0.05, 'second'),
      ('video', 'premium', 'runway', 'video-premium', 100, 0.12, 'second')
on conflict (capability, mode) do nothing;

alter table public.echo_credit_products enable row level security;
alter table public.echo_provider_accounts enable row level security;
alter table public.echo_ai_pricing enable row level security;

grant select, insert, update, delete on public.echo_credit_products to authenticated;
grant select, insert, update, delete on public.echo_provider_accounts to authenticated;
grant select, insert, update, delete on public.echo_ai_pricing to authenticated;
grant select, update on public.echo_ai_budget to authenticated;

drop policy if exists echo_ai_budget_staff on public.echo_ai_budget;
create policy echo_ai_budget_staff on public.echo_ai_budget
  for all using (app.current_role() in ('admin', 'manager', 'it'))
  with check (app.current_role() in ('admin', 'manager', 'it'));

drop policy if exists echo_credit_products_customer_read on public.echo_credit_products;
create policy echo_credit_products_customer_read on public.echo_credit_products
  for select using (enabled or app.current_role() in ('admin', 'manager', 'it'));
drop policy if exists echo_credit_products_staff_write on public.echo_credit_products;
create policy echo_credit_products_staff_write on public.echo_credit_products
  for all using (app.current_role() in ('admin', 'manager', 'it'))
  with check (app.current_role() in ('admin', 'manager', 'it'));
drop policy if exists echo_provider_accounts_staff on public.echo_provider_accounts;
create policy echo_provider_accounts_staff on public.echo_provider_accounts
  for all using (app.current_role() in ('admin', 'manager', 'it'))
  with check (app.current_role() in ('admin', 'manager', 'it'));
drop policy if exists echo_ai_pricing_customer_read on public.echo_ai_pricing;
create policy echo_ai_pricing_customer_read on public.echo_ai_pricing
  for select using (enabled or app.current_role() in ('admin', 'manager', 'it'));
drop policy if exists echo_ai_pricing_staff_write on public.echo_ai_pricing;
create policy echo_ai_pricing_staff_write on public.echo_ai_pricing
  for all using (app.current_role() in ('admin', 'manager', 'it'))
  with check (app.current_role() in ('admin', 'manager', 'it'));

create or replace function public.grant_echo_credits(
  p_user_id uuid,
  p_credits integer,
  p_reference_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_credits <= 0 then raise exception 'Credit grant must be positive'; end if;
  insert into public.echo_credit_accounts (user_id, balance, lifetime_granted)
  values (p_user_id, p_credits, p_credits)
  on conflict (user_id) do update set balance = echo_credit_accounts.balance + p_credits,
    lifetime_granted = echo_credit_accounts.lifetime_granted + p_credits, updated_at = now();
  insert into public.echo_credit_transactions (user_id, amount, kind, reference_id, metadata)
  values (p_user_id, p_credits, 'grant', p_reference_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke all on function public.grant_echo_credits(uuid, integer, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.grant_echo_credits(uuid, integer, uuid, jsonb) to service_role;