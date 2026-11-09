-- PWA-only user-armed rest reminders. The retired WhatsApp timer stays retired.
create table public.workout_web_rest_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  seconds integer not null default 120 check(seconds between 15 and 300),
  notifications boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.workout_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
create table public.workout_rest_timers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  set_id uuid not null unique references public.workout_sets(id) on delete cascade,
  scheduled_for timestamptz not null,
  expires_at timestamptz not null,
  state text not null default 'queued' check(state in ('queued','claimed','sent','cancelled','expired','failed')),
  delivery_enabled boolean not null default false,
  delivery_token text not null unique default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz
);
create unique index workout_web_rest_one_pending on public.workout_rest_timers(user_id) where state in ('queued','claimed');
create index workout_web_rest_due on public.workout_rest_timers(scheduled_for) where state='queued';
create index workout_web_rest_owner on public.workout_rest_timers(user_id,workout_id,created_at desc);
create index workout_web_rest_workout on public.workout_rest_timers(workout_id);
create index workout_push_owner on public.workout_push_subscriptions(user_id);
alter table public.workout_web_rest_preferences enable row level security;
alter table public.workout_push_subscriptions enable row level security;
alter table public.workout_rest_timers enable row level security;
revoke all on public.workout_web_rest_preferences,public.workout_push_subscriptions,public.workout_rest_timers from public,anon,authenticated;
grant select,insert,update on public.workout_web_rest_preferences to authenticated;
-- Tokens and subscription capability URLs are never readable through client table APIs.
grant select(id,user_id,workout_id,set_id,scheduled_for,expires_at,state,created_at) on public.workout_rest_timers to authenticated;
grant all on public.workout_web_rest_preferences,public.workout_push_subscriptions,public.workout_rest_timers to service_role;
create policy rest_preferences_owner on public.workout_web_rest_preferences to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy rest_timer_owner on public.workout_rest_timers for select to authenticated using(user_id=(select auth.uid()));

create or replace function lifeos_private.bound_workout_push_devices() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,791));
  if not exists(select 1 from public.workout_push_subscriptions where endpoint=new.endpoint)
    and (select count(*) from public.workout_push_subscriptions where user_id=new.user_id)>=5 then
    raise exception 'Maximum five Training notification devices per user';
  end if;
  return new;
end $$;
revoke all on function lifeos_private.bound_workout_push_devices() from public,anon,authenticated;
create trigger workout_push_device_limit before insert on public.workout_push_subscriptions
  for each row execute function lifeos_private.bound_workout_push_devices();

create or replace function lifeos_private.schedule_workout_web_rest() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.workout_web_rest_preferences; w public.workouts;
begin
  -- Serialize with preference changes and completion; never schedule historical corrections.
  select * into p from public.workout_web_rest_preferences where user_id=new.user_id for update;
  if not found or not p.enabled then return new; end if;
  select * into w from public.workouts where id=new.workout_id and user_id=new.user_id for update;
  if not found or w.ended_at is not null then return new; end if;
  if exists(select 1 from public.workout_rest_timers where set_id=new.id) then return new; end if;
  update public.workout_rest_timers set state='cancelled',finished_at=now()
    where user_id=new.user_id and state in ('queued','claimed','sent');
  begin
    insert into public.workout_rest_timers(user_id,workout_id,set_id,scheduled_for,expires_at,delivery_enabled)
      values(new.user_id,new.workout_id,new.id,statement_timestamp()+make_interval(secs=>p.seconds),statement_timestamp()+make_interval(secs=>p.seconds+300),p.notifications);
  exception when others then
    -- Keep the prior cancellation even if this replacement cannot be inserted.
    raise warning 'Workout notification replacement failed [%]',sqlstate;
  end;
  return new;
exception when others then
  -- This subtransaction rolls back timer changes ONLY. Real workout logging wins.
  raise warning 'Workout notification scheduling failed [%]',sqlstate;
  return new;
end $$;
create trigger workout_web_rest_after_set after insert on public.workout_sets
  for each row execute function lifeos_private.schedule_workout_web_rest();

create or replace function lifeos_private.cancel_workout_web_rest() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='workouts' then
    if new.ended_at is not null then
      update public.workout_rest_timers set state='cancelled',finished_at=now() where workout_id=new.id and state in ('queued','claimed','sent');
    end if;
  elsif not new.enabled or not new.notifications then
    -- Notification OFF cancels delivery, not the visual countdown when the timer remains enabled.
    if not new.enabled then
      update public.workout_rest_timers set state='cancelled',finished_at=now() where user_id=new.user_id and state in ('queued','claimed','sent');
    else
      update public.workout_rest_timers set delivery_enabled=false where user_id=new.user_id and state in ('queued','claimed','sent');
    end if;
  end if;
  return new;
end $$;
create trigger workout_web_rest_preference after update on public.workout_web_rest_preferences
  for each row execute function lifeos_private.cancel_workout_web_rest();
create trigger workout_web_rest_end after update of ended_at on public.workouts
  for each row execute function lifeos_private.cancel_workout_web_rest();

create or replace function public.cancel_workout_web_rest(p_workout_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform 1 from public.workout_web_rest_preferences where user_id=auth.uid() for update;
  update public.workout_rest_timers set state='cancelled',finished_at=now()
    where user_id=auth.uid() and (p_workout_id is null or workout_id=p_workout_id) and state in ('queued','claimed','sent');
end $$;

create or replace function public.claim_workout_web_rest() returns setof public.workout_rest_timers
language plpgsql security definer set search_path='' as $$
begin
  update public.workout_rest_timers set state='expired',finished_at=now() where state in ('queued','claimed') and expires_at<=now();
  -- Do not retry an ambiguous network send; prevents duplicate notifications after worker loss.
  update public.workout_rest_timers set state='failed',finished_at=now() where state='claimed' and claimed_at<now()-interval '60 seconds';
  return query with due as (
    select t.id from public.workout_rest_timers t
    join public.workout_web_rest_preferences p on p.user_id=t.user_id and p.enabled and p.notifications
    join public.workouts w on w.id=t.workout_id and w.user_id=t.user_id and w.ended_at is null
    where t.state='queued' and t.delivery_enabled and t.scheduled_for<=now() and t.expires_at>now()
      and exists(select 1 from public.workout_push_subscriptions s where s.user_id=t.user_id)
    order by t.scheduled_for limit 5 for update of t skip locked
  ) update public.workout_rest_timers t set state='claimed',claimed_at=now() from due where t.id=due.id returning t.*;
end $$;

revoke all on function lifeos_private.schedule_workout_web_rest(),lifeos_private.cancel_workout_web_rest() from public,anon,authenticated;
revoke all on function public.cancel_workout_web_rest(uuid) from public,anon;
grant execute on function public.cancel_workout_web_rest(uuid) to authenticated;
revoke all on function public.claim_workout_web_rest() from public,anon,authenticated;
grant execute on function public.claim_workout_web_rest() to service_role;
