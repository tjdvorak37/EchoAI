-- Managed configuration and fair-use accounting for the Premium Ask Echo chat.

create table if not exists public.echo_chat_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  gateway_url text not null default '',
  gateway_token text not null default '',
  model text not null default 'qwen2.5:7b-instruct',
  daily_message_limit integer not null default 25 check (daily_message_limit between 1 and 1000),
  max_response_tokens integer not null default 600 check (max_response_tokens between 64 and 4096),
  system_prompt text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.echo_chat_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.echo_chat_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  message_count integer not null default 0 check (message_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.echo_chat_settings enable row level security;
alter table public.echo_chat_usage enable row level security;

drop policy if exists echo_chat_settings_staff_manage on public.echo_chat_settings;
create policy echo_chat_settings_staff_manage
  on public.echo_chat_settings for all
  using (app.current_role() in ('admin', 'manager', 'it'))
  with check (app.current_role() in ('admin', 'manager', 'it'));

create or replace function public.consume_echo_chat_quota(p_daily_limit integer)
returns table (allowed boolean, messages_remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or p_daily_limit < 1 then
    return query select false, 0;
    return;
  end if;

  insert into public.echo_chat_usage (user_id, usage_date, message_count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, usage_date) do update
    set message_count = public.echo_chat_usage.message_count + 1,
        updated_at = now()
    where public.echo_chat_usage.message_count < p_daily_limit
  returning message_count into v_count;

  if v_count is null then
    return query select false, 0;
  else
    return query select true, greatest(p_daily_limit - v_count, 0);
  end if;
end;
$$;

revoke all on table public.echo_chat_settings, public.echo_chat_usage from public, anon, authenticated;
grant select, update on public.echo_chat_settings to authenticated;
revoke all on function public.consume_echo_chat_quota(integer) from public, anon;
grant execute on function public.consume_echo_chat_quota(integer) to authenticated, service_role;