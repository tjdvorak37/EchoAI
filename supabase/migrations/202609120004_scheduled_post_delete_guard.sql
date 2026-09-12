-- Users may cancel only their own queued posts. Published, failed, currently
-- publishing, and history records remain available.

drop policy if exists scheduled_posts_owner_delete on public.scheduled_posts;
create policy scheduled_posts_owner_delete
  on public.scheduled_posts for delete
  using (
    user_id = auth.uid()
    and status = 'scheduled'
  );
