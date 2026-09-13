-- Beta AI access is explicitly staff-controlled and does not imply paid access.

alter table public.profiles
  add column if not exists is_beta_tester boolean not null default false,
  add column if not exists ai_enabled boolean not null default true,
  add column if not exists ai_access_note text not null default '';

create index if not exists profiles_beta_ai_idx
  on public.profiles (is_beta_tester, ai_enabled);

create or replace function public.beta_ai_access(p_user_id uuid default auth.uid())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'isBetaTester', coalesce(p.is_beta_tester, false),
    'aiEnabled', coalesce(p.ai_enabled, true),
    'note', coalesce(p.ai_access_note, '')
  )
  from public.profiles p
  where p.id = p_user_id;
$$;

grant execute on function public.beta_ai_access(uuid) to authenticated;