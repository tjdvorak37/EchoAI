-- Full removal of TikTok, Threads, Bluesky, and Snapchat: drop any existing
-- connections/state for these platforms, then tighten the check constraints
-- so they can never be selected again.

delete from public.social_oauth_credentials where platform in ('tiktok', 'snapchat');
delete from public.social_oauth_states where platform in ('tiktok', 'snapchat');
delete from public.user_social_accounts where platform in ('tiktok', 'snapchat');

alter table public.user_social_accounts drop constraint if exists user_social_accounts_platform_check;
alter table public.user_social_accounts add constraint user_social_accounts_platform_check check (
  platform in ('instagram', 'facebook', 'x', 'youtube', 'linkedin')
);

alter table public.social_oauth_credentials drop constraint if exists social_oauth_credentials_platform_check;
alter table public.social_oauth_credentials add constraint social_oauth_credentials_platform_check check (
  platform in ('instagram', 'facebook', 'x', 'youtube', 'linkedin')
);

alter table public.social_oauth_states drop constraint if exists social_oauth_states_platform_check;
alter table public.social_oauth_states add constraint social_oauth_states_platform_check check (
  platform in ('instagram', 'facebook', 'x', 'youtube', 'linkedin')
);

delete from public.ad_oauth_connections where provider = 'tiktok';
delete from public.ad_oauth_states where provider = 'tiktok';

alter table public.ad_oauth_states drop constraint if exists ad_oauth_states_provider_check;
alter table public.ad_oauth_states add constraint ad_oauth_states_provider_check check (
  provider in ('meta', 'google')
);

alter table public.ad_oauth_connections drop constraint if exists ad_oauth_connections_provider_check;
alter table public.ad_oauth_connections add constraint ad_oauth_connections_provider_check check (
  provider in ('meta', 'google')
);

delete from public.developer_app_credentials where provider in ('tiktok', 'tiktok_ads', 'threads', 'bluesky', 'snapchat');
