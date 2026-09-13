-- Echo Creator financial firewall: monthly grants, abuse limits, provider spend,
-- and idempotent completion/refund operations.

alter table public.echo_credit_accounts
  add column if not exists monthly_allowance integer not null default 500,
  add column if not exists period_start date,
  add column if not exists period_end date;

alter table public.echo_ai_jobs
  add column if not exists provider_cost_usd numeric(12, 6) not null default 0,
  add column if not exists reserved_at timestamptz not null default now();

create table if not exists public.echo_ai_request_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  created_at timestamptz not null default now()
);

create index if not exists echo_ai_request_events_user_time_idx
  on public.echo_ai_request_events (user_id, created_at desc);

create table if not exists public.echo_ai_budget (
  id boolean primary key default true check (id),
  period_start date not null default date_trunc('month', current_date)::date,
  monthly_budget_usd numeric(12, 2) not null default 500,
  warning_usd numeric(12, 2) not null default 350,
  critical_usd numeric(12, 2) not null default 450,
  shutdown_usd numeric(12, 2) not null default 500,
  provider_spend_usd numeric(12, 6) not null default 0,
  shutdown boolean not null default false,
  shutdown_reason text,
  updated_at timestamptz not null default now()
);

insert into public.echo_ai_budget (id)
values (true)
on conflict (id) do nothing;

alter table public.echo_ai_request_events enable row level security;
alter table public.echo_ai_budget enable row level security;
revoke all on public.echo_ai_request_events from anon, authenticated;
revoke all on public.echo_ai_budget from anon, authenticated;

create or replace function public.echo_plan_credit_allowance(p_plan text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'storage_plus' then 800
    when 'storage_pro' then 1500
    when 'storage_max' then 2500
    when 'creator' then 4000
    else 500
  end;
$$;

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

  insert into public.echo_credit_accounts (user_id, monthly_allowance)
  values (p_user_id, v_allowance)
  on conflict (user_id) do nothing;

  select * into v_account from public.echo_credit_accounts where user_id = p_user_id for update;

  if v_account.period_start is null or v_account.period_start < v_period_start then
    update public.echo_credit_accounts
       set monthly_allowance = v_allowance,
           period_start = v_period_start,
           period_end = v_period_end,
           balance = v_allowance,
           lifetime_granted = lifetime_granted + v_allowance,
           updated_at = now()
     where user_id = p_user_id
     returning * into v_account;

    insert into public.echo_credit_transactions (user_id, amount, kind, metadata)
    values (p_user_id, v_allowance, 'grant', jsonb_build_object('periodStart', v_period_start, 'plan', v_plan));
  end if;

  return v_account;
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

  select coalesce(credit_cost, p_cost) into v_cost
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
  if v_budget.shutdown or v_budget.provider_spend_usd >= v_budget.shutdown_usd then raise exception 'AI generation is temporarily paused by the EchoAI budget safeguard'; end if;

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
  if v_account.balance < v_cost then raise exception 'Not enough Echo Credits'; end if;

  insert into public.echo_ai_jobs (user_id, capability, mode, credits_reserved, prompt, request)
  values (v_user_id, p_capability, coalesce(nullif(trim(p_mode), ''), 'standard'), v_cost, trim(p_prompt), coalesce(p_request, '{}'::jsonb))
  returning * into v_job;

  update public.echo_credit_accounts
    set balance = balance - v_cost, lifetime_spent = lifetime_spent + v_cost, updated_at = now()
   where user_id = v_user_id;
  if v_cost > 0 then
    insert into public.echo_credit_transactions (user_id, amount, kind, reference_id, metadata)
    values (v_user_id, -v_cost, 'reservation', v_job.id, jsonb_build_object('capability', p_capability, 'mode', p_mode));
  end if;
  insert into public.echo_ai_request_events (user_id, capability) values (v_user_id, p_capability);
  return jsonb_build_object('jobId', v_job.id, 'creditsRemaining', v_account.balance - v_cost);
end;
$$;

create or replace function public.complete_echo_ai_job(p_job_id uuid, p_provider_cost_usd numeric default 0, p_result jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_job public.echo_ai_jobs; v_budget public.echo_ai_budget;
begin
  select * into v_job from public.echo_ai_jobs where id = p_job_id for update;
  if not found or v_job.status in ('completed', 'failed', 'refunded') then return; end if;
  select * into v_budget from public.echo_ai_budget where id = true for update;
  update public.echo_ai_jobs set status = 'completed', provider_cost_usd = greatest(p_provider_cost_usd, 0), result = p_result, completed_at = now() where id = p_job_id;
  update public.echo_ai_budget set provider_spend_usd = provider_spend_usd + greatest(p_provider_cost_usd, 0), updated_at = now() where id = true;
  if v_budget.provider_spend_usd + greatest(p_provider_cost_usd, 0) >= v_budget.shutdown_usd then
    update public.echo_ai_budget set shutdown = true, shutdown_reason = 'Monthly provider budget reached', updated_at = now() where id = true;
  end if;
end;
$$;

create or replace function public.fail_echo_ai_job(p_job_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_job public.echo_ai_jobs;
begin
  select * into v_job from public.echo_ai_jobs where id = p_job_id for update;
  if not found or v_job.status in ('completed', 'failed', 'refunded') then return; end if;
  update public.echo_ai_jobs set status = 'refunded', error = p_error, completed_at = now() where id = p_job_id;
  if v_job.credits_reserved > 0 then
    update public.echo_credit_accounts set balance = balance + v_job.credits_reserved, updated_at = now() where user_id = v_job.user_id;
    insert into public.echo_credit_transactions (user_id, amount, kind, reference_id, metadata)
    values (v_job.user_id, v_job.credits_reserved, 'refund', v_job.id, jsonb_build_object('reason', p_error));
  end if;
end;
$$;

grant execute on function public.ensure_echo_credit_period(uuid) to authenticated;
grant execute on function public.complete_echo_ai_job(uuid, numeric, jsonb) to service_role;
grant execute on function public.fail_echo_ai_job(uuid, text) to service_role;