create table if not exists public.internal_forum_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Staff',
  category text not null default 'Training',
  title text not null,
  body text not null,
  document_url text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists internal_forum_posts_created_at_idx
  on public.internal_forum_posts (created_at desc);

alter table public.internal_forum_posts enable row level security;

drop policy if exists internal_forum_posts_staff_select on public.internal_forum_posts;
create policy internal_forum_posts_staff_select
  on public.internal_forum_posts for select
  using (app.current_role() in ('admin', 'manager', 'it', 'accountant', 'board_member'));

drop policy if exists internal_forum_posts_staff_insert on public.internal_forum_posts;
create policy internal_forum_posts_staff_insert
  on public.internal_forum_posts for insert
  with check (author_id = auth.uid() and app.current_role() in ('admin', 'manager', 'it', 'accountant', 'board_member'));

create table if not exists public.internal_forum_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null default 'Staff',
  channel_type text not null default 'group',
  recipient_id uuid references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint internal_forum_messages_channel_check check (channel_type in ('group', 'direct'))
);

create index if not exists internal_forum_messages_created_at_idx
  on public.internal_forum_messages (created_at desc);

create index if not exists internal_forum_messages_direct_idx
  on public.internal_forum_messages (sender_id, recipient_id, created_at desc);

alter table public.internal_forum_messages enable row level security;

drop policy if exists internal_forum_messages_staff_select on public.internal_forum_messages;
create policy internal_forum_messages_staff_select
  on public.internal_forum_messages for select
  using (
    app.current_role() in ('admin', 'manager', 'it', 'accountant', 'board_member')
    and (channel_type = 'group' or sender_id = auth.uid() or recipient_id = auth.uid())
  );

drop policy if exists internal_forum_messages_staff_insert on public.internal_forum_messages;
create policy internal_forum_messages_staff_insert
  on public.internal_forum_messages for insert
  with check (
    sender_id = auth.uid()
    and app.current_role() in ('admin', 'manager', 'it', 'accountant', 'board_member')
    and (channel_type = 'group' or recipient_id is not null)
  );