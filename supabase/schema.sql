create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  performed_on date not null default current_date,
  started_at timestamptz,
  ended_at timestamptz,
  template_id uuid,
  template_snapshot jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_id uuid not null,
  exercise text not null,
  exercise_order integer not null check (exercise_order > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, exercise_order),
  foreign key (template_id, user_id) references public.workout_templates(id, user_id) on delete cascade
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_id uuid not null,
  exercise text not null,
  set_number integer not null check (set_number > 0),
  is_warmup boolean not null default false,
  weight numeric(7,2) not null check (weight >= 0),
  reps integer not null check (reps > 0),
  rpe numeric(3,1) check (rpe is null or (rpe >= 0 and rpe <= 10)),
  performed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_id, exercise, set_number),
  foreign key (workout_id, user_id) references public.workouts(id, user_id) on delete cascade
);

create table if not exists public.health_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  sleep_hours numeric(4,2),
  sleep_start time,
  wake_time time,
  sleep_quality integer check (sleep_quality between 0 and 100),
  energy integer check (energy between 1 and 10),
  coffee integer not null default 0 check (coffee >= 0),
  water integer not null default 0 check (water >= 0),
  adc integer not null default 0 check (adc >= 0),
  mood integer check (mood between 1 and 10),
  social_time_minutes integer not null default 0 check (social_time_minutes >= 0),
  main_time_waster text,
  notes text,
  hygiene jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, logged_on)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vendor text not null,
  category text not null,
  amount numeric(10,2) not null,
  spent_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  category text,
  location text,
  notes text,
  status text not null default 'planned' check (status in ('planned', 'done', 'skipped', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  review_on date not null default current_date,
  wins text,
  risks text,
  next_actions jsonb not null default '[]'::jsonb,
  score integer check (score between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, review_on)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  title text,
  body text not null,
  widgets jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  request_id text,
  source text not null default 'app' check (source in ('app', 'shortcut', 'api', 'whatsapp')),
  user_message text,
  answer text,
  status text not null default 'success' check (status in ('success', 'error')),
  action_type text,
  action_count integer not null default 0 check (action_count >= 0),
  actions jsonb not null default '[]'::jsonb,
  record_refs jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  unique (id, user_id)
);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thread_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  request_id uuid,
  action_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (thread_id, user_id) references public.ai_chat_threads(id, user_id) on delete cascade
);

create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null,
  title text not null,
  content text not null,
  source text not null default 'assistant_inferred' check (source in ('user_explicit', 'assistant_inferred', 'system', 'manual')),
  confidence numeric(3,2) not null default 0.80 check (confidence >= 0 and confidence <= 1),
  importance integer not null default 3 check (importance between 1 and 5),
  status text not null default 'active' check (status in ('active', 'archived')),
  last_seen_at timestamptz,
  memory_kind text not null default 'semantic_fact' check (memory_kind in ('semantic_fact', 'episode', 'decision', 'project_memory', 'goal', 'constraint')),
  subject_key text check (subject_key is null or length(subject_key) between 1 and 180),
  project_id uuid,
  occurred_at timestamptz,
  occurred_on date,
  effective_from timestamptz,
  effective_until timestamptz,
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  dedupe_key text check (dedupe_key is null or dedupe_key ~ '^[0-9a-f]{64}$'),
  supersedes_id uuid,
  last_confirmed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.brain_beliefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_type text not null check (length(subject_type) between 1 and 80),
  subject_key text not null check (length(subject_key) between 1 and 180),
  predicate text not null check (length(predicate) between 1 and 120),
  value jsonb not null default '{}'::jsonb check (jsonb_typeof(value) = 'object'),
  record_status text not null default 'current' check (record_status in ('current', 'superseded')),
  confidence numeric(4,3) not null default 0.800 check (confidence >= 0 and confidence <= 1),
  source_type text not null default 'assistant_inferred' check (
    source_type in ('user_explicit', 'assistant_inferred', 'proactive_feedback', 'system', 'manual', 'external_sync')
  ),
  source_ref jsonb not null default '{}'::jsonb check (jsonb_typeof(source_ref) = 'object'),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  supersedes_id uuid,
  negative_feedback_count integer not null default 0 check (negative_feedback_count >= 0),
  last_feedback_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (supersedes_id, user_id) references public.brain_beliefs(id, user_id),
  check (effective_until is null or effective_until >= effective_from),
  check (
    subject_type <> 'routine'
    or predicate <> 'status'
    or value->>'state' in ('active', 'inactive', 'suspended', 'uncertain')
  )
);

create table if not exists public.brain_external_sync_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 1 and 160),
  request_digest text not null check (request_digest ~ '^[0-9a-f]{64}$'),
  source_system text not null check (length(source_system) between 1 and 64),
  source_kind text not null check (source_kind = 'explicit_conversation_sync'),
  source_reference text check (source_reference is null or length(source_reference) <= 160),
  captured_at timestamptz not null,
  summary text not null check (length(summary) between 1 and 240),
  status text not null default 'processing' check (status in ('processing', 'applied', 'partial', 'failed')),
  requested_count integer not null check (requested_count between 1 and 8),
  applied_count integer not null default 0 check (applied_count between 0 and 8),
  rejected_count integer not null default 0 check (rejected_count between 0 and 8),
  results jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) <= 8),
  claim_token uuid not null,
  claim_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.brain_mcp_oauth_code_redemptions (
  code_jti_hash text primary key check (code_jti_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  redeemed_at timestamptz not null default now()
);

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  insight_type text not null,
  title text not null,
  content text not null,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(3,2) not null default 0.70 check (confidence >= 0 and confidence <= 1),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_vault_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  document_type text not null default 'note' check (document_type in ('note', 'daily_report', 'weekly_report', 'workout_report', 'project_report', 'finance_report', 'life_review', 'product_report', 'brain_answer')),
  source_type text not null default 'brain' check (source_type in ('brain', 'manual', 'system', 'workout', 'project', 'health', 'finance', 'calendar')),
  source_ref jsonb not null default '{}'::jsonb,
  content_md text not null,
  summary text,
  tags text[] not null default '{}',
  entities text[] not null default '{}',
  links text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'archived')),
  visibility text not null default 'private' check (visibility in ('private')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.ai_vault_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document_id uuid not null,
  chunk_index integer not null,
  content text not null,
  token_estimate integer,
  embedding extensions.vector(1536),
  embedding_model text,
  embedding_status text not null default 'pending' check (embedding_status in ('pending', 'ready', 'failed', 'skipped')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, document_id, chunk_index),
  foreign key (document_id, user_id) references public.ai_vault_documents(id, user_id) on delete cascade
);

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  memo_date date,
  memo_time time,
  notes text,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brain_outbox_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  recipient text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'claimed', 'sent', 'failed', 'cancelled', 'expired')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  rule_key text not null,
  source_type text,
  source_id text,
  idempotency_key text not null,
  scheduled_for timestamptz not null,
  expires_at timestamptz,
  claimed_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  ack_metadata jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (id, user_id)
);

create table if not exists public.brain_whatsapp_inbound_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  canonical_recipient text not null check (length(canonical_recipient) between 1 and 180),
  provider_message_id text not null check (
    length(provider_message_id) between 1 and 300
    and provider_message_id <> '[object Object]'
    and provider_message_id !~ '[[:cntrl:]]'
  ),
  thread_id uuid,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed_before_effect', 'uncertain')),
  lease_token uuid,
  lease_expires_at timestamptz,
  effect_metadata jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  assistant_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel, canonical_recipient, provider_message_id),
  foreign key (thread_id, user_id) references public.ai_chat_threads(id, user_id) on delete cascade,
  foreign key (assistant_message_id, user_id) references public.ai_chat_messages(id, user_id) on delete cascade
);

create table if not exists public.brain_whatsapp_message_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  canonical_recipient text not null check (length(canonical_recipient) between 1 and 180),
  provider_message_id text not null check (
    length(provider_message_id) between 1 and 300
    and provider_message_id <> '[object Object]'
    and provider_message_id !~ '[[:cntrl:]]'
  ),
  thread_id uuid not null,
  assistant_message_id uuid not null,
  outbox_message_id uuid,
  delivery_attempt integer check (delivery_attempt is null or delivery_attempt >= 0),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, channel, canonical_recipient, provider_message_id),
  unique (user_id, assistant_message_id, provider_message_id),
  foreign key (thread_id, user_id) references public.ai_chat_threads(id, user_id) on delete cascade,
  foreign key (assistant_message_id, user_id) references public.ai_chat_messages(id, user_id) on delete cascade,
  foreign key (outbox_message_id, user_id) references public.brain_outbox_messages(id, user_id) on delete cascade
);

create table if not exists public.brain_interaction_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  version integer not null default 1 check (version > 0),
  state text not null check (state in ('pending_delivery', 'active', 'answered', 'superseded', 'abandoned', 'expired')),
  owner_kind text not null check (owner_kind in ('pending_action', 'proactive', 'clarification')),
  assistant_message_id uuid,
  pending_action_id text,
  outbox_message_id uuid,
  owner_payload jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, thread_id, channel),
  foreign key (thread_id, user_id) references public.ai_chat_threads(id, user_id) on delete cascade,
  foreign key (assistant_message_id, user_id) references public.ai_chat_messages(id, user_id) on delete cascade,
  foreign key (outbox_message_id, user_id) references public.brain_outbox_messages(id, user_id) on delete cascade
);

create table if not exists public.brain_proactive_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rule_key text not null,
  enabled boolean not null default true,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  quiet_hours_start time default '23:00',
  quiet_hours_end time default '08:00',
  max_per_day integer default 6 check (max_per_day is null or max_per_day >= 0),
  min_gap_minutes integer default 60 check (min_gap_minutes is null or min_gap_minutes >= 0),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, rule_key, channel)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  goal_type text not null default 'hours' check (goal_type in ('hours', 'units', 'tasks', 'content', 'custom')),
  goal_label text,
  target_value numeric(10,2) not null,
  current_value numeric(10,2) not null default 0,
  unit_label text,
  overall_cost numeric(10,2) not null default 0,
  started_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ai_memories_project_owner_fk') then
    alter table public.ai_memories add constraint ai_memories_project_owner_fk
      foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memories_supersedes_owner_fk') then
    alter table public.ai_memories add constraint ai_memories_supersedes_owner_fk
      foreign key (supersedes_id, user_id) references public.ai_memories (id, user_id);
  end if;
end $$;

create table if not exists public.project_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer check (duration_minutes >= 0),
  target_output text,
  proof_of_work text,
  progress_delta numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade
);

create table if not exists public.project_money_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null,
  type text not null check (type in ('expense', 'revenue')),
  amount numeric(10,2) not null check (amount >= 0),
  description text,
  entry_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade
);

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
create index if not exists brain_monitors_due on public.brain_monitors (user_id, next_check_at)
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
create index if not exists brain_attention_events_topic_recent on public.brain_attention_events (user_id, topic_key, created_at desc);
create index if not exists brain_attention_events_user_recent on public.brain_attention_events (user_id, created_at desc);

alter table public.workouts add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workouts alter column user_id set default auth.uid();
alter table public.workouts add column if not exists performed_on date not null default current_date;
alter table public.workouts add column if not exists started_at timestamptz;
alter table public.workouts add column if not exists ended_at timestamptz;
alter table public.workouts add column if not exists template_id uuid;
alter table public.workouts add column if not exists template_snapshot jsonb not null default '[]'::jsonb;

alter table public.workout_templates add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_templates alter column user_id set default auth.uid();
alter table public.workout_templates add column if not exists name text;
alter table public.workout_templates add column if not exists notes text;
alter table public.workout_templates add column if not exists created_at timestamptz not null default now();
alter table public.workout_templates add column if not exists updated_at timestamptz not null default now();

alter table public.workout_template_exercises add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_template_exercises alter column user_id set default auth.uid();
alter table public.workout_template_exercises add column if not exists template_id uuid;
alter table public.workout_template_exercises add column if not exists exercise text;
alter table public.workout_template_exercises add column if not exists exercise_order integer;
alter table public.workout_template_exercises alter column exercise_order set default 1;
update public.workout_template_exercises set exercise_order = 1 where exercise_order is null;
alter table public.workout_template_exercises alter column exercise_order set not null;
alter table public.workout_template_exercises add column if not exists notes text;
alter table public.workout_template_exercises add column if not exists created_at timestamptz not null default now();
alter table public.workout_template_exercises add column if not exists updated_at timestamptz not null default now();

alter table public.workout_sets add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.workout_sets alter column user_id set default auth.uid();
alter table public.workout_sets add column if not exists set_number integer;
alter table public.workout_sets alter column set_number set default 1;
update public.workout_sets set set_number = 1 where set_number is null;
alter table public.workout_sets alter column set_number set not null;
alter table public.workout_sets add column if not exists is_warmup boolean not null default false;
alter table public.workout_sets alter column rpe drop not null;
alter table public.workout_sets drop constraint if exists workout_sets_rpe_check;

alter table public.health_logs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.health_logs alter column user_id set default auth.uid();
alter table public.health_logs add column if not exists sleep_start time;
alter table public.health_logs add column if not exists wake_time time;
alter table public.health_logs add column if not exists energy integer check (energy between 1 and 10);
alter table public.health_logs add column if not exists social_time_minutes integer not null default 0 check (social_time_minutes >= 0);
alter table public.health_logs add column if not exists main_time_waster text;
alter table public.health_logs add column if not exists notes text;
alter table public.health_logs add column if not exists adc integer not null default 0 check (adc >= 0);

alter table public.expenses add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.expenses alter column user_id set default auth.uid();

alter table public.calendar_events add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.calendar_events alter column user_id set default auth.uid();
alter table public.calendar_events add column if not exists title text;
alter table public.calendar_events add column if not exists event_date date;
alter table public.calendar_events add column if not exists start_time time;
alter table public.calendar_events add column if not exists end_time time;
alter table public.calendar_events add column if not exists category text;
alter table public.calendar_events add column if not exists location text;
alter table public.calendar_events add column if not exists notes text;
alter table public.calendar_events add column if not exists status text not null default 'planned';

alter table public.daily_reviews add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.daily_reviews alter column user_id set default auth.uid();

alter table public.chat_messages add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.chat_messages alter column user_id set default auth.uid();

alter table public.ai_action_logs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_action_logs alter column user_id set default auth.uid();
alter table public.ai_action_logs add column if not exists request_id text;
alter table public.ai_action_logs add column if not exists source text not null default 'app';
alter table public.ai_action_logs add column if not exists user_message text;
alter table public.ai_action_logs add column if not exists answer text;
alter table public.ai_action_logs add column if not exists status text not null default 'success';
alter table public.ai_action_logs add column if not exists action_type text;
alter table public.ai_action_logs add column if not exists action_count integer not null default 0;
alter table public.ai_action_logs add column if not exists actions jsonb not null default '[]'::jsonb;
alter table public.ai_action_logs add column if not exists record_refs jsonb not null default '[]'::jsonb;
alter table public.ai_action_logs add column if not exists error_message text;
alter table public.ai_action_logs add column if not exists created_at timestamptz not null default now();

alter table public.ai_chat_threads add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_chat_threads alter column user_id set default auth.uid();
alter table public.ai_chat_threads add column if not exists title text not null default 'New Chat';
alter table public.ai_chat_threads add column if not exists status text not null default 'active';
alter table public.ai_chat_threads add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ai_chat_threads add column if not exists created_at timestamptz not null default now();
alter table public.ai_chat_threads add column if not exists updated_at timestamptz not null default now();
alter table public.ai_chat_threads add column if not exists last_message_at timestamptz;

alter table public.ai_chat_messages add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_chat_messages alter column user_id set default auth.uid();
alter table public.ai_chat_messages add column if not exists thread_id uuid;
alter table public.ai_chat_messages add column if not exists role text;
alter table public.ai_chat_messages add column if not exists content text;
alter table public.ai_chat_messages add column if not exists request_id uuid;
alter table public.ai_chat_messages add column if not exists action_type text;
alter table public.ai_chat_messages add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ai_chat_messages add column if not exists created_at timestamptz not null default now();

alter table public.ai_memories add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_memories alter column user_id set default auth.uid();
alter table public.ai_memories add column if not exists category text;
alter table public.ai_memories add column if not exists title text;
alter table public.ai_memories add column if not exists content text;
alter table public.ai_memories add column if not exists source text not null default 'assistant_inferred';
alter table public.ai_memories add column if not exists confidence numeric(3,2) not null default 0.80;
alter table public.ai_memories add column if not exists importance integer not null default 3;
alter table public.ai_memories add column if not exists status text not null default 'active';
alter table public.ai_memories add column if not exists last_seen_at timestamptz;
alter table public.ai_memories add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ai_memories add column if not exists created_at timestamptz not null default now();
alter table public.ai_memories add column if not exists updated_at timestamptz not null default now();

alter table public.ai_insights add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_insights alter column user_id set default auth.uid();
alter table public.ai_insights add column if not exists insight_type text;
alter table public.ai_insights add column if not exists title text;
alter table public.ai_insights add column if not exists content text;
alter table public.ai_insights add column if not exists evidence jsonb not null default '[]'::jsonb;
alter table public.ai_insights add column if not exists confidence numeric(3,2) not null default 0.70;
alter table public.ai_insights add column if not exists status text not null default 'active';
alter table public.ai_insights add column if not exists created_at timestamptz not null default now();
alter table public.ai_insights add column if not exists updated_at timestamptz not null default now();

alter table public.ai_vault_documents add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_vault_documents alter column user_id set default auth.uid();
alter table public.ai_vault_documents add column if not exists title text;
alter table public.ai_vault_documents add column if not exists document_type text not null default 'note';
alter table public.ai_vault_documents add column if not exists source_type text not null default 'brain';
alter table public.ai_vault_documents add column if not exists source_ref jsonb not null default '{}'::jsonb;
alter table public.ai_vault_documents add column if not exists content_md text;
alter table public.ai_vault_documents add column if not exists summary text;
alter table public.ai_vault_documents add column if not exists tags text[] not null default '{}';
alter table public.ai_vault_documents add column if not exists entities text[] not null default '{}';
alter table public.ai_vault_documents add column if not exists links text[] not null default '{}';
alter table public.ai_vault_documents add column if not exists status text not null default 'active';
alter table public.ai_vault_documents add column if not exists visibility text not null default 'private';
alter table public.ai_vault_documents add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ai_vault_documents add column if not exists created_at timestamptz not null default now();
alter table public.ai_vault_documents add column if not exists updated_at timestamptz not null default now();

alter table public.ai_vault_chunks add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_vault_chunks alter column user_id set default auth.uid();
alter table public.ai_vault_chunks add column if not exists document_id uuid;
alter table public.ai_vault_chunks add column if not exists chunk_index integer;
alter table public.ai_vault_chunks add column if not exists content text;
alter table public.ai_vault_chunks add column if not exists token_estimate integer;
alter table public.ai_vault_chunks add column if not exists embedding extensions.vector(1536);
alter table public.ai_vault_chunks add column if not exists embedding_model text;
alter table public.ai_vault_chunks add column if not exists embedding_status text not null default 'pending';
alter table public.ai_vault_chunks add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ai_vault_chunks add column if not exists created_at timestamptz not null default now();
alter table public.ai_vault_chunks add column if not exists updated_at timestamptz not null default now();

alter table public.memos add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.memos alter column user_id set default auth.uid();
alter table public.memos add column if not exists title text;
alter table public.memos add column if not exists memo_date date;
alter table public.memos add column if not exists memo_time time;
alter table public.memos add column if not exists notes text;
alter table public.memos add column if not exists status text not null default 'open';
alter table public.memos add column if not exists created_at timestamptz not null default now();
alter table public.memos add column if not exists updated_at timestamptz not null default now();

alter table public.projects add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.projects alter column user_id set default auth.uid();
alter table public.projects add column if not exists name text;
alter table public.projects add column if not exists status text not null default 'active';
alter table public.projects add column if not exists goal_type text not null default 'hours';
alter table public.projects add column if not exists goal_label text;
alter table public.projects add column if not exists target_value numeric(10,2);
alter table public.projects alter column target_value set default 0;
update public.projects set target_value = 0 where target_value is null;
alter table public.projects alter column target_value set not null;
alter table public.projects add column if not exists current_value numeric(10,2) not null default 0;
alter table public.projects add column if not exists unit_label text;
alter table public.projects add column if not exists overall_cost numeric(10,2) not null default 0;
alter table public.projects add column if not exists started_on date not null default current_date;
alter table public.projects add column if not exists notes text;
alter table public.projects add column if not exists created_at timestamptz not null default now();
alter table public.projects add column if not exists updated_at timestamptz not null default now();

alter table public.project_sessions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.project_sessions alter column user_id set default auth.uid();
alter table public.project_sessions add column if not exists project_id uuid;
alter table public.project_sessions add column if not exists started_at timestamptz not null default now();
alter table public.project_sessions add column if not exists ended_at timestamptz;
alter table public.project_sessions add column if not exists duration_minutes integer;
alter table public.project_sessions add column if not exists target_output text;
alter table public.project_sessions add column if not exists proof_of_work text;
alter table public.project_sessions add column if not exists progress_delta numeric(10,2) not null default 0;
alter table public.project_sessions add column if not exists created_at timestamptz not null default now();
alter table public.project_sessions add column if not exists updated_at timestamptz not null default now();

