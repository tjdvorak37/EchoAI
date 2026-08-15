-- Storage-based plan tiers.
--
-- Replaces the old plan values ('monthly' / 'annual') with a plan tier plus a
-- separate billing interval, so storage and price are properties of the tier.
--
-- Existing subscribers are mapped to 'standard' and keep their billing
-- interval, so nobody's price or access changes when this is applied.

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column if not exists billing_interval text not null default 'monthly';

-- The old constraint only permitted the interval values in the plan column.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;

update public.subscriptions
   set billing_interval = case when plan = 'annual' then 'annual' else 'monthly' end
 where plan in ('monthly', 'annual');

update public.subscriptions
   set plan = 'standard'
 where plan in ('monthly', 'annual');

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('standard', 'storage_plus', 'storage_pro', 'storage_max', 'creator'));

alter table public.subscriptions drop constraint if exists subscriptions_billing_interval_check;

alter table public.subscriptions
  add constraint subscriptions_billing_interval_check
  check (billing_interval in ('monthly', 'annual'));

-- ---------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------

alter table public.promo_codes drop constraint if exists promo_codes_plan_check;

update public.promo_codes
   set plan = 'standard'
 where plan in ('monthly', 'annual');

alter table public.promo_codes
  add constraint promo_codes_plan_check
  check (plan in ('standard', 'storage_plus', 'storage_pro', 'storage_max', 'creator'));

-- ---------------------------------------------------------------------------
-- Plan catalogue, so pricing lives in one place server-side too
-- ---------------------------------------------------------------------------

create table if not exists public.plan_catalog (
  plan text primary key,
  label text not null,
  storage_gb integer not null,
  monthly_price_usd numeric(10, 2) not null,
  annual_price_usd numeric(10, 2) not null,
  sort_order integer not null default 0,
  constraint plan_catalog_plan_check
    check (plan in ('standard', 'storage_plus', 'storage_pro', 'storage_max', 'creator'))
);

insert into public.plan_catalog (plan, label, storage_gb, monthly_price_usd, annual_price_usd, sort_order)
values
  ('standard',     'Standard',    2,   15, 153, 1),
  ('storage_plus', 'Storage +',   10,  18, 184, 2),
  ('storage_pro',  'Storage Pro', 25,  22, 224, 3),
  ('storage_max',  'Storage Max', 50,  27, 275, 4),
  ('creator',      'Creator',     100, 35, 357, 5)
on conflict (plan) do update
  set label = excluded.label,
      storage_gb = excluded.storage_gb,
      monthly_price_usd = excluded.monthly_price_usd,
      annual_price_usd = excluded.annual_price_usd,
      sort_order = excluded.sort_order;

alter table public.plan_catalog enable row level security;

drop policy if exists plan_catalog_read on public.plan_catalog;
create policy plan_catalog_read
  on public.plan_catalog for select
  using (true);

grant select on public.plan_catalog to anon, authenticated;

-- Keep the storage column on subscriptions aligned with the tier.
create or replace function public.apply_plan_storage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_storage integer;
begin
  select storage_gb into v_storage from public.plan_catalog where plan = new.plan;
  new.storage_limit_gb := coalesce(v_storage, 2);
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_plan_storage on public.subscriptions;
create trigger trg_subscriptions_plan_storage
before insert or update of plan on public.subscriptions
for each row
execute function public.apply_plan_storage();

update public.subscriptions s
   set storage_limit_gb = c.storage_gb
  from public.plan_catalog c
 where c.plan = s.plan
   and s.storage_limit_gb is distinct from c.storage_gb;

-- ---------------------------------------------------------------------------
-- Access sync: quota must follow the plan in both directions
-- ---------------------------------------------------------------------------

-- The previous version used greatest(), which meant a downgrade could never
-- shrink an account's quota. Storage is now enforced, so it must track exactly.
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
           when v_entitled then new.storage_limit_gb * 1024
           else p.storage_quota_mb
         end
   where p.id = new.user_id
     and coalesce(p.access_status, 'pending') <> 'denied'
     and coalesce(p.role, 'user') <> 'admin';

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stripe writes now carry the billing interval
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
  p_grace_period_ends_at timestamptz,
  p_billing_interval text default 'monthly'
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
      user_id, email, plan, billing_interval, status, provider,
      stripe_customer_id, stripe_subscription_id,
      current_period_end, grace_period_ends_at, cancel_at_period_end
    )
    values (
      v_user_id, p_email, coalesce(p_plan, 'standard'), coalesce(p_billing_interval, 'monthly'),
      p_status, 'stripe',
      p_stripe_customer_id, p_stripe_subscription_id,
      p_current_period_end, p_grace_period_ends_at, coalesce(p_cancel_at_period_end, false)
    )
    returning id into v_row_id;
  else
    update public.subscriptions
       set user_id = coalesce(v_user_id, user_id),
           email = p_email,
           plan = coalesce(p_plan, plan),
           billing_interval = coalesce(p_billing_interval, billing_interval),
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

