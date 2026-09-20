create table if not exists public.user_free_posting_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used_count integer not null default 0 check (used_count >= 0 and used_count <= 10),
  updated_at timestamptz not null default now()
);

alter table public.user_free_posting_usage enable row level security;
revoke all on public.user_free_posting_usage from public, anon;

drop policy if exists user_free_posting_usage_owner_all on public.user_free_posting_usage;
create policy user_free_posting_usage_owner_all
  on public.user_free_posting_usage for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_free_posting_usage to authenticated;
