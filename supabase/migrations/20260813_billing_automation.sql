-- Automated subscription lifecycle.
-- Access is derived from billing state by the database itself: a paid/redeemed
-- subscription activates the account, and a missed or overdue payment revokes it.
-- No human approval step is involved anywhere in this file.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  email text not null,
  plan text not null default 'monthly',
  status text not null default 'incomplete',
  provider text not null default 'stripe',
  stripe_customer_id text,
  stripe_subscription_id text unique,
  storage_limit_gb integer not null default 2,
  current_period_end timestamptz,
  grace_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_plan_check check (plan in ('monthly', 'annual')),
  constraint subscriptions_status_check
    check (status in ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'expired'))
);

create unique index if not exists subscriptions_email_unclaimed_idx
  on public.subscriptions (lower(email))
  where user_id is null;

create index if not exists subscriptions_email_idx on public.subscriptions (lower(email));
create index if not exists subscriptions_sweep_idx
  on public.subscriptions (status, current_period_end);

-- Webhook de-duplication. Stripe retries deliveries, so every event id is
-- recorded once and replays become no-ops.
create table if not exists public.billing_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb,
  received_at timestamptz not null default now()
);

-- Real payment ledger, written by the webhook on every paid invoice. This is
-- what the finance screens report on.
create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  stripe_invoice_id text unique,
  stripe_subscription_id text,
  plan text,
  amount_usd numeric(10, 2) not null default 0,
  status text not null default 'confirmed',
  method text not null default 'card',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint billing_payments_status_check check (status in ('confirmed', 'pending', 'failed', 'refunded'))
);

create index if not exists billing_payments_paid_at_idx on public.billing_payments (paid_at desc);

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text not null default '',
  plan text not null default 'monthly',
  duration_days integer not null default 30,
  max_uses integer,
  used_count integer not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint promo_codes_plan_check check (plan in ('monthly', 'annual')),
  constraint promo_codes_duration_check check (duration_days > 0)
);

create unique index if not exists promo_codes_code_idx on public.promo_codes (upper(code));

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.promo_codes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  redeemed_at timestamptz not null default now()
);

create unique index if not exists promo_redemptions_unique_idx
  on public.promo_redemptions (code_id, lower(email));

-- ---------------------------------------------------------------------------
-- Entitlement rules
-- ---------------------------------------------------------------------------

-- Single definition of "is this subscription currently paid for?".
create or replace function public.subscription_is_entitled(
  p_status text,
  p_current_period_end timestamptz,
  p_grace_period_ends_at timestamptz
)
returns boolean
language sql
stable
as $$
  select
    (p_status in ('active', 'trialing')
      and (p_current_period_end is null or p_current_period_end > now()))
    or
    (p_status = 'past_due'
      and p_grace_period_ends_at is not null
      and p_grace_period_ends_at > now());
$$;

create or replace function public.has_active_subscription(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_user_id
      and public.subscription_is_entitled(s.status, s.current_period_end, s.grace_period_ends_at)
  );
$$;

-- ---------------------------------------------------------------------------
-- Access propagation: subscriptions drive profiles.access_status
-- ---------------------------------------------------------------------------

create or replace function public.sync_profile_access_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitled boolean;
begin
  if new.user_id is null then
    return new;
  end if;

  v_entitled := public.subscription_is_entitled(
    new.status, new.current_period_end, new.grace_period_ends_at
  );

  update public.profiles p
     set access_status = case when v_entitled then 'active' else 'deactivated' end,
         storage_quota_mb = case
           when v_entitled then greatest(coalesce(p.storage_quota_mb, 0), new.storage_limit_gb * 1024)
           else p.storage_quota_mb
         end
   where p.id = new.user_id
     -- 'denied' is a hard security block and admins are never billing-gated.
     and coalesce(p.access_status, 'pending') <> 'denied'
     and coalesce(p.role, 'user') <> 'admin';

  return new;
end;
$$;

drop trigger if exists trg_subscriptions_sync_access on public.subscriptions;
create trigger trg_subscriptions_sync_access
after insert or update of status, current_period_end, grace_period_ends_at, user_id, storage_limit_gb
on public.subscriptions
for each row
execute function public.sync_profile_access_from_subscription();

-- Someone can pay before they create their login. When the profile appears, the
-- unclaimed subscription is attached to it and the sync trigger activates them.
create or replace function public.claim_subscription_for_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then
    return new;
  end if;

  update public.subscriptions s
     set user_id = new.id,
         updated_at = now()
   where s.user_id is null
     and lower(s.email) = lower(new.email);

  return new;
end;
$$;

drop trigger if exists trg_profiles_claim_subscription on public.profiles;
create trigger trg_profiles_claim_subscription
after insert on public.profiles
for each row
execute function public.claim_subscription_for_new_profile();

-- ---------------------------------------------------------------------------
-- Scheduled expiry sweep: removes access when payment never arrives
-- ---------------------------------------------------------------------------

