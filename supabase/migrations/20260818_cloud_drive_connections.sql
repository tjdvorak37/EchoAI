-- Cloud drive connections (OneDrive, SharePoint, Google Drive).
--
-- Files are referenced, never copied: the workspace stores a pointer and the
-- bytes stay in the customer's own drive, so linked files consume none of their
-- EchoAI storage quota.
--
-- OAuth tokens are held here for the server only. There is deliberately no
-- policy granting select to authenticated users, so the browser can never read
-- an access or refresh token.

create extension if not exists pgcrypto;

create table if not exists public.cloud_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  account_email text not null default '',
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text not null default '',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cloud_connections_provider_check check (provider in ('google', 'microsoft'))
);

create unique index if not exists cloud_connections_user_provider_idx
  on public.cloud_connections (user_id, provider);

alter table public.cloud_connections enable row level security;

-- No select/insert/update policies at all: service_role only.
revoke all on public.cloud_connections from anon, authenticated;

-- What the client is allowed to know: which providers are connected, and as who.
create or replace function public.my_cloud_connections()
returns table (provider text, account_email text, connected_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.provider, c.account_email, c.connected_at
    from public.cloud_connections c
   where c.user_id = auth.uid();
$$;

grant execute on function public.my_cloud_connections() to authenticated;

create or replace function public.disconnect_cloud_provider(p_provider text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from public.cloud_connections
   where user_id = auth.uid() and provider = p_provider;

  return true;
end;
$$;

grant execute on function public.disconnect_cloud_provider(text) to authenticated;

-- Short-lived state values for the OAuth handshake, so a callback cannot be
-- replayed or forged against another account.
create table if not exists public.cloud_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  created_at timestamptz not null default now()
);

alter table public.cloud_oauth_states enable row level security;
revoke all on public.cloud_oauth_states from anon, authenticated;

create or replace function public.prune_cloud_oauth_states()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.cloud_oauth_states where created_at < now() - interval '15 minutes';
$$;

grant execute on function public.prune_cloud_oauth_states() to service_role;
