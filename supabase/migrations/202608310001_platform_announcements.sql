-- Separate public and signed-in notices. Public visitors may only read the
-- landing notice; authenticated users may also read the application notice.

create table if not exists public.platform_announcements (
  id text primary key check (id in ('landing', 'application')),
  message text not null default '',
  enabled boolean not null default false,
  scrolling boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.platform_announcements (id, message, enabled, scrolling)
values
  (
    'landing',
    'This application is currently in Beta Testing, if you purchase a subscription please report all bugs and issues to the Support Team as we are actively working through the problems. Expected launch date 9/15/2026 Thanks',
    true,
    true
  ),
  ('application', '', false, true)
on conflict (id) do nothing;

alter table public.platform_announcements enable row level security;

drop policy if exists platform_announcements_public_landing_read on public.platform_announcements;
create policy platform_announcements_public_landing_read
  on public.platform_announcements for select
  to anon
  using (id = 'landing');

drop policy if exists platform_announcements_authenticated_read on public.platform_announcements;
create policy platform_announcements_authenticated_read
  on public.platform_announcements for select
  to authenticated
  using (true);

create or replace function public.save_platform_announcement(
  p_id text,
  p_message text,
  p_enabled boolean,
  p_scrolling boolean
)
returns public.platform_announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_announcements;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if app.current_role() not in ('admin', 'manager', 'it') then
    raise exception 'Only management or IT staff can change platform announcements.';
  end if;

  if p_id not in ('landing', 'application') then
    raise exception 'Unknown announcement audience.';
  end if;

  update public.platform_announcements
  set
    message = trim(coalesce(p_message, '')),
    enabled = coalesce(p_enabled, false),
    scrolling = coalesce(p_scrolling, true),
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.save_platform_announcement(text, text, boolean, boolean) from public;
grant execute on function public.save_platform_announcement(text, text, boolean, boolean) to authenticated;

grant select on public.platform_announcements to anon, authenticated;