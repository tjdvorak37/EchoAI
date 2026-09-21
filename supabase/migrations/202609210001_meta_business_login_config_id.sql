-- Facebook Login for Business apps authorize through a named Configuration
-- (created in the Meta App Dashboard), identified by a config_id. When a
-- configuration is used, Meta ignores the classic `scope` parameter in favor
-- of whatever permissions/features the configuration itself grants, so the
-- authorization request must pass config_id instead of (or alongside) scope.
alter table public.developer_app_credentials
  add column if not exists config_id text not null default '';
