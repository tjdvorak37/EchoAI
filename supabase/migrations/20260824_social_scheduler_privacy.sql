-- Personal social accounts and scheduled posts are never shared between users.
-- OAuth credentials live separately from browser-readable account metadata.

create extension if not exists pgcrypto;

create table if not exists public.user_social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  account_name text not null,
  account_type text not null default 'profile',
  publishing_scopes text[] not null default '{}',
  connection_status text not null default 'profile_saved',
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_social_accounts_platform_check check (
    platform in ('instagram', 'facebook', 'tiktok', 'snapchat', 'x', 'youtube', 'linkedin')
  ),
  constraint user_social_accounts_status_check check (
    connection_status in ('profile_saved', 'oauth_connected', 'reauth_required', 'disconnected')
  )
);

create unique index if not exists user_social_accounts_owner_platform_idx
  on public.user_social_accounts (user_id, platform);

alter table public.user_social_accounts enable row level security;

drop policy if exists user_social_accounts_owner on public.user_social_accounts;
create policy user_social_accounts_owner
  on public.user_social_accounts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The browser must never read an access token or refresh token. OAuth callback
-- functions use the service role to write this table after validating state.
create table if not exists public.social_oauth_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  external_account_id text not null default '',
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint social_oauth_credentials_platform_check check (
    platform in ('instagram', 'facebook', 'tiktok', 'snapchat', 'x', 'youtube', 'linkedin')
  )
);

create unique index if not exists social_oauth_credentials_owner_platform_idx
  on public.social_oauth_credentials (user_id, platform);

alter table public.social_oauth_credentials enable row level security;
revoke all on public.social_oauth_credentials from anon, authenticated;

-- Existing installations created scheduled_posts outside migrations. Make the
-- required ownership and media fields additive before enabling policies.
create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  campaign text not null default '',
  message text not null default '',
  image_idea text not null default '',
  scheduled_at timestamptz not null default now(),
  channels text[] not null default '{}',
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

alter table public.scheduled_posts add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.scheduled_posts add column if not exists media jsonb not null default '[]'::jsonb;

create index if not exists scheduled_posts_owner_scheduled_at_idx
  on public.scheduled_posts (user_id, scheduled_at desc);

alter table public.scheduled_posts enable row level security;

drop policy if exists scheduled_posts_owner_select on public.scheduled_posts;
create policy scheduled_posts_owner_select
  on public.scheduled_posts for select
  using (user_id = auth.uid());

drop policy if exists scheduled_posts_owner_insert on public.scheduled_posts;
create policy scheduled_posts_owner_insert
  on public.scheduled_posts for insert
  with check (user_id = auth.uid());

drop policy if exists scheduled_posts_owner_update on public.scheduled_posts;
create policy scheduled_posts_owner_update
  on public.scheduled_posts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists scheduled_posts_owner_delete on public.scheduled_posts;
create policy scheduled_posts_owner_delete
  on public.scheduled_posts for delete
  using (user_id = auth.uid());