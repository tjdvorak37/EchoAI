-- Add SMTP and Mailbox credentials to support_ticket_notifications table
alter table public.support_ticket_notifications
  add column if not exists smtp_host text not null default 'smtp.office365.com',
  add column if not exists smtp_port integer not null default 587,
  add column if not exists smtp_encryption text not null default 'STARTTLS',
  add column if not exists smtp_user text not null default 'support@echoaipro.com',
  add column if not exists smtp_password text not null default '',
  add column if not exists resend_api_key text not null default '',
  add column if not exists sendgrid_api_key text not null default '';
