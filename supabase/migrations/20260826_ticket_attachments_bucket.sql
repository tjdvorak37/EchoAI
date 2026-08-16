-- Private bucket: screenshots often contain personal data or session details, so
-- they are never publicly readable. Reads go through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-attachments',
  'ticket-attachments',
  false,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are namespaced by user id: <uid>/<ticket-or-uuid>/<filename>. The
-- foldername check keeps one user from writing into another user's prefix.
drop policy if exists "Users upload own ticket attachments" on storage.objects;
create policy "Users upload own ticket attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'ticket-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users read own ticket attachments" on storage.objects;
create policy "Users read own ticket attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ticket-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or app.current_role() in ('admin', 'it')
  )
);

drop policy if exists "Users delete own ticket attachments" on storage.objects;
create policy "Users delete own ticket attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ticket-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
