-- Paid-media OAuth credentials are never exposed to browser clients.
create table if not exists public.ad_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('meta', 'google', 'tiktok')),
  code_verifier text,
  created_at timestamptz not null default now()
);

create table if not exists public.ad_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('meta', 'google', 'tiktok')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  external_account_ids text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.ad_oauth_states enable row level security;
alter table public.ad_oauth_connections enable row level security;
revoke all on public.ad_oauth_states from public, anon, authenticated;
revoke all on public.ad_oauth_connections from public, anon, authenticated;

create or replace function public.prune_ad_oauth_states()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ad_oauth_states where created_at < now() - interval '15 minutes';
$$;

revoke all on function public.prune_ad_oauth_states() from public, anon, authenticated;
grant execute on function public.prune_ad_oauth_states() to service_role;