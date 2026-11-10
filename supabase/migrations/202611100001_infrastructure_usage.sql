-- Operational counters are server-owned and contain no post content or credentials.
create table public.infrastructure_settings (
  id boolean primary key default true check (id),
  supabase_plan text not null default 'free' check (supabase_plan in ('free', 'pro')),
  plan_confirmed boolean not null default false,
  aws_plan text not null default 'unknown' check (aws_plan in ('unknown', 'free', 'paid')),
  aws_expires_on date,
  tracking_started_at timestamptz not null default now()
);
insert into public.infrastructure_settings (id) values (true);

create table public.infrastructure_events (
  source text not null,
  source_id uuid not null,
  metric text not null,
  occurred_at timestamptz not null,
  bytes bigint not null default 0 check (bytes >= 0),
  primary key (source, source_id, metric)
);
create table public.infrastructure_daily (
  day date not null,
  metric text not null,
  quantity bigint not null default 0,
  bytes bigint not null default 0,
  primary key (day, metric)
);
create table public.infrastructure_snapshots (
  day date primary key,
  database_bytes bigint not null,
  storage_bytes bigint not null,
  measured_at timestamptz not null default now()
);
create table public.infrastructure_provider_readings (
  metric text primary key check (metric in (
    'supabase_egress', 'supabase_cached_egress', 'supabase_functions', 'supabase_mau',
    'aws_transfer', 'aws_build_minutes', 'aws_storage'
  )),
  value numeric not null check (value >= 0 and value < 1e18),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  measured_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null
);

alter table public.infrastructure_settings enable row level security;
alter table public.infrastructure_events enable row level security;
alter table public.infrastructure_daily enable row level security;
alter table public.infrastructure_snapshots enable row level security;
alter table public.infrastructure_provider_readings enable row level security;
revoke all on public.infrastructure_settings, public.infrastructure_events,
  public.infrastructure_daily, public.infrastructure_snapshots,
  public.infrastructure_provider_readings from anon, authenticated;

create function public.aggregate_infrastructure_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.infrastructure_daily (day, metric, quantity, bytes)
  values ((new.occurred_at at time zone 'UTC')::date, new.metric, 1, new.bytes)
  on conflict (day, metric) do update
    set quantity = public.infrastructure_daily.quantity + 1,
        bytes = public.infrastructure_daily.bytes + excluded.bytes;
  return new;
end;
$$;
revoke all on function public.aggregate_infrastructure_event() from public;
create trigger aggregate_infrastructure_event after insert on public.infrastructure_events
for each row execute function public.aggregate_infrastructure_event();

create function public.infrastructure_post_kind(p_media jsonb)
returns text language sql immutable set search_path = '' as $$
  select case
    when exists (select 1 from jsonb_array_elements(
      case when jsonb_typeof(p_media) = 'array' then p_media else '[]'::jsonb end
    ) m where m->>'type' = 'video') then 'video'
    when exists (select 1 from jsonb_array_elements(
      case when jsonb_typeof(p_media) = 'array' then p_media else '[]'::jsonb end
    ) m where m->>'type' = 'image') then 'image'
    else 'text' end
$$;
revoke all on function public.infrastructure_post_kind(jsonb) from public;

create function public.track_infrastructure_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
  v_time timestamptz;
  v_bytes bigint := 0;
