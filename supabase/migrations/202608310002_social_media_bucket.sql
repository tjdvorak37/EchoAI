-- Social media remains private in EchoAI storage. The publishing Edge Function
-- reads objects with service-role access and uploads bytes directly to Meta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-media',
  'social-media',
  false,
  104857600, -- 100 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own social media" on storage.objects;
create policy "Users upload own social media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'social-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users read own social media" on storage.objects;
create policy "Users read own social media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'social-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete own social media" on storage.objects;
create policy "Users delete own social media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'social-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);