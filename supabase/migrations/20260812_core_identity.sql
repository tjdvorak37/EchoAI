-- Core identity tables. These were previously assumed to exist but were never
-- captured in a migration, so a fresh project could not be bootstrapped.
--
-- Everything here is additive and idempotent: on a project where `profiles` and
-- `access_requests` already exist, the CREATE statements are skipped and only
-- missing columns are added. No existing column, constraint, or row is altered.
--
-- NOTE: this file enables row level security on both tables. If your live
-- project currently runs them with RLS disabled, apply this to staging first and
-- confirm signup and the admin panels still read correctly.

create extension if not exists pgcrypto;

create schema if not exists app;

-- These helpers read public.profiles and are used inside public.profiles RLS
-- policies below. Without SECURITY DEFINER that is infinite recursion (42P17)
-- as soon as RLS is enabled on the table.
create or replace function app.current_company_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(coalesce(p.company, '')))
  from public.profiles p
  where p.id = auth.uid()
$$;

create or replace function app.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.role, 'user')
  from public.profiles p
  where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists company text;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists access_status text not null default 'pending';
alter table public.profiles add column if not exists storage_quota_mb integer not null default 2048;
alter table public.profiles add column if not exists ai_agent_config jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_company_idx on public.profiles (lower(company));

-- ---------------------------------------------------------------------------
-- access_requests
-- ---------------------------------------------------------------------------

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.access_requests add column if not exists full_name text;
alter table public.access_requests add column if not exists email text;
alter table public.access_requests add column if not exists company text;
alter table public.access_requests add column if not exists status text not null default 'pending';
alter table public.access_requests add column if not exists requested_at timestamptz not null default now();
alter table public.access_requests add column if not exists reviewed_at timestamptz;

create index if not exists access_requests_status_idx on public.access_requests (status, requested_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.access_requests enable row level security;

drop policy if exists echoai_profiles_select_own on public.profiles;
create policy echoai_profiles_select_own
  on public.profiles for select
  using (id = auth.uid());

-- Admins, managers, and IT staff run the user management screens.
drop policy if exists echoai_profiles_select_staff on public.profiles;
create policy echoai_profiles_select_staff
  on public.profiles for select
  using (app.current_role() in ('admin', 'manager', 'it', 'accountant'));

-- Teammates need to see each other for company post and repost workflows.
drop policy if exists echoai_profiles_select_company on public.profiles;
create policy echoai_profiles_select_company
  on public.profiles for select
  using (
    app.current_company_key() <> ''
    and lower(trim(coalesce(company, ''))) = app.current_company_key()
  );

drop policy if exists echoai_profiles_insert_own on public.profiles;
create policy echoai_profiles_insert_own
  on public.profiles for insert
  with check (id = auth.uid());

-- Self-service updates only; role, access_status, and quota are staff-controlled
-- and are guarded by the trigger below.
drop policy if exists echoai_profiles_update_own on public.profiles;
create policy echoai_profiles_update_own
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists echoai_profiles_update_staff on public.profiles;
create policy echoai_profiles_update_staff
  on public.profiles for update
  using (app.current_role() in ('admin', 'manager', 'it'))
  with check (app.current_role() in ('admin', 'manager', 'it'));

-- Without this a user could PATCH their own row to role='admin' or
-- access_status='active' and grant themselves free access, since the
-- self-update policy above cannot restrict individual columns.
create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if app.current_role() in ('admin', 'manager', 'it') then
    return new;
  end if;

  new.role := old.role;
  new.access_status := old.access_status;
  new.storage_quota_mb := old.storage_quota_mb;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_privileged on public.profiles;
create trigger trg_profiles_guard_privileged
before update on public.profiles
for each row
when (auth.uid() is not null and auth.uid() = old.id)
execute function public.guard_privileged_profile_columns();

drop policy if exists echoai_access_requests_insert_own on public.access_requests;
create policy echoai_access_requests_insert_own
  on public.access_requests for insert
  with check (user_id = auth.uid());

drop policy if exists echoai_access_requests_select_own on public.access_requests;
create policy echoai_access_requests_select_own
  on public.access_requests for select
  using (user_id = auth.uid());

drop policy if exists echoai_access_requests_staff on public.access_requests;
create policy echoai_access_requests_staff
  on public.access_requests for all
  using (app.current_role() in ('admin', 'manager', 'it'))
  with check (app.current_role() in ('admin', 'manager', 'it'));