begin
  if tg_table_schema = 'storage' then
    -- Storage may insert a placeholder before finalizing its metadata.
    if new.metadata is null or new.metadata->>'size' is null then return new; end if;
    if exists (select 1 from public.infrastructure_events
      where source = 'storage' and source_id = new.id) then return new; end if;
    v_kind := case
      when new.metadata->>'mimetype' like 'video/%' then 'uploaded_video'
      when new.metadata->>'mimetype' like 'image/%' then 'uploaded_image'
      else 'uploaded_other' end;
    if new.metadata->>'size' ~ '^[0-9]{1,18}$' then
      v_bytes := (new.metadata->>'size')::bigint;
    end if;
    v_time := coalesce(new.created_at, now());
  elsif tg_table_name = 'scheduled_posts' then
    if tg_op = 'INSERT' then
      insert into public.infrastructure_events (source, source_id, metric, occurred_at)
      values ('post', new.id, 'created_post', coalesce(new.created_at, now()))
      on conflict do nothing;
    end if;
    if new.status <> 'published' then return new; end if;
    v_kind := 'published_' || public.infrastructure_post_kind(new.media);
    -- One publication event per post, even when a client replays a status change.
    if exists (select 1 from public.infrastructure_events
      where source = 'post' and source_id = new.id and metric like 'published_%') then
      return new;
    end if;
    v_time := coalesce(new.published_at, now());
  else
    if new.status not in ('completed', 'failed', 'refunded') then return new; end if;
    v_kind := case when new.status = 'completed' then 'ai_completed_' || new.capability else 'ai_failed' end;
    if exists (select 1 from public.infrastructure_events
      where source = 'ai' and source_id = new.id and metric like 'ai_completed_%')
      and new.status = 'completed' then return new; end if;
    v_time := coalesce(new.completed_at, now());
  end if;
  insert into public.infrastructure_events (source, source_id, metric, occurred_at, bytes)
  values (case when tg_table_schema = 'storage' then 'storage'
    when tg_table_name = 'scheduled_posts' then 'post' else 'ai' end,
    new.id, v_kind, v_time, v_bytes)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.track_infrastructure_activity() from public;

create trigger infrastructure_storage_activity after insert or update of metadata on storage.objects
for each row execute function public.track_infrastructure_activity();
create trigger infrastructure_post_activity after insert or update of status on public.scheduled_posts
for each row execute function public.track_infrastructure_activity();
create trigger infrastructure_ai_activity after insert or update of status on public.echo_ai_jobs
for each row execute function public.track_infrastructure_activity();

-- Seed retained history only; content deleted before this migration is unknowable.
insert into public.infrastructure_events (source, source_id, metric, occurred_at, bytes)
select 'storage', id, case
    when metadata->>'mimetype' like 'video/%' then 'uploaded_video'
    when metadata->>'mimetype' like 'image/%' then 'uploaded_image' else 'uploaded_other' end,
  coalesce(created_at, now()),
  case when metadata->>'size' ~ '^[0-9]{1,18}$' then (metadata->>'size')::bigint else 0 end
from storage.objects where metadata->>'size' is not null;
insert into public.infrastructure_events (source, source_id, metric, occurred_at)
select 'post', id, 'created_post', created_at from public.scheduled_posts;
insert into public.infrastructure_events (source, source_id, metric, occurred_at)
select 'post', id, 'published_' || public.infrastructure_post_kind(media),
  coalesce(published_at, created_at) from public.scheduled_posts where status = 'published';
insert into public.infrastructure_events (source, source_id, metric, occurred_at)
select 'ai', id, case when status = 'completed' then 'ai_completed_' || capability else 'ai_failed' end,
  coalesce(completed_at, created_at) from public.echo_ai_jobs
where status in ('completed', 'failed', 'refunded');

