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
