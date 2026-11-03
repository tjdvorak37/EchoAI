-- Auth owns these timestamps/counters; browser clients can only read them as staff.
create table public.user_directory_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  signed_up_at timestamptz not null,
  last_sign_in_at timestamptz,
  sign_in_count bigint not null default 0 check (sign_in_count >= 0)
);

alter table public.user_directory_activity enable row level security;
revoke all on public.user_directory_activity from anon, authenticated;
grant select on public.user_directory_activity to authenticated;

create policy user_directory_activity_staff_read
  on public.user_directory_activity for select to authenticated
  using (app.current_role() in ('admin', 'super_admin', 'manager', 'it', 'accountant'));

create or replace function public.track_user_directory_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.last_sign_in_at is not distinct from old.last_sign_in_at then
      return new;
    end if;
  end if;

  insert into public.user_directory_activity (user_id, signed_up_at, last_sign_in_at, sign_in_count)
  values (new.id, new.created_at, new.last_sign_in_at, case when new.last_sign_in_at is null then 0 else 1 end)
  on conflict (user_id) do update
    set last_sign_in_at = excluded.last_sign_in_at,
        sign_in_count = user_directory_activity.sign_in_count
          + case when excluded.last_sign_in_at is not null
                   and excluded.last_sign_in_at is distinct from user_directory_activity.last_sign_in_at
                 then 1 else 0 end;
  return new;
end;
$$;

revoke all on function public.track_user_directory_activity() from public;

create trigger track_user_directory_activity
after insert or update of last_sign_in_at on auth.users
for each row execute function public.track_user_directory_activity();

-- Existing history cannot establish a repeat visit: seed only one known sign-in.
insert into public.user_directory_activity (user_id, signed_up_at, last_sign_in_at, sign_in_count)
select id, created_at, last_sign_in_at, case when last_sign_in_at is null then 0 else 1 end
from auth.users
on conflict (user_id) do nothing;