create function public.save_infrastructure_settings(
  p_supabase_plan text, p_aws_plan text, p_aws_expires_on date default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(app.current_role(), '') not in ('admin', 'super_admin', 'it') then
    raise exception 'Administrator or IT access required' using errcode = '42501';
  end if;
  if p_supabase_plan is null or p_supabase_plan not in ('free', 'pro')
    or p_aws_plan is null or p_aws_plan not in ('unknown', 'free', 'paid') then
    raise exception 'Unsupported infrastructure plan';
  end if;
  update public.infrastructure_settings set supabase_plan = p_supabase_plan,
    plan_confirmed = true, aws_plan = p_aws_plan, aws_expires_on = p_aws_expires_on where id;
end;
$$;
revoke all on function public.save_infrastructure_settings(text, text, date) from public;
grant execute on function public.save_infrastructure_settings(text, text, date) to authenticated;

create function public.save_infrastructure_reading(
  p_metric text, p_value numeric, p_period_start date, p_period_end date
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(app.current_role(), '') not in ('admin', 'super_admin', 'it') then
    raise exception 'Administrator or IT access required' using errcode = '42501';
  end if;
  if p_period_start is null or p_period_end is null or p_value is null
    or p_value < 0 or p_value >= 1e18 or p_value::text in ('NaN', 'Infinity', '-Infinity')
    or p_period_start > (now() at time zone 'UTC')::date
    or p_period_end < (now() at time zone 'UTC')::date
    or p_period_end - p_period_start > 366 then
    raise exception 'Enter a finite nonnegative value and a current billing period of at most one year';
  end if;
  insert into public.infrastructure_provider_readings
    (metric, value, period_start, period_end, recorded_by)
  values (p_metric, p_value, p_period_start, p_period_end, auth.uid())
  on conflict (metric) do update set value = excluded.value, period_start = excluded.period_start,
    period_end = excluded.period_end, measured_at = now(), recorded_by = auth.uid();
end;
$$;
revoke all on function public.save_infrastructure_reading(text, numeric, date, date) from public;
grant execute on function public.save_infrastructure_reading(text, numeric, date, date) to authenticated;

create function public.get_infrastructure_usage(p_day date default (now() at time zone 'UTC')::date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'UTC')::date;
  v_database bigint := pg_database_size(current_database());
  v_storage bigint;
  v_result jsonb;
begin
  if auth.uid() is null or coalesce(app.current_role(), '') not in ('admin', 'super_admin', 'it') then
    raise exception 'Administrator or IT access required' using errcode = '42501';
  end if;
  if p_day is null or p_day > v_today then raise exception 'Choose a day no later than today (UTC)'; end if;

  select coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,18}$'
    then (metadata->>'size')::bigint else 0 end), 0) into v_storage from storage.objects;
  insert into public.infrastructure_snapshots (day, database_bytes, storage_bytes)
  values (v_today, v_database, v_storage)
  on conflict (day) do update set database_bytes = excluded.database_bytes,
    storage_bytes = excluded.storage_bytes, measured_at = now();

  select jsonb_build_object(
    'measuredAt', now(), 'selectedDay', p_day,
    'settings', (select to_jsonb(s) from public.infrastructure_settings s where id),
    'databaseBytes', v_database, 'storageBytes', v_storage,
    'users', (select count(*) from auth.users),
    'betaUsers', (select count(*) from public.profiles where is_beta_tester),
    'activeSubscriptions', (select count(*) from public.subscriptions where status = 'active'),
    'queue', (select jsonb_build_object(
      'scheduled', count(*) filter (where status = 'scheduled'),
      'overdue', count(*) filter (where status = 'scheduled' and scheduled_at < now() - interval '5 minutes'),
      'publishing', count(*) filter (where status = 'publishing'),
      'stuck', count(*) filter (where status = 'publishing' and publishing_started_at < now() - interval '10 minutes'),
      'failed', count(*) filter (where status = 'failed')
    ) from public.scheduled_posts),
    'activity', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from (
      select metric, sum(quantity) as total, sum(bytes) as bytes,
        coalesce(sum(quantity) filter (where day = p_day), 0) as daily,
        coalesce(sum(bytes) filter (where day = p_day), 0) as daily_bytes,
        coalesce(sum(quantity) filter (where day >= date_trunc('month', now() at time zone 'UTC')::date), 0) as month
      from public.infrastructure_daily group by metric
    ) a),
    'history', (select coalesce(jsonb_agg(to_jsonb(d) order by day desc, metric), '[]'::jsonb)
      from public.infrastructure_daily d where day between v_today - 29 and v_today),
    'buckets', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from (
      select b.id, b.file_size_limit, count(o.id) as objects,
        coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]{1,18}$'
          then (o.metadata->>'size')::bigint else 0 end), 0) as bytes,
        count(o.id) filter (where o.metadata->>'size' is null) as unknown_size
      from storage.buckets b left join storage.objects o on o.bucket_id = b.id
      group by b.id, b.file_size_limit order by bytes desc
    ) b),
    'tables', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select relname as name, pg_total_relation_size(relid) as bytes
      from pg_catalog.pg_stat_user_tables where schemaname = 'public'
      order by pg_total_relation_size(relid) desc limit 10
    ) t),
    'snapshots', (select coalesce(jsonb_agg(to_jsonb(s) order by day), '[]'::jsonb)
      from public.infrastructure_snapshots s where day >= v_today - 30),
    'readings', (select coalesce(jsonb_agg(to_jsonb(r) - 'recorded_by'), '[]'::jsonb)
      from public.infrastructure_provider_readings r)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_infrastructure_usage(date) from public;
grant execute on function public.get_infrastructure_usage(date) to authenticated;
