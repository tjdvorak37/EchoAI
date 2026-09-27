-- support_ticket_notifications is readable by admin/it/manager via RLS, which
-- was leaking the plaintext SMTP password and Resend/SendGrid API keys to any
-- staff browser session. Move those secrets to a service-role-only table.
create table if not exists public.support_ticket_notification_secrets (
  id text primary key default 'default',
  smtp_password text not null default '',
  resend_api_key text not null default '',
  sendgrid_api_key text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.support_ticket_notification_secrets (id, smtp_password, resend_api_key, sendgrid_api_key)
select id, coalesce(smtp_password, ''), coalesce(resend_api_key, ''), coalesce(sendgrid_api_key, '')
from public.support_ticket_notifications
where id = 'default'
on conflict (id) do update set
  smtp_password = excluded.smtp_password,
  resend_api_key = excluded.resend_api_key,
  sendgrid_api_key = excluded.sendgrid_api_key;

alter table public.support_ticket_notification_secrets enable row level security;
revoke all on public.support_ticket_notification_secrets from public, anon, authenticated;

alter table public.support_ticket_notifications
  drop column if exists smtp_password,
  drop column if exists resend_api_key,
  drop column if exists sendgrid_api_key;
