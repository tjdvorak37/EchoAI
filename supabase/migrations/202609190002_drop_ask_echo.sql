-- Ask Echo (AWS Bedrock gateway chat) was removed; tear down its schema.
drop function if exists public.consume_echo_chat_quota(integer);
drop table if exists public.echo_chat_usage;
drop table if exists public.echo_chat_settings;
