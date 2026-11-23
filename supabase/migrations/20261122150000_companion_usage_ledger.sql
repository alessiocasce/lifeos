-- Jarvis Companion step 0: usage ledger for paid model, voice and telephony spend.
-- Additive only. Service-role writes; the owner may read their own rows.

create table if not exists public.brain_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  provider text not null check (length(provider) between 1 and 40),
  model text not null check (length(model) between 1 and 120),
  tier text check (tier is null or tier in ('fast', 'deep', 'voice', 'telephony')),
  purpose text not null check (purpose in ('chat', 'proactive', 'call', 'eval', 'sync', 'email', 'other')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  call_seconds integer not null default 0 check (call_seconds >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0 check (estimated_cost_usd >= 0),
  request_id text check (request_id is null or length(request_id) <= 160),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists brain_usage_ledger_user_occurred_idx
  on public.brain_usage_ledger (user_id, occurred_at desc);

alter table public.brain_usage_ledger enable row level security;
drop policy if exists "brain_usage_ledger is user scoped read" on public.brain_usage_ledger;
create policy "brain_usage_ledger is user scoped read" on public.brain_usage_ledger
for select to authenticated using (auth.uid() = user_id);

revoke all on table public.brain_usage_ledger from anon, authenticated;
grant select on table public.brain_usage_ledger to authenticated;
grant all on table public.brain_usage_ledger to service_role;
