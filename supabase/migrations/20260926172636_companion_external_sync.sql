alter table public.brain_beliefs drop constraint if exists brain_beliefs_source_type_check;
alter table public.brain_beliefs add constraint brain_beliefs_source_type_check check (
  source_type in ('user_explicit', 'assistant_inferred', 'proactive_feedback', 'system', 'manual', 'external_sync')
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

create index if not exists brain_external_sync_requests_user_created_idx
  on public.brain_external_sync_requests (user_id, created_at desc);

drop trigger if exists set_brain_external_sync_requests_updated_at on public.brain_external_sync_requests;
create trigger set_brain_external_sync_requests_updated_at
before update on public.brain_external_sync_requests
for each row execute function public.set_updated_at();

alter table public.brain_external_sync_requests enable row level security;
drop policy if exists "brain_external_sync_requests are user scoped read" on public.brain_external_sync_requests;
create policy "brain_external_sync_requests are user scoped read" on public.brain_external_sync_requests
for select to authenticated using (auth.uid() = user_id);

revoke all on table public.brain_beliefs from anon, authenticated;
grant select on table public.brain_beliefs to authenticated;
revoke all on table public.brain_external_sync_requests from anon, authenticated;
grant select on table public.brain_external_sync_requests to authenticated;
grant all on table public.brain_external_sync_requests to service_role;

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
    select * into existing_row from public.brain_beliefs
    where user_id = p_user_id and idempotency_key = p_idempotency_key limit 1;
    if found then return next existing_row; return; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':' || p_subject_type || ':' || p_subject_key || ':' || p_predicate, 0
  ));

  if p_idempotency_key is not null then
    select * into existing_row from public.brain_beliefs
    where user_id = p_user_id and idempotency_key = p_idempotency_key limit 1;
    if found then return next existing_row; return; end if;
  end if;

  select * into current_row from public.brain_beliefs
  where user_id = p_user_id and subject_type = p_subject_type
    and subject_key = p_subject_key and predicate = p_predicate
    and record_status = 'current' for update;

  update public.brain_beliefs
  set record_status = 'superseded',
      effective_until = greatest(effective_from, transition_at), updated_at = now()
  where id = current_row.id and user_id = p_user_id;

  insert into public.brain_beliefs (
    user_id, subject_type, subject_key, predicate, value, confidence,
    source_type, source_ref, provenance, effective_from, effective_until,
    supersedes_id, negative_feedback_count, last_feedback_at, idempotency_key
  ) values (
    p_user_id, p_subject_type, p_subject_key, p_predicate,
    coalesce(p_value, '{}'::jsonb), p_confidence, p_source_type,
    coalesce(p_source_ref, '{}'::jsonb), coalesce(p_provenance, '{}'::jsonb),
    transition_at, p_effective_until, current_row.id,
    coalesce(p_negative_feedback_count, 0), p_last_feedback_at, p_idempotency_key
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
