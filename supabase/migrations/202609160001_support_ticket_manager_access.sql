-- Managers can open the support desk in the application, so their database
-- access must match the same staff roles exposed by that interface.
drop policy if exists support_tickets_admin_manage on public.support_tickets;
create policy support_tickets_admin_manage
on public.support_tickets
for all
using (app.current_role() in ('admin', 'manager', 'it') and app.current_company_key() <> '')
with check (app.current_role() in ('admin', 'manager', 'it') and app.current_company_key() <> '');