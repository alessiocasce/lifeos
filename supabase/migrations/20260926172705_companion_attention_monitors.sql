create table if not exists public.brain_monitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  monitor_type text not null check (monitor_type in ('project_staleness')),
  topic_key text not null check (length(topic_key) between 1 and 180),
  subject text not null check (length(subject) between 1 and 160),
  reason text not null check (length(reason) between 1 and 240),
  project_id uuid not null,
  created_by text not null check (created_by in ('brain', 'user', 'mcp')),
  source_channel text not null check (source_channel in ('app', 'whatsapp', 'mcp')),
  source_ref jsonb not null default '{}'::jsonb check (jsonb_typeof(source_ref) = 'object'),
  permission_basis text not null check (permission_basis in ('standing_monitor', 'explicit_user')),
  state text not null default 'active' check (state in ('active', 'suspended', 'retired', 'expired')),
  cadence_minutes integer not null default 1440 check (cadence_minutes between 360 and 10080),
  next_check_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_triggered_at timestamptz,
  expires_at timestamptz not null,
  review_at timestamptz not null,
  cooldown_minutes integer not null default 10080 check (cooldown_minutes between 60 and 43200),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  max_checks integer not null default 60 check (max_checks between 1 and 120),
  check_count integer not null default 0 check (check_count >= 0),
  idempotency_key text not null check (length(idempotency_key) between 1 and 160),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, idempotency_key),
  foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade,
  check (expires_at > created_at)
);

create unique index if not exists brain_monitors_one_live_topic
  on public.brain_monitors (user_id, monitor_type, topic_key)
  where state in ('active', 'suspended');
create index if not exists brain_monitors_due
  on public.brain_monitors (user_id, next_check_at)
  where state = 'active';

create table if not exists public.brain_attention_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  monitor_id uuid,
  event_key text not null check (length(event_key) between 1 and 180),
  source_type text not null check (source_type in ('monitor', 'accountability')),
  source_id text not null check (length(source_id) between 1 and 180),
  topic_key text not null check (length(topic_key) between 1 and 180),
  decision text not null check (decision in ('silent', 'message')),
  reason_code text not null check (length(reason_code) between 1 and 80),
  importance integer not null check (importance between 0 and 5),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  channel text check (channel is null or channel = 'whatsapp'),
  cooldown_until timestamptz,
  outbox_message_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, event_key),
  foreign key (monitor_id, user_id) references public.brain_monitors(id, user_id) on delete cascade,
  foreign key (outbox_message_id, user_id) references public.brain_outbox_messages(id, user_id) on delete set null (outbox_message_id)
);

create index if not exists brain_attention_events_topic_recent
  on public.brain_attention_events (user_id, topic_key, created_at desc);
create index if not exists brain_attention_events_user_recent
  on public.brain_attention_events (user_id, created_at desc);

alter table public.brain_monitors enable row level security;
alter table public.brain_attention_events enable row level security;
revoke all on table public.brain_monitors from public, anon, authenticated;
revoke all on table public.brain_attention_events from public, anon, authenticated;
grant all on table public.brain_monitors to service_role;
grant all on table public.brain_attention_events to service_role;
