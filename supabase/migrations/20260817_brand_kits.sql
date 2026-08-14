-- Brand kits: the logos, colours, and licensed fonts a company must use on
-- every post and design.
--
-- Scoped to company_key like the other multi-tenant tables, so teammates share
-- one brand rather than each rebuilding it. Managers and admins edit it;
-- everyone in the company can read it.

create extension if not exists pgcrypto;

create table if not exists public.brand_kits (
  company_key text primary key,
  company_name text not null default '',
  -- [{ id, label, value }]
  colors jsonb not null default '[]'::jsonb,
  -- [{ id, label, family, weightsCsv, sourceUrl, fallback }]
  fonts jsonb not null default '[]'::jsonb,
  -- [{ id, label, dataUrl, usage }]
  logos jsonb not null default '[]'::jsonb,
  guidelines text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.brand_kits enable row level security;

drop policy if exists brand_kits_read_company on public.brand_kits;
create policy brand_kits_read_company
  on public.brand_kits for select
  using (company_key = app.current_company_key() and app.current_company_key() <> '');

drop policy if exists brand_kits_manage on public.brand_kits;
create policy brand_kits_manage
  on public.brand_kits for all
  using (
    company_key = app.current_company_key()
    and app.current_role() in ('admin', 'manager')
  )
  with check (
    company_key = app.current_company_key()
    and app.current_role() in ('admin', 'manager')
  );

drop policy if exists brand_kits_require_mfa on public.brand_kits;
create policy brand_kits_require_mfa
  on public.brand_kits as restrictive
  to authenticated
  using (app.mfa_satisfied());

-- Writes always land on the caller's own company, so a client cannot save a
-- brand kit into someone else's tenant by passing a different company_key.
create or replace function public.save_brand_kit(
  p_colors jsonb,
  p_fonts jsonb,
  p_logos jsonb,
  p_guidelines text default ''
)
returns public.brand_kits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company text := app.current_company_key();
  v_company_name text;
  v_row public.brand_kits;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_company = '' then
    raise exception 'Set your company name on your profile before saving a brand kit.';
  end if;

  if app.current_role() not in ('admin', 'manager') then
    raise exception 'Only an admin or manager can change the brand kit.';
  end if;

  select company into v_company_name from public.profiles where id = auth.uid();

  insert into public.brand_kits (
    company_key, company_name, colors, fonts, logos, guidelines, updated_by, updated_at
  )
  values (
    v_company, coalesce(v_company_name, ''),
    coalesce(p_colors, '[]'::jsonb),
    coalesce(p_fonts, '[]'::jsonb),
    coalesce(p_logos, '[]'::jsonb),
    coalesce(p_guidelines, ''),
    auth.uid(), now()
  )
  on conflict (company_key) do update
    set colors = excluded.colors,
        fonts = excluded.fonts,
        logos = excluded.logos,
        guidelines = excluded.guidelines,
        company_name = excluded.company_name,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.save_brand_kit(jsonb, jsonb, jsonb, text) to authenticated;
