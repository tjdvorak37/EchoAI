-- Raise the Board Member / owner profit-share cap from 10% to 50% so owners
-- (e.g. majority shareholders) can be configured above the old ceiling.

alter table public.profiles
  drop constraint if exists profiles_profit_share_percent_check;
alter table public.profiles
  add constraint profiles_profit_share_percent_check
  check (profit_share_percent >= 0 and profit_share_percent <= 50);

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
  if v_share is null or v_share < 1 or v_share > 50 then raise exception 'Board Member share percentage is not configured'; end if;
  select coalesce(sum(bp.amount_usd), 0) into p_profit_after_expenses from public.billing_payments bp join public.profiles p on p.id = bp.user_id where lower(trim(p.company)) = app.current_company_key() and bp.status = 'confirmed' and bp.paid_at::date between p_quarter_start and p_quarter_end;
  select p_profit_after_expenses - coalesce(sum(case when fr.record_type = 'expense' then coalesce((fr.record->>'amountUsd')::numeric, 0) else 0 end), 0) - coalesce(sum(case when fr.record_type = 'refund' and fr.record->>'status' in ('approved', 'processed') then coalesce((fr.record->>'amountUsd')::numeric, 0) else 0 end), 0) - coalesce(sum(case when fr.record_type = 'payroll' then coalesce((fr.record->>'grossPayUsd')::numeric, 0) else 0 end), 0) into p_profit_after_expenses from public.finance_records fr where fr.company_key = app.current_company_key() and coalesce(nullif(fr.record->>'date', '')::date, nullif(fr.record->>'dueDate', '')::date, nullif(fr.record->>'lastPaidDate', '')::date, p_quarter_start) between p_quarter_start and p_quarter_end;
  p_profit_after_expenses := greatest(p_profit_after_expenses, 0);
  insert into public.board_profit_payouts (company_key, board_member_id, quarter_start, quarter_end, profit_after_expenses, active_subscription_count, share_percent, payout_amount, notes, created_by)
  values (app.current_company_key(), p_board_member_id, p_quarter_start, p_quarter_end, p_profit_after_expenses, p_active_subscription_count, v_share, p_profit_after_expenses * v_share / 100, coalesce(p_notes, ''), auth.uid()) returning * into v_payout;
  return v_payout;
end;
$$;
