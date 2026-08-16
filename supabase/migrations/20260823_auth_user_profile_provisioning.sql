-- Email-confirmation signups create auth.users before the browser has a session.
-- Provision identity rows inside Postgres so profiles RLS never needs to allow
-- anonymous inserts.

create or replace function public.provision_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, company)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    lower(trim(new.email)),
    nullif(trim(new.raw_user_meta_data ->> 'company'), '')
  )
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, profiles.full_name),
        email = coalesce(excluded.email, profiles.email),
        company = coalesce(excluded.company, profiles.company);

  insert into public.access_requests (user_id, full_name, email, company, status)
  select p.id, p.full_name, p.email, p.company, 'pending'
    from public.profiles p
   where p.id = new.id
     and p.access_status = 'pending'
     and not exists (
       select 1 from public.access_requests r where r.user_id = new.id
     );

  return new;
end;
$$;

revoke all on function public.provision_profile_for_auth_user() from public;

drop trigger if exists on_auth_user_created_provision_profile on auth.users;
create trigger on_auth_user_created_provision_profile
after insert on auth.users
for each row
execute function public.provision_profile_for_auth_user();

-- Repair users created before this trigger existed, including signups whose
-- browser-side profile insert was rejected by RLS.
insert into public.profiles (id, full_name, email, company)
select
  u.id,
  nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
  lower(trim(u.email)),
  nullif(trim(u.raw_user_meta_data ->> 'company'), '')
from auth.users u
on conflict (id) do update
  set full_name = coalesce(excluded.full_name, profiles.full_name),
      email = coalesce(excluded.email, profiles.email),
      company = coalesce(excluded.company, profiles.company);

insert into public.access_requests (user_id, full_name, email, company, status)
select p.id, p.full_name, p.email, p.company, 'pending'
  from public.profiles p
 where p.access_status = 'pending'
   and not exists (
     select 1 from public.access_requests r where r.user_id = p.id
   );