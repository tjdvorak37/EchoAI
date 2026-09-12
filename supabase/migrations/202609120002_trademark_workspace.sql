-- Shared trademark and legal preparation workspace for administrators and
-- technicians. It stores filing metadata, not customer data or credentials.

alter table public.profiles
  add column if not exists trademark_edit_access boolean not null default false;

create or replace function app.can_edit_trademark()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select p.role = 'admin' or p.trademark_edit_access from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create table if not exists public.trademark_workspaces (
  company_key text primary key,
  company_name text not null default '',
  document jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trademark_workspaces enable row level security;

drop policy if exists trademark_workspace_read on public.trademark_workspaces;
create policy trademark_workspace_read
  on public.trademark_workspaces for select
  using (
    company_key = app.current_company_key()
    and (app.current_role() in ('admin', 'it') or app.can_edit_trademark())
  );

drop policy if exists trademark_workspace_write on public.trademark_workspaces;
create policy trademark_workspace_write
  on public.trademark_workspaces for all
  using (
    company_key = app.current_company_key()
    and app.can_edit_trademark()
  )
  with check (
    company_key = app.current_company_key()
    and app.can_edit_trademark()
  );