drop function if exists public.apply_stripe_subscription(text, text, text, uuid, text, text, timestamptz, boolean, timestamptz);

revoke all on function public.apply_stripe_subscription(text, text, text, uuid, text, text, timestamptz, boolean, timestamptz, text) from public;
grant execute on function public.apply_stripe_subscription(text, text, text, uuid, text, text, timestamptz, boolean, timestamptz, text) to service_role;

-- ---------------------------------------------------------------------------
-- Referral reward: one free month is worth the referrer's actual monthly rate
-- ---------------------------------------------------------------------------

create or replace function public.record_referral_conversion(
  p_code text,
  p_referred_email text,
  p_stripe_subscription_id text,
  p_plan text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.referral_codes;
  v_referral_id uuid;
  v_referred_user_id uuid;
  v_referrer public.subscriptions;
  v_credit_usd numeric;
begin
  select * into v_code
    from public.referral_codes
   where upper(code) = upper(btrim(p_code)) and active;

  if not found then
    return json_build_object('recorded', false, 'reason', 'unknown_code');
  end if;

  select id into v_referred_user_id
    from public.profiles where lower(email) = lower(p_referred_email) limit 1;

  insert into public.referrals (
    referral_code_id, referrer_user_id, referred_email, referred_user_id,
    stripe_subscription_id, plan, status, reward_status
  )
  values (
    v_code.id, v_code.user_id, lower(p_referred_email), v_referred_user_id,
    p_stripe_subscription_id, p_plan, 'converted', 'pending'
  )
  on conflict (lower(referred_email)) do nothing
  returning id into v_referral_id;

  if v_referral_id is null then
    return json_build_object('recorded', false, 'reason', 'already_referred');
  end if;

  select * into v_referrer from public.subscriptions where user_id = v_code.user_id;

  if not found then
    update public.referrals
       set reward_status = 'skipped',
           reward_note = 'Referrer has no subscription to credit'
     where id = v_referral_id;
    return json_build_object('recorded', true, 'reward', 'none');
  end if;

  select case
           when v_referrer.billing_interval = 'annual'
             then round(c.annual_price_usd / 12, 2)
           else c.monthly_price_usd
         end
    into v_credit_usd
    from public.plan_catalog c
   where c.plan = v_referrer.plan;

  v_credit_usd := coalesce(v_credit_usd, 15);

  if v_referrer.stripe_customer_id is null then
    update public.subscriptions
       set current_period_end = greatest(coalesce(current_period_end, now()), now()) + interval '1 month',
           updated_at = now()
     where user_id = v_code.user_id;

    update public.referrals
       set reward_status = 'granted',
           reward_note = 'One free month added to access',
           rewarded_at = now()
     where id = v_referral_id;

    return json_build_object('recorded', true, 'reward', 'extended');
  end if;

  return json_build_object(
    'recorded', true,
    'reward', 'credit',
    'referralId', v_referral_id,
    'stripeCustomerId', v_referrer.stripe_customer_id,
    'creditUsd', v_credit_usd
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Entitlement payload gains the interval and storage
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
    'billingInterval', v_row.billing_interval,
    'storageGb', v_row.storage_limit_gb,
    'provider', v_row.provider,
    'role', v_role,
    'currentPeriodEnd', v_row.current_period_end,
    'gracePeriodEndsAt', v_row.grace_period_ends_at,
    'cancelAtPeriodEnd', v_row.cancel_at_period_end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Promo redemption keeps the tier's interval
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
    insert into public.subscriptions (user_id, email, plan, billing_interval, status, provider, current_period_end)
    values (v_uid, v_email, v_code.plan, 'monthly', 'active', 'promo', v_period_end)
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
    insert into public.subscriptions (user_id, email, plan, billing_interval, status, provider, current_period_end)
    values (null, v_email, v_code.plan, 'monthly', 'active', 'promo', v_period_end)
    on conflict do nothing;
  end if;

  return json_build_object(
    'status', 'active',
    'plan', v_code.plan,
    'currentPeriodEnd', v_period_end
  );
end;
$$;
