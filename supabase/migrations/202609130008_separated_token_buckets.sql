-- Separate Monthly Package Allowance from Purchased Add-on Tokens
-- 1. Monthly Subscription package tokens: "use-it-or-lose-it" reset every month.
-- 2. Purchased Add-on tokens (500, 1000, 2500, 5000): NEVER expire, rollover indefinitely.
-- 3. AI usage deducts Monthly Package Tokens FIRST before touching Purchased Tokens.

alter table public.echo_credit_accounts
  add column if not exists monthly_balance integer not null default 0 check (monthly_balance >= 0),
  add column if not exists purchased_balance integer not null default 0 check (purchased_balance >= 0);

-- Backfill existing balances: allocate up to monthly_allowance to monthly_balance, remainder to purchased_balance
update public.echo_credit_accounts
   set monthly_balance = least(balance, coalesce(monthly_allowance, 500)),
       purchased_balance = greatest(balance - coalesce(monthly_allowance, 500), 0)
 where (monthly_balance = 0 and purchased_balance = 0 and balance > 0);

create or replace function public.ensure_echo_credit_period(p_user_id uuid)
returns public.echo_credit_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.echo_credit_accounts;
  v_plan text;
  v_allowance integer;
  v_period_start date := date_trunc('month', current_date)::date;
  v_period_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
begin
  select coalesce(s.plan, 'standard') into v_plan
    from public.subscriptions s
   where s.user_id = p_user_id
   limit 1;
  v_allowance := public.echo_plan_credit_allowance(v_plan);

  insert into public.echo_credit_accounts (user_id, monthly_allowance, monthly_balance, purchased_balance, balance)
  values (p_user_id, v_allowance, v_allowance, 0, v_allowance)
  on conflict (user_id) do nothing;

  select * into v_account from public.echo_credit_accounts where user_id = p_user_id for update;

  if v_account.period_start is null or v_account.period_start < v_period_start then
    -- New monthly billing cycle begins:
    -- 1. Reset monthly_balance to the full tier allowance (use or lose previous month)
    -- 2. Purchased add-on tokens (purchased_balance) ROLL OVER COMPLETELY
    update public.echo_credit_accounts
       set monthly_allowance = v_allowance,
           monthly_balance = v_allowance,
           period_start = v_period_start,
           period_end = v_period_end,
           balance = v_allowance + purchased_balance,
           lifetime_granted = lifetime_granted + v_allowance,
           updated_at = now()
     where user_id = p_user_id
     returning * into v_account;

    insert into public.echo_credit_transactions (user_id, amount, kind, metadata)
    values (
      p_user_id,
      v_allowance,
      'grant',
      jsonb_build_object('type', 'monthly_allowance_reset', 'periodStart', v_period_start, 'plan', v_plan, 'purchasedRollover', v_account.purchased_balance)
    );
  end if;

  return v_account;
end;
$$;

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
declare
  v_account public.echo_credit_accounts;
begin
  if p_credits <= 0 then raise exception 'Credit grant must be positive'; end if;

  v_account := public.ensure_echo_credit_period(p_user_id);

  -- Add-on purchases go directly to purchased_balance which rolls over indefinitely
  update public.echo_credit_accounts
     set purchased_balance = purchased_balance + p_credits,
         balance = monthly_balance + (purchased_balance + p_credits),
         lifetime_granted = lifetime_granted + p_credits,
         updated_at = now()
   where user_id = p_user_id;

  insert into public.echo_credit_transactions (user_id, amount, kind, reference_id, metadata)
  values (
    p_user_id,
    p_credits,
    'grant',
    p_reference_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('bucket', 'purchased_addon', 'expires', false, 'rollover', true)
  );
end;
$$;

