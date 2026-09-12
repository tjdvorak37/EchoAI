-- Accounting can access only the company attached to their profile.

drop policy if exists billing_payments_finance_select on public.billing_payments;
create policy billing_payments_finance_select
  on public.billing_payments for select
  using (
    app.current_role() = 'admin'
    or (
      app.current_role() = 'accountant'
      and exists (
        select 1 from public.profiles p
        where p.id = billing_payments.user_id
          and lower(trim(p.company)) = app.current_company_key()
      )
    )
  );

drop policy if exists subscriptions_admin_select on public.subscriptions;
create policy subscriptions_admin_select
  on public.subscriptions for select
  using (
    app.current_role() = 'admin'
    or (
      app.current_role() = 'accountant'
      and exists (
        select 1 from public.profiles p
        where p.id = subscriptions.user_id
          and lower(trim(p.company)) = app.current_company_key()
      )
    )
  );