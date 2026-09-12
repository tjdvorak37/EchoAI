-- Board Members receive no salary. Their compensation is a percentage of
-- quarterly profit after expenses, limited to 1-10 percent.

alter table public.profiles
  add column if not exists profit_share_percent numeric(4, 2) not null default 0;

alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'it', 'accountant', 'board_member', 'user'));

alter table public.profiles
  drop constraint if exists profiles_profit_share_percent_check;
alter table public.profiles
  add constraint profiles_profit_share_percent_check
  check (profit_share_percent >= 0 and profit_share_percent <= 10);

create table if not exists public.board_profit_payouts (
  id uuid primary key default gen_random_uuid(),
  company_key text not null,
  board_member_id uuid not null references auth.users(id) on delete cascade,
  quarter_start date not null,
  quarter_end date not null,
  profit_after_expenses numeric(12, 2) not null default 0,
  active_subscription_count integer not null default 0,
  share_percent numeric(4, 2) not null,
  payout_amount numeric(12, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid', 'void')),
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists board_profit_payouts_member_idx
  on public.board_profit_payouts (board_member_id, quarter_end desc);

alter table public.board_profit_payouts enable row level security;

create policy board_profit_payouts_admin_accounting
  on public.board_profit_payouts for select
  using (company_key = app.current_company_key() and app.current_role() in ('admin', 'accountant'))
;

create policy board_profit_payouts_member_read
  on public.board_profit_payouts for select
  using (board_member_id = auth.uid() and company_key = app.current_company_key() and app.current_role() = 'board_member');

create or replace function public.board_member_financial_summary(p_company_key text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := app.current_role();
  v_share numeric(4, 2);
  v_revenue numeric(12, 2);
  v_expenses numeric(12, 2);
  v_payroll numeric(12, 2);
  v_refunds numeric(12, 2);
  v_subscriptions integer;
  v_profit numeric(12, 2);
begin
  if v_role <> 'board_member' or lower(trim(p_company_key)) <> app.current_company_key() then
    raise exception 'Board Member access is required';
  end if;

  select coalesce(profit_share_percent, 0) into v_share
    from public.profiles where id = auth.uid();

  select coalesce(sum(bp.amount_usd), 0) into v_revenue
    from public.billing_payments bp
    join public.profiles p on p.id = bp.user_id
   where lower(trim(p.company)) = lower(trim(p_company_key))
     and bp.status = 'confirmed';

  select
    coalesce(sum(case when record_type = 'expense' then coalesce((record->>'amountUsd')::numeric, 0) else 0 end), 0),
    coalesce(sum(case when record_type = 'payroll' then coalesce((record->>'grossPayUsd')::numeric, 0) else 0 end), 0),
    coalesce(sum(case when record_type = 'refund' and record->>'status' in ('approved', 'processed') then coalesce((record->>'amountUsd')::numeric, 0) else 0 end), 0)
    into v_expenses, v_payroll, v_refunds
    from public.finance_records
   where company_key = lower(trim(p_company_key));

  select count(*) into v_subscriptions
    from public.subscriptions s
    join public.profiles p on p.id = s.user_id
   where lower(trim(p.company)) = lower(trim(p_company_key))
     and public.subscription_is_entitled(s.status, s.current_period_end, s.grace_period_ends_at);

  v_profit := v_revenue - v_expenses - v_payroll - v_refunds;
  return json_build_object(
    'revenue', v_revenue,
    'expenses', v_expenses,
    'refunds', v_refunds,
    'profitAfterExpenses', v_profit,
    'activeSubscriptions', v_subscriptions,
    'sharePercent', v_share,
    'estimatedPayout', greatest(v_profit, 0) * v_share / 100
  );
end;
$$;

grant execute on function public.board_member_financial_summary(text) to authenticated;

create or replace function public.create_board_profit_payout(
  p_company_key text,
  p_board_member_id uuid,
  p_quarter_start date,
  p_quarter_end date,
  p_profit_after_expenses numeric,
  p_active_subscription_count integer,
  p_notes text default ''
)
returns public.board_profit_payouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share numeric(4, 2);
  v_payout public.board_profit_payouts;
begin
  if app.current_role() not in ('admin', 'accountant') then
    raise exception 'Super Admin or Accounting access is required';
  end if;
  if lower(trim(p_company_key)) <> app.current_company_key() then
    raise exception 'Company scope mismatch';
  end if;
  if p_quarter_end < p_quarter_start or p_active_subscription_count < 0 then
    raise exception 'Invalid quarterly payout values';
  end if;
  select profit_share_percent into v_share
    from public.profiles
   where id = p_board_member_id
     and role = 'board_member'
     and lower(trim(company)) = app.current_company_key();
  if v_share is null or v_share < 1 or v_share > 10 then
    raise exception 'Board Member share percentage is not configured';
  end if;
  select coalesce(sum(bp.amount_usd), 0)
    into p_profit_after_expenses
    from public.billing_payments bp
    join public.profiles payment_profile on payment_profile.id = bp.user_id
   where lower(trim(payment_profile.company)) = app.current_company_key()
     and bp.status = 'confirmed'
     and bp.paid_at::date between p_quarter_start and p_quarter_end;

  select p_profit_after_expenses
    - coalesce(sum(case when fr.record_type = 'expense' then coalesce((fr.record->>'amountUsd')::numeric, 0) else 0 end), 0)
    - coalesce(sum(case when fr.record_type = 'refund' and fr.record->>'status' in ('approved', 'processed') then coalesce((fr.record->>'amountUsd')::numeric, 0) else 0 end), 0)
    - coalesce(sum(case when fr.record_type = 'payroll' then coalesce((fr.record->>'grossPayUsd')::numeric, 0) else 0 end), 0)
    into p_profit_after_expenses
    from public.finance_records fr
   where fr.company_key = app.current_company_key()
    and coalesce(nullif(fr.record->>'date', '')::date, nullif(fr.record->>'dueDate', '')::date, nullif(fr.record->>'lastPaidDate', '')::date, p_quarter_start) between p_quarter_start and p_quarter_end;

  p_profit_after_expenses := greatest(p_profit_after_expenses, 0);

  insert into public.board_profit_payouts (
    company_key, board_member_id, quarter_start, quarter_end,
    profit_after_expenses, active_subscription_count, share_percent,
    payout_amount, notes, created_by
  ) values (
    app.current_company_key(), p_board_member_id, p_quarter_start, p_quarter_end,
    p_profit_after_expenses, p_active_subscription_count, v_share,
    greatest(p_profit_after_expenses, 0) * v_share / 100, coalesce(p_notes, ''), auth.uid()
  ) returning * into v_payout;
  return v_payout;
end;
$$;

grant execute on function public.create_board_profit_payout(text, uuid, date, date, numeric, integer, text) to authenticated;

create or replace function public.mark_board_profit_payout_paid(p_payout_id uuid)
returns public.board_profit_payouts
language plpgsql
security definer
set search_path = public
as $$
declare v_payout public.board_profit_payouts;
begin
  if app.current_role() not in ('admin', 'accountant') then raise exception 'Super Admin or Accounting access is required'; end if;
  update public.board_profit_payouts set status = 'paid', paid_at = now()
   where id = p_payout_id and company_key = app.current_company_key()
   returning * into v_payout;
  if v_payout.id is null then raise exception 'Payout not found'; end if;
  return v_payout;
end;
$$;
grant execute on function public.mark_board_profit_payout_paid(uuid) to authenticated;

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
  v_employee := v_role in ('admin', 'manager', 'it', 'accountant', 'board_member');
  select * into v_row from public.subscriptions where user_id = v_uid;
  if not found then
    return json_build_object('entitled', v_employee, 'status', case when v_employee then 'employee' else 'none' end, 'plan', case when v_employee then 'creator' else null end, 'provider', case when v_employee then 'internal' else null end, 'role', v_role);
  end if;
  return json_build_object('entitled', v_employee or public.subscription_is_entitled(v_row.status, v_row.current_period_end, v_row.grace_period_ends_at), 'status', case when v_employee then 'employee' else v_row.status end, 'plan', case when v_employee then 'creator' else v_row.plan end, 'provider', case when v_employee then 'internal' else v_row.provider end, 'role', v_role, 'currentPeriodEnd', v_row.current_period_end, 'gracePeriodEndsAt', v_row.grace_period_ends_at, 'cancelAtPeriodEnd', v_row.cancel_at_period_end);
end;
$$;