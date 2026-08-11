alter table public.profiles
add column if not exists ai_agent_config jsonb not null default '{}'::jsonb;