alter table public.project_money_entries add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.project_money_entries alter column user_id set default auth.uid();
alter table public.project_money_entries add column if not exists project_id uuid;
alter table public.project_money_entries add column if not exists type text;
alter table public.project_money_entries alter column type set default 'expense';
update public.project_money_entries set type = 'expense' where type is null;
alter table public.project_money_entries alter column type set not null;
alter table public.project_money_entries add column if not exists amount numeric(10,2);
alter table public.project_money_entries alter column amount set default 0;
update public.project_money_entries set amount = 0 where amount is null;
alter table public.project_money_entries alter column amount set not null;
alter table public.project_money_entries add column if not exists description text;
alter table public.project_money_entries add column if not exists entry_date date not null default current_date;
alter table public.project_money_entries add column if not exists created_at timestamptz not null default now();
alter table public.project_money_entries add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_sets_rpe_check'
  ) then
    alter table public.workout_sets
    add constraint workout_sets_rpe_check
    check (rpe is null or (rpe >= 0 and rpe <= 10));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_chat_threads_id_user_id_key'
  ) then
    alter table public.ai_chat_threads
    add constraint ai_chat_threads_id_user_id_key unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_chat_threads_status_check'
  ) then
    alter table public.ai_chat_threads
    add constraint ai_chat_threads_status_check
    check (status in ('active', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_chat_messages_role_check'
  ) then
    alter table public.ai_chat_messages
    add constraint ai_chat_messages_role_check
    check (role in ('user', 'assistant', 'system', 'tool'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_chat_messages_thread_id_user_id_fkey'
  ) then
    alter table public.ai_chat_messages
    add constraint ai_chat_messages_thread_id_user_id_fkey
    foreign key (thread_id, user_id) references public.ai_chat_threads(id, user_id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_memories_source_check'
  ) then
    alter table public.ai_memories
    add constraint ai_memories_source_check
    check (source in ('user_explicit', 'assistant_inferred', 'system', 'manual'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_memories_confidence_check'
  ) then
    alter table public.ai_memories
    add constraint ai_memories_confidence_check
    check (confidence >= 0 and confidence <= 1);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_memories_importance_check'
  ) then
    alter table public.ai_memories
    add constraint ai_memories_importance_check
    check (importance between 1 and 5);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_memories_status_check'
  ) then
    alter table public.ai_memories
    add constraint ai_memories_status_check
    check (status in ('active', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_insights_confidence_check'
  ) then
    alter table public.ai_insights
    add constraint ai_insights_confidence_check
    check (confidence >= 0 and confidence <= 1);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_insights_status_check'
  ) then
    alter table public.ai_insights
    add constraint ai_insights_status_check
    check (status in ('active', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_vault_documents_id_user_id_key'
  ) then
    alter table public.ai_vault_documents
    add constraint ai_vault_documents_id_user_id_key unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_vault_documents_document_type_check'
  ) then
    alter table public.ai_vault_documents
    add constraint ai_vault_documents_document_type_check
    check (document_type in ('note', 'daily_report', 'weekly_report', 'workout_report', 'project_report', 'finance_report', 'life_review', 'product_report', 'brain_answer'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_vault_documents_source_type_check'
  ) then
    alter table public.ai_vault_documents
    add constraint ai_vault_documents_source_type_check
    check (source_type in ('brain', 'manual', 'system', 'workout', 'project', 'health', 'finance', 'calendar'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_vault_documents_status_check'
  ) then
    alter table public.ai_vault_documents
    add constraint ai_vault_documents_status_check
    check (status in ('active', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_vault_documents_visibility_check'
  ) then
    alter table public.ai_vault_documents
    add constraint ai_vault_documents_visibility_check
    check (visibility in ('private'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_vault_chunks_user_document_chunk_key'
  ) then
    alter table public.ai_vault_chunks
    add constraint ai_vault_chunks_user_document_chunk_key unique (user_id, document_id, chunk_index);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_vault_chunks_embedding_status_check'
  ) then
    alter table public.ai_vault_chunks
    add constraint ai_vault_chunks_embedding_status_check
    check (embedding_status in ('pending', 'ready', 'failed', 'skipped'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_vault_chunks_document_id_user_id_fkey'
  ) then
    alter table public.ai_vault_chunks
    add constraint ai_vault_chunks_document_id_user_id_fkey
    foreign key (document_id, user_id) references public.ai_vault_documents(id, user_id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'calendar_events_status_check'
  ) then
    alter table public.calendar_events
    add constraint calendar_events_status_check
    check (status in ('planned', 'done', 'skipped', 'cancelled'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workouts_id_user_id_key'
  ) then
    alter table public.workouts add constraint workouts_id_user_id_key unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_templates_user_id_name_key'
  ) then
    alter table public.workout_templates add constraint workout_templates_user_id_name_key unique (user_id, name);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_templates_id_user_id_key'
  ) then
    alter table public.workout_templates add constraint workout_templates_id_user_id_key unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_template_exercises_template_id_exercise_order_key'
  ) then
    alter table public.workout_template_exercises
    add constraint workout_template_exercises_template_id_exercise_order_key unique (template_id, exercise_order);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_template_exercises_exercise_order_check'
  ) then
    alter table public.workout_template_exercises
    add constraint workout_template_exercises_exercise_order_check
    check (exercise_order > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_template_exercises_template_id_user_id_fkey'
  ) then
    alter table public.workout_template_exercises
    add constraint workout_template_exercises_template_id_user_id_fkey
    foreign key (template_id, user_id) references public.workout_templates(id, user_id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_sets_workout_id_user_id_fkey'
  ) then
    alter table public.workout_sets
    add constraint workout_sets_workout_id_user_id_fkey
    foreign key (workout_id, user_id) references public.workouts(id, user_id) on delete cascade;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'ai_action_logs_source_check'
  ) then
    alter table public.ai_action_logs
    drop constraint ai_action_logs_source_check;
  end if;

  if not exists (
    select 1 from public.ai_action_logs
    where source not in ('app', 'shortcut', 'api', 'whatsapp')
  ) then
    alter table public.ai_action_logs
    add constraint ai_action_logs_source_check
    check (source in ('app', 'shortcut', 'api', 'whatsapp'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_action_logs_status_check'
  ) then
    alter table public.ai_action_logs
    add constraint ai_action_logs_status_check
    check (status in ('success', 'error'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_action_logs_action_count_check'
  ) then
    alter table public.ai_action_logs
    add constraint ai_action_logs_action_count_check
    check (action_count >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'memos_status_check'
  ) then
    alter table public.memos
    add constraint memos_status_check
    check (status in ('open', 'done', 'dismissed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_id_user_id_key'
  ) then
    alter table public.projects add constraint projects_id_user_id_key unique (id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_status_check'
  ) then
    alter table public.projects
    add constraint projects_status_check
    check (status in ('active', 'paused', 'completed', 'archived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_goal_type_check'
  ) then
    alter table public.projects
    add constraint projects_goal_type_check
    check (goal_type in ('hours', 'units', 'tasks', 'content', 'custom'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_sessions_duration_minutes_check'
  ) then
    alter table public.project_sessions
    add constraint project_sessions_duration_minutes_check
    check (duration_minutes >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_sessions_project_id_user_id_fkey'
  ) then
    alter table public.project_sessions
    add constraint project_sessions_project_id_user_id_fkey
    foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_money_entries_type_check'
  ) then
    alter table public.project_money_entries
    add constraint project_money_entries_type_check
    check (type in ('expense', 'revenue'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_money_entries_amount_check'
  ) then
    alter table public.project_money_entries
    add constraint project_money_entries_amount_check
    check (amount >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_money_entries_project_id_user_id_fkey'
  ) then
    alter table public.project_money_entries
    add constraint project_money_entries_project_id_user_id_fkey
    foreign key (project_id, user_id) references public.projects(id, user_id) on delete cascade;
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_workouts_updated_at on public.workouts;
create trigger set_workouts_updated_at
before update on public.workouts
for each row execute function public.set_updated_at();

drop trigger if exists set_workout_templates_updated_at on public.workout_templates;
create trigger set_workout_templates_updated_at
before update on public.workout_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_workout_template_exercises_updated_at on public.workout_template_exercises;
create trigger set_workout_template_exercises_updated_at
before update on public.workout_template_exercises
for each row execute function public.set_updated_at();

drop trigger if exists set_workout_sets_updated_at on public.workout_sets;
create trigger set_workout_sets_updated_at
before update on public.workout_sets
for each row execute function public.set_updated_at();

drop trigger if exists set_health_logs_updated_at on public.health_logs;
create trigger set_health_logs_updated_at
before update on public.health_logs
for each row execute function public.set_updated_at();

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

drop trigger if exists set_calendar_events_updated_at on public.calendar_events;
create trigger set_calendar_events_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

drop trigger if exists set_daily_reviews_updated_at on public.daily_reviews;
create trigger set_daily_reviews_updated_at
before update on public.daily_reviews
for each row execute function public.set_updated_at();

drop trigger if exists set_chat_messages_updated_at on public.chat_messages;
create trigger set_chat_messages_updated_at
before update on public.chat_messages
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_chat_threads_updated_at on public.ai_chat_threads;
create trigger set_ai_chat_threads_updated_at
before update on public.ai_chat_threads
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_memories_updated_at on public.ai_memories;
create trigger set_ai_memories_updated_at
before update on public.ai_memories
for each row execute function public.set_updated_at();

drop trigger if exists set_brain_beliefs_updated_at on public.brain_beliefs;
create trigger set_brain_beliefs_updated_at
before update on public.brain_beliefs
for each row execute function public.set_updated_at();

drop trigger if exists set_brain_external_sync_requests_updated_at on public.brain_external_sync_requests;
create trigger set_brain_external_sync_requests_updated_at
before update on public.brain_external_sync_requests
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_insights_updated_at on public.ai_insights;
create trigger set_ai_insights_updated_at
before update on public.ai_insights
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_vault_documents_updated_at on public.ai_vault_documents;
create trigger set_ai_vault_documents_updated_at
before update on public.ai_vault_documents
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_vault_chunks_updated_at on public.ai_vault_chunks;
create trigger set_ai_vault_chunks_updated_at
before update on public.ai_vault_chunks
for each row execute function public.set_updated_at();

drop trigger if exists set_memos_updated_at on public.memos;
create trigger set_memos_updated_at
before update on public.memos
for each row execute function public.set_updated_at();

drop trigger if exists set_brain_outbox_messages_updated_at on public.brain_outbox_messages;
create trigger set_brain_outbox_messages_updated_at
before update on public.brain_outbox_messages
for each row execute function public.set_updated_at();

drop trigger if exists set_brain_proactive_rules_updated_at on public.brain_proactive_rules;
create trigger set_brain_proactive_rules_updated_at
before update on public.brain_proactive_rules
for each row execute function public.set_updated_at();

drop trigger if exists set_brain_whatsapp_inbound_receipts_updated_at on public.brain_whatsapp_inbound_receipts;
create trigger set_brain_whatsapp_inbound_receipts_updated_at
before update on public.brain_whatsapp_inbound_receipts
for each row execute function public.set_updated_at();

drop trigger if exists set_brain_interaction_state_updated_at on public.brain_interaction_state;
create trigger set_brain_interaction_state_updated_at
before update on public.brain_interaction_state
for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists set_project_sessions_updated_at on public.project_sessions;
create trigger set_project_sessions_updated_at
before update on public.project_sessions
for each row execute function public.set_updated_at();

drop trigger if exists set_project_money_entries_updated_at on public.project_money_entries;
create trigger set_project_money_entries_updated_at
before update on public.project_money_entries
for each row execute function public.set_updated_at();

create or replace function public.apply_brain_belief_transition(
  p_user_id uuid,
  p_subject_type text,
  p_subject_key text,
  p_predicate text,
  p_value jsonb,
  p_confidence numeric,
  p_source_type text,
  p_source_ref jsonb,
  p_provenance jsonb,
  p_effective_from timestamptz,
  p_effective_until timestamptz,
  p_negative_feedback_count integer,
  p_last_feedback_at timestamptz,
  p_idempotency_key text
)
returns setof public.brain_beliefs
language plpgsql
set search_path = public
as $$
declare
  existing_row public.brain_beliefs%rowtype;
  current_row public.brain_beliefs%rowtype;
  inserted_row public.brain_beliefs%rowtype;
  transition_at timestamptz := coalesce(p_effective_from, now());
begin
  if p_idempotency_key is not null then
    select * into existing_row
    from public.brain_beliefs
    where user_id = p_user_id
      and idempotency_key = p_idempotency_key
    limit 1;
    if found then
      return next existing_row;
      return;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':' || p_subject_type || ':' || p_subject_key || ':' || p_predicate,
    0
  ));

  if p_idempotency_key is not null then
    select * into existing_row
    from public.brain_beliefs
    where user_id = p_user_id
      and idempotency_key = p_idempotency_key
    limit 1;
    if found then
      return next existing_row;
      return;
    end if;
  end if;

  select * into current_row
  from public.brain_beliefs
  where user_id = p_user_id
    and subject_type = p_subject_type
    and subject_key = p_subject_key
    and predicate = p_predicate
    and record_status = 'current'
  for update;

  update public.brain_beliefs
  set record_status = 'superseded',
      effective_until = greatest(effective_from, transition_at),
      updated_at = now()
  where id = current_row.id
    and user_id = p_user_id;

  insert into public.brain_beliefs (
    user_id,
    subject_type,
    subject_key,
    predicate,
    value,
    confidence,
    source_type,
    source_ref,
    provenance,
    effective_from,
    effective_until,
    supersedes_id,
    negative_feedback_count,
    last_feedback_at,
    idempotency_key
  ) values (
    p_user_id,
    p_subject_type,
    p_subject_key,
    p_predicate,
    coalesce(p_value, '{}'::jsonb),
    p_confidence,
    p_source_type,
    coalesce(p_source_ref, '{}'::jsonb),
    coalesce(p_provenance, '{}'::jsonb),
    transition_at,
    p_effective_until,
    current_row.id,
    coalesce(p_negative_feedback_count, 0),
    p_last_feedback_at,
    p_idempotency_key
  ) returning * into inserted_row;

  return next inserted_row;
end;
$$;

revoke all on function public.apply_brain_belief_transition(
  uuid, text, text, text, jsonb, numeric, text, jsonb, jsonb,
  timestamptz, timestamptz, integer, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.apply_brain_belief_transition(
  uuid, text, text, text, jsonb, numeric, text, jsonb, jsonb,
  timestamptz, timestamptz, integer, timestamptz, text
) to service_role;

create or replace function public.curate_autobiographical_memory(
  p_user_id uuid, p_memory_kind text, p_category text, p_title text, p_content text,
  p_source text, p_confidence numeric, p_importance integer, p_subject_key text,
  p_project_id uuid, p_occurred_at timestamptz, p_occurred_on date,
  p_effective_from timestamptz, p_provenance jsonb, p_dedupe_key text
)
returns setof public.ai_memories
language plpgsql
set search_path = public
as $$
declare
  previous_row public.ai_memories%rowtype;
  exact_row public.ai_memories%rowtype;
  result_row public.ai_memories%rowtype;
  lock_key text := coalesce(p_subject_key, p_dedupe_key);
begin
  if p_user_id is null or p_dedupe_key is null or p_source not in ('user_explicit', 'assistant_inferred', 'manual') then
    raise exception 'Invalid autobiographical memory candidate.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || lock_key, 0));
  select * into exact_row from public.ai_memories
  where user_id = p_user_id and dedupe_key = p_dedupe_key limit 1 for update;
  if found then
    if exact_row.status = 'archived' and p_source in ('user_explicit', 'manual') then
      update public.ai_memories set dedupe_key = null where id = exact_row.id;
    else
      update public.ai_memories set last_seen_at = now(),
        last_confirmed_at = case when p_source in ('user_explicit', 'manual') then now() else last_confirmed_at end,
        confidence = greatest(confidence, p_confidence), importance = greatest(importance, p_importance),
        provenance = coalesce(provenance, '{}'::jsonb) || jsonb_build_object('last_seen_source', coalesce(p_provenance, '{}'::jsonb)),
        updated_at = now()
      where id = exact_row.id returning * into result_row;
      return next result_row;
      return;
    end if;
  end if;
  if p_subject_key is not null then
    select * into previous_row from public.ai_memories
    where user_id = p_user_id and subject_key = p_subject_key and status = 'active'
    order by updated_at desc limit 1 for update;
    if found and previous_row.source in ('user_explicit', 'manual')
      and (p_source = 'assistant_inferred' or p_confidence < previous_row.confidence) then
      return next previous_row;
      return;
    end if;
    if found then
      update public.ai_memories set status = 'archived', effective_until = coalesce(p_effective_from, now()), updated_at = now()
      where id = previous_row.id;
    end if;
  end if;
  insert into public.ai_memories (
    user_id, memory_kind, category, title, content, source, confidence, importance,
    subject_key, project_id, occurred_at, occurred_on, effective_from, provenance,
    dedupe_key, supersedes_id, last_seen_at, last_confirmed_at, status
  ) values (
    p_user_id, p_memory_kind, p_category, p_title, p_content, p_source, p_confidence, p_importance,
    p_subject_key, p_project_id, p_occurred_at, p_occurred_on, p_effective_from,
    coalesce(p_provenance, '{}'::jsonb), p_dedupe_key, previous_row.id, now(),
    case when p_source in ('user_explicit', 'manual') then now() else null end, 'active'
  ) returning * into result_row;
  return next result_row;
end;
$$;

revoke all on function public.curate_autobiographical_memory(
  uuid, text, text, text, text, text, numeric, integer, text, uuid,
  timestamptz, date, timestamptz, jsonb, text
) from public, anon, authenticated;
grant execute on function public.curate_autobiographical_memory(
  uuid, text, text, text, text, text, numeric, integer, text, uuid,
  timestamptz, date, timestamptz, jsonb, text
) to service_role;

revoke all on table public.brain_beliefs from anon, authenticated;
grant select on table public.brain_beliefs to authenticated;
revoke all on table public.brain_external_sync_requests from anon, authenticated;
grant select on table public.brain_external_sync_requests to authenticated;
grant all on table public.brain_external_sync_requests to service_role;
revoke all on table public.brain_mcp_oauth_code_redemptions from public, anon, authenticated;
grant select, insert, delete on table public.brain_mcp_oauth_code_redemptions to service_role;

create index if not exists workouts_user_performed_on_idx on public.workouts (user_id, performed_on desc);
create index if not exists workout_templates_user_name_idx on public.workout_templates (user_id, name);
create index if not exists workout_template_exercises_template_order_idx on public.workout_template_exercises (template_id, exercise_order);
create index if not exists workout_sets_user_performed_at_idx on public.workout_sets (user_id, performed_at desc);
create index if not exists workout_sets_workout_id_idx on public.workout_sets (workout_id);
create index if not exists workout_sets_exercise_idx on public.workout_sets (user_id, exercise);
create index if not exists health_logs_user_logged_on_idx on public.health_logs (user_id, logged_on desc);
create index if not exists expenses_user_spent_on_idx on public.expenses (user_id, spent_on desc);
create index if not exists calendar_events_user_event_date_idx on public.calendar_events (user_id, event_date desc);
create index if not exists daily_reviews_user_review_on_idx on public.daily_reviews (user_id, review_on desc);
create index if not exists chat_messages_user_created_at_idx on public.chat_messages (user_id, created_at asc);
create index if not exists ai_action_logs_user_created_at_idx on public.ai_action_logs (user_id, created_at desc);
create index if not exists ai_action_logs_user_request_id_idx on public.ai_action_logs (user_id, request_id);
create index if not exists ai_chat_threads_user_updated_at_idx on public.ai_chat_threads (user_id, updated_at desc);
create index if not exists ai_chat_threads_user_last_message_at_idx on public.ai_chat_threads (user_id, last_message_at desc);
create index if not exists ai_chat_threads_user_status_idx on public.ai_chat_threads (user_id, status);
create index if not exists ai_chat_messages_user_thread_created_at_idx on public.ai_chat_messages (user_id, thread_id, created_at asc);
create index if not exists ai_chat_messages_user_created_at_idx on public.ai_chat_messages (user_id, created_at desc);
create index if not exists ai_chat_messages_user_request_id_idx on public.ai_chat_messages (user_id, request_id);
create index if not exists ai_memories_user_status_importance_idx on public.ai_memories (user_id, status, importance desc, updated_at desc);
create index if not exists ai_memories_user_category_idx on public.ai_memories (user_id, category);
create index if not exists ai_memories_user_last_seen_at_idx on public.ai_memories (user_id, last_seen_at desc);
create unique index if not exists ai_memories_user_dedupe_unique on public.ai_memories (user_id, dedupe_key) where dedupe_key is not null;
create unique index if not exists ai_memories_user_active_subject_unique on public.ai_memories (user_id, subject_key) where status = 'active' and subject_key is not null;
create index if not exists ai_memories_user_subject_active_idx on public.ai_memories (user_id, subject_key, updated_at desc) where status = 'active' and subject_key is not null;
create index if not exists ai_memories_user_kind_recent_idx on public.ai_memories (user_id, memory_kind, updated_at desc) where status = 'active';
create index if not exists ai_memories_user_project_recent_idx on public.ai_memories (user_id, project_id, updated_at desc) where status = 'active' and project_id is not null;
create index if not exists ai_insights_user_status_created_at_idx on public.ai_insights (user_id, status, created_at desc);
create index if not exists ai_insights_user_type_created_at_idx on public.ai_insights (user_id, insight_type, created_at desc);
create index if not exists ai_vault_documents_user_created_at_idx on public.ai_vault_documents (user_id, created_at desc);
create index if not exists ai_vault_documents_user_type_created_at_idx on public.ai_vault_documents (user_id, document_type, created_at desc);
create index if not exists ai_vault_documents_user_status_created_at_idx on public.ai_vault_documents (user_id, status, created_at desc);
create index if not exists ai_vault_documents_tags_gin_idx on public.ai_vault_documents using gin (tags);
create index if not exists ai_vault_documents_entities_gin_idx on public.ai_vault_documents using gin (entities);
create index if not exists ai_vault_documents_links_gin_idx on public.ai_vault_documents using gin (links);
create index if not exists ai_vault_chunks_user_document_idx on public.ai_vault_chunks (user_id, document_id);
create index if not exists ai_vault_chunks_user_status_idx on public.ai_vault_chunks (user_id, embedding_status);
create index if not exists ai_vault_chunks_user_created_at_idx on public.ai_vault_chunks (user_id, created_at desc);

do $$
begin
  begin
    create index if not exists ai_vault_chunks_embedding_hnsw_idx
    on public.ai_vault_chunks
    using hnsw (embedding extensions.vector_cosine_ops)
    where embedding is not null;
  exception
    when undefined_object or feature_not_supported or invalid_parameter_value then
      raise notice 'Skipping ai_vault_chunks_embedding_hnsw_idx; pgvector HNSW is not available in this environment.';
  end;
end $$;

create or replace function public.match_ai_vault_chunks(
  query_embedding extensions.vector(1536),
  match_count int default 8,
  match_threshold float default 0.2,
  filter_document_types text[] default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  document_type text,
  content text,
  summary text,
  tags text[],
  entities text[],
  links text[],
  similarity float,
  created_at timestamptz
)
language sql
stable
as $$
  select
    c.id as chunk_id,
    d.id as document_id,
    d.title,
    d.document_type,
    c.content,
    d.summary,
    d.tags,
    d.entities,
    d.links,
    greatest(0, 1 - (c.embedding <=> query_embedding)) as similarity,
    d.created_at
  from public.ai_vault_chunks c
  join public.ai_vault_documents d
    on d.id = c.document_id
   and d.user_id = c.user_id
  where d.user_id = auth.uid()
    and d.status = 'active'
    and c.embedding_status = 'ready'
    and c.embedding_model = 'gemini-embedding-2'
    and c.embedding is not null
    and (filter_document_types is null or d.document_type = any(filter_document_types))
    and greatest(0, 1 - (c.embedding <=> query_embedding)) >= match_threshold
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 8), 20));
$$;

create or replace function public.match_ai_vault_chunks_for_user(
  target_user_id uuid,
  query_embedding extensions.vector(1536),
  match_count int default 8,
  match_threshold float default 0.2,
  filter_document_types text[] default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  document_type text,
  content text,
  summary text,
  tags text[],
  entities text[],
  links text[],
  similarity float,
  created_at timestamptz
)
language sql
stable
as $$
  select
    c.id as chunk_id,
    d.id as document_id,
    d.title,
    d.document_type,
    c.content,
    d.summary,
    d.tags,
    d.entities,
    d.links,
    greatest(0, 1 - (c.embedding <=> query_embedding)) as similarity,
    d.created_at
  from public.ai_vault_chunks c
  join public.ai_vault_documents d
    on d.id = c.document_id
   and d.user_id = c.user_id
  where d.user_id = target_user_id
    and (auth.uid() = target_user_id or auth.role() = 'service_role')
    and d.status = 'active'
    and c.embedding_status = 'ready'
    and c.embedding_model = 'gemini-embedding-2'
    and c.embedding is not null
    and (filter_document_types is null or d.document_type = any(filter_document_types))
    and greatest(0, 1 - (c.embedding <=> query_embedding)) >= match_threshold
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 8), 20));
$$;
create index if not exists memos_user_status_due_idx on public.memos (user_id, status, memo_date, memo_time);
create index if not exists memos_user_created_at_idx on public.memos (user_id, created_at desc);
create unique index if not exists brain_beliefs_one_current_idx
  on public.brain_beliefs (user_id, subject_type, subject_key, predicate)
  where record_status = 'current';
