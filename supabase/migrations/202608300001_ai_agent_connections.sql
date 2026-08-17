-- Multiple owner-only AI tool connections. API keys never leave this table or
-- the server-side inhouse-ai proxy.
create extension if not exists pgcrypto;

create table if not exists public.ai_agent_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  provider text not null default 'custom_router',
  endpoint text not null,
  api_key text not null default '',
  model text not null default 'default',
  capabilities text[] not null default '{}',
  routing jsonb not null default '{"strategy":"best_quality","allowFallback":true}'::jsonb,
  enabled boolean not null default true,
  status text not null default 'not_connected',
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_agent_connections_status_check check (status in ('connected', 'not_connected', 'error', 'checking'))
);

create index if not exists ai_agent_connections_owner_idx
  on public.ai_agent_connections (user_id, updated_at desc);

alter table public.ai_agent_connections enable row level security;

create policy ai_agent_connections_owner on public.ai_agent_connections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The browser may manage metadata through RLS, but never receives the key.
revoke all on public.ai_agent_connections from anon, authenticated;
grant select (id, user_id, name, provider, endpoint, model, capabilities, routing, enabled, status, last_error, last_checked_at, created_at, updated_at) on public.ai_agent_connections to authenticated;
grant insert (user_id, name, provider, endpoint, api_key, model, capabilities, routing, enabled, status, last_error, last_checked_at, created_at, updated_at) on public.ai_agent_connections to authenticated;
grant update (name, provider, endpoint, api_key, model, capabilities, routing, enabled, status, last_error, last_checked_at, updated_at) on public.ai_agent_connections to authenticated;
grant delete on public.ai_agent_connections to authenticated;
