-- Run against a fresh, disposable PostgreSQL database only.
\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create schema auth;
create schema app;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create function app.current_role() returns text language sql stable as $$
  select current_setting('test.role', true)
$$;
grant usage on schema auth, app to authenticated;
create table auth.users (id uuid primary key);
create table public.profiles (id uuid primary key, is_beta_tester boolean default false);
create table public.subscriptions (id uuid primary key, status text);
create table storage.buckets (id text primary key, file_size_limit bigint);
create table storage.objects (
  id uuid primary key, bucket_id text, metadata jsonb, created_at timestamptz default now()
);
create table public.scheduled_posts (
  id uuid primary key, status text, media jsonb default '[]', created_at timestamptz default now(),
  published_at timestamptz, scheduled_at timestamptz default now(), publishing_started_at timestamptz
);
create table public.echo_ai_jobs (
  id uuid primary key, status text, capability text, created_at timestamptz default now(), completed_at timestamptz
);
insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into public.profiles values ('00000000-0000-0000-0000-000000000001', true);
insert into storage.buckets values ('social-media', 2147483648);
insert into storage.objects values ('10000000-0000-0000-0000-000000000001', 'social-media',
  '{"size":1000,"mimetype":"video/mp4"}', '2026-10-01T23:30:00Z');
insert into public.scheduled_posts (id, status, media, published_at)
values ('20000000-0000-0000-0000-000000000001', 'published', '[{"type":"image"},{"type":"video"}]', '2026-10-01T23:30:00Z');
insert into public.echo_ai_jobs (id, status, capability, completed_at)
values ('30000000-0000-0000-0000-000000000001', 'completed', 'image', '2026-10-01T23:30:00Z');

\ir ../supabase/migrations/202611100001_infrastructure_usage.sql

set local timezone = 'Pacific/Auckland';
do $$
begin
  assert (select quantity = 1 and bytes = 1000 from public.infrastructure_daily where day = '2026-10-01' and metric = 'uploaded_video'), 'Backfill uses UTC';
  assert (select quantity = 1 from public.infrastructure_daily where day = '2026-10-01' and metric = 'published_video'), 'Mixed media prefers video';
  assert (select quantity = 1 from public.infrastructure_daily where day = '2026-10-01' and metric = 'ai_completed_image'), 'AI history seeded';
end $$;

-- A finalized upload counts once, including metadata replay and MIME changes.
insert into storage.objects (id, bucket_id) values ('10000000-0000-0000-0000-000000000002', 'social-media');
update storage.objects set metadata = '{"size":500,"mimetype":"image/png"}' where id = '10000000-0000-0000-0000-000000000002';
update storage.objects set metadata = '{"size":500,"mimetype":"image/jpeg"}' where id = '10000000-0000-0000-0000-000000000002';
update storage.objects set metadata = '{"size":500,"mimetype":"video/mp4"}' where id = '10000000-0000-0000-0000-000000000002';
delete from storage.objects where id = '10000000-0000-0000-0000-000000000002';

insert into public.scheduled_posts (id, status) values ('20000000-0000-0000-0000-000000000002', 'scheduled');
update public.scheduled_posts set status = 'published' where id = '20000000-0000-0000-0000-000000000002';
update public.scheduled_posts set status = 'published', media = '[{"type":"image"}]' where id = '20000000-0000-0000-0000-000000000002';
delete from public.scheduled_posts where id = '20000000-0000-0000-0000-000000000002';
insert into public.echo_ai_jobs (id, status, capability) values ('30000000-0000-0000-0000-000000000002', 'running', 'video');
update public.echo_ai_jobs set status = 'completed' where id = '30000000-0000-0000-0000-000000000002';
update public.echo_ai_jobs set status = 'completed' where id = '30000000-0000-0000-0000-000000000002';
insert into public.echo_ai_jobs (id, status, capability) values ('30000000-0000-0000-0000-000000000003', 'failed', 'image');
update public.echo_ai_jobs set status = 'refunded' where id = '30000000-0000-0000-0000-000000000003';
do $$
begin
  assert (select count(*) = 1 from public.infrastructure_events where source_id = '10000000-0000-0000-0000-000000000002'), 'Upload replay cannot inflate history';
  assert (select sum(quantity) = 1 from public.infrastructure_daily where metric = 'uploaded_image'), 'Deleted upload remains counted';
  assert (select sum(quantity) = 1 from public.infrastructure_daily where metric = 'published_text'), 'Deleted/replayed published post remains counted once';
  assert (select sum(quantity) = 1 from public.infrastructure_daily where metric = 'ai_completed_video'), 'Completed job counted once';
  assert (select sum(quantity) = 1 from public.infrastructure_daily where metric = 'ai_failed'), 'Failure and refund count once';
