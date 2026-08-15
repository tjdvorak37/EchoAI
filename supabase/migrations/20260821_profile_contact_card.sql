-- Contact card details so a user is identified by more than an email address.
-- Additive only: every column is nullable and self-service editable.

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists address_line1 text;
alter table public.profiles add column if not exists address_line2 text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists state_region text;
alter table public.profiles add column if not exists postal_code text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists calendar_url text;

-- The privileged-column guard already blocks role/access_status/quota edits, so
-- these stay writable through the existing self-update policy.
