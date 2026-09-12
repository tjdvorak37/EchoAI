-- Keep employee profile records out of Technician and Manager browser queries.
-- Accounting retains read access for finance duties; Super Admin retains full access.

drop policy if exists echoai_profiles_select_staff on public.profiles;
create policy echoai_profiles_select_staff
  on public.profiles for select
  using (
    app.current_role() = 'admin'
    or (
      app.current_role() = 'accountant'
      and lower(trim(coalesce(company, ''))) = app.current_company_key()
    )
  );

drop policy if exists echoai_profiles_select_company on public.profiles;
create policy echoai_profiles_select_company
  on public.profiles for select
  using (
    app.current_company_key() <> ''
    and lower(trim(coalesce(company, ''))) = app.current_company_key()
    and role = 'user'
  );