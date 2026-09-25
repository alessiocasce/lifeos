alter table public.ai_memories
  add column if not exists memory_kind text not null default 'semantic_fact',
  add column if not exists subject_key text,
  add column if not exists project_id uuid,
  add column if not exists occurred_at timestamptz,
  add column if not exists occurred_on date,
  add column if not exists effective_from timestamptz,
  add column if not exists effective_until timestamptz,
  add column if not exists provenance jsonb not null default '{}'::jsonb,
  add column if not exists dedupe_key text,
  add column if not exists supersedes_id uuid,
  add column if not exists last_confirmed_at timestamptz;

alter table public.ai_memories enable row level security;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ai_memories_id_user_id_key') then
    alter table public.ai_memories add constraint ai_memories_id_user_id_key unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memories_kind_check') then
    alter table public.ai_memories add constraint ai_memories_kind_check
      check (memory_kind in ('semantic_fact', 'episode', 'decision', 'project_memory', 'goal', 'constraint'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memories_provenance_check') then
    alter table public.ai_memories add constraint ai_memories_provenance_check
      check (jsonb_typeof(provenance) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memories_subject_key_check') then
    alter table public.ai_memories add constraint ai_memories_subject_key_check
      check (subject_key is null or length(subject_key) between 1 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memories_dedupe_key_check') then
    alter table public.ai_memories add constraint ai_memories_dedupe_key_check
      check (dedupe_key is null or dedupe_key ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memories_project_owner_fk') then
    alter table public.ai_memories add constraint ai_memories_project_owner_fk
      foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memories_supersedes_owner_fk') then
    alter table public.ai_memories add constraint ai_memories_supersedes_owner_fk
      foreign key (supersedes_id, user_id) references public.ai_memories (id, user_id);
  end if;
end $$;

create unique index if not exists ai_memories_user_dedupe_unique
  on public.ai_memories (user_id, dedupe_key) where dedupe_key is not null;
create unique index if not exists ai_memories_user_active_subject_unique
  on public.ai_memories (user_id, subject_key) where status = 'active' and subject_key is not null;
create index if not exists ai_memories_user_subject_active_idx
  on public.ai_memories (user_id, subject_key, updated_at desc) where status = 'active' and subject_key is not null;
create index if not exists ai_memories_user_kind_recent_idx
  on public.ai_memories (user_id, memory_kind, updated_at desc) where status = 'active';
create index if not exists ai_memories_user_project_recent_idx
  on public.ai_memories (user_id, project_id, updated_at desc) where status = 'active' and project_id is not null;

create or replace function public.curate_autobiographical_memory(
  p_user_id uuid,
  p_memory_kind text,
  p_category text,
  p_title text,
  p_content text,
  p_source text,
  p_confidence numeric,
  p_importance integer,
  p_subject_key text,
  p_project_id uuid,
  p_occurred_at timestamptz,
  p_occurred_on date,
  p_effective_from timestamptz,
  p_provenance jsonb,
  p_dedupe_key text
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
      update public.ai_memories set
        last_seen_at = now(),
        last_confirmed_at = case when p_source in ('user_explicit', 'manual') then now() else last_confirmed_at end,
        confidence = greatest(confidence, p_confidence),
        importance = greatest(importance, p_importance),
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
