-- Public company package requests enter the same support queue as authenticated tickets.

alter table public.support_tickets add column if not exists subject text not null default 'Support request';
alter table public.support_tickets add column if not exists requester_name text;
alter table public.support_tickets add column if not exists requester_email text;
alter table public.support_tickets add column if not exists company_name text;
alter table public.support_tickets alter column user_id drop not null;
alter table public.support_tickets add column if not exists admin_response text;
alter table public.support_tickets add column if not exists responded_at timestamptz;

create or replace function public.submit_company_package_request(
  p_full_name text,
  p_email text,
  p_company text,
  p_seat_count integer,
  p_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if length(trim(coalesce(p_full_name, ''))) < 2
    or position('@' in trim(coalesce(p_email, ''))) < 2
    or length(trim(coalesce(p_company, ''))) < 2
    or p_seat_count < 1 then
    raise exception 'Valid requester, company, email, and seat count are required.';
  end if;

  insert into public.support_tickets (
    user_id, subject, category, details, requester_name, requester_email, company_name, status
  ) values (
    auth.uid(),
    'Company Seats Package Request',
    'Company package',
    format('Requested seats: %s\n\n%s', p_seat_count, trim(coalesce(p_details, ''))),
    trim(p_full_name),
    lower(trim(p_email)),
    trim(p_company),
    'open'
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_company_package_request(text, text, text, integer, text) from public;
grant execute on function public.submit_company_package_request(text, text, text, integer, text) to anon, authenticated;