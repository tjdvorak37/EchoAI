-- Echo Creator foundation: brand context, provider-neutral jobs, and credits.
-- Provider credentials remain in Edge Function secrets or owner-only config.

create extension if not exists pgcrypto;

create table if not exists public.echo_brand_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null default '',
  website text not null default '',
  location text not null default '',
  target_audience text not null default '',
  writing_tone text not null default '',
  slogans text[] not null default '{}',
  prohibited_words text[] not null default '{}',
  example_posts text[] not null default '{}',
  colors jsonb not null default '[]'::jsonb,
  logo_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.echo_credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_granted integer not null default 0 check (lifetime_granted >= 0),
  lifetime_spent integer not null default 0 check (lifetime_spent >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.echo_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0),
  kind text not null check (kind in ('grant', 'reservation', 'refund', 'adjustment')),
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists echo_credit_transactions_user_idx
  on public.echo_credit_transactions (user_id, created_at desc);

create table if not exists public.echo_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability in ('message', 'image', 'image_edit', 'video', 'audio', 'vision', 'moderation', 'campaign')),
  mode text not null default 'standard',
  provider text not null default 'echo_router',
  model text not null default 'pending',
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'refunded')),
  credits_reserved integer not null default 0 check (credits_reserved >= 0),
  prompt text not null,
  request jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists echo_ai_jobs_user_idx
  on public.echo_ai_jobs (user_id, created_at desc);

alter table public.echo_brand_profiles enable row level security;
alter table public.echo_credit_accounts enable row level security;
alter table public.echo_credit_transactions enable row level security;
alter table public.echo_ai_jobs enable row level security;

drop policy if exists echo_brand_profiles_owner on public.echo_brand_profiles;
create policy echo_brand_profiles_owner on public.echo_brand_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists echo_credit_accounts_owner on public.echo_credit_accounts;
create policy echo_credit_accounts_owner on public.echo_credit_accounts
  for select using (user_id = auth.uid());

drop policy if exists echo_credit_transactions_owner on public.echo_credit_transactions;
create policy echo_credit_transactions_owner on public.echo_credit_transactions
  for select using (user_id = auth.uid());

drop policy if exists echo_ai_jobs_owner on public.echo_ai_jobs;
create policy echo_ai_jobs_owner on public.echo_ai_jobs
  for select using (user_id = auth.uid());

revoke all on public.echo_credit_accounts from anon, authenticated;
revoke all on public.echo_credit_transactions from anon, authenticated;
revoke all on public.echo_ai_jobs from anon, authenticated;
grant select on public.echo_credit_accounts to authenticated;
grant select on public.echo_credit_transactions to authenticated;
grant select on public.echo_ai_jobs to authenticated;

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
  v_job public.echo_ai_jobs;
  v_balance integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_capability not in ('message', 'image', 'image_edit', 'video', 'audio', 'vision', 'moderation', 'campaign') then
    raise exception 'Unsupported AI capability';
  end if;
  if p_cost < 0 then
    raise exception 'Credit cost cannot be negative';
  end if;
  if coalesce(trim(p_prompt), '') = '' then
    raise exception 'A prompt is required';
  end if;
  if not public.has_active_subscription(v_user_id) then
    raise exception 'An active subscription is required';
  end if;

  insert into public.echo_credit_accounts (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select balance into v_balance
    from public.echo_credit_accounts
   where user_id = v_user_id
   for update;

  if v_balance < p_cost then
    raise exception 'Not enough Echo Credits';
  end if;

  insert into public.echo_ai_jobs (user_id, capability, mode, credits_reserved, prompt, request)
  values (v_user_id, p_capability, coalesce(nullif(trim(p_mode), ''), 'standard'), p_cost, trim(p_prompt), coalesce(p_request, '{}'::jsonb))
  returning * into v_job;

  if p_cost > 0 then
    update public.echo_credit_accounts
       set balance = balance - p_cost,
           lifetime_spent = lifetime_spent + p_cost,
           updated_at = now()
     where user_id = v_user_id;

    insert into public.echo_credit_transactions (user_id, amount, kind, reference_id, metadata)
    values (v_user_id, -p_cost, 'reservation', v_job.id, jsonb_build_object('capability', p_capability, 'mode', p_mode));
  end if;

  return jsonb_build_object('jobId', v_job.id, 'creditsRemaining', v_balance - p_cost);
end;
$$;

grant execute on function public.reserve_echo_ai_job(text, text, text, integer, jsonb) to authenticated;