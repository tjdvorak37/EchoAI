-- Integration API keys entered from IT / Management. Values live encrypted in Supabase Vault;
-- only the service role (edge functions) can set or read them. The browser only ever sees status.
create extension if not exists supabase_vault with schema vault;

create table if not exists public.integration_secret_status (
  name text primary key,
  key_hint text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.integration_secret_status enable row level security;
revoke all on public.integration_secret_status from anon, authenticated;

create or replace function public.set_integration_secret(p_name text, p_value text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  vault_name text := 'integration_' || p_name;
  existing_id uuid;
begin
  if p_name not in ('pixabay_api_key') then
    raise exception 'Unknown integration secret %', p_name;
  end if;
  if coalesce(length(trim(p_value)), 0) < 8 then
    raise exception 'Secret value is too short';
  end if;

  select id into existing_id from vault.secrets where name = vault_name;
  if existing_id is null then
    perform vault.create_secret(trim(p_value), vault_name, 'Set from IT / Management');
  else
    perform vault.update_secret(existing_id, trim(p_value));
  end if;

  insert into public.integration_secret_status (name, key_hint, updated_at, updated_by)
  values (p_name, right(trim(p_value), 4), now(), p_actor)
  on conflict (name) do update
    set key_hint = excluded.key_hint, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

create or replace function public.clear_integration_secret(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where name = 'integration_' || p_name;
  delete from public.integration_secret_status where name = p_name;
end;
$$;

create or replace function public.get_integration_secret(p_name text)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'integration_' || p_name limit 1;
$$;

revoke all on function public.set_integration_secret(text, text, uuid) from public, anon, authenticated;
revoke all on function public.clear_integration_secret(text) from public, anon, authenticated;
revoke all on function public.get_integration_secret(text) from public, anon, authenticated;
grant execute on function public.set_integration_secret(text, text, uuid) to service_role;
grant execute on function public.clear_integration_secret(text) to service_role;
grant execute on function public.get_integration_secret(text) to service_role;
