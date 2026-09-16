-- Managers share the support desk with admins and IT, including private
-- screenshots attached by customers. Signed preview URLs remain short-lived.
drop policy if exists "Users read own ticket attachments" on storage.objects;
create policy "Users read own ticket attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ticket-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or app.current_role() in ('admin', 'manager', 'it')
  )
);

drop policy if exists support_requester_profiles_select on public.profiles;
create policy support_requester_profiles_select
on public.profiles
for select
to authenticated
using (
  role = 'user'
  and app.current_role() in ('admin', 'manager', 'it')
  and exists (
    select 1
    from public.support_tickets
    where support_tickets.user_id = profiles.id
  )
);