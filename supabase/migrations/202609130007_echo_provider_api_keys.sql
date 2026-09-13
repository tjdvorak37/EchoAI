-- Add full API Key & Secret Key support to AI provider accounts for front-end management

alter table public.echo_provider_accounts
  add column if not exists api_key text not null default '',
  add column if not exists secret_key text not null default '',
  add column if not exists organization_id text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists updated_by uuid references auth.users(id);

insert into public.echo_provider_accounts (provider_key, label, secret_name, endpoint, enabled, monthly_cap_usd, priority)
values
  ('openai', 'OpenAI', 'OPENAI_API_KEY', 'https://api.openai.com/v1', true, 1000, 10),
  ('runway', 'Runway ML', 'RUNWAY_API_KEY', 'https://api.runwayml.com/v1', true, 1000, 10),
  ('anthropic', 'Anthropic (Claude)', 'ANTHROPIC_API_KEY', 'https://api.anthropic.com/v1', true, 500, 5),
  ('replicate', 'Replicate', 'REPLICATE_API_TOKEN', 'https://api.replicate.com/v1', true, 500, 5),
  ('custom_router', 'Custom AI Gateway / Router', 'CUSTOM_AI_API_KEY', 'https://api.openai.com/v1', true, 500, 1)
on conflict (provider_key) do update
set label = excluded.label,
    secret_name = excluded.secret_name,
    endpoint = case when echo_provider_accounts.endpoint = '' then excluded.endpoint else echo_provider_accounts.endpoint end;

-- Re-affirm RLS policy for staff
drop policy if exists echo_provider_accounts_staff on public.echo_provider_accounts;
create policy echo_provider_accounts_staff on public.echo_provider_accounts
  for all using (app.current_role() in ('admin', 'manager', 'it'))
  with check (app.current_role() in ('admin', 'manager', 'it'));
