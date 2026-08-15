-- Supabase installs pgcrypto functions in the extensions schema. Recreate the
-- recovery-code function with schema-qualified crypto calls for existing apps.

create extension if not exists pgcrypto;

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
    v_code := upper(encode(extensions.gen_random_bytes(5), 'hex'));
    v_codes := array_append(v_codes, v_code);
    insert into public.mfa_recovery_codes (user_id, code_hash)
    values (v_uid, extensions.crypt(v_code, extensions.gen_salt('bf')));
  end loop;

  return v_codes;
end;
$$;

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
     and code_hash = extensions.crypt(upper(btrim(p_code)), code_hash)
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