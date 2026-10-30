-- Explicit member-only snapshots. Private workout policies/grants remain unchanged.
create schema if not exists lifeos_private;
revoke all on schema lifeos_private from public,anon,authenticated;
create table public.community_workout_shares (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.user_profiles(user_id) on delete cascade,
  source_workout_id uuid not null unique references public.workouts(id) on delete cascade,
  title text not null check(length(title) between 1 and 120),
  performed_on date not null,
  notes text,
  notes_consent boolean not null default false,
  sets jsonb not null check(jsonb_typeof(sets)='array' and jsonb_array_length(sets) between 1 and 500),
  exercise_count integer not null check(exercise_count>0),
  set_count integer not null check(set_count between 1 and 500),
  published_at timestamptz not null default now()
);
create index community_feed_order on public.community_workout_shares(published_at desc,id desc);
create index community_author_order on public.community_workout_shares(author_id,published_at desc,id desc);
alter table public.community_workout_shares enable row level security;
revoke all on public.community_workout_shares from public,anon,authenticated;
grant select(id,author_id,title,performed_on,notes,notes_consent,sets,exercise_count,set_count,published_at) on public.community_workout_shares to authenticated;
create policy community_members_read on public.community_workout_shares for select to authenticated using ((select auth.uid()) is not null);

-- One audited write boundary: derives identity and projection exclusively from private rows.
create function public.publish_workout_share(p_workout uuid,p_notes boolean default false,p_rpe boolean default true,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); prefs public.user_preferences; w public.workouts;
  rows jsonb; exercises integer; n integer; result_id uuid; result jsonb;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  -- Serialize publication against privacy changes before locking source workout.
  select * into prefs from public.user_preferences where user_id=actor for update;
  if not found or not prefs.workout_sharing then raise exception 'Enable workout sharing in Settings first' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where user_id=actor) then raise exception 'Create your public profile first'; end if;
  select * into w from public.workouts where id=p_workout and user_id=actor for no key update;
  if not found then raise exception 'Workout unavailable' using errcode='42501'; end if;
  if w.ended_at is null then raise exception 'Only completed workouts can be shared'; end if;
  if p_notes and not prefs.share_workout_notes then raise exception 'Notes sharing is disabled' using errcode='42501'; end if;
  select count(*),count(distinct coalesce(s.exercise_id::text,'custom:'||s.exercise)),
    jsonb_agg(jsonb_build_object('exercise',s.exercise,'exercise_id',s.exercise_id,
      'set_number',s.set_number,'is_warmup',s.is_warmup,'weight',s.weight,'reps',s.reps,
      'rpe',case when p_rpe then s.rpe else null end,
      'notes',case when p_notes then left(s.notes,2000) else null end)
      order by s.performed_at,s.created_at,s.id)
    into n,exercises,rows from public.workout_sets s where s.workout_id=w.id and s.user_id=actor;
  if n=0 or n>500 then raise exception 'Share requires between 1 and 500 sets'; end if;
  result:=jsonb_build_object('title',left(w.name,120),'performed_on',w.performed_on,
    'notes',case when p_notes then left(w.notes,2000) else null end,
    'notes_consent',p_notes,'sets',rows,'exercise_count',exercises,'set_count',n);
  if p_confirm then
    insert into public.community_workout_shares(author_id,source_workout_id,title,performed_on,notes,notes_consent,sets,exercise_count,set_count)
    values(actor,w.id,result->>'title',w.performed_on,result->>'notes',p_notes,rows,exercises,n)
    on conflict(source_workout_id) do update set title=excluded.title,performed_on=excluded.performed_on,
      notes=excluded.notes,notes_consent=excluded.notes_consent,sets=excluded.sets,
      exercise_count=excluded.exercise_count,set_count=excluded.set_count
    returning id into result_id;
    result:=result||jsonb_build_object('id',result_id);
  end if;
  return result;
end $$;
revoke all on function public.publish_workout_share(uuid,boolean,boolean,boolean) from public,anon;
grant execute on function public.publish_workout_share(uuid,boolean,boolean,boolean) to authenticated;

create function public.withdraw_workout_share(p_workout uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.workouts where id=p_workout and user_id=auth.uid()) then raise exception 'Workout unavailable' using errcode='42501'; end if;
  delete from public.community_workout_shares where source_workout_id=p_workout and author_id=auth.uid();
end $$;
revoke all on function public.withdraw_workout_share(uuid) from public,anon;
grant execute on function public.withdraw_workout_share(uuid) to authenticated;

