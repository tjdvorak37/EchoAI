-- Stable logical bot/controller metadata. Provider implementations can be
-- replaced without changing the customer-facing capability or mode.

alter table public.echo_ai_pricing
  add column if not exists bot_name text not null default '',
  add column if not exists bot_description text not null default '',
  add column if not exists echo_credit_cost integer,
  add column if not exists provider_cost_input numeric(12, 8) not null default 0,
  add column if not exists provider_cost_output numeric(12, 8) not null default 0,
  add column if not exists provider_key text not null default 'openai';

alter table public.echo_provider_accounts
  add column if not exists endpoint text not null default '',
  add column if not exists replacement_for text,
  add column if not exists priority integer not null default 0;

update public.echo_ai_pricing
   set bot_name = case
     when capability = 'message' then 'Echo Copywriter'
     when capability = 'image' and mode = 'premium' then 'Echo Premium Image'
     when capability = 'image' then 'Echo Image Studio'
     when capability = 'video' and mode = 'premium' then 'Echo Cinema'
     when capability = 'video' then 'Echo Video Fast'
     else initcap(capability) end,
       bot_description = case
         when capability = 'message' then 'Captions, social posts, hashtags, rewrites, and campaign copy.'
         when capability = 'image' then 'Marketing image generation and editing.'
         when capability = 'video' then 'Short-form marketing video generation.'
         else 'EchoAI hosted generation engine.' end,
       echo_credit_cost = coalesce(echo_credit_cost, credit_cost),
       provider_cost_input = case when capability = 'message' then provider_cost_per_unit else 0 end,
       provider_cost_output = case when capability = 'message' then provider_cost_per_unit else 0 end
 where bot_name = '' or echo_credit_cost is null;

update public.echo_provider_accounts
   set endpoint = case provider_key
     when 'openai' then 'https://api.openai.com/v1'
     else endpoint end
 where endpoint = '';

create table if not exists public.echo_ai_route_overrides (
  capability text not null,
  mode text not null default 'standard',
  pricing_id uuid not null references public.echo_ai_pricing(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (capability, mode)
);

insert into public.echo_ai_route_overrides (capability, mode, pricing_id)
select capability, mode, id from public.echo_ai_pricing
on conflict (capability, mode) do update set pricing_id = excluded.pricing_id;

insert into public.echo_ai_pricing (capability, mode, provider_key, model, credit_cost, echo_credit_cost, provider_cost_per_unit, unit, bot_name, bot_description)
values ('image_edit', 'standard', 'openai', 'image-edit-standard', 10, 10, 0.04, 'image', 'Echo Image Editor', 'Precise campaign image edits and background changes.'),
       ('audio', 'standard', 'openai', 'audio-standard', 10, 10, 0.01, 'request', 'Echo Voice Studio', 'Voiceover, transcription, captions, and audio workflows.'),
       ('vision', 'standard', 'openai', 'vision-standard', 5, 5, 0.01, 'request', 'Echo Vision', 'Visual understanding and media analysis.'),
       ('campaign', 'standard', 'openai', 'campaign-standard', 10, 10, 0.03, 'request', 'Echo Campaign Planner', 'Structured campaign strategy and content planning.')
on conflict (capability, mode) do nothing;

insert into public.echo_ai_route_overrides (capability, mode, pricing_id)
select capability, mode, id from public.echo_ai_pricing
where capability in ('image_edit', 'audio', 'vision', 'campaign')
on conflict (capability, mode) do update set pricing_id = excluded.pricing_id;

alter table public.echo_ai_route_overrides enable row level security;
drop policy if exists echo_ai_route_overrides_staff on public.echo_ai_route_overrides;
create policy echo_ai_route_overrides_staff on public.echo_ai_route_overrides
  for all using (app.current_role() in ('admin', 'manager', 'it'))
  with check (app.current_role() in ('admin', 'manager', 'it'));
grant select, insert, update, delete on public.echo_ai_route_overrides to authenticated;

create or replace function public.get_echo_ai_financial_summary()
returns table (
  jobs bigint,
  credits_spent bigint,
  provider_spend_usd numeric,
  completed_jobs bigint,
  failed_jobs bigint
)
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint,
         coalesce(sum(credits_reserved) filter (where status = 'completed'), 0)::bigint,
         coalesce(sum(provider_cost_usd) filter (where status = 'completed'), 0),
         count(*) filter (where status = 'completed')::bigint,
         count(*) filter (where status in ('failed', 'refunded'))::bigint
    from public.echo_ai_jobs
   where app.current_role() in ('admin', 'manager', 'it', 'accountant');
$$;

grant execute on function public.get_echo_ai_financial_summary() to authenticated;