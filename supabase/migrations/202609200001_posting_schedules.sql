-- Recurring weekly posting-time schedule per user, so "Post to next available
-- slot" can pick a time without the user manually setting a date/time for
-- every post. One row per user; `days` holds enabled flag + sorted "HH:MM"
-- times (24h) for each of the seven weekdays.
create table if not exists public.posting_schedules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_goal integer not null default 10 check (weekly_goal between 1 and 500),
  days jsonb not null default '{
    "sunday": {"enabled": false, "times": []},
    "monday": {"enabled": true, "times": ["09:00", "13:00", "17:00"]},
    "tuesday": {"enabled": true, "times": ["09:00", "13:00", "17:00"]},
    "wednesday": {"enabled": true, "times": ["09:00", "13:00", "17:00"]},
    "thursday": {"enabled": true, "times": ["09:00", "13:00", "17:00"]},
    "friday": {"enabled": true, "times": ["09:00", "13:00", "17:00"]},
    "saturday": {"enabled": false, "times": []}
  }'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.posting_schedules enable row level security;
revoke all on public.posting_schedules from public, anon;

drop policy if exists posting_schedules_owner_all on public.posting_schedules;
create policy posting_schedules_owner_all
  on public.posting_schedules for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.posting_schedules to authenticated;
