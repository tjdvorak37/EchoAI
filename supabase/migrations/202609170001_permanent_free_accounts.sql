-- A subscription controls paid capabilities, not whether a verified user may
-- keep their EchoAI account. Billing expiry now returns customers to free access.

create or replace function public.sync_profile_access_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitled boolean;
begin
  if new.user_id is null then
    return new;
  end if;

  v_entitled := public.subscription_is_entitled(
    new.status, new.current_period_end, new.grace_period_ends_at
  );

  update public.profiles p
     set access_status = case
           when v_entitled then 'active'
           when p.access_status = 'active' then 'pending'
           else p.access_status
         end,
         storage_quota_mb = case
           when v_entitled then new.storage_limit_gb * 1024
           else p.storage_quota_mb
         end
   where p.id = new.user_id
     and coalesce(p.access_status, 'pending') <> 'denied'
     and coalesce(p.role, 'user') <> 'admin';

  return new;
end;
$$;

create or replace function public.expire_overdue_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with swept as (
    update public.subscriptions
       set status = 'expired',
           updated_at = now()
     where status in ('incomplete', 'trialing', 'active', 'past_due')
       and coalesce(grace_period_ends_at, current_period_end + interval '1 day') < now()
    returning 1
  )
  select count(*) into v_count from swept;

  update public.profiles p
     set access_status = 'pending'
   where p.access_status = 'active'
     and coalesce(p.role, 'user') <> 'admin'
     and not exists (
       select 1
       from public.subscriptions s
       where s.user_id = p.id
         and public.subscription_is_entitled(s.status, s.current_period_end, s.grace_period_ends_at)
     )
     and exists (select 1 from public.subscriptions s2 where s2.user_id = p.id);

  return coalesce(v_count, 0);
end;
$$;

-- Repair customers previously deactivated only because their billing ended.
update public.profiles p
   set access_status = 'pending'
 where p.access_status = 'deactivated'
   and exists (
     select 1
       from public.subscriptions s
      where s.user_id = p.id
        and s.status in ('canceled', 'cancelled', 'expired', 'unpaid', 'incomplete_expired')
   );

create or replace function app.has_paid_access()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and (
         coalesce(p.is_board_member, false)
         or p.role in ('admin', 'super_admin', 'manager', 'it', 'accountant', 'board_member')
         or exists (
           select 1
             from public.subscriptions s
            where s.user_id = p.id
              and public.subscription_is_entitled(s.status, s.current_period_end, s.grace_period_ends_at)
         )
       )
  );
$$;

revoke all on function app.has_paid_access() from public;
grant execute on function app.has_paid_access() to authenticated, service_role;

create or replace function public.my_entitlement()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.subscriptions;
  v_role text;
  v_employee boolean;
  v_paid boolean;
begin
  if v_uid is null then
    return json_build_object('entitled', false, 'accessLevel', 'anonymous', 'status', 'anonymous');
  end if;

  select coalesce(role, 'user'),
         coalesce(is_board_member, false) or role in ('admin', 'super_admin', 'manager', 'it', 'accountant', 'board_member')
    into v_role, v_employee
    from public.profiles
   where id = v_uid;

  select * into v_row from public.subscriptions where user_id = v_uid;
  if not found then
    return json_build_object(
      'entitled', v_employee,
      'accessLevel', case when v_employee then 'paid' else 'free' end,
      'status', case when v_employee then 'employee' else 'none' end,
      'plan', case when v_employee then 'creator' else null end,
      'storageGb', case when v_employee then 100 else 0 end,
      'provider', case when v_employee then 'internal' else null end,
      'role', v_role
    );
  end if;

  v_paid := v_employee or public.subscription_is_entitled(
    v_row.status, v_row.current_period_end, v_row.grace_period_ends_at
  );

  return json_build_object(
    'entitled', v_paid,
    'accessLevel', case when v_paid then 'paid' else 'free' end,
    'status', case when v_employee then 'employee' else v_row.status end,
    'plan', case when v_employee then 'creator' when v_paid then v_row.plan else null end,
    'storageGb', case when v_employee then 100 when v_paid then v_row.storage_limit_gb else 0 end,
    'provider', case when v_employee then 'internal' else v_row.provider end,
    'role', v_role,
    'currentPeriodEnd', v_row.current_period_end,
    'gracePeriodEndsAt', v_row.grace_period_ends_at,
    'cancelAtPeriodEnd', v_row.cancel_at_period_end
  );
end;
$$;

revoke all on function public.expire_overdue_subscriptions() from public;
grant execute on function public.expire_overdue_subscriptions() to service_role;
grant execute on function public.my_entitlement() to authenticated;