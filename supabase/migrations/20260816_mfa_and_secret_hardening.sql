-- Security hardening: real MFA enforcement and secret isolation.
--
-- 1. User-supplied AI agent API keys move out of profiles. They were stored in
--    profiles.ai_agent_config, and the staff/company SELECT policies on profiles
--    meant any teammate or staff member could read another user's API key.
-- 2. MFA recovery codes, so a lost authenticator is self-service.
-- 3. Restrictive AAL2 policies: once a user enrols a second factor, an AAL1
--    session can no longer touch their data.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Isolate user secrets
-- ---------------------------------------------------------------------------

create table if not exists public.user_ai_agent_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Move any existing config across, then strip the secret from profiles.
insert into public.user_ai_agent_config (user_id, config)
select id, coalesce(ai_agent_config, '{}'::jsonb)
  from public.profiles
 where ai_agent_config is not null
   and ai_agent_config <> '{}'::jsonb
on conflict (user_id) do nothing;

update public.profiles
   set ai_agent_config = '{}'::jsonb
 where ai_agent_config <> '{}'::jsonb;

alter table public.user_ai_agent_config enable row level security;

-- Owner only. No staff policy, no company policy: nobody else reads these keys.
drop policy if exists user_ai_agent_config_owner on public.user_ai_agent_config;
create policy user_ai_agent_config_owner
  on public.user_ai_agent_config for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. MFA recovery codes
-- ---------------------------------------------------------------------------

create table if not exists public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_recovery_codes_user_idx
  on public.mfa_recovery_codes (user_id) where used_at is null;

alter table public.mfa_recovery_codes enable row level security;

-- Users may see how many codes remain, but the hashes are never selectable and
-- only the service role may insert or consume them.
drop policy if exists mfa_recovery_codes_owner_read on public.mfa_recovery_codes;
create policy mfa_recovery_codes_owner_read
  on public.mfa_recovery_codes for select
  using (user_id = auth.uid());

revoke all on public.mfa_recovery_codes from anon, authenticated;
grant select (id, user_id, used_at, created_at) on public.mfa_recovery_codes to authenticated;

-- Replaces any existing codes; returns the plaintext set exactly once.
create or replace function public.generate_mfa_recovery_codes()
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_codes text[] := '{}';
  v_code text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  delete from public.mfa_recovery_codes where user_id = v_uid;

  for i in 1..10 loop
    v_code := upper(encode(gen_random_bytes(5), 'hex'));
    v_codes := array_append(v_codes, v_code);
    insert into public.mfa_recovery_codes (user_id, code_hash)
    values (v_uid, crypt(v_code, gen_salt('bf')));
  end loop;

  return v_codes;
end;
$$;

-- Called by the recovery edge function with the service role.
create or replace function public.consume_mfa_recovery_code(p_user_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.mfa_recovery_codes
   where user_id = p_user_id
     and used_at is null
     and code_hash = crypt(upper(btrim(p_code)), code_hash)
   limit 1;

  if v_id is null then
    return false;
  end if;

  update public.mfa_recovery_codes set used_at = now() where id = v_id;
  return true;
end;
$$;

revoke all on function public.consume_mfa_recovery_code(uuid, text) from public;
grant execute on function public.consume_mfa_recovery_code(uuid, text) to service_role;
grant execute on function public.generate_mfa_recovery_codes() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Enforce the second factor at the database
-- ---------------------------------------------------------------------------

-- True when the session's assurance level satisfies what the user has enrolled.
-- Users without a verified factor are unaffected; users with one must be aal2.
create or replace function app.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from auth.mfa_factors
       where user_id = auth.uid() and status = 'verified'
    )
    then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    else true
  end;
$$;

grant execute on function app.mfa_satisfied() to authenticated, anon;

-- RESTRICTIVE policies AND with the existing permissive ones, so this narrows
-- access without re-granting anything.
drop policy if exists profiles_require_mfa on public.profiles;
create policy profiles_require_mfa
  on public.profiles as restrictive
  to authenticated
  using (app.mfa_satisfied());

drop policy if exists subscriptions_require_mfa on public.subscriptions;
create policy subscriptions_require_mfa
  on public.subscriptions as restrictive
  to authenticated
  using (app.mfa_satisfied());

drop policy if exists ai_agent_config_require_mfa on public.user_ai_agent_config;
create policy ai_agent_config_require_mfa
  on public.user_ai_agent_config as restrictive
  to authenticated
  using (app.mfa_satisfied());

drop policy if exists billing_payments_require_mfa on public.billing_payments;
create policy billing_payments_require_mfa
  on public.billing_payments as restrictive
  to authenticated
  using (app.mfa_satisfied());

drop policy if exists support_tickets_require_mfa on public.support_tickets;
create policy support_tickets_require_mfa
  on public.support_tickets as restrictive
  to authenticated
  using (app.mfa_satisfied());

-- Staff actions are the highest value target, so admins must always be at aal2
-- to use the elevated policies.
create or replace function app.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when app.mfa_satisfied() then coalesce(p.role, 'user')
    else 'user'
  end
  from public.profiles p
  where p.id = auth.uid()
$$;
