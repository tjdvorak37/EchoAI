create table if not exists public.developer_app_credentials (
  provider text primary key,
  app_name text not null default '',
  client_id text not null default '',
  client_secret text not null default '',
  redirect_uri text not null default '',
  scopes text[] not null default '{}',
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.developer_app_credentials enable row level security;
revoke all on public.developer_app_credentials from public, anon, authenticated;

alter table public.profiles
  add column if not exists developer_app_edit_access boolean not null default false;