-- Owner management from Community does not require exposing a private source ID.
create function public.withdraw_community_share(p_share uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or exists(select 1 from public.community_workout_shares where id=p_share and author_id<>auth.uid()) then raise exception 'Share unavailable' using errcode='42501'; end if;
  delete from public.community_workout_shares where id=p_share and author_id=auth.uid();
end $$;
revoke all on function public.withdraw_community_share(uuid) from public,anon;
grant execute on function public.withdraw_community_share(uuid) to authenticated;

create function public.workout_share_status(p_workout uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select s.id from public.community_workout_shares s join public.workouts w on w.id=s.source_workout_id
  where w.id=p_workout and w.user_id=auth.uid() and s.author_id=auth.uid();
$$;
revoke all on function public.workout_share_status(uuid) from public,anon;
grant execute on function public.workout_share_status(uuid) to authenticated;

-- No direct client writes to snapshots. Every private source change withdraws its share.
create function lifeos_private.withdraw_changed_workout() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_id uuid; new_id uuid;
begin
  if tg_table_name='workouts' then
    old_id:=old.id;
  else
    if tg_op<>'INSERT' then old_id:=old.workout_id; end if;
    if tg_op<>'DELETE' then new_id:=new.workout_id; end if;
    if tg_op<>'DELETE' and not exists(select 1 from public.workouts where id=new_id and user_id=new.user_id) then
      raise exception 'Workout ownership mismatch' using errcode='42501';
    end if;
    -- Serialize with publication. Do not touch source timestamps.
    perform id from public.workouts where id in(old_id,new_id) order by id for no key update;
  end if;
  if tg_table_name='workouts' then
    delete from public.community_workout_shares where source_workout_id=old_id;
  else
    delete from public.community_workout_shares s where
      (tg_op<>'INSERT' and s.source_workout_id=old_id and s.author_id=old.user_id)
      or (tg_op<>'DELETE' and s.source_workout_id=new_id and s.author_id=new.user_id);
  end if;
  return null;
end $$;
revoke all on function lifeos_private.withdraw_changed_workout() from public,anon,authenticated;
create trigger community_source_workout_changed after update or delete on public.workouts for each row execute function lifeos_private.withdraw_changed_workout();
create trigger community_source_set_changed after insert or update or delete on public.workout_sets for each row execute function lifeos_private.withdraw_changed_workout();

create function lifeos_private.apply_training_privacy() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    delete from public.community_workout_shares where author_id=old.user_id;
  elsif not new.workout_sharing then
    delete from public.community_workout_shares where author_id=new.user_id;
  elsif not new.share_workout_notes then
    update public.community_workout_shares s set notes=null,notes_consent=false,
      sets=(select jsonb_agg(e||jsonb_build_object('notes',null) order by pos) from jsonb_array_elements(s.sets) with ordinality as a(e,pos))
      where author_id=new.user_id and notes_consent;
  end if;
  return null;
end $$;
revoke all on function lifeos_private.apply_training_privacy() from public,anon,authenticated;
create trigger community_privacy_changed after update or delete on public.user_preferences for each row execute function lifeos_private.apply_training_privacy();

-- Keyset pagination, independent of private client history. Explicit projection, no source IDs.
create function public.community_feed(p_before_time timestamptz default null,p_before_id uuid default null,p_author uuid default null,p_limit integer default 10)
returns setof jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',s.id,'author_id',s.author_id,'title',s.title,'performed_on',s.performed_on,
    'exercise_count',s.exercise_count,'set_count',s.set_count,'published_at',s.published_at,
    'exercise_preview',(select jsonb_agg(e) from (select distinct jsonb_build_object('exercise',e->>'exercise','exercise_id',e->>'exercise_id') e from jsonb_array_elements(s.sets) e limit 3) preview),
    'author',jsonb_build_object('user_id',p.user_id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url))
  from public.community_workout_shares s join public.user_profiles p on p.user_id=s.author_id
  where (p_author is null or s.author_id=p_author)
    and (p_before_time is null or (s.published_at,s.id)<(p_before_time,p_before_id))
  order by s.published_at desc,s.id desc limit greatest(1,least(coalesce(p_limit,10),20));
$$;
revoke all on function public.community_feed(timestamptz,uuid,uuid,integer) from public,anon;
grant execute on function public.community_feed(timestamptz,uuid,uuid,integer) to authenticated;
