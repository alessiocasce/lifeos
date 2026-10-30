-- Global opt-in/out is authoritative. No private source policy is broadened.
alter table public.user_preferences alter column workout_sharing set default true;

-- Read-time defense in depth: even an old/corrupt snapshot cannot outlive privacy
-- or completion eligibility. This helper reveals no private rows to the caller.
create function lifeos_private.community_share_is_visible(p_author uuid,p_workout uuid,p_notes boolean)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.user_preferences prefs join public.user_profiles p on p.user_id=prefs.user_id
    join public.workouts w on w.user_id=p.user_id
    where prefs.user_id=p_author and prefs.workout_sharing and w.id=p_workout and w.ended_at is not null
      and (not p_notes or prefs.share_workout_notes));
$$;
revoke all on function lifeos_private.community_share_is_visible(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function lifeos_private.community_share_is_visible(uuid,uuid,boolean) to authenticated;
drop policy community_members_read on public.community_workout_shares;
create policy community_members_read on public.community_workout_shares for select to authenticated
  using (lifeos_private.community_share_is_visible(author_id,source_workout_id,notes_consent));

-- Small-community writer gate, acquired BEFORE any row locks for client AND service
-- writes. Readers never take this lock. This prevents privacy/source races and
-- avoids inversions between parent workout, set and preference row locks.
create function lifeos_private.community_writer_gate() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform pg_catalog.pg_advisory_xact_lock(742029301::bigint); return null; end $$;
revoke all on function lifeos_private.community_writer_gate() from public,anon,authenticated,service_role;
create trigger community_writer_gate before insert or update or delete on public.workouts for each statement execute function lifeos_private.community_writer_gate();
create trigger community_writer_gate before insert or update or delete on public.workout_sets for each statement execute function lifeos_private.community_writer_gate();
create trigger community_writer_gate before insert or update or delete on public.user_preferences for each statement execute function lifeos_private.community_writer_gate();
create trigger community_writer_gate before insert or update or delete on public.user_profiles for each statement execute function lifeos_private.community_writer_gate();
create trigger community_auth_writer_gate before insert or delete on auth.users for each statement execute function lifeos_private.community_writer_gate();

create function lifeos_private.sync_community_workout(p_workout uuid) returns void
language plpgsql security definer set search_path='' as $$
declare w public.workouts; prefs public.user_preferences; projected jsonb; n integer; exercises integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(742029301::bigint);
  select * into w from public.workouts where id=p_workout;
  if not found then delete from public.community_workout_shares where source_workout_id=p_workout; return; end if;
  select * into prefs from public.user_preferences where user_id=w.user_id;
  -- A deleted/corrupt preference row fails closed; normal initialization always creates it.
  if not found or not prefs.workout_sharing or w.ended_at is null
      or not exists(select 1 from public.user_profiles where user_id=w.user_id) then
    delete from public.community_workout_shares where source_workout_id=p_workout; return;
  end if;
  select count(*),count(distinct coalesce(s.exercise_id::text,'custom:'||s.exercise)),
    jsonb_agg(jsonb_build_object('exercise',s.exercise,'exercise_id',s.exercise_id,
      'set_number',s.set_number,'is_warmup',s.is_warmup,'weight',s.weight,'reps',s.reps,'rpe',s.rpe,
      'notes',case when prefs.share_workout_notes then left(s.notes,2000) else null end)
      order by s.performed_at,s.created_at,s.id)
    into n,exercises,projected from public.workout_sets s where s.workout_id=w.id and s.user_id=w.user_id;
  if n=0 or n>500 then
    delete from public.community_workout_shares where source_workout_id=p_workout;
    if n>500 then raise warning 'Community projection ineligible: set limit'; end if;
    return;
  end if;
  insert into public.community_workout_shares as existing(author_id,source_workout_id,title,performed_on,notes,notes_consent,sets,exercise_count,set_count)
  values(w.user_id,w.id,coalesce(nullif(left(w.name,120),''),'Workout'),w.performed_on,
    case when prefs.share_workout_notes then left(w.notes,2000) else null end,prefs.share_workout_notes,projected,exercises,n)
  on conflict(source_workout_id) do update set author_id=excluded.author_id,title=excluded.title,performed_on=excluded.performed_on,
    notes=excluded.notes,notes_consent=excluded.notes_consent,sets=excluded.sets,
    exercise_count=excluded.exercise_count,set_count=excluded.set_count
  where (existing.author_id,existing.title,existing.performed_on,existing.notes,existing.notes_consent,existing.sets,existing.exercise_count,existing.set_count)
    is distinct from (excluded.author_id,excluded.title,excluded.performed_on,excluded.notes,excluded.notes_consent,excluded.sets,excluded.exercise_count,excluded.set_count);
exception when others then
  -- Logging must survive projection failure, but a stale public snapshot must not.
  delete from public.community_workout_shares where source_workout_id=p_workout;
  raise warning 'Community projection withdrawn after synchronization error (SQLSTATE %)',sqlstate;
end $$;
revoke all on function lifeos_private.sync_community_workout(uuid) from public,anon,authenticated,service_role;

create function lifeos_private.sync_community_member(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare w record;
begin
  perform pg_catalog.pg_advisory_xact_lock(742029301::bigint);
  for w in select id from public.workouts where user_id=p_user order by id loop
    perform lifeos_private.sync_community_workout(w.id);
  end loop;
end $$;
revoke all on function lifeos_private.sync_community_member(uuid) from public,anon,authenticated,service_role;

create or replace function lifeos_private.withdraw_changed_workout() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='workouts' then
    if tg_op='DELETE' then delete from public.community_workout_shares where source_workout_id=old.id;
    else perform lifeos_private.sync_community_workout(new.id); end if;
  else
    if tg_op<>'DELETE' and not exists(select 1 from public.workouts where id=new.workout_id and user_id=new.user_id) then
      raise exception 'Workout ownership mismatch' using errcode='42501';
    end if;
    if tg_op<>'INSERT' then perform lifeos_private.sync_community_workout(old.workout_id); end if;
    if tg_op='INSERT' or (tg_op='UPDATE' and new.workout_id is distinct from old.workout_id) then
      perform lifeos_private.sync_community_workout(new.workout_id);
    end if;
  end if;
  return null;
end $$;
drop trigger community_source_workout_changed on public.workouts;
revoke all on function lifeos_private.withdraw_changed_workout() from public,anon,authenticated,service_role;
create trigger community_source_workout_changed after insert or update or delete on public.workouts for each row execute function lifeos_private.withdraw_changed_workout();

create or replace function lifeos_private.apply_training_privacy() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then delete from public.community_workout_shares where author_id=old.user_id;
  elsif tg_op='INSERT' or (new.workout_sharing,new.share_workout_notes) is distinct from (old.workout_sharing,old.share_workout_notes) then
    perform lifeos_private.sync_community_member(new.user_id);
  end if;
  return null;
end $$;
drop trigger community_privacy_changed on public.user_preferences;
revoke all on function lifeos_private.apply_training_privacy() from public,anon,authenticated,service_role;
create trigger community_privacy_changed after insert or update or delete on public.user_preferences for each row execute function lifeos_private.apply_training_privacy();

create function lifeos_private.initialize_training_preferences() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.user_preferences(user_id) values(new.id) on conflict(user_id) do nothing;
  return null;
end $$;
revoke all on function lifeos_private.initialize_training_preferences() from public,anon,authenticated,service_role;
create trigger initialize_training_preferences after insert on auth.users for each row execute function lifeos_private.initialize_training_preferences();

create function lifeos_private.community_profile_created() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Creating an authored profile also recovers a missing settings row, not an OFF opt-out.
  insert into public.user_preferences(user_id) values(new.user_id) on conflict(user_id) do nothing;
  perform lifeos_private.sync_community_member(new.user_id);
  return null;
end $$;
revoke all on function lifeos_private.community_profile_created() from public,anon,authenticated,service_role;
create trigger community_profile_created after insert on public.user_profiles for each row execute function lifeos_private.community_profile_created();

-- These obsolete client mutation APIs must not bypass global sharing anymore.
drop function public.publish_workout_share(uuid,boolean,boolean,boolean);
drop function public.withdraw_workout_share(uuid);
drop function public.withdraw_community_share(uuid);

create index community_feed_workout_date on public.community_workout_shares(performed_on desc,id desc);
create index community_author_workout_date on public.community_workout_shares(author_id,performed_on desc,id desc);
-- Keep the old feed read contract available for already-cached clients.
create function public.community_feed_v2(p_before_date date default null,p_before_id uuid default null,p_author uuid default null,p_limit integer default 10)
returns setof jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',s.id,'author_id',s.author_id,'title',s.title,'performed_on',s.performed_on,
    'exercise_count',s.exercise_count,'set_count',s.set_count,'published_at',s.published_at,
    'exercise_preview',(select jsonb_agg(e) from (select distinct jsonb_build_object('exercise',e->>'exercise','exercise_id',e->>'exercise_id') e from jsonb_array_elements(s.sets) e limit 3) preview),
    'author',jsonb_build_object('user_id',p.user_id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url))
  from public.community_workout_shares s join public.user_profiles p on p.user_id=s.author_id
  where (p_author is null or s.author_id=p_author)
    and (p_before_date is null or (s.performed_on,s.id)<(p_before_date,p_before_id))
  order by s.performed_on desc,s.id desc limit greatest(1,least(coalesce(p_limit,10),20));
$$;
revoke all on function public.community_feed_v2(date,uuid,uuid,integer) from public,anon;
grant execute on function public.community_feed_v2(date,uuid,uuid,integer) to authenticated;

-- Preserve explicit OFF choices; initialize only previously unset preferences.
insert into public.user_preferences(user_id) select id from auth.users on conflict(user_id) do nothing;
do $$ declare member record; begin
  for member in select user_id from public.user_profiles order by user_id loop
    perform lifeos_private.sync_community_member(member.user_id);
  end loop;
end $$;
