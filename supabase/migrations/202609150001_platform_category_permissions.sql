-- Add per-category Platform permissions for non-admin staff access.

alter table public.profiles
  add column if not exists license_edit_access boolean not null default false,
  add column if not exists integrations_edit_access boolean not null default false,
  add column if not exists ai_operations_edit_access boolean not null default false,
  add column if not exists site_controls_edit_access boolean not null default false;