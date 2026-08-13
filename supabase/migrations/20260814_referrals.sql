-- Referral program.
--
-- A subscriber shares a link containing their code. The person who signs up
-- through it gets 20% off their first month or 10% off their first year, and
-- the referrer earns one free month once that subscription actually converts.
--
-- Rewards are granted automatically by the Stripe webhook. Nothing here needs a
-- human to approve, calculate, or pay out anything.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists referral_codes_code_idx on public.referral_codes (upper(code));

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_email text not null,
  referred_user_id uuid references auth.users(id) on delete set null,
  stripe_subscription_id text unique,
  plan text,
  status text not null default 'converted',
  reward_status text not null default 'pending',
  reward_note text,
  converted_at timestamptz not null default now(),
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint referrals_status_check check (status in ('converted', 'void')),
  constraint referrals_reward_status_check check (reward_status in ('pending', 'granted', 'skipped'))
);

-- One reward per referred person, ever. Stops a referred user from cancelling
-- and resubscribing to mint repeat rewards.
create unique index if not exists referrals_referred_email_idx
  on public.referrals (lower(referred_email));

create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id, converted_at desc);

-- ---------------------------------------------------------------------------
-- Code issuing
-- ---------------------------------------------------------------------------

create or replace function public.my_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_attempt integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select code into v_code from public.referral_codes where user_id = v_uid;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    -- Ambiguity-free alphabet: no O/0, I/1, so codes survive being read aloud.
    v_code := 'ECHO-' || (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::int + 1, 1), '')
      from generate_series(1, 6)
    );

    begin
      insert into public.referral_codes (user_id, code) values (v_uid, v_code);
      return v_code;
    exception
      when unique_violation then
        -- Either this user raced themselves, or the code collided.
        select code into v_code from public.referral_codes where user_id = v_uid;
        if v_code is not null then
          return v_code;
        end if;
        if v_attempt >= 10 then
          raise exception 'Could not allocate a referral code';
        end if;
    end;
  end loop;
end;
$$;

create or replace function public.my_referral_summary()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select code into v_code from public.referral_codes where user_id = v_uid;

  return json_build_object(
    'code', v_code,
    'converted', (
      select count(*) from public.referrals
       where referrer_user_id = v_uid and status = 'converted'
    ),
    'rewardsGranted', (
      select count(*) from public.referrals
       where referrer_user_id = v_uid and reward_status = 'granted'
    ),
    'rewardsPending', (
      select count(*) from public.referrals
       where referrer_user_id = v_uid and status = 'converted' and reward_status = 'pending'
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Checkout-time validation (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.resolve_referral_code(p_code text, p_email text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.referral_codes;
  v_referrer_email text;
begin
  select * into v_row
    from public.referral_codes
   where upper(code) = upper(btrim(p_code)) and active;

  if not found then
    return json_build_object('valid', false, 'reason', 'unknown_code');
  end if;

  select email into v_referrer_email from auth.users where id = v_row.user_id;

  -- No referring yourself.
  if p_email is not null and lower(btrim(p_email)) = lower(coalesce(v_referrer_email, '')) then
    return json_build_object('valid', false, 'reason', 'self_referral');
  end if;

  -- The discount is for new customers only.
  if exists (
    select 1 from public.subscriptions
     where lower(email) = lower(btrim(p_email))
       and status in ('active', 'trialing', 'past_due')
  ) then
    return json_build_object('valid', false, 'reason', 'existing_subscriber');
  end if;

  if exists (
    select 1 from public.referrals where lower(referred_email) = lower(btrim(p_email))
  ) then
    return json_build_object('valid', false, 'reason', 'already_referred');
  end if;

  return json_build_object('valid', true, 'referrerUserId', v_row.user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversion + reward (service role only, called by the webhook)
-- ---------------------------------------------------------------------------

-- Records the conversion and reports how the referrer should be rewarded.
-- Referrers billed through Stripe get a credit applied by the webhook; referrers
-- on a promo subscription have no invoice to discount, so their access is
-- extended here directly.
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

  -- One free month, valued at the referrer's own monthly rate.
  v_credit_usd := case when v_referrer.plan = 'annual' then 10 else 15 end;

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

create or replace function public.mark_referral_rewarded(p_referral_id uuid, p_note text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.referrals
     set reward_status = 'granted',
         reward_note = p_note,
         rewarded_at = now()
   where id = p_referral_id;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;

drop policy if exists referral_codes_select_own on public.referral_codes;
create policy referral_codes_select_own
  on public.referral_codes for select
  using (user_id = auth.uid());

drop policy if exists referral_codes_admin_select on public.referral_codes;
create policy referral_codes_admin_select
  on public.referral_codes for select
  using (app.current_role() = 'admin');

drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own
  on public.referrals for select
  using (referrer_user_id = auth.uid());

drop policy if exists referrals_staff_select on public.referrals;
create policy referrals_staff_select
  on public.referrals for select
  using (app.current_role() in ('admin', 'accountant'));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function public.my_referral_code() to authenticated;
grant execute on function public.my_referral_summary() to authenticated;

revoke all on function public.resolve_referral_code(text, text) from public;
grant execute on function public.resolve_referral_code(text, text) to service_role;

revoke all on function public.record_referral_conversion(text, text, text, text) from public;
grant execute on function public.record_referral_conversion(text, text, text, text) to service_role;

revoke all on function public.mark_referral_rewarded(uuid, text) from public;
grant execute on function public.mark_referral_rewarded(uuid, text) to service_role;