create unique index if not exists brain_beliefs_idempotency_idx
  on public.brain_beliefs (user_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists brain_beliefs_user_subject_history_idx
  on public.brain_beliefs (user_id, subject_type, subject_key, predicate, effective_from desc);
create index if not exists brain_external_sync_requests_user_created_idx
  on public.brain_external_sync_requests (user_id, created_at desc);
create index if not exists brain_mcp_oauth_code_redemptions_expires_idx
  on public.brain_mcp_oauth_code_redemptions (expires_at);
create index if not exists brain_outbox_messages_user_status_scheduled_idx on public.brain_outbox_messages (user_id, status, scheduled_for);
create index if not exists brain_outbox_messages_user_channel_status_scheduled_idx on public.brain_outbox_messages (user_id, channel, status, scheduled_for);
create index if not exists brain_outbox_messages_idempotency_key_idx on public.brain_outbox_messages (idempotency_key);
create index if not exists brain_outbox_messages_source_idx on public.brain_outbox_messages (source_type, source_id);
create index if not exists brain_proactive_rules_user_rule_channel_idx on public.brain_proactive_rules (user_id, rule_key, channel);
create unique index if not exists ai_chat_messages_user_thread_outbox_unique
  on public.ai_chat_messages (user_id, thread_id, (metadata->>'outbox_message_id'))
  where role = 'assistant' and coalesce(metadata->>'outbox_message_id', '') <> '';
create index if not exists brain_whatsapp_receipts_user_status_lease_idx on public.brain_whatsapp_inbound_receipts (user_id, status, lease_expires_at);
create index if not exists brain_whatsapp_deliveries_assistant_idx on public.brain_whatsapp_message_deliveries (user_id, assistant_message_id);
create index if not exists brain_interaction_state_expiry_idx on public.brain_interaction_state (user_id, channel, state, expires_at);
create index if not exists projects_user_status_created_at_idx on public.projects (user_id, status, created_at desc);
create index if not exists project_sessions_user_project_started_at_idx on public.project_sessions (user_id, project_id, started_at desc);
create index if not exists project_sessions_user_ended_at_idx on public.project_sessions (user_id, ended_at);
create index if not exists project_money_entries_user_project_entry_date_idx on public.project_money_entries (user_id, project_id, entry_date desc);
create index if not exists project_money_entries_user_created_at_idx on public.project_money_entries (user_id, created_at desc);

alter table public.workouts enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workout_template_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.health_logs enable row level security;
alter table public.expenses enable row level security;
alter table public.calendar_events enable row level security;
alter table public.daily_reviews enable row level security;
alter table public.chat_messages enable row level security;
alter table public.ai_action_logs enable row level security;
alter table public.ai_chat_threads enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_memories enable row level security;
alter table public.brain_beliefs enable row level security;
alter table public.brain_external_sync_requests enable row level security;
alter table public.brain_mcp_oauth_code_redemptions enable row level security;
alter table public.ai_insights enable row level security;
alter table public.ai_vault_documents enable row level security;
alter table public.ai_vault_chunks enable row level security;
alter table public.memos enable row level security;
alter table public.brain_outbox_messages enable row level security;
alter table public.brain_proactive_rules enable row level security;
alter table public.brain_monitors enable row level security;
alter table public.brain_attention_events enable row level security;
alter table public.brain_whatsapp_inbound_receipts enable row level security;
alter table public.brain_whatsapp_message_deliveries enable row level security;
alter table public.brain_interaction_state enable row level security;
alter table public.projects enable row level security;
alter table public.project_sessions enable row level security;
alter table public.project_money_entries enable row level security;

drop policy if exists "lifeos local read workouts" on public.workouts;
drop policy if exists "lifeos local write workouts" on public.workouts;
drop policy if exists "workouts are user scoped" on public.workouts;
create policy "workouts are user scoped" on public.workouts
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read workout_templates" on public.workout_templates;
drop policy if exists "lifeos local write workout_templates" on public.workout_templates;
drop policy if exists "workout_templates are user scoped" on public.workout_templates;
create policy "workout_templates are user scoped" on public.workout_templates
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read workout_template_exercises" on public.workout_template_exercises;
drop policy if exists "lifeos local write workout_template_exercises" on public.workout_template_exercises;
drop policy if exists "workout_template_exercises are user scoped" on public.workout_template_exercises;
create policy "workout_template_exercises are user scoped" on public.workout_template_exercises
for all to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.workout_templates
    where workout_templates.id = workout_template_exercises.template_id
      and workout_templates.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.workout_templates
    where workout_templates.id = workout_template_exercises.template_id
      and workout_templates.user_id = auth.uid()
  )
);

drop policy if exists "lifeos local read workout_sets" on public.workout_sets;
drop policy if exists "lifeos local write workout_sets" on public.workout_sets;
drop policy if exists "workout_sets are user scoped" on public.workout_sets;
create policy "workout_sets are user scoped" on public.workout_sets
for all to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.workouts
    where workouts.id = workout_sets.workout_id
      and workouts.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.workouts
    where workouts.id = workout_sets.workout_id
      and workouts.user_id = auth.uid()
  )
);

drop policy if exists "lifeos local read health_logs" on public.health_logs;
drop policy if exists "lifeos local write health_logs" on public.health_logs;
drop policy if exists "health_logs are user scoped" on public.health_logs;
create policy "health_logs are user scoped" on public.health_logs
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read expenses" on public.expenses;
drop policy if exists "lifeos local write expenses" on public.expenses;
drop policy if exists "expenses are user scoped" on public.expenses;
create policy "expenses are user scoped" on public.expenses
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read calendar_events" on public.calendar_events;
drop policy if exists "lifeos local write calendar_events" on public.calendar_events;
drop policy if exists "calendar_events are user scoped" on public.calendar_events;
create policy "calendar_events are user scoped" on public.calendar_events
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read daily_reviews" on public.daily_reviews;
drop policy if exists "lifeos local write daily_reviews" on public.daily_reviews;
drop policy if exists "daily_reviews are user scoped" on public.daily_reviews;
create policy "daily_reviews are user scoped" on public.daily_reviews
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read chat_messages" on public.chat_messages;
drop policy if exists "lifeos local write chat_messages" on public.chat_messages;
drop policy if exists "chat_messages are user scoped" on public.chat_messages;
create policy "chat_messages are user scoped" on public.chat_messages
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read ai_action_logs" on public.ai_action_logs;
drop policy if exists "lifeos local write ai_action_logs" on public.ai_action_logs;
drop policy if exists "ai_action_logs are user scoped" on public.ai_action_logs;
create policy "ai_action_logs are user scoped" on public.ai_action_logs
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "ai_chat_threads are user scoped" on public.ai_chat_threads;
create policy "ai_chat_threads are user scoped" on public.ai_chat_threads
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "ai_chat_messages are user scoped" on public.ai_chat_messages;
create policy "ai_chat_messages are user scoped" on public.ai_chat_messages
for all to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.ai_chat_threads
    where ai_chat_threads.id = ai_chat_messages.thread_id
      and ai_chat_threads.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.ai_chat_threads
    where ai_chat_threads.id = ai_chat_messages.thread_id
      and ai_chat_threads.user_id = auth.uid()
  )
);

drop policy if exists "ai_memories are user scoped" on public.ai_memories;
create policy "ai_memories are user scoped" on public.ai_memories
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "brain_beliefs are user scoped" on public.brain_beliefs;
drop policy if exists "brain_beliefs are user scoped read" on public.brain_beliefs;
create policy "brain_beliefs are user scoped read" on public.brain_beliefs
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "brain_external_sync_requests are user scoped read" on public.brain_external_sync_requests;
create policy "brain_external_sync_requests are user scoped read" on public.brain_external_sync_requests
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "ai_insights are user scoped" on public.ai_insights;
create policy "ai_insights are user scoped" on public.ai_insights
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "ai_vault_documents are user scoped" on public.ai_vault_documents;
create policy "ai_vault_documents are user scoped" on public.ai_vault_documents
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "ai_vault_chunks are user scoped" on public.ai_vault_chunks;
create policy "ai_vault_chunks are user scoped" on public.ai_vault_chunks
for all to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.ai_vault_documents
    where ai_vault_documents.id = ai_vault_chunks.document_id
      and ai_vault_documents.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.ai_vault_documents
    where ai_vault_documents.id = ai_vault_chunks.document_id
      and ai_vault_documents.user_id = auth.uid()
  )
);

drop policy if exists "lifeos local read memos" on public.memos;
drop policy if exists "lifeos local write memos" on public.memos;
drop policy if exists "memos are user scoped" on public.memos;
create policy "memos are user scoped" on public.memos
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "brain_outbox_messages are user scoped" on public.brain_outbox_messages;
create policy "brain_outbox_messages are user scoped" on public.brain_outbox_messages
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "brain_proactive_rules are user scoped" on public.brain_proactive_rules;
create policy "brain_proactive_rules are user scoped" on public.brain_proactive_rules
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- WhatsApp receipt, delivery and interaction-state tables are service-role only.
-- RLS is enabled as defense in depth and no authenticated-user policies exist.
revoke all on table public.brain_whatsapp_inbound_receipts from anon, authenticated;
revoke all on table public.brain_whatsapp_message_deliveries from anon, authenticated;
revoke all on table public.brain_interaction_state from anon, authenticated;
revoke all on table public.brain_monitors from public, anon, authenticated;
revoke all on table public.brain_attention_events from public, anon, authenticated;
grant all on table public.brain_monitors to service_role;
grant all on table public.brain_attention_events to service_role;

drop policy if exists "lifeos local read projects" on public.projects;
drop policy if exists "lifeos local write projects" on public.projects;
drop policy if exists "projects are user scoped" on public.projects;
create policy "projects are user scoped" on public.projects
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lifeos local read project_sessions" on public.project_sessions;
drop policy if exists "lifeos local write project_sessions" on public.project_sessions;
drop policy if exists "project_sessions are user scoped" on public.project_sessions;
create policy "project_sessions are user scoped" on public.project_sessions
for all to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = project_sessions.project_id
      and projects.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = project_sessions.project_id
      and projects.user_id = auth.uid()
  )
);

drop policy if exists "lifeos local read project_money_entries" on public.project_money_entries;
drop policy if exists "lifeos local write project_money_entries" on public.project_money_entries;
drop policy if exists "project_money_entries are user scoped" on public.project_money_entries;
create policy "project_money_entries are user scoped" on public.project_money_entries
for all to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = project_money_entries.project_id
      and projects.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.projects
    where projects.id = project_money_entries.project_id
      and projects.user_id = auth.uid()
  )
);

-- Reliability release: source_id is a polymorphic logical key; memo UUID strings are preserved.
alter table public.brain_outbox_messages alter column source_id type text using source_id::text;

-- Serialize admission and ordinary delivery per user/channel across serverless instances.
create or replace function public.guard_proactive_attention()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  gap_minutes integer;
  daily_max integer;
  recent boolean;
