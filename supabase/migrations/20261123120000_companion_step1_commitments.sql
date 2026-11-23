-- Jarvis Companion step 1 (docs/specs/jarvis-companion.md §4.2, §4.10, §5.5).
--
-- 1. Commitments: `memos` evolves in place. Every existing row becomes a
--    commitment of kind 'reminder' through the column defaults, so no data
--    moves and the Memos tab, MCP memo tools and proactive memo rules keep
--    reading the same columns. `status` keeps its open/done/dismissed values;
--    a retired commitment is status 'dismissed' with chase_state 'retired'.
-- 2. Action ledger: every Brain write records how to reverse it (undo).
-- 3. Turn lock: one Brain turn at a time per user across channels.
--
-- Additive only. Service-role writes; the owner may read their own ledger.

alter table public.memos add column if not exists kind text not null default 'reminder';
alter table public.memos add column if not exists hard boolean not null default false;
alter table public.memos add column if not exists project_id uuid;
alter table public.memos add column if not exists chase_intensity text not null default 'coach';
alter table public.memos add column if not exists chase_state text not null default 'idle';
alter table public.memos add column if not exists recurrence text;
alter table public.memos add column if not exists source jsonb not null default '{}'::jsonb;
alter table public.memos add column if not exists snoozed_until timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'memos_kind_check') then
    alter table public.memos add constraint memos_kind_check
      check (kind in ('reminder', 'task', 'deadline', 'promise', 'recurring', 'external_date', 'checkin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'memos_chase_intensity_check') then
    alter table public.memos add constraint memos_chase_intensity_check
      check (chase_intensity in ('gentle', 'coach', 'drill'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'memos_chase_state_check') then
    alter table public.memos add constraint memos_chase_state_check
      check (chase_state in ('idle', 'active', 'snoozed', 'retired'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'memos_recurrence_check') then
    alter table public.memos add constraint memos_recurrence_check
      check (recurrence is null or recurrence ~ '^(daily|weekly:(mon|tue|wed|thu|fri|sat|sun)|monthly:([1-9]|[12][0-9]|3[01])|yearly:(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01]))$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'memos_source_object_check') then
    alter table public.memos add constraint memos_source_object_check check (jsonb_typeof(source) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'memos_id_user_id_key') then
    alter table public.memos add constraint memos_id_user_id_key unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'memos_project_owner_fk') then
    alter table public.memos add constraint memos_project_owner_fk
      foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id);
  end if;
end $$;

create table if not exists public.brain_action_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text check (request_id is null or length(request_id) <= 160),
  thread_id uuid,
  source_message_id uuid,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'app', 'call', 'proactive', 'mcp')),
  tool text not null check (length(tool) between 1 and 80),
  autonomy text not null check (autonomy in ('silent', 'mention', 'explicit', 'confirm', 'undo')),
  args jsonb not null default '{}'::jsonb check (jsonb_typeof(args) = 'object'),
  result_ref jsonb not null default '{}'::jsonb check (jsonb_typeof(result_ref) = 'object'),
  inverse jsonb not null default '[]'::jsonb check (jsonb_typeof(inverse) = 'array'),
  summary text not null check (length(summary) between 1 and 300),
  undone_at timestamptz,
  undone_by uuid references public.brain_action_ledger(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists brain_action_ledger_user_created_idx
  on public.brain_action_ledger (user_id, created_at desc);

alter table public.brain_action_ledger enable row level security;
drop policy if exists "brain_action_ledger is user scoped read" on public.brain_action_ledger;
create policy "brain_action_ledger is user scoped read" on public.brain_action_ledger
for select to authenticated using (auth.uid() = user_id);

revoke all on table public.brain_action_ledger from anon, authenticated;
grant select on table public.brain_action_ledger to authenticated;
grant all on table public.brain_action_ledger to service_role;

create table if not exists public.brain_turn_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  holder text not null check (length(holder) between 1 and 160),
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.brain_turn_locks enable row level security;
revoke all on table public.brain_turn_locks from anon, authenticated;
grant all on table public.brain_turn_locks to service_role;

-- Takes the user's turn lock when it is free, expired or already held by
-- this holder. Returns acquired=false while another live turn holds it.
-- Two output columns so every client reads a row object, never a scalar.
create or replace function public.companion_try_turn_lock(p_user_id uuid, p_holder text, p_ttl_seconds integer)
returns table (acquired boolean, lock_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.brain_turn_locks as lock (user_id, holder, acquired_at, expires_at)
  values (p_user_id, p_holder, now(), now() + make_interval(secs => greatest(5, least(coalesce(p_ttl_seconds, 90), 300))))
  on conflict (user_id) do update
    set holder = excluded.holder, acquired_at = excluded.acquired_at, expires_at = excluded.expires_at
    where lock.expires_at < now() or lock.holder = excluded.holder;
  return query
    select lock.holder = p_holder, lock.expires_at from public.brain_turn_locks as lock where lock.user_id = p_user_id;
end;
$$;

create or replace function public.companion_release_turn_lock(p_user_id uuid, p_holder text)
returns table (released boolean, released_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.brain_turn_locks as lock where lock.user_id = p_user_id and lock.holder = p_holder;
  return query select found, now();
end;
$$;

revoke all on function public.companion_try_turn_lock(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.companion_release_turn_lock(uuid, text) from public, anon, authenticated;
grant execute on function public.companion_try_turn_lock(uuid, text, integer) to service_role;
grant execute on function public.companion_release_turn_lock(uuid, text) to service_role;