end $$;

set local role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000001', true);
select set_config('test.role', 'user', true);
do $$
begin
  begin perform public.get_infrastructure_usage(); raise exception 'Customer must not read usage'; exception when insufficient_privilege then null; end;
  begin perform public.save_infrastructure_settings('pro', 'paid'); raise exception 'Customer must not write settings'; exception when insufficient_privilege then null; end;
  begin perform public.save_infrastructure_reading('supabase_egress', 0, current_date, current_date); raise exception 'Customer must not write readings'; exception when insufficient_privilege then null; end;
  assert not has_table_privilege('authenticated', 'public.infrastructure_events', 'SELECT'), 'No raw client access';
  assert not has_table_privilege('authenticated', 'public.infrastructure_daily', 'INSERT'), 'No client counter mutation';
  assert not has_function_privilege('anon', 'public.get_infrastructure_usage(date)', 'EXECUTE'), 'No anonymous RPC';
  assert not has_function_privilege('authenticated', 'public.track_infrastructure_activity()', 'EXECUTE'), 'No client tracker invocation';
end $$;
select set_config('test.role', 'it', true);
select public.save_infrastructure_settings('pro', 'paid', '2027-01-01');
select public.save_infrastructure_reading('supabase_functions', 123, (now() at time zone 'UTC')::date, (now() at time zone 'UTC')::date);
do $$
declare v_result jsonb;
begin
  v_result := public.get_infrastructure_usage('2026-10-01');
  assert v_result->'settings'->>'supabase_plan' = 'pro', 'Plan settings persist';
  assert (v_result->>'storageBytes')::bigint = 1000, 'Storage is live inventory, not lifetime bytes';
  assert (v_result->>'users')::bigint = 1, 'Server counts users';
  assert (v_result->>'betaUsers')::bigint = 1, 'Server counts testers';
  assert jsonb_array_length(v_result->'readings') = 1, 'Saved reading included';
  assert jsonb_array_length(v_result->'snapshots') = 1, 'One snapshot per UTC day';
  assert exists (select 1 from jsonb_array_elements(v_result->'activity') a where a->>'metric' = 'uploaded_video' and (a->>'daily')::bigint = 1), 'Selected day returned';
  perform public.get_infrastructure_usage();
  begin perform public.save_infrastructure_settings(null, 'free'); raise exception 'Null plan accepted'; exception when raise_exception then assert sqlerrm = 'Unsupported infrastructure plan'; end;
  begin perform public.save_infrastructure_reading('supabase_functions', -1, current_date, current_date); raise exception 'Negative value accepted'; exception when raise_exception then assert sqlerrm like 'Enter a finite%'; end;
  begin perform public.save_infrastructure_reading('supabase_functions', 'NaN', current_date, current_date); raise exception 'NaN accepted'; exception when raise_exception then assert sqlerrm like 'Enter a finite%'; end;
  begin perform public.get_infrastructure_usage(current_date + 3); raise exception 'Future day accepted'; exception when raise_exception then assert sqlerrm like 'Choose a day%'; end;
end $$;
select set_config('test.role', 'accountant', true);
do $$ begin
  begin perform public.get_infrastructure_usage(); raise exception 'Accountant must not read IT telemetry'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) = 1 from public.infrastructure_snapshots), 'Repeated refreshes upsert a daily snapshot';
end $$;
rollback;
