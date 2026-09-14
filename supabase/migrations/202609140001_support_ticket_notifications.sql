-- Support ticket email notification configuration
create table if not exists public.support_ticket_notifications (
  id text primary key default 'default',
  enabled boolean not null default true,
  recipient_email text not null default 'support@echoaipro.com',
  secondary_email text not null default '',
  sender_name text not null default 'EchoAI Support System',
  subject_prefix text not null default '[EchoAI Support]',
  include_full_description boolean not null default true,
  notify_on_landing_tickets boolean not null default true,
  notify_on_app_tickets boolean not null default true,
  notify_on_company_requests boolean not null default true,
  webhook_url text not null default '',
  webhook_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.support_ticket_notifications (id, enabled, recipient_email)
values ('default', true, 'support@echoaipro.com')
on conflict (id) do nothing;

alter table public.support_ticket_notifications enable row level security;

drop policy if exists support_ticket_notifications_read on public.support_ticket_notifications;
create policy support_ticket_notifications_read
  on public.support_ticket_notifications for select
  using (app.current_role() in ('admin', 'it', 'manager'));

drop policy if exists support_ticket_notifications_update on public.support_ticket_notifications;
create policy support_ticket_notifications_update
  on public.support_ticket_notifications for update
  using (app.current_role() in ('admin', 'it', 'manager'))
  with check (app.current_role() in ('admin', 'it', 'manager'));

drop policy if exists support_ticket_notifications_insert on public.support_ticket_notifications;
create policy support_ticket_notifications_insert
  on public.support_ticket_notifications for insert
  with check (app.current_role() in ('admin', 'it', 'manager'));
