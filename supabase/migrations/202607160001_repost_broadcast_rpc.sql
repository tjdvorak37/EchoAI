create or replace function public.broadcast_company_post(target_company_post_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  caller_company text;
  caller_role text;
  target_company_key text;
  inserted_count integer;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  select lower(trim(coalesce(p.company, ''))), coalesce(p.role, 'user')
    into caller_company, caller_role
  from public.profiles p
  where p.id = caller_id;

  if caller_company is null or caller_company = '' then
    raise exception 'Company is required on profile';
  end if;

  if caller_role <> 'admin' then
    raise exception 'Only admins can broadcast company posts';
  end if;

  select cmp.company_key
    into target_company_key
  from public.company_main_posts cmp
  where cmp.id = target_company_post_id;

  if target_company_key is null then
    raise exception 'Company post not found';
  end if;

  if target_company_key <> caller_company then
    raise exception 'Cannot broadcast posts outside your tenant';
  end if;

  insert into public.repost_queue (company_key, company_post_id, user_id, status)
  select
    caller_company,
    target_company_post_id,
    p.id,
    'pending'
  from public.profiles p
  where lower(trim(coalesce(p.company, ''))) = caller_company
    and coalesce(p.access_status, 'pending') = 'active'
    and p.id <> caller_id
    and not exists (
      select 1
      from public.repost_queue rq
      where rq.company_post_id = target_company_post_id
        and rq.user_id = p.id
        and rq.status in ('pending', 'approved', 'posted')
    );

  get diagnostics inserted_count = row_count;
  return coalesce(inserted_count, 0);
end;
$$;

grant execute on function public.broadcast_company_post(uuid) to authenticated;
