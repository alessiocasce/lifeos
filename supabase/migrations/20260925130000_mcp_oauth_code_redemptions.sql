create table if not exists public.brain_mcp_oauth_code_redemptions (
  code_jti_hash text primary key check (code_jti_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  redeemed_at timestamptz not null default now()
);

alter table public.brain_mcp_oauth_code_redemptions enable row level security;
revoke all on table public.brain_mcp_oauth_code_redemptions from public, anon, authenticated;
grant select, insert, delete on table public.brain_mcp_oauth_code_redemptions to service_role;

create index if not exists brain_mcp_oauth_code_redemptions_expires_idx
  on public.brain_mcp_oauth_code_redemptions (expires_at);
