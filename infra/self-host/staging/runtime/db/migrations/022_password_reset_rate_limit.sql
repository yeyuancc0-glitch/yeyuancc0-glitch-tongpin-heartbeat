alter table app_auth.password_reset_tokens
  add column if not exists ip_prefix text;

create index if not exists password_reset_tokens_user_created_idx
  on app_auth.password_reset_tokens(user_id, created_at desc);

create index if not exists password_reset_tokens_ip_created_idx
  on app_auth.password_reset_tokens(ip_prefix, created_at desc)
  where ip_prefix is not null;
