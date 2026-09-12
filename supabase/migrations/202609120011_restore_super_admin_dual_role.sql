-- Board Member is a capability, not a replacement for the Super Admin role.
-- Restore the named platform owner if the old role selector demoted the account.
update public.profiles
   set role = 'admin',
       is_board_member = true,
       profit_share_percent = greatest(1, least(coalesce(profit_share_percent, 1), 10))
 where lower(email) = 'tdvorak37@gmail.com';