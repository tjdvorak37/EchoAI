-- Allow a user to connect more than one account per platform (e.g. managing
-- social channels for multiple clients or brands from a single EchoAI login).
-- Previously both tables enforced one row per (user_id, platform), which made
-- a second Facebook Page or Instagram account impossible to connect.

drop index if exists public.user_social_accounts_owner_platform_idx;
create unique index if not exists user_social_accounts_owner_platform_account_idx
  on public.user_social_accounts (user_id, platform, external_account_id);

drop index if exists public.social_oauth_credentials_owner_platform_idx;
create unique index if not exists social_oauth_credentials_owner_platform_account_idx
  on public.social_oauth_credentials (user_id, platform, external_account_id);

-- Scheduled posts can now target a specific connected account per platform.
-- Empty/omitted entries fall back to the single legacy behaviour (the most
-- recently connected account for that platform).
alter table public.scheduled_posts
  add column if not exists channel_accounts jsonb not null default '{}'::jsonb;
