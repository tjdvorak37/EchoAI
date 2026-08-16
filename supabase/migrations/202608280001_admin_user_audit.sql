-- Support actions an admin can take on another account are high value targets,
-- so every one is recorded. Only the service role writes here; nothing in the
-- browser can insert, edit, or delete a row.
create table if not exists public.admin_user_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_user_audit_action_check
    check (action in ('viewed_verification', 'generated_recovery_link', 'updated_profile'))
);

create index if not exists admin_user_audit_target_idx
  on public.admin_user_audit (target_user_id, created_at desc);

alter table public.admin_user_audit enable row level security;

drop policy if exists "Admins read audit trail" on public.admin_user_audit;
create policy "Admins read audit trail"
  on public.admin_user_audit
  for select
  using (app.current_role() = 'admin');
