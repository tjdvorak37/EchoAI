-- Premium and Board membership are independent capabilities, not user roles.
update public.profiles
   set role = 'it'
 where role = 'manager';

update public.profiles
   set role = 'user'
 where role = 'board_member';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'it', 'accountant', 'user'));