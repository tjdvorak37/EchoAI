-- Tracks when EchoAI's own confirmation/welcome email was last sent for a
-- profile. `auth.users.email_confirmed_at` cannot be used for this because
-- MAILER_AUTOCONFIRM is on (auth.email.enable_confirmations = false in
-- config.toml) so Supabase marks every account "confirmed" at signup time,
-- before the custom email is ever sent. Without a separate marker,
-- send-auth-email mistook every brand-new signup for an already-confirmed
-- account and silently skipped sending the welcome/confirmation email.
alter table public.profiles add column if not exists confirmation_email_sent_at timestamptz;
