create table if not exists public.internal_projects (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_name text not null default 'Staff',
  title text not null,
  summary text not null default '',
  status text not null default 'planned',
  priority text not null default 'medium',
  owner_id uuid references auth.users(id) on delete set null,
  owner_name text not null default '',
  due_at date,
  completion_requested_at timestamptz,
  completion_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_projects_status_check check (status in ('planned', 'working', 'review', 'done')),
  constraint internal_projects_priority_check check (priority in ('low', 'medium', 'high', 'critical'))
);

create index if not exists internal_projects_status_idx
  on public.internal_projects (status, updated_at desc);

create index if not exists internal_projects_owner_idx
  on public.internal_projects (owner_id, status, updated_at desc);

alter table public.internal_projects enable row level security;

drop policy if exists internal_projects_staff_select on public.internal_projects;
create policy internal_projects_staff_select
  on public.internal_projects for select
  using (app.current_role() in ('admin', 'manager', 'it', 'accountant', 'board_member'));

drop policy if exists internal_projects_staff_insert on public.internal_projects;
create policy internal_projects_staff_insert
  on public.internal_projects for insert
  with check (created_by = auth.uid() and app.current_role() in ('admin', 'manager', 'it'));

drop policy if exists internal_projects_staff_update on public.internal_projects;
create policy internal_projects_staff_update
  on public.internal_projects for update
  using (app.current_role() in ('admin', 'manager', 'it') or owner_id = auth.uid())
  with check (app.current_role() in ('admin', 'manager', 'it') or owner_id = auth.uid());

create table if not exists public.internal_project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.internal_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_name text not null default 'Staff',
  title text not null,
  status text not null default 'todo',
  assignee_id uuid references auth.users(id) on delete set null,
  assignee_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_project_tasks_status_check check (status in ('todo', 'doing', 'blocked', 'done'))
);

create index if not exists internal_project_tasks_project_idx
  on public.internal_project_tasks (project_id, status, created_at);

create index if not exists internal_project_tasks_assignee_idx
  on public.internal_project_tasks (assignee_id, status, updated_at desc);

alter table public.internal_project_tasks enable row level security;

drop policy if exists internal_project_tasks_staff_select on public.internal_project_tasks;
create policy internal_project_tasks_staff_select
  on public.internal_project_tasks for select
  using (app.current_role() in ('admin', 'manager', 'it', 'accountant', 'board_member'));

drop policy if exists internal_project_tasks_staff_insert on public.internal_project_tasks;
create policy internal_project_tasks_staff_insert
  on public.internal_project_tasks for insert
  with check (created_by = auth.uid() and app.current_role() in ('admin', 'manager', 'it'));

drop policy if exists internal_project_tasks_staff_update on public.internal_project_tasks;
create policy internal_project_tasks_staff_update
  on public.internal_project_tasks for update
  using (app.current_role() in ('admin', 'manager', 'it') or assignee_id = auth.uid())
  with check (app.current_role() in ('admin', 'manager', 'it') or assignee_id = auth.uid());

create table if not exists public.internal_project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.internal_projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Staff',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists internal_project_notes_project_idx
  on public.internal_project_notes (project_id, created_at desc);

alter table public.internal_project_notes enable row level security;

drop policy if exists internal_project_notes_staff_select on public.internal_project_notes;
create policy internal_project_notes_staff_select
  on public.internal_project_notes for select
  using (app.current_role() in ('admin', 'manager', 'it', 'accountant', 'board_member'));

drop policy if exists internal_project_notes_staff_insert on public.internal_project_notes;
create policy internal_project_notes_staff_insert
  on public.internal_project_notes for insert
  with check (author_id = auth.uid() and app.current_role() in ('admin', 'manager', 'it', 'accountant', 'board_member'));