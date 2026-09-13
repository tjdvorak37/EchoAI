-- Board membership is independent from the primary role. An admin, accountant,
-- or employee may also be a Board Member and receive profit-share payouts.

alter table public.profiles
  add column if not exists is_board_member boolean not null default false;

update public.profiles
   set is_board_member = true
 where role = 'board_member';

create or replace function app.is_board_member()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce((select p.is_board_member from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.my_entitlement()
returns json
language plpgsql stable security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_row public.subscriptions; v_role text; v_employee boolean;
begin
  if v_uid is null then return json_build_object('entitled', false, 'status', 'anonymous'); end if;
  select coalesce(role, 'user'), coalesce(is_board_member, false) or role in ('admin', 'manager', 'it', 'accountant') into v_role, v_employee from public.profiles where id = v_uid;
  select * into v_row from public.subscriptions where user_id = v_uid;
  if not found then return json_build_object('entitled', v_employee, 'status', case when v_employee then 'employee' else 'none' end, 'plan', case when v_employee then 'creator' else null end, 'provider', case when v_employee then 'internal' else null end, 'role', v_role); end if;
  return json_build_object('entitled', v_employee or public.subscription_is_entitled(v_row.status, v_row.current_period_end, v_row.grace_period_ends_at), 'status', case when v_employee then 'employee' else v_row.status end, 'plan', case when v_employee then 'creator' else v_row.plan end, 'provider', case when v_employee then 'internal' else v_row.provider end, 'role', v_role, 'currentPeriodEnd', v_row.current_period_end, 'gracePeriodEndsAt', v_row.grace_period_ends_at, 'cancelAtPeriodEnd', v_row.cancel_at_period_end);
end;
$$;

drop policy if exists board_profit_payouts_member_read on public.board_profit_payouts;
create policy board_profit_payouts_member_read
  on public.board_profit_payouts for select
  using (board_member_id = auth.uid() and company_key = app.current_company_key() and app.is_board_member());

create or replace function public.board_member_financial_summary(p_company_key text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_share numeric(4, 2);
  v_revenue numeric(12, 2);
  v_expenses numeric(12, 2);
  v_payroll numeric(12, 2);
  v_refunds numeric(12, 2);
  v_subscriptions integer;
  v_profit numeric(12, 2);
begin
  if not app.is_board_member() or lower(trim(p_company_key)) <> app.current_company_key() then
    raise exception 'Board Member access is required';
  end if;
  select coalesce(profit_share_percent, 0) into v_share from public.profiles where id = auth.uid();
  select coalesce(sum(bp.amount_usd), 0) into v_revenue
    from public.billing_payments bp join public.profiles p on p.id = bp.user_id
   where lower(trim(p.company)) = lower(trim(p_company_key)) and bp.status = 'confirmed';
  select
    coalesce(sum(case when record_type = 'expense' then coalesce((record->>'amountUsd')::numeric, 0) else 0 end), 0),
    coalesce(sum(case when record_type = 'payroll' then coalesce((record->>'grossPayUsd')::numeric, 0) else 0 end), 0),
    coalesce(sum(case when record_type = 'refund' and record->>'status' in ('approved', 'processed') then coalesce((record->>'amountUsd')::numeric, 0) else 0 end), 0)
    into v_expenses, v_payroll, v_refunds from public.finance_records where company_key = lower(trim(p_company_key));
  select count(*) into v_subscriptions
    from public.subscriptions s join public.profiles p on p.id = s.user_id
   where lower(trim(p.company)) = lower(trim(p_company_key))
     and public.subscription_is_entitled(s.status, s.current_period_end, s.grace_period_ends_at);
  v_profit := v_revenue - v_expenses - v_payroll - v_refunds;
  return json_build_object('revenue', v_revenue, 'expenses', v_expenses, 'refunds', v_refunds, 'profitAfterExpenses', v_profit, 'activeSubscriptions', v_subscriptions, 'sharePercent', v_share, 'estimatedPayout', greatest(v_profit, 0) * v_share / 100);
end;
$$;

create or replace function public.create_board_profit_payout(
  p_company_key text, p_board_member_id uuid, p_quarter_start date, p_quarter_end date,
  p_profit_after_expenses numeric, p_active_subscription_count integer, p_notes text default ''
)
returns public.board_profit_payouts
language plpgsql security definer set search_path = public
as $$
declare v_share numeric(4, 2); v_payout public.board_profit_payouts;
begin
  if app.current_role() not in ('admin', 'accountant') then raise exception 'Super Admin or Accounting access is required'; end if;
  if lower(trim(p_company_key)) <> app.current_company_key() or p_quarter_end < p_quarter_start or p_active_subscription_count < 0 then raise exception 'Invalid quarterly payout values'; end if;
  select profit_share_percent into v_share from public.profiles where id = p_board_member_id and is_board_member and lower(trim(company)) = app.current_company_key();
  if v_share is null or v_share < 1 or v_share > 10 then raise exception 'Board Member share percentage is not configured'; end if;
  select coalesce(sum(bp.amount_usd), 0) into p_profit_after_expenses from public.billing_payments bp join public.profiles p on p.id = bp.user_id where lower(trim(p.company)) = app.current_company_key() and bp.status = 'confirmed' and bp.paid_at::date between p_quarter_start and p_quarter_end;
  select p_profit_after_expenses - coalesce(sum(case when fr.record_type = 'expense' then coalesce((fr.record->>'amountUsd')::numeric, 0) else 0 end), 0) - coalesce(sum(case when fr.record_type = 'refund' and fr.record->>'status' in ('approved', 'processed') then coalesce((fr.record->>'amountUsd')::numeric, 0) else 0 end), 0) - coalesce(sum(case when fr.record_type = 'payroll' then coalesce((fr.record->>'grossPayUsd')::numeric, 0) else 0 end), 0) into p_profit_after_expenses from public.finance_records fr where fr.company_key = app.current_company_key() and coalesce(nullif(fr.record->>'date', '')::date, nullif(fr.record->>'dueDate', '')::date, nullif(fr.record->>'lastPaidDate', '')::date, p_quarter_start) between p_quarter_start and p_quarter_end;
  p_profit_after_expenses := greatest(p_profit_after_expenses, 0);
  insert into public.board_profit_payouts (company_key, board_member_id, quarter_start, quarter_end, profit_after_expenses, active_subscription_count, share_percent, payout_amount, notes, created_by)
  values (app.current_company_key(), p_board_member_id, p_quarter_start, p_quarter_end, p_profit_after_expenses, p_active_subscription_count, v_share, p_profit_after_expenses * v_share / 100, coalesce(p_notes, ''), auth.uid()) returning * into v_payout;
  return v_payout;
end;
$$;