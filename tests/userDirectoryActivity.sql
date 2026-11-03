-- Run with psql against a fresh, disposable PostgreSQL database.
\set ON_ERROR_STOP on
begin;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create schema auth;
create schema app;
create table auth.users (
  id uuid primary key,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  email text
);
create function app.current_role() returns text language sql stable as $$
  select current_setting('test.role', true)
$$;
grant usage on schema app to authenticated;

insert into auth.users (id, created_at, last_sign_in_at)
values ('00000000-0000-0000-0000-000000000001', '2026-01-01', '2026-02-01');

\ir ../supabase/migrations/202611030001_user_directory_activity.sql

do $$
begin
  assert (select sign_in_count = 1 and signed_up_at = '2026-01-01'::timestamptz
    from public.user_directory_activity where user_id = '00000000-0000-0000-0000-000000000001'),
    'Backfill must preserve auth signup date and not invent historical repeat visits';
end $$;

insert into auth.users (id) values ('00000000-0000-0000-0000-000000000002');
do $$
begin
  assert (select sign_in_count = 0 and last_sign_in_at is null
    from public.user_directory_activity where user_id = '00000000-0000-0000-0000-000000000002'),
    'Signup without sign-in must start at zero';
end $$;

update auth.users set last_sign_in_at = '2026-11-03T10:00:00Z'
where id = '00000000-0000-0000-0000-000000000002';
update auth.users set email = 'fixture@example.test'
where id = '00000000-0000-0000-0000-000000000002';
update auth.users set last_sign_in_at = '2026-11-03T10:00:00Z'
where id = '00000000-0000-0000-0000-000000000002';
do $$
begin
  assert (select sign_in_count = 1 from public.user_directory_activity
    where user_id = '00000000-0000-0000-0000-000000000002'),
    'First sign-in counts once; unrelated updates and unchanged timestamps do not';
end $$;
update auth.users set last_sign_in_at = '2026-11-03T11:00:00Z';
do $$
begin
  assert (select count(*) = 2 from public.user_directory_activity where sign_in_count = 2),
    'A second sign-in must establish returning status for both existing and new accounts';
end $$;

set local role authenticated;
select set_config('test.role', 'user', true);
do $$
begin
  assert (select count(*) = 0 from public.user_directory_activity),
    'Non-staff must not read directory activity';
  assert not has_function_privilege('authenticated', 'public.track_user_directory_activity()', 'execute'),
    'Clients must not execute the tracking function';
end $$;
select set_config('test.role', 'it', true);
do $$
begin
  assert (select count(*) = 2 from public.user_directory_activity),
    'Authorized staff must see directory activity';
  begin
    update public.user_directory_activity set sign_in_count = 99;
    raise exception 'Staff must not write auth-owned activity';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.user_directory_activity (user_id, signed_up_at)
    values ('00000000-0000-0000-0000-000000000003', now());
    raise exception 'Clients must not insert activity';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;
delete from auth.users;
do $$
begin
  assert (select count(*) = 0 from public.user_directory_activity),
    'Deleting an account must remove its activity';
end $$;
rollback;
