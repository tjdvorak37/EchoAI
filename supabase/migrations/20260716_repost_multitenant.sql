create extension if not exists pgcrypto;

create schema if not exists app;

create or replace function app.current_company_key()
returns text
language sql
stable
as $$
  select lower(trim(coalesce(p.company, '')))
  from public.profiles p
  where p.id = auth.uid()
$$;

create or replace function app.current_role()
returns text
language sql
stable
as $$
  select coalesce(p.role, 'user')
  from public.profiles p
  where p.id = auth.uid()
$$;

create table if not exists public.company_social_accounts (
  id uuid primary key default gen_random_uuid(),
  company_key text not null,
  company_name text not null,
  platform text not null,
  account_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.company_main_posts (
  id uuid primary key default gen_random_uuid(),
  company_key text not null,
  company_name text not null,
  title text not null,
  content text not null,
  channels text[] not null default '{}',
  published_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.repost_queue (
  id uuid primary key default gen_random_uuid(),
  company_key text not null,
  company_post_id uuid not null references public.company_main_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  queued_at timestamptz not null default now(),
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  constraint repost_queue_status_check check (status in ('pending', 'approved', 'declined', 'posted'))
);

create unique index if not exists repost_queue_unique_pending
  on public.repost_queue (company_post_id, user_id)
  where status in ('pending', 'approved', 'posted');

create table if not exists public.user_reposts (
  id uuid primary key default gen_random_uuid(),
  company_key text not null,
  company_post_id uuid not null references public.company_main_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'posted',
  caption text not null,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_reposts_status_check check (status in ('posted', 'failed'))
);

create table if not exists public.user_repost_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_key text not null,
  auto_approve_company_posts boolean not null default false,
  updated_at timestamptz not null default now()
);

create or replace function public.user_repost_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_repost_settings_updated_at on public.user_repost_settings;
create trigger trg_user_repost_settings_updated_at
before update on public.user_repost_settings
for each row
execute procedure public.user_repost_settings_set_updated_at();

alter table public.company_social_accounts enable row level security;
alter table public.company_main_posts enable row level security;
alter table public.repost_queue enable row level security;
alter table public.user_reposts enable row level security;
alter table public.user_repost_settings enable row level security;

drop policy if exists company_social_accounts_select_tenant on public.company_social_accounts;
create policy company_social_accounts_select_tenant
on public.company_social_accounts
for select
using (company_key = app.current_company_key());

drop policy if exists company_social_accounts_admin_write on public.company_social_accounts;
create policy company_social_accounts_admin_write
on public.company_social_accounts
for all
using (company_key = app.current_company_key() and app.current_role() = 'admin')
with check (company_key = app.current_company_key() and app.current_role() = 'admin');

drop policy if exists company_main_posts_select_tenant on public.company_main_posts;
create policy company_main_posts_select_tenant
on public.company_main_posts
for select
using (company_key = app.current_company_key());

drop policy if exists company_main_posts_admin_insert on public.company_main_posts;
create policy company_main_posts_admin_insert
on public.company_main_posts
for insert
with check (company_key = app.current_company_key() and app.current_role() = 'admin');

drop policy if exists company_main_posts_admin_update_delete on public.company_main_posts;
create policy company_main_posts_admin_update_delete
on public.company_main_posts
for update
using (company_key = app.current_company_key() and app.current_role() = 'admin')
with check (company_key = app.current_company_key() and app.current_role() = 'admin');

drop policy if exists company_main_posts_admin_delete on public.company_main_posts;
create policy company_main_posts_admin_delete
on public.company_main_posts
for delete
using (company_key = app.current_company_key() and app.current_role() = 'admin');

drop policy if exists repost_queue_select_self on public.repost_queue;
create policy repost_queue_select_self
on public.repost_queue
for select
using (company_key = app.current_company_key() and user_id = auth.uid());

drop policy if exists repost_queue_insert_self on public.repost_queue;
create policy repost_queue_insert_self
on public.repost_queue
for insert
with check (
  company_key = app.current_company_key()
  and user_id = auth.uid()
  and status = 'pending'
);

drop policy if exists repost_queue_update_self on public.repost_queue;
create policy repost_queue_update_self
on public.repost_queue
for update
using (company_key = app.current_company_key() and user_id = auth.uid())
with check (company_key = app.current_company_key() and user_id = auth.uid());

drop policy if exists user_reposts_select_self on public.user_reposts;
create policy user_reposts_select_self
on public.user_reposts
for select
using (company_key = app.current_company_key() and user_id = auth.uid());

drop policy if exists user_reposts_insert_self on public.user_reposts;
create policy user_reposts_insert_self
on public.user_reposts
for insert
with check (company_key = app.current_company_key() and user_id = auth.uid());

drop policy if exists user_repost_settings_select_self on public.user_repost_settings;
create policy user_repost_settings_select_self
on public.user_repost_settings
for select
using (company_key = app.current_company_key() and user_id = auth.uid());

drop policy if exists user_repost_settings_upsert_self on public.user_repost_settings;
create policy user_repost_settings_upsert_self
on public.user_repost_settings
for insert
with check (company_key = app.current_company_key() and user_id = auth.uid());

drop policy if exists user_repost_settings_update_self on public.user_repost_settings;
create policy user_repost_settings_update_self
on public.user_repost_settings
for update
using (company_key = app.current_company_key() and user_id = auth.uid())
with check (company_key = app.current_company_key() and user_id = auth.uid());
