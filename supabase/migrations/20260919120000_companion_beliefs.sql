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
    source_type in ('user_explicit', 'assistant_inferred', 'proactive_feedback', 'system', 'manual')
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

create unique index if not exists brain_beliefs_one_current_idx
  on public.brain_beliefs (user_id, subject_type, subject_key, predicate)
  where record_status = 'current';
create unique index if not exists brain_beliefs_idempotency_idx
  on public.brain_beliefs (user_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists brain_beliefs_user_subject_history_idx
  on public.brain_beliefs (user_id, subject_type, subject_key, predicate, effective_from desc);

drop trigger if exists set_brain_beliefs_updated_at on public.brain_beliefs;
create trigger set_brain_beliefs_updated_at
before update on public.brain_beliefs
for each row execute function public.set_updated_at();

alter table public.brain_beliefs enable row level security;

drop policy if exists "brain_beliefs are user scoped" on public.brain_beliefs;
drop policy if exists "brain_beliefs are user scoped read" on public.brain_beliefs;
create policy "brain_beliefs are user scoped read" on public.brain_beliefs
for select to authenticated
using (auth.uid() = user_id);

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
) from public;
grant execute on function public.apply_brain_belief_transition(
  uuid, text, text, text, jsonb, numeric, text, jsonb, jsonb,
  timestamptz, timestamptz, integer, timestamptz, text
) to service_role;
