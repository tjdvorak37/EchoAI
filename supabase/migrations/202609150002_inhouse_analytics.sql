create table if not exists public.app_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_key text not null default '',
  role text not null default 'user',
  event_type text not null,
  event_name text not null,
  route text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists app_analytics_events_occurred_at_idx
  on public.app_analytics_events (occurred_at desc);

create index if not exists app_analytics_events_user_idx
  on public.app_analytics_events (user_id, occurred_at desc);

create index if not exists app_analytics_events_type_name_idx
  on public.app_analytics_events (event_type, event_name, occurred_at desc);

alter table public.app_analytics_events enable row level security;

drop policy if exists app_analytics_events_insert_own on public.app_analytics_events;
create policy app_analytics_events_insert_own
  on public.app_analytics_events for insert
  with check (user_id = auth.uid());

drop policy if exists app_analytics_events_staff_select on public.app_analytics_events;
create policy app_analytics_events_staff_select
  on public.app_analytics_events for select
  using (app.current_role() in ('admin', 'manager', 'it'));

create table if not exists public.customer_exit_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  company_key text not null default '',
  reason text not null,
  competitor text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists customer_exit_feedback_created_at_idx
  on public.customer_exit_feedback (created_at desc);

alter table public.customer_exit_feedback enable row level security;

drop policy if exists customer_exit_feedback_insert_own on public.customer_exit_feedback;
create policy customer_exit_feedback_insert_own
  on public.customer_exit_feedback for insert
  with check (user_id = auth.uid() or user_id is null);

drop policy if exists customer_exit_feedback_staff_select on public.customer_exit_feedback;
create policy customer_exit_feedback_staff_select
  on public.customer_exit_feedback for select
  using (app.current_role() in ('admin', 'manager', 'it', 'accountant'));