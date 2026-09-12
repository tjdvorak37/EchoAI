-- Users may cancel only their own future queued posts. Published, failed,
-- currently publishing, and past-due records remain available for history.

drop policy if exists scheduled_posts_owner_delete on public.scheduled_posts;
create policy scheduled_posts_owner_delete
  on public.scheduled_posts for delete
  using (
    user_id = auth.uid()
    and status = 'scheduled'
    and scheduled_at > now()
  );
