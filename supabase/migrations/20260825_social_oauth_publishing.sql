-- Social OAuth is self-service: every authorization request is bound to one
-- authenticated user, while tokens remain accessible only to service-role code.

create table if not exists public.social_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  requested_scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint social_oauth_states_platform_check check (
    platform in ('instagram', 'facebook', 'tiktok', 'snapchat', 'x', 'youtube', 'linkedin')
  )
);

alter table public.social_oauth_states enable row level security;
revoke all on public.social_oauth_states from anon, authenticated;

create or replace function public.prune_social_oauth_states()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.social_oauth_states where created_at < now() - interval '15 minutes';
$$;

grant execute on function public.prune_social_oauth_states() to service_role;

alter table public.user_social_accounts
  add column if not exists external_account_id text not null default '';
alter table public.user_social_accounts
  add column if not exists provider_account_url text not null default '';

alter table public.scheduled_posts
  add column if not exists publish_attempts integer not null default 0;
alter table public.scheduled_posts
  add column if not exists last_publish_error text;
alter table public.scheduled_posts
  add column if not exists provider_post_ids jsonb not null default '{}'::jsonb;
alter table public.scheduled_posts
  add column if not exists publishing_started_at timestamptz;
alter table public.scheduled_posts
  add column if not exists published_at timestamptz;

create index if not exists scheduled_posts_due_publish_idx
  on public.scheduled_posts (scheduled_at)
  where status = 'scheduled';

-- Claims a due post exactly once. The publishing worker calls this as service
-- role, so customers cannot read or mutate anyone else's queued jobs.
create or replace function public.claim_due_scheduled_posts(p_limit integer default 25)
returns setof public.scheduled_posts
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id
    from public.scheduled_posts
    where status = 'scheduled'
      and scheduled_at <= now()
    order by scheduled_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.scheduled_posts post
     set status = 'publishing',
         publishing_started_at = now(),
         publish_attempts = post.publish_attempts + 1
    from due
   where post.id = due.id
  returning post.*;
end;
$$;

revoke all on function public.claim_due_scheduled_posts(integer) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_posts(integer) to service_role;