-- Persistent company finance records. Only Super Admin and Accounting may read or write.
create table if not exists public.finance_records (
  id uuid primary key default gen_random_uuid(),
  company_key text not null,
  record_type text not null,
  record jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_records_type_check check (record_type in ('expense', 'payroll', 'tax', 'refund', 'task'))
);

create index if not exists finance_records_company_type_idx
  on public.finance_records (company_key, record_type, updated_at desc);

alter table public.finance_records enable row level security;

drop policy if exists finance_records_admin_accounting on public.finance_records;
create policy finance_records_admin_accounting
  on public.finance_records for all
  using (company_key = app.current_company_key() and app.current_role() in ('admin', 'accountant'))
  with check (company_key = app.current_company_key() and app.current_role() in ('admin', 'accountant'));

create policy finance_records_board_summary_read
  on public.finance_records for select
  using (company_key = app.current_company_key() and app.current_role() = 'board_member' and record_type in ('expense', 'refund', 'task'));
