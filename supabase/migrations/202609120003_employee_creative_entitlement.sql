-- Employees operate the platform and receive the Creative package at no charge.
-- This is entitlement metadata only; it does not create or modify a Stripe plan.

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
begin
  if v_uid is null then
    return json_build_object('entitled', false, 'status', 'anonymous');
  end if;

  select coalesce(role, 'user') into v_role from public.profiles where id = v_uid;
  v_employee := v_role in ('admin', 'manager', 'it', 'accountant');
  select * into v_row from public.subscriptions where user_id = v_uid;

  if not found then
    return json_build_object(
      'entitled', v_employee,
      'status', case when v_employee then 'employee' else 'none' end,
      'plan', case when v_employee then 'creator' else null end,
      'provider', case when v_employee then 'internal' else null end,
      'role', v_role
    );
  end if;

  return json_build_object(
    'entitled', v_employee or public.subscription_is_entitled(v_row.status, v_row.current_period_end, v_row.grace_period_ends_at),
    'status', case when v_employee then 'employee' else v_row.status end,
    'plan', case when v_employee then 'creator' else v_row.plan end,
    'provider', case when v_employee then 'internal' else v_row.provider end,
    'role', v_role,
    'currentPeriodEnd', v_row.current_period_end,
    'gracePeriodEndsAt', v_row.grace_period_ends_at,
    'cancelAtPeriodEnd', v_row.cancel_at_period_end
  );
end;
$$;