begin
  if new.source_type not in ('memo', 'accountability') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.channel, 0));
  gap_minutes := coalesce((new.metadata #>> '{attention_profile,min_gap_minutes}')::integer,
    case when new.source_type = 'accountability' then 20 else 60 end);
  daily_max := coalesce((new.metadata #>> '{attention_profile,max_per_day}')::integer,
    case when new.source_type = 'accountability' then 20 else 6 end);
  if tg_op = 'INSERT' then
    if exists (select 1 from public.brain_outbox_messages b where b.user_id = new.user_id and b.idempotency_key = new.idempotency_key) then return new; end if;
    if (select count(*) from public.brain_outbox_messages b where b.user_id = new.user_id and b.channel = new.channel
      and b.source_type is distinct from 'workout_rest_timer'
      and b.created_at >= (date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome')
      and b.status <> 'cancelled') >= daily_max then
      raise exception 'attention_deferred';
    end if;
    if coalesce((new.metadata->>'exact_due_reminder')::boolean, false) or new.rule_key like '%_snooze' then return new; end if;
    select exists(select 1 from public.brain_outbox_messages b where b.user_id = new.user_id and b.channel = new.channel
      and b.source_type is distinct from 'workout_rest_timer'
      and b.status in ('queued','claimed','sent') and b.created_at > now() - make_interval(mins => gap_minutes)) into recent;
    if recent then raise exception 'attention_deferred'; end if;
  elsif old.status = 'queued' and new.status = 'claimed' then
    if coalesce((new.metadata->>'exact_due_reminder')::boolean, false) then return new; end if;
    select exists(select 1 from public.brain_outbox_messages b where b.user_id = new.user_id and b.channel = new.channel and b.id <> new.id
      and b.source_type is distinct from 'workout_rest_timer'
      and ((b.status = 'sent' and b.sent_at > now() - make_interval(mins => gap_minutes))
        or (b.status = 'claimed' and b.claimed_at > now() - make_interval(mins => gap_minutes)))) into recent;
    if recent then return null; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_proactive_attention on public.brain_outbox_messages;
create trigger guard_proactive_attention before insert or update of status on public.brain_outbox_messages
for each row execute function public.guard_proactive_attention();
revoke all on function public.guard_proactive_attention() from public, anon, authenticated;

-- Completed non-hour session contributions are applied transactionally on every
-- insert/edit/reopen/delete. Manual total edits rebase the existing total.
create or replace function public.reconcile_project_session_progress()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare old_value numeric := 0; new_value numeric := 0; target_id uuid; target_user uuid;
begin
  if tg_op <> 'INSERT' then
    target_id := old.project_id;
    target_user := old.user_id;
    if old.ended_at is not null then old_value := old.progress_delta; end if;
  end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'UPDATE' and new.project_id <> old.project_id then raise exception 'Move sessions by recreating them in the destination project.'; end if;
    target_id := new.project_id;
    target_user := new.user_id;
    if new.ended_at is not null then new_value := new.progress_delta; end if;
  end if;
  update public.projects set current_value = current_value + new_value - old_value
    where id = target_id and user_id = target_user and goal_type <> 'hours';
  if exists (select 1 from public.projects where id = target_id and user_id = target_user and current_value < 0) then
    raise exception 'Reconcile manual project progress before removing this contribution.';
  end if;
  return null;
end;
$$;
drop trigger if exists reconcile_project_session_progress on public.project_sessions;
create trigger reconcile_project_session_progress after insert or update or delete on public.project_sessions
for each row execute function public.reconcile_project_session_progress();
revoke all on function public.reconcile_project_session_progress() from public, anon, authenticated;

-- Preferences are server-controlled: the browser never supplies a destination.
create table if not exists public.workout_rest_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  duration_seconds integer not null default 120 check (duration_seconds between 15 and 900),
  recipient text,
  last_set_id uuid,
  last_set_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.workout_rest_preferences enable row level security;
revoke all on public.workout_rest_preferences from public, anon, authenticated;
grant all on public.workout_rest_preferences to service_role;

create unique index if not exists workout_rest_one_pending
  on public.brain_outbox_messages(user_id)
  where source_type = 'workout_rest_timer' and status in ('queued', 'claimed');

create or replace function public.schedule_workout_rest_timer(p_set_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.workout_sets;
  p public.workout_rest_preferences;
  due timestamptz;
  next_number integer;
begin
  select * into s from public.workout_sets where id = p_set_id;
  if s.id is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(s.user_id::text || ':workout-rest', 0));
  select * into p from public.workout_rest_preferences where user_id = s.user_id;
  if not coalesce(p.enabled, false) or p.recipient is null then return; end if;
  if exists(select 1 from public.brain_outbox_messages where user_id = s.user_id
    and idempotency_key = 'workout-rest:' || s.id::text) then return; end if;
  if p.last_set_at is not null and s.created_at < p.last_set_at then return; end if;
  if not exists(select 1 from public.workouts where id = s.workout_id and user_id = s.user_id and ended_at is null) then return; end if;
  due := s.created_at + make_interval(secs => p.duration_seconds);
  if due + interval '5 minutes' <= now() then return; end if;
  select coalesce(max(set_number), 0) + 1 into next_number from public.workout_sets
    where workout_id = s.workout_id and user_id = s.user_id and not is_warmup
    and lower(trim(exercise)) = lower(trim(s.exercise)) and set_number < 1000;
  update public.brain_outbox_messages set status = 'cancelled'
    where user_id = s.user_id and source_type = 'workout_rest_timer' and status in ('queued', 'claimed');
  insert into public.brain_outbox_messages(user_id, channel, recipient, body, priority, rule_key,
    source_type, source_id, idempotency_key, scheduled_for, expires_at, metadata)
  values(s.user_id, 'whatsapp', p.recipient,
    'Rest''s over. ' || left(s.exercise, 160) || ' - time for ' ||
      case when s.is_warmup then 'the next set.' else 'set ' || next_number::text || '.' end,
    'high', 'workout.rest_timer', 'workout_rest_timer', s.id::text,
    'workout-rest:' || s.id::text, due, due + interval '5 minutes',
    jsonb_build_object('expected_reply_type', 'notification_only', 'user_armed', true,
      'workout_rest', jsonb_build_object('workout_id', s.workout_id, 'set_id', s.id,
        'exercise', s.exercise, 'next_set_number', case when s.is_warmup then null else next_number end,
        'duration_seconds', p.duration_seconds)));
  update public.workout_rest_preferences set last_set_id = s.id, last_set_at = s.created_at where user_id = s.user_id;
end;
$$;
revoke all on function public.schedule_workout_rest_timer(uuid) from public, anon, authenticated;
grant execute on function public.schedule_workout_rest_timer(uuid) to service_role;

-- Trigger is the durable save boundary, not a second request from a living PWA.
create or replace function public.after_workout_set_rest_timer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Notification failure must never discard the workout set. The subtransaction
  -- also restores the previous timer if replacement fails partway through.
  begin
    perform public.schedule_workout_rest_timer(new.id);
  exception when others then
    raise warning 'workout_rest_schedule_failed SQLSTATE=%', sqlstate;
  end;
  return new;
end;
$$;
revoke all on function public.after_workout_set_rest_timer() from public, anon, authenticated;
drop trigger if exists workout_set_rest_timer on public.workout_sets;
create trigger workout_set_rest_timer after insert on public.workout_sets
  for each row execute function public.after_workout_set_rest_timer();

create or replace function public.cancel_workout_rest_on_close()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.ended_at is not null then
    perform pg_advisory_xact_lock(hashtextextended(old.user_id::text || ':workout-rest', 0));
    update public.brain_outbox_messages set status = 'cancelled'
      where user_id = old.user_id and source_type = 'workout_rest_timer' and status in ('queued', 'claimed')
      and metadata #>> '{workout_rest,workout_id}' = old.id::text;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.cancel_workout_rest_on_close() from public, anon, authenticated;
drop trigger if exists workout_close_rest_timer on public.workouts;
create trigger workout_close_rest_timer before update of ended_at or delete on public.workouts
  for each row execute function public.cancel_workout_rest_on_close();

create or replace function public.control_workout_rest_timer(p_user_id uuid, p_operation text,
  p_recipient text default null, p_set_id uuid default null, p_enabled boolean default null, p_duration integer default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  p public.workout_rest_preferences;
  timer public.brain_outbox_messages;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':workout-rest', 0));
  if p_operation not in ('status','configure','schedule','cancel') then raise exception 'Invalid operation'; end if;
  if p_operation = 'configure' then
    if p_enabled is null or p_duration is null or p_duration not between 15 and 900
      or (p_enabled and coalesce(p_recipient, '') = '') then raise exception 'Invalid rest preferences'; end if;
    insert into public.workout_rest_preferences(user_id, enabled, duration_seconds, recipient)
      values(p_user_id, p_enabled, p_duration, p_recipient)
      on conflict(user_id) do update set enabled = excluded.enabled,
        duration_seconds = excluded.duration_seconds, recipient = coalesce(excluded.recipient, workout_rest_preferences.recipient), updated_at = now();
  end if;
  if p_operation = 'cancel' or (p_operation = 'configure' and not p_enabled) then
    update public.brain_outbox_messages set status = 'cancelled'
      where user_id = p_user_id and source_type = 'workout_rest_timer' and status in ('queued','claimed');
  end if;
  if p_operation = 'schedule' then
    if not exists(select 1 from public.workout_sets where id = p_set_id and user_id = p_user_id) then raise exception 'Set not found'; end if;
    perform public.schedule_workout_rest_timer(p_set_id);
  end if;
  select * into p from public.workout_rest_preferences where user_id = p_user_id;
  select * into timer from public.brain_outbox_messages where user_id = p_user_id
    and source_type = 'workout_rest_timer' and status in ('queued','claimed') and expires_at > now()
    order by created_at desc limit 1;
  return jsonb_build_object('preferences', jsonb_build_object('enabled', coalesce(p.enabled,false),
    'duration_seconds', coalesce(p.duration_seconds,120)), 'timer', case when timer.id is null then null else to_jsonb(timer) end);
end;
$$;
revoke all on function public.control_workout_rest_timer(uuid,text,text,uuid,boolean,integer) from public, anon, authenticated;
grant execute on function public.control_workout_rest_timer(uuid,text,text,uuid,boolean,integer) to service_role;
-- Social Training foundation (generated from targeted migrations).
-- Public identity is explicitly authored; never copy auth metadata or emails.
create table public.user_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-zA-Z][a-zA-Z0-9_]{2,23}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  avatar_url text check (avatar_url is null or (length(avatar_url) <= 1000 and avatar_url ~ '^https://')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index user_profiles_username_ci on public.user_profiles(lower(username));
alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from public, anon, authenticated;
grant select, delete on public.user_profiles to authenticated;
grant insert(user_id,username,display_name,avatar_url), update(username,display_name,avatar_url) on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;
create policy profiles_read on public.user_profiles for select to authenticated using (true);
create policy profiles_insert on public.user_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update on public.user_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy profiles_delete on public.user_profiles for delete to authenticated using ((select auth.uid()) = user_id);
create table public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  language text not null default 'en' check (language in ('en','it')),
  workout_sharing boolean not null default false, share_workout_notes boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from public, anon, authenticated;
grant select, delete on public.user_preferences to authenticated;
grant insert(user_id,language,workout_sharing,share_workout_notes), update(language,workout_sharing,share_workout_notes) on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;
create policy preferences_own on public.user_preferences for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create trigger user_profiles_updated before update on public.user_profiles for each row execute function public.set_updated_at();
create trigger user_preferences_updated before update on public.user_preferences for each row execute function public.set_updated_at();
-- No existing private policies change. Sharing flags publish nothing in Phase 0.
create function public.set_user_preferences(p_language text, p_workout_sharing boolean, p_share_notes boolean)
returns public.user_preferences language sql security invoker set search_path = '' as $$
  insert into public.user_preferences(user_id,language,workout_sharing,share_workout_notes)
  values(auth.uid(),p_language,p_workout_sharing,p_share_notes)
  on conflict(user_id) do update set language=excluded.language,workout_sharing=excluded.workout_sharing,share_workout_notes=excluded.share_workout_notes returning *;
$$;
revoke all on function public.set_user_preferences(text,boolean,boolean) from public, anon;
grant execute on function public.set_user_preferences(text,boolean,boolean) to authenticated;
create function public.save_user_settings(p_username text,p_display_name text,p_language text,p_workout_sharing boolean,p_share_notes boolean)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.user_profiles(user_id,username,display_name) values(auth.uid(),trim(p_username),trim(p_display_name))
  on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name;
  perform public.set_user_preferences(p_language,p_workout_sharing,p_share_notes);
end;
$$;
revoke all on function public.save_user_settings(text,text,text,boolean,boolean) from public, anon;
grant execute on function public.save_user_settings(text,text,text,boolean,boolean) to authenticated;

create table public.exercise_catalog (
  id uuid primary key, slug text not null unique,
  name_en text not null, name_it text not null, category text not null,
  primary_muscle_group text not null, equipment text not null,
  load_type text not null check (load_type in ('total_external','per_implement','machine_display','bodyweight','assistance','none')),
  uses_external_load boolean not null, is_unilateral boolean not null default false,
  leaderboard_eligible boolean not null default false, active boolean not null default true,
  display_order integer not null default 0, created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.exercise_aliases (
  alias text not null, exercise_id uuid not null references public.exercise_catalog(id),
  primary key(alias,exercise_id)
);
alter table public.exercise_catalog enable row level security;
alter table public.exercise_aliases enable row level security;
revoke all on public.exercise_catalog,public.exercise_aliases from public,anon,authenticated;
grant select on public.exercise_catalog,public.exercise_aliases to authenticated;
grant all on public.exercise_catalog,public.exercise_aliases to service_role;
create policy catalog_read on public.exercise_catalog for select to authenticated using(true);
create policy aliases_read on public.exercise_aliases for select to authenticated using(true);
create function public.normalize_exercise_alias(value text) returns text language sql immutable security invoker set search_path='' as $$
  select regexp_replace(lower(trim(translate(value,'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ','AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))),'\s+',' ','g');
$$;
create function public.resolve_exercise_id(value text) returns uuid language sql stable security invoker set search_path='' as $$
  select case when count(distinct exercise_id)=1 then (array_agg(distinct exercise_id))[1] else null end
  from public.exercise_aliases where alias=public.normalize_exercise_alias(value);
$$;
revoke all on function public.normalize_exercise_alias(text),public.resolve_exercise_id(text) from public,anon;
grant execute on function public.normalize_exercise_alias(text),public.resolve_exercise_id(text) to authenticated,service_role;
alter table public.workout_sets add column exercise_id uuid references public.exercise_catalog(id);
alter table public.workout_template_exercises add column exercise_id uuid references public.exercise_catalog(id);
create index workout_sets_exercise_catalog_idx on public.workout_sets(user_id,exercise_id,performed_at desc) where exercise_id is not null;
create index template_exercises_catalog_idx on public.workout_template_exercises(exercise_id) where exercise_id is not null;
-- Catalog seed and cautious backfill are generated below by generate-catalog-migration.js.
insert into public.exercise_catalog(id,slug,name_en,name_it,category,primary_muscle_group,equipment,load_type,uses_external_load,is_unilateral,leaderboard_eligible,active,display_order) values
('1cc54087-1015-58a0-a233-71b5758095ab','barbell_flat_bench_press','Barbell Bench Press','Panca piana con bilanciere','chest','chest','barbell','total_external',true,false,true,true,0),
('105d831d-fa83-5b16-ae2a-c4cbe45a3d42','dumbbell_flat_bench_press','Dumbbell Bench Press','Panca piana con manubri','chest','chest','dumbbell','per_implement',true,false,true,true,1),
('a7488575-614b-5c1d-a005-6df897c5cf57','smith_flat_bench_press','Smith Machine Bench Press','Panca piana alla Smith machine','chest','chest','smith','machine_display',true,false,false,true,2),
('fc0b4fa3-7be8-51f2-ae1b-a7a01ac05c35','machine_chest_press','Chest Press Machine','Chest press alla macchina','chest','chest','machine','machine_display',true,false,false,true,3),
('935aab7c-620f-54f0-a97e-94fc99e35694','barbell_incline_bench_press','Incline Barbell Bench Press','Panca inclinata con bilanciere','chest','chest','barbell','total_external',true,false,true,true,4),
('48bcf475-1824-5586-a253-db461083ad12','dumbbell_incline_bench_press','Incline Dumbbell Press','Panca inclinata con manubri','chest','chest','dumbbell','per_implement',true,false,true,true,5),
('91b98411-1f3a-582e-a369-96a50ae4f048','smith_incline_bench_press','Smith Incline Bench Press','Panca inclinata alla Smith machine','chest','chest','smith','machine_display',true,false,false,true,6),
('38b1ffd0-ef79-589e-a6fb-64c96d7c8f62','machine_incline_chest_press','Incline Chest Press Machine','Chest press inclinata alla macchina','chest','chest','machine','machine_display',true,false,false,true,7),
('add8c056-c413-5acc-ae47-6c604d42cb21','barbell_decline_bench_press','Decline Barbell Bench Press','Panca declinata con bilanciere','chest','chest','barbell','total_external',true,false,false,true,8),
('3945cb86-6733-57da-a0d0-6bf7c6d8437b','dumbbell_decline_bench_press','Decline Dumbbell Bench Press','Panca declinata con manubri','chest','chest','dumbbell','per_implement',true,false,false,true,9),
('f6018cd6-1996-5bad-a059-2c6767ac583b','smith_decline_bench_press','Smith Decline Bench Press','Panca declinata alla Smith machine','chest','chest','smith','machine_display',true,false,false,true,10),
('b17b768a-34b1-5c78-ae16-e0979784ac07','dumbbell_flat_fly','Flat Dumbbell Fly','Croci su panca piana con manubri','chest','chest','dumbbell','per_implement',true,false,false,true,11),
('a0715eef-3198-57fa-a914-54a611826029','dumbbell_incline_fly','Incline Dumbbell Fly','Croci su panca inclinata con manubri','chest','chest','dumbbell','per_implement',true,false,false,true,12),
('a7a546f3-a00f-5e68-ad0a-b0872a68f647','dumbbell_decline_fly','Decline Dumbbell Fly','Croci su panca declinata con manubri','chest','chest','dumbbell','per_implement',true,false,false,true,13),
('6e66ff29-09ec-5f29-a105-19c3ff9f0913','pec_deck','Pec Deck Fly','Croci alla pec deck','chest','chest','machine','machine_display',true,false,false,true,14),
('fa47a745-4dc1-57ff-a5e3-738efaf4848c','cable_standing_fly','Standing Cable Fly','Croci ai cavi in piedi','chest','chest','cable','machine_display',true,false,false,true,15),
('6762f8f7-5b36-5afa-a214-b3800dc9d77e','cable_high_to_low_fly','High-to-Low Cable Fly','Croci ai cavi dall''alto','chest','chest','cable','machine_display',true,false,false,true,16),
('d7edadbe-18eb-56bf-a40f-9ef18640db8c','cable_low_to_high_fly','Low-to-High Cable Fly','Croci ai cavi dal basso','chest','chest','cable','machine_display',true,false,false,true,17),
('ded1fb4d-d234-55d5-aa75-2a45f72f51e3','cable_flat_bench_fly','Flat Bench Cable Fly','Croci ai cavi su panca piana','chest','chest','cable','machine_display',true,false,false,true,18),
('a3e4fc26-d893-5e3d-a7cf-7af66438a0b8','push_up','Push-Up','Piegamenti a terra','chest','chest','bodyweight','bodyweight',false,false,false,true,19),
('b90c0a37-87f2-51e5-ae01-cac0a76a61d1','incline_push_up','Incline Push-Up','Piegamenti con mani rialzate','chest','chest','bodyweight','bodyweight',false,false,false,true,20),
('6bfd9c3a-90cd-5ba5-a9d8-d4073dd720e5','decline_push_up','Decline Push-Up','Piegamenti con piedi rialzati','chest','chest','bodyweight','bodyweight',false,false,false,true,21),
('305ef29c-35a0-5df7-a3cf-cee62b800971','chest_dip','Chest Dip','Dip alle parallele per il petto','chest','chest','bodyweight','bodyweight',false,false,false,true,22),
('a03ce3e0-ad2c-51d1-a106-94257af34ca1','assisted_chest_dip','Assisted Chest Dip','Dip assistiti per il petto','chest','chest','assisted_machine','assistance',true,false,false,true,23),
('8074aafd-fb70-532a-aa98-b1b0a2d32742','dumbbell_squeeze_press','Dumbbell Squeeze Press','Squeeze press con manubri','chest','chest','dumbbell','per_implement',true,false,false,true,24),
('da58b184-0044-5e3f-ae76-e3582252e46a','barbell_bent_over_row','Barbell Bent-Over Row','Rematore con bilanciere','back','back','barbell','total_external',true,false,false,true,25),
('e0469469-0dd5-5637-a716-b6238a89ca4b','barbell_pendlay_row','Pendlay Row','Rematore Pendlay','back','back','barbell','total_external',true,false,false,true,26),
('7ba86bc1-1eed-594c-a837-0f6356913c16','barbell_underhand_row','Underhand Barbell Row','Rematore con bilanciere presa supina','back','back','barbell','total_external',true,false,false,true,27),
('0215dd44-2a47-5cde-a3dc-eb76a0bafd84','dumbbell_one_arm_row','One-Arm Dumbbell Row','Rematore con manubrio a un braccio','back','back','dumbbell','per_implement',true,true,false,true,28),
('bcd533bd-2ecf-5537-ae71-21b96b796df9','dumbbell_bent_over_row','Dumbbell Bent-Over Row','Rematore con due manubri','back','back','dumbbell','per_implement',true,false,false,true,29),
('37045b40-b0d8-5ea9-a13d-c42f598856eb','dumbbell_chest_supported_row','Chest-Supported Dumbbell Row','Rematore con manubri su panca inclinata','back','back','dumbbell','per_implement',true,false,false,true,30),
('0cd0a66f-9401-5ef4-adf6-69adc80ea934','machine_chest_supported_row','Chest-Supported Machine Row','Rematore alla macchina con appoggio al petto','back','back','machine','machine_display',true,false,false,true,31),
('82993261-9c3d-5347-ab88-d92febeb7fa9','machine_high_row','Machine High Row','High row alla macchina','back','back','machine','machine_display',true,false,false,true,32),
('1d627c60-56bc-57c8-a814-3a0cd5005871','machine_low_row','Machine Low Row','Low row alla macchina','back','back','machine','machine_display',true,false,false,true,33),
('d203f0c4-df22-529d-a10d-831a60f46eca','t_bar_row','T-Bar Row','Rematore T-bar','back','back','landmine','total_external',true,false,false,true,34),
('625749a8-c40e-5246-aa13-fb60a979f46d','chest_supported_t_bar_row','Chest-Supported T-Bar Row','Rematore T-bar con appoggio al petto','back','back','machine','machine_display',true,false,false,true,35),
('430842ab-04fe-5be8-a9ea-702039107ef1','seated_cable_row','Seated Cable Row','Rematore al cavo da seduto','back','back','cable','machine_display',true,false,false,true,36),
('f5f8757a-feb0-5f3c-ac4e-6e787bbba6c7','wide_grip_cable_row','Wide-Grip Cable Row','Rematore al cavo presa larga','back','back','cable','machine_display',true,false,false,true,37),
('811ace33-23e5-5ad1-adab-f9c007186f8d','one_arm_cable_row','One-Arm Cable Row','Rematore al cavo a un braccio','back','back','cable','machine_display',true,true,false,true,38),
('d06e5b68-65ff-5f89-a89a-0a3d0934741c','lat_pulldown','Lat Pulldown','Lat machine presa prona','back','back','cable','machine_display',true,false,false,true,39),
('f78c9154-64b9-5c2a-ad8e-6f05ace8a718','wide_grip_lat_pulldown','Wide-Grip Lat Pulldown','Lat machine presa larga','back','back','cable','machine_display',true,false,false,true,40),
('e5dc1730-7452-5a26-a47c-fc7b1c629eca','close_neutral_lat_pulldown','Close Neutral-Grip Lat Pulldown','Lat machine presa neutra stretta','back','back','cable','machine_display',true,false,false,true,41),
('26f1b64f-605d-5ca3-a635-fa8ff26ea38f','underhand_lat_pulldown','Underhand Lat Pulldown','Lat machine presa supina','back','back','cable','machine_display',true,false,false,true,42),
('163c4d83-5dcc-5070-a2d7-dd5b6303a2f5','one_arm_lat_pulldown','One-Arm Lat Pulldown','Lat machine a un braccio','back','back','cable','machine_display',true,true,false,true,43),
('9894f0d2-515a-54ad-a974-67d5805fd039','machine_pullover','Machine Pullover','Pullover alla macchina','back','back','machine','machine_display',true,false,false,true,44),
('cad12f5d-5e6b-5aac-a63e-1d2b08764f6c','cable_straight_arm_pulldown','Straight-Arm Cable Pulldown','Pulldown a braccia tese al cavo','back','back','cable','machine_display',true,false,false,true,45),
('8bb2415b-65fe-51dc-aca0-2794d1888da9','dumbbell_pullover','Dumbbell Pullover','Pullover con manubrio','back','back','dumbbell','per_implement',true,false,false,true,46),
('a8ba7081-912a-522c-a15e-0e26fa620d87','pull_up','Pull-Up','Trazioni presa prona','back','back','bodyweight','bodyweight',false,false,false,true,47),
('d24c6a0e-d75c-5fe6-a57a-085a2edd0548','chin_up','Chin-Up','Trazioni presa supina','back','back','bodyweight','bodyweight',false,false,false,true,48),
('2c38df75-414b-55a8-aa32-c2a71316b85a','neutral_grip_pull_up','Neutral-Grip Pull-Up','Trazioni presa neutra','back','back','bodyweight','bodyweight',false,false,false,true,49),
('51db11f0-99a2-5c29-a833-793991eefd64','assisted_pull_up','Assisted Pull-Up','Trazioni assistite presa prona','back','back','assisted_machine','assistance',true,false,false,true,50),
('a9ae56f6-5259-51b9-a83b-e09d2d346e24','inverted_row','Inverted Row','Rematore inverso a corpo libero','back','back','bodyweight','bodyweight',false,false,false,true,51),
('4563772a-f40e-56c7-aaae-1eba834040c2','back_extension','Back Extension','Estensioni lombari','back','back','bodyweight','bodyweight',false,false,false,true,52),
('37772a76-cb6a-5e58-a03d-8a941150a153','reverse_hyperextension','Reverse Hyperextension','Iperestensioni inverse','back','back','machine','machine_display',true,false,false,true,53),
('aae76572-4960-5292-abb9-191d25e29e96','smith_bent_over_row','Smith Machine Row','Rematore alla Smith machine','back','back','smith','machine_display',true,false,false,true,54),
('82a56e16-9d21-5844-a4ff-e0bf668522c7','barbell_overhead_press','Standing Barbell Overhead Press','Lento avanti in piedi con bilanciere','shoulders','shoulders','barbell','total_external',true,false,true,true,55),
('95c31e3e-cee7-5d0c-a12f-7354073e6e7a','seated_barbell_overhead_press','Seated Barbell Overhead Press','Lento avanti seduto con bilanciere','shoulders','shoulders','barbell','total_external',true,false,false,true,56),
('b5eaef8f-9359-528a-a6e6-331e0e0dbf7b','standing_dumbbell_press','Standing Dumbbell Shoulder Press','Lento avanti in piedi con manubri','shoulders','shoulders','dumbbell','per_implement',true,false,false,true,57),
('432de433-c657-54fa-a8ba-2515fc62ad3e','seated_dumbbell_press','Seated Dumbbell Shoulder Press','Lento avanti seduto con manubri','shoulders','shoulders','dumbbell','per_implement',true,false,false,true,58),
('7296184d-133f-5bee-aae2-57012b492a80','arnold_press','Arnold Press','Arnold press','shoulders','shoulders','dumbbell','per_implement',true,false,false,true,59),
('2c143d3a-27f4-50de-a91d-3ea09f94d104','smith_shoulder_press','Smith Machine Shoulder Press','Lento avanti alla Smith machine','shoulders','shoulders','smith','machine_display',true,false,false,true,60),
('fa9cb5ff-5906-53c0-a064-8b34e8dd1e9d','machine_shoulder_press','Machine Shoulder Press','Shoulder press alla macchina','shoulders','shoulders','machine','machine_display',true,false,false,true,61),
('fd3490ff-3c5a-53c7-ad55-aadf7a2ee95a','one_arm_landmine_press','One-Arm Landmine Press','Landmine press a un braccio','shoulders','shoulders','landmine','total_external',true,true,false,true,62),
('ce3f9b76-9854-5de7-a998-5c6070b07298','dumbbell_lateral_raise','Dumbbell Lateral Raise','Alzate laterali con manubri','shoulders','shoulders','dumbbell','per_implement',true,false,false,true,63),
('6231da37-73a4-5d69-a28e-a2a492dbb02b','seated_dumbbell_lateral_raise','Seated Dumbbell Lateral Raise','Alzate laterali seduto con manubri','shoulders','shoulders','dumbbell','per_implement',true,false,false,true,64),
('450e38a1-5e0b-56d2-a735-3af5883fd7a6','one_arm_cable_lateral_raise','One-Arm Cable Lateral Raise','Alzata laterale al cavo a un braccio','shoulders','shoulders','cable','machine_display',true,true,false,true,65),
('6bcc52bc-cdd4-554b-a26a-e734abadd58e','machine_lateral_raise','Machine Lateral Raise','Alzate laterali alla macchina','shoulders','shoulders','machine','machine_display',true,false,false,true,66),
('5fed719b-b632-53f9-a519-dffa7337eadf','dumbbell_front_raise','Dumbbell Front Raise','Alzate frontali con manubri','shoulders','shoulders','dumbbell','per_implement',true,false,false,true,67),
('253e6500-5e68-55b7-ac0e-d109d2e29d21','barbell_front_raise','Barbell Front Raise','Alzate frontali con bilanciere','shoulders','shoulders','barbell','total_external',true,false,false,true,68),
('d6bc2ad5-0475-55de-a921-cf86991b1504','cable_front_raise','Cable Front Raise','Alzate frontali al cavo','shoulders','shoulders','cable','machine_display',true,false,false,true,69),
('acc9e0a2-065c-595a-a632-3fdf5ee55bd7','plate_front_raise','Plate Front Raise','Alzate frontali con disco','shoulders','shoulders','plate','total_external',true,false,false,true,70),
('e90adea6-35a7-5f3f-a074-f0575874955b','dumbbell_rear_delt_fly','Bent-Over Dumbbell Rear Delt Fly','Alzate posteriori busto flesso con manubri','shoulders','shoulders','dumbbell','per_implement',true,false,false,true,71),
('3d18573d-d2b6-5299-a907-8742c52ee591','incline_rear_delt_fly','Incline Bench Rear Delt Fly','Alzate posteriori con manubri su panca inclinata','shoulders','shoulders','dumbbell','per_implement',true,false,false,true,72),
('12b70d67-9a68-50a0-a2b9-2bbc4d997ce2','reverse_pec_deck','Reverse Pec Deck','Croci inverse alla pec deck','shoulders','shoulders','machine','machine_display',true,false,false,true,73),
('cbbe07dc-4bab-5bba-ab68-4bbcfa2d28d9','cable_reverse_fly','Cable Reverse Fly','Croci inverse ai cavi','shoulders','shoulders','cable','machine_display',true,false,false,true,74),
('9d85514e-36c5-5d88-a607-74923920a173','cable_face_pull','Cable Face Pull','Face pull al cavo','shoulders','shoulders','cable','machine_display',true,false,false,true,75),
('b9940c4d-2443-5763-a276-5db3b8dd4bb7','barbell_upright_row','Barbell Upright Row','Tirate al mento con bilanciere','shoulders','shoulders','barbell','total_external',true,false,false,true,76),
('bfbd7bb1-3d7a-5b1d-a992-3ada81d66351','cable_upright_row','Cable Upright Row','Tirate al mento al cavo','shoulders','shoulders','cable','machine_display',true,false,false,true,77),
('2d281141-dceb-5d6c-a6d4-2802dd9e3d51','barbell_shrug','Barbell Shrug','Scrollate con bilanciere','shoulders','shoulders','barbell','total_external',true,false,false,true,78),
('39ca76ef-80b5-5470-aea4-c98d078792bc','dumbbell_shrug','Dumbbell Shrug','Scrollate con manubri','shoulders','shoulders','dumbbell','per_implement',true,false,false,true,79),
('860c2371-8592-5ad9-aa43-805984020e52','barbell_curl','Barbell Curl','Curl con bilanciere dritto','biceps','biceps','barbell','total_external',true,false,false,true,80),
('a2bc1c95-14c7-558d-a56b-0973cc4793dd','ez_bar_curl','EZ-Bar Curl','Curl con bilanciere EZ','biceps','biceps','ez_bar','total_external',true,false,false,true,81),
('fdaea492-4089-5fb8-a165-77fcab7745fe','dumbbell_curl','Dumbbell Curl','Curl con manubri','biceps','biceps','dumbbell','per_implement',true,false,false,true,82),
('2e3858ec-27a1-5d37-a34b-9cf1ebe73dc9','alternating_dumbbell_curl','Alternating Dumbbell Curl','Curl alternato con manubri','biceps','biceps','dumbbell','per_implement',true,true,false,true,83),
('809ab105-99f3-57ab-ab0a-54244aab3268','incline_dumbbell_curl','Incline Dumbbell Curl','Curl con manubri su panca inclinata','biceps','biceps','dumbbell','per_implement',true,false,false,true,84),
('f42e2dd8-0945-5d24-afc9-b08f5a9d5d60','hammer_curl','Hammer Curl','Curl a martello con manubri','biceps','biceps','dumbbell','per_implement',true,false,false,true,85),
('f2cb08af-46a3-5a99-ae33-7b67a595fe84','cross_body_hammer_curl','Cross-Body Hammer Curl','Curl a martello incrociato','biceps','biceps','dumbbell','per_implement',true,false,false,true,86),
('f7bd0ac8-b15c-5c55-a4e9-4932c91577bc','concentration_curl','Concentration Curl','Curl concentrato con manubrio','biceps','biceps','dumbbell','per_implement',true,true,false,true,87),
('66edb80e-e354-5871-a98e-63888b05b2b5','ez_preacher_curl','EZ-Bar Preacher Curl','Curl alla panca Scott con bilanciere EZ','biceps','biceps','ez_bar','total_external',true,false,false,true,88),
('c727c590-a024-5731-a16b-fe55cd926edf','dumbbell_preacher_curl','Dumbbell Preacher Curl','Curl alla panca Scott con manubrio','biceps','biceps','dumbbell','per_implement',true,false,false,true,89),
('82e7c6cd-695c-5870-a82c-8a3055d22bf1','machine_preacher_curl','Machine Preacher Curl','Curl alla macchina Scott','biceps','biceps','machine','machine_display',true,false,false,true,90),
('cc369d6a-0813-5c17-abe3-ed511d30529b','cable_curl','Cable Curl','Curl al cavo basso','biceps','biceps','cable','machine_display',true,false,false,true,91),
('084847dd-d72d-51ba-a7ee-1153ff392510','cable_rope_hammer_curl','Cable Rope Hammer Curl','Curl a martello al cavo con corda','biceps','biceps','cable','machine_display',true,false,false,true,92),
('63c7feed-add7-5bb9-a753-f919bdfb1c17','bayesian_cable_curl','Bayesian Cable Curl','Curl bayesiano al cavo','biceps','biceps','cable','machine_display',true,true,false,true,93),
('b0b0079b-49bf-5a56-a205-823d1a9abd44','high_cable_curl','High Cable Curl','Curl ai cavi alti','biceps','biceps','cable','machine_display',true,false,false,true,94),
('9f5739d5-4f9e-5018-a546-97058be889f2','spider_curl','Dumbbell Spider Curl','Spider curl con manubri','biceps','biceps','dumbbell','per_implement',true,false,false,true,95),
('7bc874be-2966-5a24-ac99-e849999f7d0b','reverse_barbell_curl','Reverse Barbell Curl','Curl inverso con bilanciere','biceps','biceps','barbell','total_external',true,false,false,true,96),
('2caf0c3d-cdd2-5b41-a2e8-dbb66241fadb','zottman_curl','Zottman Curl','Curl Zottman','biceps','biceps','dumbbell','per_implement',true,false,false,true,97),
('816290d8-e53e-5e0f-ab0a-c651dd9568e3','close_grip_barbell_bench','Close-Grip Barbell Bench Press','Panca presa stretta con bilanciere','triceps','triceps','barbell','total_external',true,false,false,true,98),
('d093f72d-0b54-5c73-a941-c34359b5d640','ez_skull_crusher','EZ-Bar Skull Crusher','French press su panca con bilanciere EZ','triceps','triceps','ez_bar','total_external',true,false,false,true,99),
('2a35ef7a-4b68-5f22-aaba-d162c839b361','dumbbell_skull_crusher','Dumbbell Skull Crusher','French press su panca con manubri','triceps','triceps','dumbbell','per_implement',true,false,false,true,100),
('9f32af6f-44a3-50e1-adbe-762baae0653c','seated_dumbbell_overhead_extension','Seated Dumbbell Overhead Triceps Extension','Estensione tricipiti sopra la testa con un manubrio','triceps','triceps','dumbbell','per_implement',true,false,false,true,101),
('2feee85c-7a83-5c32-a2f6-63c55d5a2002','one_arm_dumbbell_overhead_extension','One-Arm Dumbbell Overhead Triceps Extension','Estensione tricipiti sopra la testa a un braccio con manubrio','triceps','triceps','dumbbell','per_implement',true,true,false,true,102),
('14a94b27-9532-5321-a14f-0caa99dab5cf','cable_rope_pushdown','Rope Triceps Pushdown','Pushdown tricipiti con corda','triceps','triceps','cable','machine_display',true,false,false,true,103),
('38ccc681-8e90-5f10-ad9b-81a868c522a9','cable_bar_pushdown','Straight-Bar Triceps Pushdown','Pushdown tricipiti con barra dritta','triceps','triceps','cable','machine_display',true,false,false,true,104),
('e7500760-9b13-5f82-a68f-358fd5ccc54c','cable_v_bar_pushdown','V-Bar Triceps Pushdown','Pushdown tricipiti con barra a V','triceps','triceps','cable','machine_display',true,false,false,true,105),
('5c30166c-8817-5088-ab6b-69479695d2f8','cable_reverse_grip_pushdown','Reverse-Grip Triceps Pushdown','Pushdown tricipiti presa inversa','triceps','triceps','cable','machine_display',true,false,false,true,106),
('940f1cb7-7b5a-5846-a392-d91faf414010','one_arm_cable_pushdown','One-Arm Cable Pushdown','Pushdown al cavo a un braccio','triceps','triceps','cable','machine_display',true,true,false,true,107),
('d70d27b9-3741-54e9-a43a-509505f7500f','cable_rope_overhead_extension','Rope Overhead Triceps Extension','Estensioni tricipiti sopra la testa al cavo con corda','triceps','triceps','cable','machine_display',true,false,false,true,108),
('6f1756da-6a85-5f7f-a3dd-473d06cc832a','one_arm_cable_overhead_extension','One-Arm Cable Overhead Triceps Extension','Estensione tricipiti sopra la testa al cavo a un braccio','triceps','triceps','cable','machine_display',true,true,false,true,109),
('90a2f37e-403a-58bf-a33c-ec1b487686cf','dumbbell_kickback','Dumbbell Triceps Kickback','Kickback tricipiti con manubrio','triceps','triceps','dumbbell','per_implement',true,true,false,true,110),
('bbe0817f-7ef8-5d0b-ae8d-a62e8a106f02','cable_kickback','Cable Triceps Kickback','Kickback tricipiti al cavo','triceps','triceps','cable','machine_display',true,true,false,true,111),
('d5a92286-e3a8-578c-ad2d-c0f69cf41eb7','machine_triceps_extension','Machine Triceps Extension','Estensioni tricipiti alla macchina','triceps','triceps','machine','machine_display',true,false,false,true,112),
('a0668b86-0f1b-5b95-a174-3e5de39729de','machine_triceps_dip','Machine Triceps Dip','Dip tricipiti alla macchina','triceps','triceps','machine','machine_display',true,false,false,true,113),
('122c601f-cb3c-5763-a745-e51b6fcb99bd','triceps_dip','Triceps Dip','Dip alle parallele per tricipiti','triceps','triceps','bodyweight','bodyweight',false,false,false,true,114),
('62322eaf-54ef-5c34-af59-77bb3af21c53','bench_dip','Bench Dip','Dip su panca','triceps','triceps','bodyweight','bodyweight',false,false,false,true,115),
('20f8c129-7853-5472-a8cb-8daae4d094b5','diamond_push_up','Diamond Push-Up','Piegamenti a diamante','triceps','triceps','bodyweight','bodyweight',false,false,false,true,116),
('e2dec2a6-b890-5d82-a005-5dbe224ca857','ez_overhead_triceps_extension','EZ-Bar Overhead Triceps Extension','Estensioni tricipiti sopra la testa con bilanciere EZ','triceps','triceps','ez_bar','total_external',true,false,false,true,117),
('a80406cd-3458-57b5-a1e9-f8d1ca4bd5e3','barbell_back_squat','Barbell Back Squat','Squat con bilanciere sulla schiena','quadriceps','quadriceps','barbell','total_external',true,false,true,true,118),
('bcd65ad5-aba9-5657-aff4-4473aa6d55fb','barbell_front_squat','Barbell Front Squat','Front squat con bilanciere','quadriceps','quadriceps','barbell','total_external',true,false,true,true,119),
('44296ec4-36a7-5d71-a303-dabd51b6e4e2','smith_squat','Smith Machine Squat','Squat alla Smith machine','quadriceps','quadriceps','smith','machine_display',true,false,false,true,120),
('d6d48e9c-d4b1-5b02-adfb-99ca3f45bfa3','hack_squat','Hack Squat Machine','Hack squat alla macchina','quadriceps','quadriceps','machine','machine_display',true,false,false,true,121),
('ce50cbe1-4388-5ca1-ab84-059031d356f4','leg_press_45','45-Degree Leg Press','Leg press a 45 gradi','quadriceps','quadriceps','machine','machine_display',true,false,false,true,122),
('fd78ec18-b4b3-587a-a65b-827347826fff','horizontal_leg_press','Horizontal Leg Press','Leg press orizzontale','quadriceps','quadriceps','machine','machine_display',true,false,false,true,123),
('79c7e92c-5d9c-5f03-a820-8e39c51949ab','single_leg_press','Single-Leg Press','Leg press a una gamba','quadriceps','quadriceps','machine','machine_display',true,true,false,true,124),
('9533b032-9ed4-56d1-afb2-2acb81375063','leg_extension','Leg Extension','Leg extension','quadriceps','quadriceps','machine','machine_display',true,false,false,true,125),
('02f64994-e1df-54d1-ab34-62b57684aa56','single_leg_extension','Single-Leg Extension','Leg extension a una gamba','quadriceps','quadriceps','machine','machine_display',true,true,false,true,126),
('f27a9c0e-a5b3-5037-a931-f0f7387c9927','goblet_squat','Goblet Squat','Goblet squat con kettlebell','quadriceps','quadriceps','kettlebell','per_implement',true,false,false,true,127),
('04424729-06f2-5207-ad9f-6bd8920da049','dumbbell_goblet_squat','Dumbbell Goblet Squat','Goblet squat con manubrio','quadriceps','quadriceps','dumbbell','per_implement',true,false,false,true,128),
('bfe309cd-356f-5572-a782-44dcbfc44072','dumbbell_bulgarian_split_squat','Dumbbell Bulgarian Split Squat','Squat bulgaro con manubri','quadriceps','quadriceps','dumbbell','per_implement',true,true,false,true,129),
('b56f0ecd-b6e6-5e0f-a37f-ed8daf1db1ae','barbell_split_squat','Barbell Split Squat','Split squat con bilanciere','quadriceps','quadriceps','barbell','total_external',true,false,false,true,130),
('f338d7c1-732a-5f87-a98b-6bbc1981c0ed','dumbbell_walking_lunge','Dumbbell Walking Lunge','Affondi camminati con manubri','quadriceps','quadriceps','dumbbell','per_implement',true,true,false,true,131),
('547b6d18-d7aa-52db-a1c0-6ed08d0e05e3','barbell_walking_lunge','Barbell Walking Lunge','Affondi camminati con bilanciere','quadriceps','quadriceps','barbell','total_external',true,true,false,true,132),
('11f11f53-cfd3-5c3e-a8d4-2a661f749982','dumbbell_reverse_lunge','Dumbbell Reverse Lunge','Affondi indietro con manubri','quadriceps','quadriceps','dumbbell','per_implement',true,true,false,true,133),
('f103ca1a-6b52-53ad-ab64-dc9ce00f978c','dumbbell_step_up','Dumbbell Step-Up','Step-up con manubri','quadriceps','quadriceps','dumbbell','per_implement',true,true,false,true,134),
('54fca1ce-5846-56c9-a753-ac19ba56dc7a','bodyweight_squat','Bodyweight Squat','Squat a corpo libero','quadriceps','quadriceps','bodyweight','bodyweight',false,false,false,true,135),
('dc177d42-4df4-5cb8-a015-35440bcc9b7b','sissy_squat','Sissy Squat','Sissy squat a corpo libero','quadriceps','quadriceps','bodyweight','bodyweight',false,false,false,true,136),
('afb49bfc-0fc4-5b01-a218-5bed2bf00b89','belt_squat','Belt Squat','Squat con cintura','quadriceps','quadriceps','machine','machine_display',true,false,false,true,137),
('47bc2be2-f2fa-5ba4-aab4-4656352cd573','barbell_romanian_deadlift','Barbell Romanian Deadlift','Stacco rumeno con bilanciere','hamstrings','hamstrings','barbell','total_external',true,false,true,true,138),
('96d0c122-2dce-52a4-a9ff-4063982a8664','dumbbell_romanian_deadlift','Dumbbell Romanian Deadlift','Stacco rumeno con manubri','hamstrings','hamstrings','dumbbell','per_implement',true,false,false,true,139),
('d80104f9-671e-5b61-a67d-454f9cb7750c','single_leg_dumbbell_rdl','Single-Leg Dumbbell Romanian Deadlift','Stacco rumeno a una gamba con manubri','hamstrings','hamstrings','dumbbell','per_implement',true,true,false,true,140),
('2a46e115-8de4-578b-ade0-c9eae164075a','smith_romanian_deadlift','Smith Romanian Deadlift','Stacco rumeno alla Smith machine','hamstrings','hamstrings','smith','machine_display',true,false,false,true,141),
('7a00c907-adf5-5201-a3ba-825838985351','seated_leg_curl','Seated Leg Curl','Leg curl da seduto','hamstrings','hamstrings','machine','machine_display',true,false,false,true,142),
('15573f6b-27f4-535e-a379-882e2ce2216a','lying_leg_curl','Lying Leg Curl','Leg curl da sdraiato','hamstrings','hamstrings','machine','machine_display',true,false,false,true,143),
('7c0bffb2-960c-589a-aa0b-0122d2006ee2','standing_leg_curl','Standing Leg Curl','Leg curl in piedi a una gamba','hamstrings','hamstrings','machine','machine_display',true,false,false,true,144),
('2281b609-3795-539c-a04a-c90d811b0c32','nordic_curl','Nordic Hamstring Curl','Nordic curl','hamstrings','hamstrings','bodyweight','bodyweight',false,false,false,true,145),
('7ab11a97-a654-50e6-a62c-b5077d44a98f','glute_ham_raise','Glute-Ham Raise','Glute-ham raise','hamstrings','hamstrings','bodyweight','bodyweight',false,false,false,true,146),
('2cd9b8f0-e3c8-5a62-adb2-59266a73ba00','barbell_good_morning','Barbell Good Morning','Good morning con bilanciere','hamstrings','hamstrings','barbell','total_external',true,false,false,true,147),
('57eb93b3-1b43-5c0f-ab3b-099341b5396e','stability_ball_leg_curl','Stability Ball Leg Curl','Leg curl su fitball','hamstrings','hamstrings','bodyweight','bodyweight',false,false,false,true,148),
('f7336a66-8b25-54e5-a8ae-306fcd50a682','slider_leg_curl','Slider Leg Curl','Leg curl con slider','hamstrings','hamstrings','bodyweight','bodyweight',false,false,false,true,149),
('1af9b188-f135-5cc4-ad75-f531311944f8','barbell_hip_thrust','Barbell Hip Thrust','Hip thrust con bilanciere','glutes','glutes','barbell','total_external',true,false,false,true,150),
('395b5ea8-827e-51df-a191-6e4443715c93','smith_hip_thrust','Smith Hip Thrust','Hip thrust alla Smith machine','glutes','glutes','smith','machine_display',true,false,false,true,151),
('eb1bad43-918a-59ff-aff5-1ef57e59df81','machine_hip_thrust','Machine Hip Thrust','Hip thrust alla macchina','glutes','glutes','machine','machine_display',true,false,false,true,152),
('5eb0bef9-15cc-5773-acf3-0a05b6a65682','bodyweight_glute_bridge','Glute Bridge','Ponte glutei a corpo libero','glutes','glutes','bodyweight','bodyweight',false,false,false,true,153),
('2ead17a6-79b8-5ce5-a1c8-c1246a21d878','barbell_glute_bridge','Barbell Glute Bridge','Ponte glutei con bilanciere','glutes','glutes','barbell','total_external',true,false,false,true,154),
('aeac8807-ffba-5fb7-a2fb-0c0889cc043e','single_leg_glute_bridge','Single-Leg Glute Bridge','Ponte glutei a una gamba','glutes','glutes','bodyweight','bodyweight',false,true,false,true,155),
('4eca8ed0-f3ef-5416-affb-8f73b027dbe9','cable_glute_kickback','Cable Glute Kickback','Slancio posteriore al cavo per glutei','glutes','glutes','cable','machine_display',true,true,false,true,156),
('7c8d6641-2989-5c60-a5ea-e92ee77436f1','machine_glute_kickback','Machine Glute Kickback','Slancio posteriore alla macchina per glutei','glutes','glutes','machine','machine_display',true,true,false,true,157),
('0e2cd342-f310-50cb-af2a-839967c25098','machine_hip_abduction','Machine Hip Abduction','Abduzioni delle anche alla macchina','glutes','glutes','machine','machine_display',true,false,false,true,158),
('72b9633c-0bac-5e31-abe8-0d4d032b709a','cable_hip_abduction','Cable Hip Abduction','Abduzione dell''anca al cavo','glutes','glutes','cable','machine_display',true,true,false,true,159),
('4b3269b3-5e95-53c2-ae0e-948c76cf374b','machine_hip_adduction','Machine Hip Adduction','Adduzioni delle anche alla macchina','glutes','glutes','machine','machine_display',true,false,false,true,160),
('3095fa8a-78ff-53ec-a4cd-88ddf7d109a9','cable_hip_adduction','Cable Hip Adduction','Adduzione dell''anca al cavo','glutes','glutes','cable','machine_display',true,true,false,true,161),
('908a3514-2beb-5eae-ab02-6ccb0c30797e','cable_pull_through','Cable Pull-Through','Pull-through al cavo','glutes','glutes','cable','machine_display',true,false,false,true,162),
('80d9e17c-549f-5b00-a057-d4a09d2e0789','dumbbell_lateral_lunge','Dumbbell Lateral Lunge','Affondi laterali con manubri','glutes','glutes','dumbbell','per_implement',true,true,false,true,163),
('dd07f6d6-67c4-515a-abc9-813ab55c13af','sumo_dumbbell_squat','Dumbbell Sumo Squat','Squat sumo con manubrio','glutes','glutes','dumbbell','per_implement',true,false,false,true,164),
('9feecd11-69fb-5d5c-ad9b-f7934c5cdcf4','frog_pump','Frog Pump','Frog pump a corpo libero','glutes','glutes','bodyweight','bodyweight',false,false,false,true,165),
('8eb22ab6-e62d-5c09-ac2c-053943e0129a','standing_calf_raise_machine','Standing Machine Calf Raise','Calf raise in piedi alla macchina','calves','calves','machine','machine_display',true,false,false,true,166),
('3b81e126-fdee-5aa3-a42e-9839d56fff69','seated_calf_raise_machine','Seated Machine Calf Raise','Calf raise seduto alla macchina','calves','calves','machine','machine_display',true,false,false,true,167),
('50336fa7-be25-5902-a585-d1ca89fbf800','leg_press_calf_raise','Leg Press Calf Raise','Calf raise alla leg press','calves','calves','machine','machine_display',true,false,false,true,168),
('d4e1482c-6a44-5064-a778-f7775ce24286','smith_calf_raise','Smith Machine Calf Raise','Calf raise alla Smith machine','calves','calves','smith','machine_display',true,false,false,true,169),
('95f3c075-a060-5f08-a15e-29474b0664bb','single_leg_dumbbell_calf_raise','Single-Leg Dumbbell Calf Raise','Calf raise a una gamba con manubrio','calves','calves','dumbbell','per_implement',true,true,false,true,170),
('2238f9ca-7938-59f8-ada5-0d7b3f4b08c4','bodyweight_calf_raise','Bodyweight Calf Raise','Calf raise a corpo libero','calves','calves','bodyweight','bodyweight',false,false,false,true,171),
('0ad1bee4-46dc-545d-a545-2fc2c06c326a','donkey_calf_raise','Donkey Calf Raise Machine','Donkey calf raise alla macchina','calves','calves','machine','machine_display',true,false,false,true,172),
('2ee6113e-7cca-56fc-ac3d-0fcb1e5559bb','tibialis_raise','Tibialis Raise','Sollevamenti per il tibiale anteriore','calves','calves','bodyweight','bodyweight',false,false,false,true,173),
('759c121e-465a-5c9d-ab18-a4026067efbe','crunch','Crunch','Crunch a terra','core','core','bodyweight','bodyweight',false,false,false,true,174),
('029bb821-c8ee-53ef-aff8-999a25c8db27','reverse_crunch','Reverse Crunch','Crunch inverso','core','core','bodyweight','bodyweight',false,false,false,true,175),
('d3342787-aa09-57a0-a0b1-1258639313e0','cable_crunch','Cable Crunch','Crunch al cavo','core','core','cable','machine_display',true,false,false,true,176),
('7c82e813-45f9-5f30-a122-3814bbf55be3','machine_crunch','Machine Crunch','Crunch alla macchina','core','core','machine','machine_display',true,false,false,true,177),
('f780b20c-3f8f-5173-aa9d-68c382e53a06','decline_sit_up','Decline Sit-Up','Sit-up su panca declinata','core','core','bodyweight','bodyweight',false,false,false,true,178),
('515dae8c-cef0-5239-ae78-c65edb22f8ec','hanging_knee_raise','Hanging Knee Raise','Sollevamento ginocchia alla sbarra','core','core','bodyweight','bodyweight',false,false,false,true,179),
('8aac2c8a-8b6a-50d5-ade1-efe52e6ea6e1','hanging_leg_raise','Hanging Leg Raise','Sollevamento gambe alla sbarra','core','core','bodyweight','bodyweight',false,false,false,true,180),
('af0ea26c-2b21-58cf-a3da-391644df1f09','captains_chair_knee_raise','Captain''s Chair Knee Raise','Sollevamento ginocchia alle parallele con appoggio','core','core','bodyweight','bodyweight',false,false,false,true,181),
('48dddda8-6d9d-5cb3-a097-27b095d6255d','lying_leg_raise','Lying Leg Raise','Sollevamento gambe da sdraiato','core','core','bodyweight','bodyweight',false,false,false,true,182),
('bc454d71-dcb9-5624-afcf-01384aa37e99','plank','Plank','Plank','core','core','bodyweight','bodyweight',false,false,false,true,183),
('aec19e49-9aac-5381-ab8c-fc5e6ca1d666','side_plank','Side Plank','Plank laterale','core','core','bodyweight','bodyweight',false,false,false,true,184),
('f556eaf5-4910-528c-ae00-668af7b54777','ab_wheel_rollout','Ab Wheel Rollout','Rollout con ruota addominale','core','core','bodyweight','bodyweight',false,false,false,true,185),
('43399ec9-394f-5d5f-a753-66a1deae79a6','barbell_rollout','Barbell Rollout','Rollout con bilanciere','core','core','barbell','total_external',true,false,false,true,186),
('7ce44f59-6389-56d8-a546-059f6e76eacd','dead_bug','Dead Bug','Dead bug','core','core','bodyweight','bodyweight',false,false,false,true,187),
('312d6568-122b-5148-a2fa-e3d76508e675','bird_dog','Bird Dog','Bird dog','core','core','bodyweight','bodyweight',false,false,false,true,188),
('715dbc79-860d-57a7-ae1f-d0af0a7f89a2','pallof_press','Pallof Press','Pallof press al cavo','core','core','cable','machine_display',true,false,false,true,189),
('e9f2b48f-3756-5327-a966-476fffbf2d64','cable_woodchop','Cable Woodchop','Woodchop al cavo','core','core','cable','machine_display',true,false,false,true,190),
('eb2ecba7-7020-5a0b-aad3-fbaccfc26e52','machine_torso_rotation','Machine Torso Rotation','Rotazioni del busto alla macchina','core','core','machine','machine_display',true,false,false,true,191),
('bd46e26f-1e14-555c-a2e2-1636a402b319','weighted_russian_twist','Plate Russian Twist','Russian twist con disco','core','core','plate','total_external',true,false,false,true,192),
('b06dc1e3-5377-5269-a21b-444d797e2d61','bicycle_crunch','Bicycle Crunch','Crunch a bicicletta','core','core','bodyweight','bodyweight',false,false,false,true,193),
('35718ff9-95bb-54bc-a90a-5a360760966f','mountain_climber','Mountain Climber','Mountain climber','core','core','bodyweight','bodyweight',false,false,false,true,194),
('c8b8334f-9ab2-5433-a8e2-c2428ba48d22','hollow_body_hold','Hollow Body Hold','Tenuta hollow body','core','core','bodyweight','bodyweight',false,false,false,true,195),
('7c33bbc8-f318-521d-ab5d-a5f98898a10c','v_up','V-Up','Chiusure a V','core','core','bodyweight','bodyweight',false,false,false,true,196),
('ea27ea8c-071d-5dbd-ad21-082ab4122c25','heel_touch','Heel Touch','Tocchi ai talloni','core','core','bodyweight','bodyweight',false,false,false,true,197),
('a86f8780-5640-5ab9-a932-b08e0784d56a','stability_ball_crunch','Stability Ball Crunch','Crunch su fitball','core','core','bodyweight','bodyweight',false,false,false,true,198),
('1473748c-8263-5f13-aeb1-70f63d40e227','barbell_deadlift','Conventional Barbell Deadlift','Stacco da terra convenzionale','full_body','full_body','barbell','total_external',true,false,true,true,199),
('710298b6-cc06-5852-a37e-d22d83268b55','barbell_sumo_deadlift','Sumo Barbell Deadlift','Stacco da terra sumo','full_body','full_body','barbell','total_external',true,false,true,true,200),
('cafd875e-530c-5265-a9c5-709ade665348','trap_bar_deadlift','Trap-Bar Deadlift','Stacco con trap bar','full_body','full_body','trap_bar','total_external',true,false,false,true,201),
('a8bc1772-451b-5dcd-ad59-0b36d56a7744','barbell_rack_pull','Barbell Rack Pull','Stacco dai blocchi con bilanciere','full_body','full_body','barbell','total_external',true,false,false,true,202),
('3d4551d7-175f-52fb-a59c-664e02dafe9e','kettlebell_swing','Two-Hand Kettlebell Swing','Swing con kettlebell a due mani','full_body','full_body','kettlebell','per_implement',true,false,false,true,203),
('21255c15-55eb-5a6d-a8a1-d40f63c0aef7','one_arm_kettlebell_swing','One-Arm Kettlebell Swing','Swing con kettlebell a un braccio','full_body','full_body','kettlebell','per_implement',true,true,false,true,204),
('04a182c5-9abc-5508-aba2-1fdaa6de8712','kettlebell_clean','Kettlebell Clean','Girata con kettlebell','full_body','full_body','kettlebell','per_implement',true,false,false,true,205),
('33f33387-1ecc-542c-af40-c867359dd52b','kettlebell_snatch','Kettlebell Snatch','Strappo con kettlebell','full_body','full_body','kettlebell','per_implement',true,false,false,true,206),
('5500eb22-61fe-55c8-a64a-29b3d6d6b541','turkish_get_up','Turkish Get-Up','Turkish get-up con kettlebell','full_body','full_body','kettlebell','per_implement',true,false,false,true,207),
('5c6ee939-b54e-5274-a945-54230cd1fdd6','barbell_power_clean','Barbell Power Clean','Girata al petto in semipiegata','full_body','full_body','barbell','total_external',true,false,false,true,208),
('b368e2d7-8e41-5582-a9df-3399d85b5adb','barbell_push_press','Barbell Push Press','Push press con bilanciere','full_body','full_body','barbell','total_external',true,false,false,true,209),
('5ec07302-16c4-5c39-a72b-ecbcb9aef7c6','barbell_thruster','Barbell Thruster','Thruster con bilanciere','full_body','full_body','barbell','total_external',true,false,false,true,210),
('feed090d-7a7d-598a-a9c6-41799775f477','dumbbell_thruster','Dumbbell Thruster','Thruster con manubri','full_body','full_body','dumbbell','per_implement',true,false,false,true,211),
('8f3eb8d5-8bca-51b8-a12e-d0515cabbf75','burpee','Burpee','Burpee','full_body','full_body','bodyweight','bodyweight',false,false,false,true,212),
('0013ee67-39d3-5cf3-ad80-639e55123878','farmers_carry','Dumbbell Farmer''s Carry','Camminata del contadino con manubri','full_body','full_body','dumbbell','per_implement',true,false,false,true,213),
('045f8e3f-df0f-59da-a7b8-a2a6a8edcabd','sled_push','Sled Push','Spinta della slitta','full_body','full_body','sled','total_external',true,false,false,true,214),
('2a8258ac-d54f-5198-a489-71ac25e74f23','sled_drag','Sled Drag','Traino della slitta','full_body','full_body','sled','total_external',true,false,false,true,215),
('5534ba02-f2b9-5abb-a711-7de376b359df','battle_rope_waves','Battle Rope Waves','Onde con battle rope','full_body','full_body','rope','none',false,false,false,true,216)
on conflict(id) do nothing;
insert into public.exercise_aliases(alias,exercise_id) values
('barbell bench press','1cc54087-1015-58a0-a233-71b5758095ab'),
('panca piana con bilanciere','1cc54087-1015-58a0-a233-71b5758095ab'),
('bb bench press','1cc54087-1015-58a0-a233-71b5758095ab'),
('panca piana bilanciere','1cc54087-1015-58a0-a233-71b5758095ab'),
('bench press','1cc54087-1015-58a0-a233-71b5758095ab'),
('dumbbell bench press','105d831d-fa83-5b16-ae2a-c4cbe45a3d42'),
('panca piana con manubri','105d831d-fa83-5b16-ae2a-c4cbe45a3d42'),
('db bench press','105d831d-fa83-5b16-ae2a-c4cbe45a3d42'),
('dumbell bench press','105d831d-fa83-5b16-ae2a-c4cbe45a3d42'),
('panca con manubri','105d831d-fa83-5b16-ae2a-c4cbe45a3d42'),
('bench press','105d831d-fa83-5b16-ae2a-c4cbe45a3d42'),
('smith machine bench press','a7488575-614b-5c1d-a005-6df897c5cf57'),
('panca piana alla smith machine','a7488575-614b-5c1d-a005-6df897c5cf57'),
('chest press machine','fc0b4fa3-7be8-51f2-ae1b-a7a01ac05c35'),
('chest press alla macchina','fc0b4fa3-7be8-51f2-ae1b-a7a01ac05c35'),
('incline barbell bench press','935aab7c-620f-54f0-a97e-94fc99e35694'),
('panca inclinata con bilanciere','935aab7c-620f-54f0-a97e-94fc99e35694'),
('incline dumbbell press','48bcf475-1824-5586-a253-db461083ad12'),
('panca inclinata con manubri','48bcf475-1824-5586-a253-db461083ad12'),
('incline db press','48bcf475-1824-5586-a253-db461083ad12'),
('smith incline bench press','91b98411-1f3a-582e-a369-96a50ae4f048'),
('panca inclinata alla smith machine','91b98411-1f3a-582e-a369-96a50ae4f048'),
('incline chest press machine','38b1ffd0-ef79-589e-a6fb-64c96d7c8f62'),
('chest press inclinata alla macchina','38b1ffd0-ef79-589e-a6fb-64c96d7c8f62'),
('decline barbell bench press','add8c056-c413-5acc-ae47-6c604d42cb21'),
('panca declinata con bilanciere','add8c056-c413-5acc-ae47-6c604d42cb21'),
('decline dumbbell bench press','3945cb86-6733-57da-a0d0-6bf7c6d8437b'),
('panca declinata con manubri','3945cb86-6733-57da-a0d0-6bf7c6d8437b'),
('smith decline bench press','f6018cd6-1996-5bad-a059-2c6767ac583b'),
('panca declinata alla smith machine','f6018cd6-1996-5bad-a059-2c6767ac583b'),
('flat dumbbell fly','b17b768a-34b1-5c78-ae16-e0979784ac07'),
('croci su panca piana con manubri','b17b768a-34b1-5c78-ae16-e0979784ac07'),
('incline dumbbell fly','a0715eef-3198-57fa-a914-54a611826029'),
('croci su panca inclinata con manubri','a0715eef-3198-57fa-a914-54a611826029'),
('decline dumbbell fly','a7a546f3-a00f-5e68-ad0a-b0872a68f647'),
('croci su panca declinata con manubri','a7a546f3-a00f-5e68-ad0a-b0872a68f647'),
('pec deck fly','6e66ff29-09ec-5f29-a105-19c3ff9f0913'),
('croci alla pec deck','6e66ff29-09ec-5f29-a105-19c3ff9f0913'),
('standing cable fly','fa47a745-4dc1-57ff-a5e3-738efaf4848c'),
('croci ai cavi in piedi','fa47a745-4dc1-57ff-a5e3-738efaf4848c'),
('high-to-low cable fly','6762f8f7-5b36-5afa-a214-b3800dc9d77e'),
('croci ai cavi dall''alto','6762f8f7-5b36-5afa-a214-b3800dc9d77e'),
('low-to-high cable fly','d7edadbe-18eb-56bf-a40f-9ef18640db8c'),
('croci ai cavi dal basso','d7edadbe-18eb-56bf-a40f-9ef18640db8c'),
('flat bench cable fly','ded1fb4d-d234-55d5-aa75-2a45f72f51e3'),
('croci ai cavi su panca piana','ded1fb4d-d234-55d5-aa75-2a45f72f51e3'),
('push-up','a3e4fc26-d893-5e3d-a7cf-7af66438a0b8'),
('piegamenti a terra','a3e4fc26-d893-5e3d-a7cf-7af66438a0b8'),
('incline push-up','b90c0a37-87f2-51e5-ae01-cac0a76a61d1'),
('piegamenti con mani rialzate','b90c0a37-87f2-51e5-ae01-cac0a76a61d1'),
('decline push-up','6bfd9c3a-90cd-5ba5-a9d8-d4073dd720e5'),
('piegamenti con piedi rialzati','6bfd9c3a-90cd-5ba5-a9d8-d4073dd720e5'),
('chest dip','305ef29c-35a0-5df7-a3cf-cee62b800971'),
('dip alle parallele per il petto','305ef29c-35a0-5df7-a3cf-cee62b800971'),
('assisted chest dip','a03ce3e0-ad2c-51d1-a106-94257af34ca1'),
('dip assistiti per il petto','a03ce3e0-ad2c-51d1-a106-94257af34ca1'),
('dumbbell squeeze press','8074aafd-fb70-532a-aa98-b1b0a2d32742'),
('squeeze press con manubri','8074aafd-fb70-532a-aa98-b1b0a2d32742'),
('barbell bent-over row','da58b184-0044-5e3f-ae76-e3582252e46a'),
('rematore con bilanciere','da58b184-0044-5e3f-ae76-e3582252e46a'),
('pendlay row','e0469469-0dd5-5637-a716-b6238a89ca4b'),
('rematore pendlay','e0469469-0dd5-5637-a716-b6238a89ca4b'),
('underhand barbell row','7ba86bc1-1eed-594c-a837-0f6356913c16'),
('rematore con bilanciere presa supina','7ba86bc1-1eed-594c-a837-0f6356913c16'),
('one-arm dumbbell row','0215dd44-2a47-5cde-a3dc-eb76a0bafd84'),
('rematore con manubrio a un braccio','0215dd44-2a47-5cde-a3dc-eb76a0bafd84'),
('dumbbell bent-over row','bcd533bd-2ecf-5537-ae71-21b96b796df9'),
('rematore con due manubri','bcd533bd-2ecf-5537-ae71-21b96b796df9'),
('chest-supported dumbbell row','37045b40-b0d8-5ea9-a13d-c42f598856eb'),
('rematore con manubri su panca inclinata','37045b40-b0d8-5ea9-a13d-c42f598856eb'),
('chest-supported machine row','0cd0a66f-9401-5ef4-adf6-69adc80ea934'),
('rematore alla macchina con appoggio al petto','0cd0a66f-9401-5ef4-adf6-69adc80ea934'),
('machine high row','82993261-9c3d-5347-ab88-d92febeb7fa9'),
('high row alla macchina','82993261-9c3d-5347-ab88-d92febeb7fa9'),
('machine low row','1d627c60-56bc-57c8-a814-3a0cd5005871'),
('low row alla macchina','1d627c60-56bc-57c8-a814-3a0cd5005871'),
('t-bar row','d203f0c4-df22-529d-a10d-831a60f46eca'),
('rematore t-bar','d203f0c4-df22-529d-a10d-831a60f46eca'),
('chest-supported t-bar row','625749a8-c40e-5246-aa13-fb60a979f46d'),
('rematore t-bar con appoggio al petto','625749a8-c40e-5246-aa13-fb60a979f46d'),
('seated cable row','430842ab-04fe-5be8-a9ea-702039107ef1'),
('rematore al cavo da seduto','430842ab-04fe-5be8-a9ea-702039107ef1'),
('wide-grip cable row','f5f8757a-feb0-5f3c-ac4e-6e787bbba6c7'),
('rematore al cavo presa larga','f5f8757a-feb0-5f3c-ac4e-6e787bbba6c7'),
('one-arm cable row','811ace33-23e5-5ad1-adab-f9c007186f8d'),
('rematore al cavo a un braccio','811ace33-23e5-5ad1-adab-f9c007186f8d'),
('pulley singolo','811ace33-23e5-5ad1-adab-f9c007186f8d'),
('lat pulldown','d06e5b68-65ff-5f89-a89a-0a3d0934741c'),
('lat machine presa prona','d06e5b68-65ff-5f89-a89a-0a3d0934741c'),
('lat pulldowns','d06e5b68-65ff-5f89-a89a-0a3d0934741c'),
('wide-grip lat pulldown','f78c9154-64b9-5c2a-ad8e-6f05ace8a718'),
('lat machine presa larga','f78c9154-64b9-5c2a-ad8e-6f05ace8a718'),
('close neutral-grip lat pulldown','e5dc1730-7452-5a26-a47c-fc7b1c629eca'),
('lat machine presa neutra stretta','e5dc1730-7452-5a26-a47c-fc7b1c629eca'),
('underhand lat pulldown','26f1b64f-605d-5ca3-a635-fa8ff26ea38f'),
('lat machine presa supina','26f1b64f-605d-5ca3-a635-fa8ff26ea38f'),
('one-arm lat pulldown','163c4d83-5dcc-5070-a2d7-dd5b6303a2f5'),
('lat machine a un braccio','163c4d83-5dcc-5070-a2d7-dd5b6303a2f5'),
('single hand pulldown','163c4d83-5dcc-5070-a2d7-dd5b6303a2f5'),
('machine pullover','9894f0d2-515a-54ad-a974-67d5805fd039'),
('pullover alla macchina','9894f0d2-515a-54ad-a974-67d5805fd039'),
('straight-arm cable pulldown','cad12f5d-5e6b-5aac-a63e-1d2b08764f6c'),
('pulldown a braccia tese al cavo','cad12f5d-5e6b-5aac-a63e-1d2b08764f6c'),
('dumbbell pullover','8bb2415b-65fe-51dc-aca0-2794d1888da9'),
('pullover con manubrio','8bb2415b-65fe-51dc-aca0-2794d1888da9'),
('pull-up','a8ba7081-912a-522c-a15e-0e26fa620d87'),
('trazioni presa prona','a8ba7081-912a-522c-a15e-0e26fa620d87'),
('pull ups','a8ba7081-912a-522c-a15e-0e26fa620d87'),
('chin-up','d24c6a0e-d75c-5fe6-a57a-085a2edd0548'),
('trazioni presa supina','d24c6a0e-d75c-5fe6-a57a-085a2edd0548'),
('neutral-grip pull-up','2c38df75-414b-55a8-aa32-c2a71316b85a'),
('trazioni presa neutra','2c38df75-414b-55a8-aa32-c2a71316b85a'),
('assisted pull-up','51db11f0-99a2-5c29-a833-793991eefd64'),
('trazioni assistite presa prona','51db11f0-99a2-5c29-a833-793991eefd64'),
('inverted row','a9ae56f6-5259-51b9-a83b-e09d2d346e24'),
('rematore inverso a corpo libero','a9ae56f6-5259-51b9-a83b-e09d2d346e24'),
('back extension','4563772a-f40e-56c7-aaae-1eba834040c2'),
('estensioni lombari','4563772a-f40e-56c7-aaae-1eba834040c2'),
('reverse hyperextension','37772a76-cb6a-5e58-a03d-8a941150a153'),
('iperestensioni inverse','37772a76-cb6a-5e58-a03d-8a941150a153'),
('smith machine row','aae76572-4960-5292-abb9-191d25e29e96'),
('rematore alla smith machine','aae76572-4960-5292-abb9-191d25e29e96'),
('standing barbell overhead press','82a56e16-9d21-5844-a4ff-e0bf668522c7'),
('lento avanti in piedi con bilanciere','82a56e16-9d21-5844-a4ff-e0bf668522c7'),
('military press','82a56e16-9d21-5844-a4ff-e0bf668522c7'),
('seated barbell overhead press','95c31e3e-cee7-5d0c-a12f-7354073e6e7a'),
('lento avanti seduto con bilanciere','95c31e3e-cee7-5d0c-a12f-7354073e6e7a'),
('standing dumbbell shoulder press','b5eaef8f-9359-528a-a6e6-331e0e0dbf7b'),
('lento avanti in piedi con manubri','b5eaef8f-9359-528a-a6e6-331e0e0dbf7b'),
('seated dumbbell shoulder press','432de433-c657-54fa-a8ba-2515fc62ad3e'),
('lento avanti seduto con manubri','432de433-c657-54fa-a8ba-2515fc62ad3e'),
('military press','432de433-c657-54fa-a8ba-2515fc62ad3e'),
('arnold press','7296184d-133f-5bee-aae2-57012b492a80'),
('smith machine shoulder press','2c143d3a-27f4-50de-a91d-3ea09f94d104'),
('lento avanti alla smith machine','2c143d3a-27f4-50de-a91d-3ea09f94d104'),
('machine shoulder press','fa9cb5ff-5906-53c0-a064-8b34e8dd1e9d'),
('shoulder press alla macchina','fa9cb5ff-5906-53c0-a064-8b34e8dd1e9d'),
('one-arm landmine press','fd3490ff-3c5a-53c7-ad55-aadf7a2ee95a'),
('landmine press a un braccio','fd3490ff-3c5a-53c7-ad55-aadf7a2ee95a'),
('dumbbell lateral raise','ce3f9b76-9854-5de7-a998-5c6070b07298'),
('alzate laterali con manubri','ce3f9b76-9854-5de7-a998-5c6070b07298'),
('lateral raises','ce3f9b76-9854-5de7-a998-5c6070b07298'),
('seated dumbbell lateral raise','6231da37-73a4-5d69-a28e-a2a492dbb02b'),
('alzate laterali seduto con manubri','6231da37-73a4-5d69-a28e-a2a492dbb02b'),
('one-arm cable lateral raise','450e38a1-5e0b-56d2-a735-3af5883fd7a6'),
('alzata laterale al cavo a un braccio','450e38a1-5e0b-56d2-a735-3af5883fd7a6'),
('lateral raises','450e38a1-5e0b-56d2-a735-3af5883fd7a6'),
('machine lateral raise','6bcc52bc-cdd4-554b-a26a-e734abadd58e'),
('alzate laterali alla macchina','6bcc52bc-cdd4-554b-a26a-e734abadd58e'),
('dumbbell front raise','5fed719b-b632-53f9-a519-dffa7337eadf'),
('alzate frontali con manubri','5fed719b-b632-53f9-a519-dffa7337eadf'),
('barbell front raise','253e6500-5e68-55b7-ac0e-d109d2e29d21'),
('alzate frontali con bilanciere','253e6500-5e68-55b7-ac0e-d109d2e29d21'),
('cable front raise','d6bc2ad5-0475-55de-a921-cf86991b1504'),
('alzate frontali al cavo','d6bc2ad5-0475-55de-a921-cf86991b1504'),
('plate front raise','acc9e0a2-065c-595a-a632-3fdf5ee55bd7'),
('alzate frontali con disco','acc9e0a2-065c-595a-a632-3fdf5ee55bd7'),
('bent-over dumbbell rear delt fly','e90adea6-35a7-5f3f-a074-f0575874955b'),
('alzate posteriori busto flesso con manubri','e90adea6-35a7-5f3f-a074-f0575874955b'),
('incline bench rear delt fly','3d18573d-d2b6-5299-a907-8742c52ee591'),
('alzate posteriori con manubri su panca inclinata','3d18573d-d2b6-5299-a907-8742c52ee591'),
('reverse pec deck','12b70d67-9a68-50a0-a2b9-2bbc4d997ce2'),
('croci inverse alla pec deck','12b70d67-9a68-50a0-a2b9-2bbc4d997ce2'),
('cable reverse fly','cbbe07dc-4bab-5bba-ab68-4bbcfa2d28d9'),
('croci inverse ai cavi','cbbe07dc-4bab-5bba-ab68-4bbcfa2d28d9'),
('cable face pull','9d85514e-36c5-5d88-a607-74923920a173'),
('face pull al cavo','9d85514e-36c5-5d88-a607-74923920a173'),
('barbell upright row','b9940c4d-2443-5763-a276-5db3b8dd4bb7'),
('tirate al mento con bilanciere','b9940c4d-2443-5763-a276-5db3b8dd4bb7'),
('cable upright row','bfbd7bb1-3d7a-5b1d-a992-3ada81d66351'),
('tirate al mento al cavo','bfbd7bb1-3d7a-5b1d-a992-3ada81d66351'),
('barbell shrug','2d281141-dceb-5d6c-a6d4-2802dd9e3d51'),
('scrollate con bilanciere','2d281141-dceb-5d6c-a6d4-2802dd9e3d51'),
('dumbbell shrug','39ca76ef-80b5-5470-aea4-c98d078792bc'),
('scrollate con manubri','39ca76ef-80b5-5470-aea4-c98d078792bc'),
('barbell curl','860c2371-8592-5ad9-aa43-805984020e52'),
('curl con bilanciere dritto','860c2371-8592-5ad9-aa43-805984020e52'),
('ez-bar curl','a2bc1c95-14c7-558d-a56b-0973cc4793dd'),
('curl con bilanciere ez','a2bc1c95-14c7-558d-a56b-0973cc4793dd'),
('dumbbell curl','fdaea492-4089-5fb8-a165-77fcab7745fe'),
('curl con manubri','fdaea492-4089-5fb8-a165-77fcab7745fe'),
('alternating dumbbell curl','2e3858ec-27a1-5d37-a34b-9cf1ebe73dc9'),
('curl alternato con manubri','2e3858ec-27a1-5d37-a34b-9cf1ebe73dc9'),
('incline dumbbell curl','809ab105-99f3-57ab-ab0a-54244aab3268'),
('curl con manubri su panca inclinata','809ab105-99f3-57ab-ab0a-54244aab3268'),
('hammer curl','f42e2dd8-0945-5d24-afc9-b08f5a9d5d60'),
('curl a martello con manubri','f42e2dd8-0945-5d24-afc9-b08f5a9d5d60'),
('cross-body hammer curl','f2cb08af-46a3-5a99-ae33-7b67a595fe84'),
('curl a martello incrociato','f2cb08af-46a3-5a99-ae33-7b67a595fe84'),
('concentration curl','f7bd0ac8-b15c-5c55-a4e9-4932c91577bc'),
('curl concentrato con manubrio','f7bd0ac8-b15c-5c55-a4e9-4932c91577bc'),
('ez-bar preacher curl','66edb80e-e354-5871-a98e-63888b05b2b5'),
('curl alla panca scott con bilanciere ez','66edb80e-e354-5871-a98e-63888b05b2b5'),
('dumbbell preacher curl','c727c590-a024-5731-a16b-fe55cd926edf'),
('curl alla panca scott con manubrio','c727c590-a024-5731-a16b-fe55cd926edf'),
('machine preacher curl','82e7c6cd-695c-5870-a82c-8a3055d22bf1'),
('curl alla macchina scott','82e7c6cd-695c-5870-a82c-8a3055d22bf1'),
('cable curl','cc369d6a-0813-5c17-abe3-ed511d30529b'),
('curl al cavo basso','cc369d6a-0813-5c17-abe3-ed511d30529b'),
('cable rope hammer curl','084847dd-d72d-51ba-a7ee-1153ff392510'),
('curl a martello al cavo con corda','084847dd-d72d-51ba-a7ee-1153ff392510'),
('bayesian cable curl','63c7feed-add7-5bb9-a753-f919bdfb1c17'),
('curl bayesiano al cavo','63c7feed-add7-5bb9-a753-f919bdfb1c17'),
('high cable curl','b0b0079b-49bf-5a56-a205-823d1a9abd44'),
('curl ai cavi alti','b0b0079b-49bf-5a56-a205-823d1a9abd44'),
('dumbbell spider curl','9f5739d5-4f9e-5018-a546-97058be889f2'),
('spider curl con manubri','9f5739d5-4f9e-5018-a546-97058be889f2'),
('reverse barbell curl','7bc874be-2966-5a24-ac99-e849999f7d0b'),
('curl inverso con bilanciere','7bc874be-2966-5a24-ac99-e849999f7d0b'),
('zottman curl','2caf0c3d-cdd2-5b41-a2e8-dbb66241fadb'),
('curl zottman','2caf0c3d-cdd2-5b41-a2e8-dbb66241fadb'),
('close-grip barbell bench press','816290d8-e53e-5e0f-ab0a-c651dd9568e3'),
('panca presa stretta con bilanciere','816290d8-e53e-5e0f-ab0a-c651dd9568e3'),
('ez-bar skull crusher','d093f72d-0b54-5c73-a941-c34359b5d640'),
('french press su panca con bilanciere ez','d093f72d-0b54-5c73-a941-c34359b5d640'),
('dumbbell skull crusher','2a35ef7a-4b68-5f22-aaba-d162c839b361'),
('french press su panca con manubri','2a35ef7a-4b68-5f22-aaba-d162c839b361'),
('seated dumbbell overhead triceps extension','9f32af6f-44a3-50e1-adbe-762baae0653c'),
('estensione tricipiti sopra la testa con un manubrio','9f32af6f-44a3-50e1-adbe-762baae0653c'),
('one-arm dumbbell overhead triceps extension','2feee85c-7a83-5c32-a2f6-63c55d5a2002'),
('estensione tricipiti sopra la testa a un braccio con manubrio','2feee85c-7a83-5c32-a2f6-63c55d5a2002'),
('rope triceps pushdown','14a94b27-9532-5321-a14f-0caa99dab5cf'),
('pushdown tricipiti con corda','14a94b27-9532-5321-a14f-0caa99dab5cf'),
('rope pushdown','14a94b27-9532-5321-a14f-0caa99dab5cf'),
('straight-bar triceps pushdown','38ccc681-8e90-5f10-ad9b-81a868c522a9'),
('pushdown tricipiti con barra dritta','38ccc681-8e90-5f10-ad9b-81a868c522a9'),
('v-bar triceps pushdown','e7500760-9b13-5f82-a68f-358fd5ccc54c'),
('pushdown tricipiti con barra a v','e7500760-9b13-5f82-a68f-358fd5ccc54c'),
('reverse-grip triceps pushdown','5c30166c-8817-5088-ab6b-69479695d2f8'),
('pushdown tricipiti presa inversa','5c30166c-8817-5088-ab6b-69479695d2f8'),
('one-arm cable pushdown','940f1cb7-7b5a-5846-a392-d91faf414010'),
('pushdown al cavo a un braccio','940f1cb7-7b5a-5846-a392-d91faf414010'),
('rope overhead triceps extension','d70d27b9-3741-54e9-a43a-509505f7500f'),
('estensioni tricipiti sopra la testa al cavo con corda','d70d27b9-3741-54e9-a43a-509505f7500f'),
('one-arm cable overhead triceps extension','6f1756da-6a85-5f7f-a3dd-473d06cc832a'),
('estensione tricipiti sopra la testa al cavo a un braccio','6f1756da-6a85-5f7f-a3dd-473d06cc832a'),
('dumbbell triceps kickback','90a2f37e-403a-58bf-a33c-ec1b487686cf'),
('kickback tricipiti con manubrio','90a2f37e-403a-58bf-a33c-ec1b487686cf'),
('cable triceps kickback','bbe0817f-7ef8-5d0b-ae8d-a62e8a106f02'),
('kickback tricipiti al cavo','bbe0817f-7ef8-5d0b-ae8d-a62e8a106f02'),
('machine triceps extension','d5a92286-e3a8-578c-ad2d-c0f69cf41eb7'),
('estensioni tricipiti alla macchina','d5a92286-e3a8-578c-ad2d-c0f69cf41eb7'),
('machine triceps dip','a0668b86-0f1b-5b95-a174-3e5de39729de'),
('dip tricipiti alla macchina','a0668b86-0f1b-5b95-a174-3e5de39729de'),
('triceps dip','122c601f-cb3c-5763-a745-e51b6fcb99bd'),
('dip alle parallele per tricipiti','122c601f-cb3c-5763-a745-e51b6fcb99bd'),
('bench dip','62322eaf-54ef-5c34-af59-77bb3af21c53'),
('dip su panca','62322eaf-54ef-5c34-af59-77bb3af21c53'),
('diamond push-up','20f8c129-7853-5472-a8cb-8daae4d094b5'),
('piegamenti a diamante','20f8c129-7853-5472-a8cb-8daae4d094b5'),
('ez-bar overhead triceps extension','e2dec2a6-b890-5d82-a005-5dbe224ca857'),
('estensioni tricipiti sopra la testa con bilanciere ez','e2dec2a6-b890-5d82-a005-5dbe224ca857'),
('barbell back squat','a80406cd-3458-57b5-a1e9-f8d1ca4bd5e3'),
('squat con bilanciere sulla schiena','a80406cd-3458-57b5-a1e9-f8d1ca4bd5e3'),
('barbell squat','a80406cd-3458-57b5-a1e9-f8d1ca4bd5e3'),
('back squat','a80406cd-3458-57b5-a1e9-f8d1ca4bd5e3'),
('barbell front squat','bcd65ad5-aba9-5657-aff4-4473aa6d55fb'),
('front squat con bilanciere','bcd65ad5-aba9-5657-aff4-4473aa6d55fb'),
('smith machine squat','44296ec4-36a7-5d71-a303-dabd51b6e4e2'),
('squat alla smith machine','44296ec4-36a7-5d71-a303-dabd51b6e4e2'),
('hack squat machine','d6d48e9c-d4b1-5b02-adfb-99ca3f45bfa3'),
('hack squat alla macchina','d6d48e9c-d4b1-5b02-adfb-99ca3f45bfa3'),
('45-degree leg press','ce50cbe1-4388-5ca1-ab84-059031d356f4'),
('leg press a 45 gradi','ce50cbe1-4388-5ca1-ab84-059031d356f4'),
('horizontal leg press','fd78ec18-b4b3-587a-a65b-827347826fff'),
('leg press orizzontale','fd78ec18-b4b3-587a-a65b-827347826fff'),
('single-leg press','79c7e92c-5d9c-5f03-a820-8e39c51949ab'),
('leg press a una gamba','79c7e92c-5d9c-5f03-a820-8e39c51949ab'),
('leg extension','9533b032-9ed4-56d1-afb2-2acb81375063'),
('single-leg extension','02f64994-e1df-54d1-ab34-62b57684aa56'),
('leg extension a una gamba','02f64994-e1df-54d1-ab34-62b57684aa56'),
('goblet squat','f27a9c0e-a5b3-5037-a931-f0f7387c9927'),
('goblet squat con kettlebell','f27a9c0e-a5b3-5037-a931-f0f7387c9927'),
('dumbbell goblet squat','04424729-06f2-5207-ad9f-6bd8920da049'),
('goblet squat con manubrio','04424729-06f2-5207-ad9f-6bd8920da049'),
('dumbbell bulgarian split squat','bfe309cd-356f-5572-a782-44dcbfc44072'),
('squat bulgaro con manubri','bfe309cd-356f-5572-a782-44dcbfc44072'),
('barbell split squat','b56f0ecd-b6e6-5e0f-a37f-ed8daf1db1ae'),
('split squat con bilanciere','b56f0ecd-b6e6-5e0f-a37f-ed8daf1db1ae'),
('dumbbell walking lunge','f338d7c1-732a-5f87-a98b-6bbc1981c0ed'),
('affondi camminati con manubri','f338d7c1-732a-5f87-a98b-6bbc1981c0ed'),
('barbell walking lunge','547b6d18-d7aa-52db-a1c0-6ed08d0e05e3'),
('affondi camminati con bilanciere','547b6d18-d7aa-52db-a1c0-6ed08d0e05e3'),
('dumbbell reverse lunge','11f11f53-cfd3-5c3e-a8d4-2a661f749982'),
('affondi indietro con manubri','11f11f53-cfd3-5c3e-a8d4-2a661f749982'),
('dumbbell step-up','f103ca1a-6b52-53ad-ab64-dc9ce00f978c'),
('step-up con manubri','f103ca1a-6b52-53ad-ab64-dc9ce00f978c'),
('bodyweight squat','54fca1ce-5846-56c9-a753-ac19ba56dc7a'),
('squat a corpo libero','54fca1ce-5846-56c9-a753-ac19ba56dc7a'),
('sissy squat','dc177d42-4df4-5cb8-a015-35440bcc9b7b'),
('sissy squat a corpo libero','dc177d42-4df4-5cb8-a015-35440bcc9b7b'),
('belt squat','afb49bfc-0fc4-5b01-a218-5bed2bf00b89'),
('squat con cintura','afb49bfc-0fc4-5b01-a218-5bed2bf00b89'),
('barbell romanian deadlift','47bc2be2-f2fa-5ba4-aab4-4656352cd573'),
('stacco rumeno con bilanciere','47bc2be2-f2fa-5ba4-aab4-4656352cd573'),
('barbell rdl','47bc2be2-f2fa-5ba4-aab4-4656352cd573'),
('dumbbell romanian deadlift','96d0c122-2dce-52a4-a9ff-4063982a8664'),
('stacco rumeno con manubri','96d0c122-2dce-52a4-a9ff-4063982a8664'),
('db rdl','96d0c122-2dce-52a4-a9ff-4063982a8664'),
('single-leg dumbbell romanian deadlift','d80104f9-671e-5b61-a67d-454f9cb7750c'),
('stacco rumeno a una gamba con manubri','d80104f9-671e-5b61-a67d-454f9cb7750c'),
('smith romanian deadlift','2a46e115-8de4-578b-ade0-c9eae164075a'),
('stacco rumeno alla smith machine','2a46e115-8de4-578b-ade0-c9eae164075a'),
('seated leg curl','7a00c907-adf5-5201-a3ba-825838985351'),
('leg curl da seduto','7a00c907-adf5-5201-a3ba-825838985351'),
('lying leg curl','15573f6b-27f4-535e-a379-882e2ce2216a'),
('leg curl da sdraiato','15573f6b-27f4-535e-a379-882e2ce2216a'),
('standing leg curl','7c0bffb2-960c-589a-aa0b-0122d2006ee2'),
('leg curl in piedi a una gamba','7c0bffb2-960c-589a-aa0b-0122d2006ee2'),
('nordic hamstring curl','2281b609-3795-539c-a04a-c90d811b0c32'),
('nordic curl','2281b609-3795-539c-a04a-c90d811b0c32'),
('glute-ham raise','7ab11a97-a654-50e6-a62c-b5077d44a98f'),
('barbell good morning','2cd9b8f0-e3c8-5a62-adb2-59266a73ba00'),
('good morning con bilanciere','2cd9b8f0-e3c8-5a62-adb2-59266a73ba00'),
('stability ball leg curl','57eb93b3-1b43-5c0f-ab3b-099341b5396e'),
('leg curl su fitball','57eb93b3-1b43-5c0f-ab3b-099341b5396e'),
('slider leg curl','f7336a66-8b25-54e5-a8ae-306fcd50a682'),
('leg curl con slider','f7336a66-8b25-54e5-a8ae-306fcd50a682'),
('barbell hip thrust','1af9b188-f135-5cc4-ad75-f531311944f8'),
('hip thrust con bilanciere','1af9b188-f135-5cc4-ad75-f531311944f8'),
('smith hip thrust','395b5ea8-827e-51df-a191-6e4443715c93'),
('hip thrust alla smith machine','395b5ea8-827e-51df-a191-6e4443715c93'),
('machine hip thrust','eb1bad43-918a-59ff-aff5-1ef57e59df81'),
('hip thrust alla macchina','eb1bad43-918a-59ff-aff5-1ef57e59df81'),
('glute bridge','5eb0bef9-15cc-5773-acf3-0a05b6a65682'),
('ponte glutei a corpo libero','5eb0bef9-15cc-5773-acf3-0a05b6a65682'),
('barbell glute bridge','2ead17a6-79b8-5ce5-a1c8-c1246a21d878'),
('ponte glutei con bilanciere','2ead17a6-79b8-5ce5-a1c8-c1246a21d878'),
('single-leg glute bridge','aeac8807-ffba-5fb7-a2fb-0c0889cc043e'),
('ponte glutei a una gamba','aeac8807-ffba-5fb7-a2fb-0c0889cc043e'),
('cable glute kickback','4eca8ed0-f3ef-5416-affb-8f73b027dbe9'),
('slancio posteriore al cavo per glutei','4eca8ed0-f3ef-5416-affb-8f73b027dbe9'),
('machine glute kickback','7c8d6641-2989-5c60-a5ea-e92ee77436f1'),
('slancio posteriore alla macchina per glutei','7c8d6641-2989-5c60-a5ea-e92ee77436f1'),
('machine hip abduction','0e2cd342-f310-50cb-af2a-839967c25098'),
('abduzioni delle anche alla macchina','0e2cd342-f310-50cb-af2a-839967c25098'),
('cable hip abduction','72b9633c-0bac-5e31-abe8-0d4d032b709a'),
('abduzione dell''anca al cavo','72b9633c-0bac-5e31-abe8-0d4d032b709a'),
('machine hip adduction','4b3269b3-5e95-53c2-ae0e-948c76cf374b'),
('adduzioni delle anche alla macchina','4b3269b3-5e95-53c2-ae0e-948c76cf374b'),
('cable hip adduction','3095fa8a-78ff-53ec-a4cd-88ddf7d109a9'),
('adduzione dell''anca al cavo','3095fa8a-78ff-53ec-a4cd-88ddf7d109a9'),
('cable pull-through','908a3514-2beb-5eae-ab02-6ccb0c30797e'),
('pull-through al cavo','908a3514-2beb-5eae-ab02-6ccb0c30797e'),
('dumbbell lateral lunge','80d9e17c-549f-5b00-a057-d4a09d2e0789'),
('affondi laterali con manubri','80d9e17c-549f-5b00-a057-d4a09d2e0789'),
('dumbbell sumo squat','dd07f6d6-67c4-515a-abc9-813ab55c13af'),
('squat sumo con manubrio','dd07f6d6-67c4-515a-abc9-813ab55c13af'),
('frog pump','9feecd11-69fb-5d5c-ad9b-f7934c5cdcf4'),
('frog pump a corpo libero','9feecd11-69fb-5d5c-ad9b-f7934c5cdcf4'),
('standing machine calf raise','8eb22ab6-e62d-5c09-ac2c-053943e0129a'),
('calf raise in piedi alla macchina','8eb22ab6-e62d-5c09-ac2c-053943e0129a'),
('seated machine calf raise','3b81e126-fdee-5aa3-a42e-9839d56fff69'),
('calf raise seduto alla macchina','3b81e126-fdee-5aa3-a42e-9839d56fff69'),
('leg press calf raise','50336fa7-be25-5902-a585-d1ca89fbf800'),
('calf raise alla leg press','50336fa7-be25-5902-a585-d1ca89fbf800'),
('smith machine calf raise','d4e1482c-6a44-5064-a778-f7775ce24286'),
('calf raise alla smith machine','d4e1482c-6a44-5064-a778-f7775ce24286'),
('single-leg dumbbell calf raise','95f3c075-a060-5f08-a15e-29474b0664bb'),
('calf raise a una gamba con manubrio','95f3c075-a060-5f08-a15e-29474b0664bb'),
('bodyweight calf raise','2238f9ca-7938-59f8-ada5-0d7b3f4b08c4'),
('calf raise a corpo libero','2238f9ca-7938-59f8-ada5-0d7b3f4b08c4'),
('donkey calf raise machine','0ad1bee4-46dc-545d-a545-2fc2c06c326a'),
('donkey calf raise alla macchina','0ad1bee4-46dc-545d-a545-2fc2c06c326a'),
('tibialis raise','2ee6113e-7cca-56fc-ac3d-0fcb1e5559bb'),
('sollevamenti per il tibiale anteriore','2ee6113e-7cca-56fc-ac3d-0fcb1e5559bb'),
('crunch','759c121e-465a-5c9d-ab18-a4026067efbe'),
('crunch a terra','759c121e-465a-5c9d-ab18-a4026067efbe'),
('reverse crunch','029bb821-c8ee-53ef-aff8-999a25c8db27'),
('crunch inverso','029bb821-c8ee-53ef-aff8-999a25c8db27'),
('cable crunch','d3342787-aa09-57a0-a0b1-1258639313e0'),
('crunch al cavo','d3342787-aa09-57a0-a0b1-1258639313e0'),
('machine crunch','7c82e813-45f9-5f30-a122-3814bbf55be3'),
('crunch alla macchina','7c82e813-45f9-5f30-a122-3814bbf55be3'),
('decline sit-up','f780b20c-3f8f-5173-aa9d-68c382e53a06'),
('sit-up su panca declinata','f780b20c-3f8f-5173-aa9d-68c382e53a06'),
('hanging knee raise','515dae8c-cef0-5239-ae78-c65edb22f8ec'),
('sollevamento ginocchia alla sbarra','515dae8c-cef0-5239-ae78-c65edb22f8ec'),
('hanging leg raise','8aac2c8a-8b6a-50d5-ade1-efe52e6ea6e1'),
('sollevamento gambe alla sbarra','8aac2c8a-8b6a-50d5-ade1-efe52e6ea6e1'),
('captain''s chair knee raise','af0ea26c-2b21-58cf-a3da-391644df1f09'),
('sollevamento ginocchia alle parallele con appoggio','af0ea26c-2b21-58cf-a3da-391644df1f09'),
('lying leg raise','48dddda8-6d9d-5cb3-a097-27b095d6255d'),
('sollevamento gambe da sdraiato','48dddda8-6d9d-5cb3-a097-27b095d6255d'),
('plank','bc454d71-dcb9-5624-afcf-01384aa37e99'),
('side plank','aec19e49-9aac-5381-ab8c-fc5e6ca1d666'),
('plank laterale','aec19e49-9aac-5381-ab8c-fc5e6ca1d666'),
('ab wheel rollout','f556eaf5-4910-528c-ae00-668af7b54777'),
('rollout con ruota addominale','f556eaf5-4910-528c-ae00-668af7b54777'),
('barbell rollout','43399ec9-394f-5d5f-a753-66a1deae79a6'),
('rollout con bilanciere','43399ec9-394f-5d5f-a753-66a1deae79a6'),
('dead bug','7ce44f59-6389-56d8-a546-059f6e76eacd'),
('bird dog','312d6568-122b-5148-a2fa-e3d76508e675'),
('pallof press','715dbc79-860d-57a7-ae1f-d0af0a7f89a2'),
('pallof press al cavo','715dbc79-860d-57a7-ae1f-d0af0a7f89a2'),
('cable woodchop','e9f2b48f-3756-5327-a966-476fffbf2d64'),
('woodchop al cavo','e9f2b48f-3756-5327-a966-476fffbf2d64'),
('machine torso rotation','eb2ecba7-7020-5a0b-aad3-fbaccfc26e52'),
('rotazioni del busto alla macchina','eb2ecba7-7020-5a0b-aad3-fbaccfc26e52'),
('plate russian twist','bd46e26f-1e14-555c-a2e2-1636a402b319'),
('russian twist con disco','bd46e26f-1e14-555c-a2e2-1636a402b319'),
('bicycle crunch','b06dc1e3-5377-5269-a21b-444d797e2d61'),
('crunch a bicicletta','b06dc1e3-5377-5269-a21b-444d797e2d61'),
('mountain climber','35718ff9-95bb-54bc-a90a-5a360760966f'),
('hollow body hold','c8b8334f-9ab2-5433-a8e2-c2428ba48d22'),
('tenuta hollow body','c8b8334f-9ab2-5433-a8e2-c2428ba48d22'),
('v-up','7c33bbc8-f318-521d-ab5d-a5f98898a10c'),
('chiusure a v','7c33bbc8-f318-521d-ab5d-a5f98898a10c'),
('heel touch','ea27ea8c-071d-5dbd-ad21-082ab4122c25'),
('tocchi ai talloni','ea27ea8c-071d-5dbd-ad21-082ab4122c25'),
('stability ball crunch','a86f8780-5640-5ab9-a932-b08e0784d56a'),
('crunch su fitball','a86f8780-5640-5ab9-a932-b08e0784d56a'),
('conventional barbell deadlift','1473748c-8263-5f13-aeb1-70f63d40e227'),
('stacco da terra convenzionale','1473748c-8263-5f13-aeb1-70f63d40e227'),
('deadlift','1473748c-8263-5f13-aeb1-70f63d40e227'),
('conventional deadlift','1473748c-8263-5f13-aeb1-70f63d40e227'),
('sumo barbell deadlift','710298b6-cc06-5852-a37e-d22d83268b55'),
('stacco da terra sumo','710298b6-cc06-5852-a37e-d22d83268b55'),
('trap-bar deadlift','cafd875e-530c-5265-a9c5-709ade665348'),
('stacco con trap bar','cafd875e-530c-5265-a9c5-709ade665348'),
('barbell rack pull','a8bc1772-451b-5dcd-ad59-0b36d56a7744'),
('stacco dai blocchi con bilanciere','a8bc1772-451b-5dcd-ad59-0b36d56a7744'),
('two-hand kettlebell swing','3d4551d7-175f-52fb-a59c-664e02dafe9e'),
('swing con kettlebell a due mani','3d4551d7-175f-52fb-a59c-664e02dafe9e'),
('one-arm kettlebell swing','21255c15-55eb-5a6d-a8a1-d40f63c0aef7'),
('swing con kettlebell a un braccio','21255c15-55eb-5a6d-a8a1-d40f63c0aef7'),
('kettlebell clean','04a182c5-9abc-5508-aba2-1fdaa6de8712'),
('girata con kettlebell','04a182c5-9abc-5508-aba2-1fdaa6de8712'),
('kettlebell snatch','33f33387-1ecc-542c-af40-c867359dd52b'),
('strappo con kettlebell','33f33387-1ecc-542c-af40-c867359dd52b'),
('turkish get-up','5500eb22-61fe-55c8-a64a-29b3d6d6b541'),
('turkish get-up con kettlebell','5500eb22-61fe-55c8-a64a-29b3d6d6b541'),
('barbell power clean','5c6ee939-b54e-5274-a945-54230cd1fdd6'),
('girata al petto in semipiegata','5c6ee939-b54e-5274-a945-54230cd1fdd6'),
('barbell push press','b368e2d7-8e41-5582-a9df-3399d85b5adb'),
('push press con bilanciere','b368e2d7-8e41-5582-a9df-3399d85b5adb'),
('barbell thruster','5ec07302-16c4-5c39-a72b-ecbcb9aef7c6'),
('thruster con bilanciere','5ec07302-16c4-5c39-a72b-ecbcb9aef7c6'),
('dumbbell thruster','feed090d-7a7d-598a-a9c6-41799775f477'),
('thruster con manubri','feed090d-7a7d-598a-a9c6-41799775f477'),
('burpee','8f3eb8d5-8bca-51b8-a12e-d0515cabbf75'),
('dumbbell farmer''s carry','0013ee67-39d3-5cf3-ad80-639e55123878'),
('camminata del contadino con manubri','0013ee67-39d3-5cf3-ad80-639e55123878'),
('sled push','045f8e3f-df0f-59da-a7b8-a2a6a8edcabd'),
('spinta della slitta','045f8e3f-df0f-59da-a7b8-a2a6a8edcabd'),
('sled drag','2a8258ac-d54f-5198-a489-71ac25e74f23'),
('traino della slitta','2a8258ac-d54f-5198-a489-71ac25e74f23'),
('battle rope waves','5534ba02-f2b9-5abb-a711-7de376b359df'),
('onde con battle rope','5534ba02-f2b9-5abb-a711-7de376b359df')
on conflict do nothing;
-- Idempotent exact/curated-only mapping. No fuzzy assignment or text replacement.
update public.workout_sets set exercise_id=public.resolve_exercise_id(exercise)
where exercise_id is null and public.resolve_exercise_id(exercise) is not null;
update public.workout_template_exercises set exercise_id=public.resolve_exercise_id(exercise)
where exercise_id is null and public.resolve_exercise_id(exercise) is not null;
update public.workouts w set template_snapshot=(select jsonb_agg(
  case when item->>'exercise_id' is null and public.resolve_exercise_id(item->>'exercise') is not null
  then item || jsonb_build_object('exercise_id',public.resolve_exercise_id(item->>'exercise')) else item end order by position)
  from jsonb_array_elements(case when jsonb_typeof(w.template_snapshot)='array' then w.template_snapshot else '[]'::jsonb end) with ordinality as entries(item,position))
where jsonb_typeof(w.template_snapshot)='array' and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(w.template_snapshot)='array' then w.template_snapshot else '[]'::jsonb end) item
  where item->>'exercise_id' is null and public.resolve_exercise_id(item->>'exercise') is not null);
-- Counts are scoped by the caller's existing workout RLS. Admin rollout can report all.
create or replace function public.exercise_legacy_mapping_report()
returns table(source text, exercise text, records bigint, mapped bigint, ambiguous boolean)
language sql stable security invoker set search_path='' as $$
  with records as (
    select 'workout_sets' source, exercise,exercise_id::text from public.workout_sets
    union all select 'workout_template_exercises',exercise,exercise_id::text from public.workout_template_exercises
    union all select 'template_snapshot',e->>'exercise',e->>'exercise_id' from public.workouts w,
      lateral jsonb_array_elements(case when jsonb_typeof(template_snapshot)='array' then template_snapshot else '[]'::jsonb end) e
  ) select r.source,r.exercise,count(*),count(r.exercise_id),
    (select count(distinct a.exercise_id)>1 from public.exercise_aliases a where a.alias=public.normalize_exercise_alias(r.exercise))
    from records r group by r.source,r.exercise;
$$;
revoke all on function public.exercise_legacy_mapping_report() from public,anon;
grant execute on function public.exercise_legacy_mapping_report() to authenticated,service_role;

-- Preserve the durable timer; only exercise matching gains canonical identity.
create or replace function public.schedule_workout_rest_timer(p_set_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.workout_sets;
  p public.workout_rest_preferences;
  due timestamptz;
  next_number integer;
begin
  select * into s from public.workout_sets where id = p_set_id;
  if s.id is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(s.user_id::text || ':workout-rest', 0));
  select * into p from public.workout_rest_preferences where user_id = s.user_id;
  if not coalesce(p.enabled, false) or p.recipient is null then return; end if;
  if exists(select 1 from public.brain_outbox_messages where user_id = s.user_id
    and idempotency_key = 'workout-rest:' || s.id::text) then return; end if;
  if p.last_set_at is not null and s.created_at < p.last_set_at then return; end if;
  if not exists(select 1 from public.workouts where id = s.workout_id and user_id = s.user_id and ended_at is null) then return; end if;
  due := s.created_at + make_interval(secs => p.duration_seconds);
  if due + interval '5 minutes' <= now() then return; end if;
  select coalesce(max(set_number), 0) + 1 into next_number from public.workout_sets
    where workout_id = s.workout_id and user_id = s.user_id and not is_warmup
    and case when s.exercise_id is not null then coalesce(exercise_id,public.resolve_exercise_id(exercise)) = s.exercise_id else public.normalize_exercise_alias(exercise) = public.normalize_exercise_alias(s.exercise) end and set_number < 1000;
  update public.brain_outbox_messages set status = 'cancelled'
    where user_id = s.user_id and source_type = 'workout_rest_timer' and status in ('queued', 'claimed');
  insert into public.brain_outbox_messages(user_id, channel, recipient, body, priority, rule_key,
    source_type, source_id, idempotency_key, scheduled_for, expires_at, metadata)
  values(s.user_id, 'whatsapp', p.recipient,
    'Rest''s over. ' || left(s.exercise, 160) || ' - time for ' ||
      case when s.is_warmup then 'the next set.' else 'set ' || next_number::text || '.' end,
    'high', 'workout.rest_timer', 'workout_rest_timer', s.id::text,
    'workout-rest:' || s.id::text, due, due + interval '5 minutes',
    jsonb_build_object('expected_reply_type', 'notification_only', 'user_armed', true,
      'workout_rest', jsonb_build_object('workout_id', s.workout_id, 'set_id', s.id,
        'exercise', s.exercise, 'next_set_number', case when s.is_warmup then null else next_number end,
        'duration_seconds', p.duration_seconds)));
  update public.workout_rest_preferences set last_set_id = s.id, last_set_at = s.created_at where user_id = s.user_id;
end;
$$;
revoke all on function public.schedule_workout_rest_timer(uuid) from public, anon, authenticated;
grant execute on function public.schedule_workout_rest_timer(uuid) to service_role;
