-- Keep the live OAuth state schema aligned with social-oauth. X uses this
-- value for PKCE; other providers leave it null.
alter table public.social_oauth_states
  add column if not exists code_verifier text;
