create table if not exists public.support_inbound_config (
  id text primary key default 'default',
  inbound_email text not null default 'support@echoaipro.com',
  enabled boolean not null default false,
  webhook_secret_hash text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.support_inbound_config (id)
values ('default')
on conflict (id) do nothing;

alter table public.support_inbound_config enable row level security;
revoke all on public.support_inbound_config from anon, authenticated;