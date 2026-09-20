-- Beta testers receive Premium access without a subscription or charge.
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
         coalesce(p.is_beta_tester, false)
         or coalesce(p.is_board_member, false)
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
  v_beta boolean;
  v_paid boolean;
begin
  if v_uid is null then
    return json_build_object('entitled', false, 'accessLevel', 'anonymous', 'status', 'anonymous');
  end if;

  select coalesce(role, 'user'),
         coalesce(is_board_member, false) or role in ('admin', 'super_admin', 'manager', 'it', 'accountant', 'board_member'),
         coalesce(is_beta_tester, false)
    into v_role, v_employee, v_beta
    from public.profiles
   where id = v_uid;

  select * into v_row from public.subscriptions where user_id = v_uid;
  v_paid := v_employee or v_beta or (found and public.subscription_is_entitled(v_row.status, v_row.current_period_end, v_row.grace_period_ends_at));

  return json_build_object(
    'entitled', v_paid,
    'accessLevel', case when v_paid then 'paid' else 'free' end,
    'status', case when v_employee then 'employee' when v_beta then 'beta' when found then v_row.status else 'none' end,
    'plan', case when v_employee or v_beta then 'creator' when v_paid then v_row.plan else null end,
    'storageGb', case when v_employee or v_beta then 100 when v_paid then v_row.storage_limit_gb else 0 end,
    'provider', case when v_employee then 'internal' when v_beta then 'beta' when found then v_row.provider else null end,
    'role', v_role,
    'currentPeriodEnd', case when found then v_row.current_period_end else null end,
    'gracePeriodEndsAt', case when found then v_row.grace_period_ends_at else null end,
    'cancelAtPeriodEnd', case when found then v_row.cancel_at_period_end else false end
  );
end;
$$;