create or replace function public.expire_overdue_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with swept as (
    update public.subscriptions
       set status = 'expired',
           updated_at = now()
     where status in ('incomplete', 'trialing', 'active', 'past_due')
       and coalesce(
             grace_period_ends_at,
             -- one day of slack so a late renewal webhook does not lock anyone out
             current_period_end + interval '1 day'
           ) < now()
    returning 1
  )
  select count(*) into v_count from swept;

  -- Catch-up pass: revoke anyone still marked active without an entitled
  -- subscription (e.g. a row deleted out from under the trigger).
  update public.profiles p
     set access_status = 'deactivated'
   where p.access_status = 'active'
     and coalesce(p.role, 'user') <> 'admin'
     and not exists (
       select 1
       from public.subscriptions s
       where s.user_id = p.id
         and public.subscription_is_entitled(s.status, s.current_period_end, s.grace_period_ends_at)
     )
     and exists (select 1 from public.subscriptions s2 where s2.user_id = p.id);

  return coalesce(v_count, 0);
end;
$$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('echoai-expire-subscriptions');
exception
  when others then null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'echoai-expire-subscriptions',
    '*/15 * * * *',
    $cron$select public.expire_overdue_subscriptions();$cron$
  );
exception
  when others then
    raise notice 'pg_cron unavailable; schedule expire_overdue_subscriptions() externally.';
end;
$$;