create or replace function public.reserve_echo_ai_job(
  p_capability text,
  p_mode text,
  p_prompt text,
  p_cost integer,
  p_request jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cost integer;
  v_is_beta boolean;
  v_ai_enabled boolean;
  v_ai_note text;
  v_account public.echo_credit_accounts;
  v_job public.echo_ai_jobs;
  v_budget public.echo_ai_budget;
  v_recent_requests integer;
  v_daily_videos integer;
  v_active_jobs integer;
  v_from_monthly integer := 0;
  v_from_purchased integer := 0;
  v_total_available integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_capability not in ('message', 'image', 'image_edit', 'video', 'audio', 'vision', 'moderation', 'campaign') then raise exception 'Unsupported AI capability'; end if;
  if p_cost < 0 then raise exception 'Credit cost cannot be negative'; end if;
  if coalesce(trim(p_prompt), '') = '' then raise exception 'A prompt is required'; end if;

  select coalesce(is_beta_tester, false), coalesce(ai_enabled, true), coalesce(ai_access_note, '')
    into v_is_beta, v_ai_enabled, v_ai_note
    from public.profiles where id = v_user_id;
  if v_is_beta and not v_ai_enabled then
    raise exception using message = case when v_ai_note <> '' then v_ai_note else 'AI tools are not enabled for this beta account.' end;
  end if;
  if not v_is_beta and not public.has_active_subscription(v_user_id) then raise exception 'An active subscription is required'; end if;

  select coalesce(echo_credit_cost, credit_cost, p_cost) into v_cost
    from public.echo_ai_pricing
   where capability = p_capability and mode = coalesce(nullif(trim(p_mode), ''), 'standard') and enabled = true;
  v_cost := coalesce(v_cost, p_cost);
  if v_cost < 0 then raise exception 'Credit cost cannot be negative'; end if;

  select * into v_budget from public.echo_ai_budget where id = true for update;
  if v_budget.period_start < date_trunc('month', current_date)::date then
    update public.echo_ai_budget
       set period_start = date_trunc('month', current_date)::date,
           provider_spend_usd = 0,
           shutdown = false,
           shutdown_reason = null,
           updated_at = now()
     where id = true
     returning * into v_budget;
  end if;
  if v_budget.shutdown or v_budget.provider_spend_usd >= v_budget.shutdown_usd then
    raise exception 'AI generation is temporarily paused by the EchoAI budget safeguard';
  end if;

  select count(*) into v_recent_requests from public.echo_ai_request_events
   where user_id = v_user_id and created_at > now() - interval '1 minute';
  if v_recent_requests >= 20 then raise exception 'AI request rate limit reached. Try again shortly'; end if;
  select count(*) into v_active_jobs from public.echo_ai_jobs
   where user_id = v_user_id and status in ('queued', 'running');
  if v_active_jobs >= 3 then raise exception 'Maximum queued AI jobs reached'; end if;

  if p_capability = 'video' then
    select count(*) into v_active_jobs from public.echo_ai_jobs
     where user_id = v_user_id and capability = 'video' and status in ('queued', 'running');
    if v_active_jobs >= 1 then raise exception 'Only one video generation can run at a time'; end if;
    select count(*) into v_daily_videos from public.echo_ai_jobs
     where user_id = v_user_id and capability = 'video' and created_at >= current_date;
    if v_daily_videos >= 10 then raise exception 'Daily video generation limit reached'; end if;
  elsif p_capability in ('image', 'image_edit') then
    select count(*) into v_active_jobs from public.echo_ai_jobs
     where user_id = v_user_id and capability in ('image', 'image_edit') and status in ('queued', 'running');
    if v_active_jobs >= 2 then raise exception 'Only two image generations can run at a time'; end if;
  end if;

  v_account := public.ensure_echo_credit_period(v_user_id);
  v_total_available := v_account.monthly_balance + v_account.purchased_balance;
  if v_total_available < v_cost then
    raise exception 'Not enough Echo Credits';
  end if;

  -- Priority deduction: Consume Monthly Subscription Allowance FIRST
  if v_account.monthly_balance >= v_cost then
    v_from_monthly := v_cost;
    v_from_purchased := 0;
  else
    v_from_monthly := v_account.monthly_balance;
    v_from_purchased := v_cost - v_account.monthly_balance;
  end if;

  insert into public.echo_ai_jobs (user_id, capability, mode, credits_reserved, prompt, request)
  values (
    v_user_id,
    p_capability,
    coalesce(nullif(trim(p_mode), ''), 'standard'),
    v_cost,
    trim(p_prompt),
    coalesce(p_request, '{}'::jsonb) || jsonb_build_object(
      'from_monthly', v_from_monthly,
      'from_purchased', v_from_purchased
    )
  )
  returning * into v_job;

  update public.echo_credit_accounts
     set monthly_balance = monthly_balance - v_from_monthly,
         purchased_balance = purchased_balance - v_from_purchased,
         balance = (monthly_balance - v_from_monthly) + (purchased_balance - v_from_purchased),
         lifetime_spent = lifetime_spent + v_cost,
         updated_at = now()
   where user_id = v_user_id
   returning * into v_account;

  if v_cost > 0 then
    insert into public.echo_credit_transactions (user_id, amount, kind, reference_id, metadata)
    values (
      v_user_id,
      -v_cost,
      'reservation',
      v_job.id,
      jsonb_build_object(
        'capability', p_capability,
        'mode', p_mode,
        'from_monthly', v_from_monthly,
        'from_purchased', v_from_purchased
      )
    );
  end if;

  insert into public.echo_ai_request_events (user_id, capability) values (v_user_id, p_capability);

  return jsonb_build_object(
    'jobId', v_job.id,
    'creditsRemaining', v_account.balance,
    'monthlyRemaining', v_account.monthly_balance,
    'purchasedRemaining', v_account.purchased_balance
  );
end;
$$;

create or replace function public.fail_echo_ai_job(p_job_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.echo_ai_jobs;
  v_from_monthly integer := 0;
  v_from_purchased integer := 0;
begin
  select * into v_job from public.echo_ai_jobs where id = p_job_id for update;
  if not found or v_job.status in ('completed', 'failed', 'refunded') then return; end if;

  v_from_monthly := coalesce((v_job.request->>'from_monthly')::integer, 0);
  v_from_purchased := coalesce((v_job.request->>'from_purchased')::integer, v_job.credits_reserved - v_from_monthly);

  update public.echo_ai_jobs set status = 'refunded', error = p_error, completed_at = now() where id = p_job_id;

  if v_job.credits_reserved > 0 then
    update public.echo_credit_accounts
       set monthly_balance = monthly_balance + v_from_monthly,
           purchased_balance = purchased_balance + v_from_purchased,
           balance = balance + v_job.credits_reserved,
           updated_at = now()
     where user_id = v_job.user_id;

    insert into public.echo_credit_transactions (user_id, amount, kind, reference_id, metadata)
    values (
      v_job.user_id,
      v_job.credits_reserved,
      'refund',
      v_job.id,
      jsonb_build_object(
        'reason', p_error,
        'refunded_to_monthly', v_from_monthly,
        'refunded_to_purchased', v_from_purchased
      )
    );
  end if;
end;
$$;
