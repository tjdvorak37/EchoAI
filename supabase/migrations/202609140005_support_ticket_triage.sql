alter table public.support_tickets
  add column if not exists priority text not null default 'medium',
  add column if not exists queue text not null default 'general',
  add column if not exists tags text[] not null default '{}',
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

alter table public.support_tickets
  drop constraint if exists support_tickets_priority_check;

alter table public.support_tickets
  add constraint support_tickets_priority_check
  check (priority in ('critical', 'high', 'medium', 'low'));

create index if not exists support_tickets_active_queue_idx
  on public.support_tickets (status, priority, queue, created_at desc);

create index if not exists support_tickets_assigned_to_idx
  on public.support_tickets (assigned_to, status, created_at desc);

create index if not exists support_tickets_tags_idx
  on public.support_tickets using gin (tags);

create or replace function public.classify_support_ticket()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  content text := lower(coalesce(new.category, '') || ' ' || coalesce(new.details, ''));
begin
  if new.status = 'open' then
    new.status := 'new';
  end if;

  if content ~ '(security|breach|hacked|compromised|stolen|fraud|unauthori[sz]ed|data loss|data leak)' then
    new.priority := 'critical';
    new.queue := 'security';
    new.tags := array_append(new.tags, 'security');
  elsif content ~ '(outage|down|unavailable|cannot log in|can''t log in|locked out)' then
    new.priority := 'high';
    new.queue := 'technical';
    new.tags := array_append(new.tags, 'access');
  elsif content ~ '(billing|payment|charged|invoice|refund|subscription)' then
    new.priority := case when content ~ '(charged twice|duplicate charge|fraud)' then 'critical' else 'high' end;
    new.queue := 'billing';
    new.tags := array_append(new.tags, 'billing');
  elsif content ~ '(company package|seat|enterprise|team plan)' then
    new.priority := 'high';
    new.queue := 'sales';
    new.tags := array_append(new.tags, 'company-package');
  elsif content ~ '(bug|error|broken|not working|technical)' then
    new.priority := 'medium';
    new.queue := 'technical';
    new.tags := array_append(new.tags, 'technical');
  else
    new.priority := coalesce(new.priority, 'medium');
    new.queue := coalesce(nullif(new.queue, ''), 'general');
  end if;

  new.tags := array(
    select distinct tag
    from unnest(new.tags || array[coalesce(nullif(lower(replace(new.source, '_', '-')), ''), 'app')]) as tag
    where tag <> ''
  );
  return new;
end;
$$;

drop trigger if exists trg_classify_support_ticket on public.support_tickets;
create trigger trg_classify_support_ticket
before insert or update of category, details, source on public.support_tickets
for each row execute procedure public.classify_support_ticket();

update public.support_tickets
set details = details
where tags = '{}' or status = 'open';