-- 202609180004_simplify_user_management.sql converted every 'manager' profile
-- to 'it' and dropped 'manager' from profiles_role_check, but brand_kits was
-- never updated to match. Former managers lost brand kit edit access because
-- the RLS policy and save_brand_kit() still only allowed ('admin', 'manager').

drop policy if exists brand_kits_manage on public.brand_kits;
create policy brand_kits_manage
  on public.brand_kits for all
  using (
    company_key = app.current_company_key()
    and app.current_role() in ('admin', 'it')
  )
  with check (
    company_key = app.current_company_key()
    and app.current_role() in ('admin', 'it')
  );

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

  if app.current_role() not in ('admin', 'it') then
    raise exception 'Only an admin or IT team member can change the brand kit.';
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
