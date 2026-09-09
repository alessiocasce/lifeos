-- Durable WhatsApp execution receipts, provider-message correlation and one
-- current conversational owner per Brain thread. Service-role backend only.

alter table public.ai_chat_messages
  add constraint ai_chat_messages_id_user_id_key unique (id, user_id);
alter table public.brain_outbox_messages
  add constraint brain_outbox_messages_id_user_id_key unique (id, user_id);

create table public.brain_whatsapp_inbound_receipts (
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

create table public.brain_whatsapp_message_deliveries (
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

create table public.brain_interaction_state (
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

do $$
begin
  if exists (
    select 1 from public.ai_chat_messages
    where role = 'assistant' and coalesce(metadata->>'outbox_message_id', '') <> ''
    group by user_id, thread_id, metadata->>'outbox_message_id'
    having count(*) > 1
  ) then
    raise exception 'Duplicate proactive assistant/outbox links must be reconciled before migration.';
  end if;
end $$;

create unique index ai_chat_messages_user_thread_outbox_unique
  on public.ai_chat_messages (user_id, thread_id, (metadata->>'outbox_message_id'))
  where role = 'assistant' and coalesce(metadata->>'outbox_message_id', '') <> '';
create index brain_whatsapp_receipts_user_status_lease_idx
  on public.brain_whatsapp_inbound_receipts (user_id, status, lease_expires_at);
create index brain_whatsapp_deliveries_assistant_idx
  on public.brain_whatsapp_message_deliveries (user_id, assistant_message_id);
create index brain_interaction_state_expiry_idx
  on public.brain_interaction_state (user_id, channel, state, expires_at);

alter table public.brain_whatsapp_inbound_receipts enable row level security;
alter table public.brain_whatsapp_message_deliveries enable row level security;
alter table public.brain_interaction_state enable row level security;

revoke all on table public.brain_whatsapp_inbound_receipts from anon, authenticated;
revoke all on table public.brain_whatsapp_message_deliveries from anon, authenticated;
revoke all on table public.brain_interaction_state from anon, authenticated;

create trigger set_brain_whatsapp_inbound_receipts_updated_at
before update on public.brain_whatsapp_inbound_receipts
for each row execute function public.set_updated_at();
create trigger set_brain_interaction_state_updated_at
before update on public.brain_interaction_state
for each row execute function public.set_updated_at();