-- ---------------------------------------------------------------------------
-- Write path used by the Stripe webhook (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.apply_stripe_subscription(
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_email text,
  p_user_id uuid,
  p_plan text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_grace_period_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := p_user_id;
  v_row_id uuid;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'email is required';
  end if;

  if v_user_id is null then
    select id into v_user_id from public.profiles where lower(email) = lower(p_email) limit 1;
  end if;

  select id into v_row_id
    from public.subscriptions
   where stripe_subscription_id = p_stripe_subscription_id
   limit 1;

  if v_row_id is null and v_user_id is not null then
    select id into v_row_id from public.subscriptions where user_id = v_user_id limit 1;
  end if;

  if v_row_id is null then
    select id into v_row_id
      from public.subscriptions
     where user_id is null and lower(email) = lower(p_email)
     limit 1;
  end if;

  if v_row_id is null then
    insert into public.subscriptions (
      user_id, email, plan, status, provider,
      stripe_customer_id, stripe_subscription_id,
      current_period_end, grace_period_ends_at, cancel_at_period_end
    )
    values (
      v_user_id, p_email, coalesce(p_plan, 'monthly'), p_status, 'stripe',
      p_stripe_customer_id, p_stripe_subscription_id,
      p_current_period_end, p_grace_period_ends_at, coalesce(p_cancel_at_period_end, false)
    )
    returning id into v_row_id;
  else
    update public.subscriptions
       set user_id = coalesce(v_user_id, user_id),
           email = p_email,
           plan = coalesce(p_plan, plan),
           status = p_status,
           provider = 'stripe',
           stripe_customer_id = coalesce(p_stripe_customer_id, stripe_customer_id),
           stripe_subscription_id = coalesce(p_stripe_subscription_id, stripe_subscription_id),
           current_period_end = coalesce(p_current_period_end, current_period_end),
           grace_period_ends_at = p_grace_period_ends_at,
           cancel_at_period_end = coalesce(p_cancel_at_period_end, cancel_at_period_end),
           updated_at = now()
     where id = v_row_id;
  end if;

  return v_row_id;
end;
$$;

create or replace function public.record_billing_payment(
  p_stripe_invoice_id text,
  p_stripe_subscription_id text,
  p_email text,
  p_plan text,
  p_amount_usd numeric,
  p_status text,
  p_paid_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from public.profiles where lower(email) = lower(p_email) limit 1;

  insert into public.billing_payments (
    user_id, email, stripe_invoice_id, stripe_subscription_id,
    plan, amount_usd, status, method, paid_at
  )
  values (
    v_user_id, p_email, p_stripe_invoice_id, p_stripe_subscription_id,
    p_plan, coalesce(p_amount_usd, 0), coalesce(p_status, 'confirmed'), 'card', p_paid_at
  )
  on conflict (stripe_invoice_id) do update
    set status = excluded.status,
        amount_usd = excluded.amount_usd,
        paid_at = excluded.paid_at,
        user_id = coalesce(excluded.user_id, billing_payments.user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Promo redemption: validated and activated entirely server-side
-- ---------------------------------------------------------------------------

create or replace function public.redeem_promo_code(p_code text, p_email text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_code public.promo_codes;
  v_period_end timestamptz;
begin
  if v_uid is not null then
    select email into v_email from auth.users where id = v_uid;
  end if;

  v_email := coalesce(v_email, lower(btrim(p_email)));

  if v_email is null or v_email = '' then
    raise exception 'An email address is required to redeem a code.';
  end if;

  select * into v_code
    from public.promo_codes
   where upper(code) = upper(btrim(p_code))
   for update;

  if not found then
    raise exception 'Code not found.';
  end if;
  if not v_code.active then
    raise exception 'This code is no longer active.';
  end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then
    raise exception 'This code has expired.';
  end if;
  if v_code.max_uses is not null and v_code.used_count >= v_code.max_uses then
    raise exception 'This code has reached its usage limit.';
  end if;
  if exists (
    select 1 from public.promo_redemptions
     where code_id = v_code.id and lower(email) = v_email
  ) then
    raise exception 'This code has already been redeemed for that email.';
  end if;

  v_period_end := now() + make_interval(days => v_code.duration_days);

  insert into public.promo_redemptions (code_id, user_id, email)
  values (v_code.id, v_uid, v_email);

  update public.promo_codes
     set used_count = used_count + 1
   where id = v_code.id;

  if v_uid is not null then
    insert into public.subscriptions (user_id, email, plan, status, provider, current_period_end)
    values (v_uid, v_email, v_code.plan, 'active', 'promo', v_period_end)
    on conflict (user_id) do update
      set status = 'active',
          provider = 'promo',
          plan = excluded.plan,
          grace_period_ends_at = null,
          current_period_end = greatest(
            coalesce(subscriptions.current_period_end, now()),
            excluded.current_period_end
          ),
          updated_at = now();
  else
    insert into public.subscriptions (user_id, email, plan, status, provider, current_period_end)
    values (null, v_email, v_code.plan, 'active', 'promo', v_period_end)
    on conflict do nothing;
  end if;

  return json_build_object(
    'status', 'active',
    'plan', v_code.plan,
    'currentPeriodEnd', v_period_end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Read path for the app
-- ---------------------------------------------------------------------------

create or replace function public.my_entitlement()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.subscriptions;
  v_role text;
begin
  if v_uid is null then
    return json_build_object('entitled', false, 'status', 'anonymous');
  end if;

  select coalesce(role, 'user') into v_role from public.profiles where id = v_uid;

  select * into v_row from public.subscriptions where user_id = v_uid;

  if not found then
    return json_build_object(
      'entitled', v_role = 'admin',
      'status', 'none',
      'role', v_role
    );
  end if;

  return json_build_object(
    'entitled',
      v_role = 'admin'
      or public.subscription_is_entitled(v_row.status, v_row.current_period_end, v_row.grace_period_ends_at),
    'status', v_row.status,
    'plan', v_row.plan,
    'provider', v_row.provider,
    'role', v_role,
    'currentPeriodEnd', v_row.current_period_end,
    'gracePeriodEndsAt', v_row.grace_period_ends_at,
    'cancelAtPeriodEnd', v_row.cancel_at_period_end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.billing_payments enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
  on public.subscriptions for select
  using (user_id = auth.uid());

drop policy if exists subscriptions_admin_select on public.subscriptions;
create policy subscriptions_admin_select
  on public.subscriptions for select
  using (app.current_role() = 'admin');

drop policy if exists billing_payments_select_own on public.billing_payments;
create policy billing_payments_select_own
  on public.billing_payments for select
  using (user_id = auth.uid());

drop policy if exists billing_payments_finance_select on public.billing_payments;
create policy billing_payments_finance_select
  on public.billing_payments for select
  using (app.current_role() in ('admin', 'accountant'));

drop policy if exists promo_codes_admin_manage on public.promo_codes;
create policy promo_codes_admin_manage
  on public.promo_codes for all
  using (app.current_role() = 'admin')
  with check (app.current_role() = 'admin');

drop policy if exists promo_redemptions_select_own on public.promo_redemptions;
create policy promo_redemptions_select_own
  on public.promo_redemptions for select
  using (user_id = auth.uid() or app.current_role() = 'admin');

-- billing_events intentionally has no policies: only the service role touches it.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.apply_stripe_subscription(text, text, text, uuid, text, text, timestamptz, boolean, timestamptz) from public;
grant execute on function public.apply_stripe_subscription(text, text, text, uuid, text, text, timestamptz, boolean, timestamptz) to service_role;

revoke all on function public.record_billing_payment(text, text, text, text, numeric, text, timestamptz) from public;
grant execute on function public.record_billing_payment(text, text, text, text, numeric, text, timestamptz) to service_role;

revoke all on function public.expire_overdue_subscriptions() from public;
grant execute on function public.expire_overdue_subscriptions() to service_role;

revoke all on function public.redeem_promo_code(text, text) from public;
grant execute on function public.redeem_promo_code(text, text) to anon, authenticated;

grant execute on function public.my_entitlement() to authenticated;
grant execute on function public.has_active_subscription(uuid) to authenticated, service_role;
grant execute on function public.subscription_is_entitled(text, timestamptz, timestamptz) to authenticated, anon, service_role;
