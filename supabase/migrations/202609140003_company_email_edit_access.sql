-- Add company_email_edit_access column to public.profiles to lock email & SMTP editing unless granted by Super Admin

alter table public.profiles
  add column if not exists company_email_edit_access boolean not null default false;

-- Update RLS policies for support_ticket_notifications
drop policy if exists support_ticket_notifications_update on public.support_ticket_notifications;
create policy support_ticket_notifications_update
  on public.support_ticket_notifications for update
  using (
    app.current_role() = 'admin'
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.company_email_edit_access = true
    )
  )
  with check (
    app.current_role() = 'admin'
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.company_email_edit_access = true
    )
  );

drop policy if exists support_ticket_notifications_insert on public.support_ticket_notifications;
create policy support_ticket_notifications_insert
  on public.support_ticket_notifications for insert
  with check (
    app.current_role() = 'admin'
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.company_email_edit_access = true
    )
  );
