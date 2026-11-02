-- Current automatic-sharing contract; real roles, no persistent QA users/posts.
begin;
select set_config('qa.a',gen_random_uuid()::text,true),set_config('qa.b',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('qa.a')::uuid),(current_setting('qa.b')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.a'),true);
do $$ begin
  if not (select workout_sharing from public.user_preferences where user_id=auth.uid())
    or (select share_workout_notes from public.user_preferences where user_id=auth.uid()) then raise exception 'New account defaults';end if;
end $$;
select public.save_user_settings('qa_'||substr(replace(current_setting('qa.a'),'-',''),1,16),'Automatic QA A','en',false,false);
with w as(insert into public.workouts(name,notes,performed_on,ended_at) values('Rollback historical','PRIVATE SESSION NOTE','2025-01-02',now()) returning id)
select set_config('qa.w',id::text,true) from w;
with w as(insert into public.workouts(name,performed_on) values('Rollback active','2025-01-03') returning id)
select set_config('qa.active',id::text,true) from w;
insert into public.workout_sets(workout_id,exercise,exercise_id,set_number,weight,reps,rpe,notes)
values(current_setting('qa.w')::uuid,'Dumbbell Bench Press',public.resolve_exercise_id('Dumbbell Bench Press'),1,30,10,8,'PRIVATE SET NOTE');
do $$ begin if public.workout_share_status(current_setting('qa.w')::uuid) is not null then raise exception 'OFF leaked';end if;end $$;
select public.set_user_preferences('en',true,false);
select set_config('qa.share',public.workout_share_status(current_setting('qa.w')::uuid)::text,true);
do $$ begin
  if current_setting('qa.share')='' then raise exception 'Historical backfill missing';end if;
  if public.workout_share_status(current_setting('qa.active')::uuid) is not null then raise exception 'Active published';end if;
  if exists(select 1 from public.community_workout_shares s cross join lateral jsonb_array_elements(s.sets) e where s.author_id=auth.uid() and (s.notes is not null or e->>'notes' is not null)) then raise exception 'Default notes leak';end if;
end $$;
insert into public.workout_sets(workout_id,exercise,set_number,is_warmup,weight,reps) values(current_setting('qa.w')::uuid,'Custom',1001,true,10,12);
update public.workout_sets set reps=11 where workout_id=current_setting('qa.w')::uuid and set_number=1;
do $$ begin
  if (select set_count from public.community_workout_shares where id=current_setting('qa.share')::uuid)<>2 then raise exception 'Set insertion not synchronized';end if;
  if not exists(select 1 from public.community_workout_shares s cross join lateral jsonb_array_elements(s.sets) e where s.id=current_setting('qa.share')::uuid and e->>'reps'='11') then raise exception 'Set update not synchronized';end if;
end $$;
delete from public.workout_sets where workout_id=current_setting('qa.w')::uuid and set_number=1001;
update public.workouts set name='Edited historical' where id=current_setting('qa.w')::uuid;
do $$ begin if not exists(select 1 from public.community_workout_shares where id=current_setting('qa.share')::uuid and set_count=1 and title='Edited historical' and performed_on='2025-01-02') then raise exception 'Source/date synchronization';end if;end $$;
select public.set_user_preferences('en',true,true);
select set_config('request.jwt.claim.sub',current_setting('qa.b'),true);
-- B can read only the projection, not source records or private source IDs.
do $$ begin
  if not exists(select 1 from public.community_workout_shares where id=current_setting('qa.share')::uuid and notes='PRIVATE SESSION NOTE') then raise exception 'Enabled notes absent';end if;
  if exists(select 1 from public.workout_sets where user_id=current_setting('qa.a')::uuid) or exists(select 1 from public.workouts where user_id=current_setting('qa.a')::uuid) then raise exception 'Private source leak';end if;
  update public.user_profiles set display_name='Forbidden' where user_id=current_setting('qa.a')::uuid;
  if found then raise exception 'Cross profile update';end if;
  update public.user_preferences set workout_sharing=false where user_id=current_setting('qa.a')::uuid;
  if found then raise exception 'Cross preference update';end if;
  begin perform source_workout_id from public.community_workout_shares;raise exception 'Source ID exposed';exception when insufficient_privilege then null;end;
  begin delete from public.community_workout_shares;raise exception 'Direct revoke';exception when insufficient_privilege then null;end;
  begin insert into public.workout_sets(workout_id,exercise,set_number,weight,reps) values(current_setting('qa.w')::uuid,'Intrusion',8,1,1);raise exception 'Foreign parent accepted';exception when insufficient_privilege then null;end;
  if public.workout_share_status(current_setting('qa.w')::uuid) is not null then raise exception 'Private share status leak';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.a'),true);
select public.set_user_preferences('en',true,false);
select set_config('request.jwt.claim.sub',current_setting('qa.b'),true);
do $$ begin
  if exists(select 1 from public.community_workout_shares s cross join lateral jsonb_array_elements(s.sets) e where id=current_setting('qa.share')::uuid and (notes is not null or e->>'notes' is not null)) then raise exception 'Revoked notes leak';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.a'),true);
select public.set_user_preferences('en',false,false);
select set_config('request.jwt.claim.sub',current_setting('qa.b'),true);
do $$ begin if exists(select 1 from public.community_workout_shares where id=current_setting('qa.share')::uuid) then raise exception 'OFF old detail visible';end if;end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.a'),true);
select public.set_user_preferences('en',true,false);
do $$ begin if public.workout_share_status(current_setting('qa.w')::uuid) is null then raise exception 'ON failed restore';end if;end $$;
update public.workouts set ended_at=null where id=current_setting('qa.w')::uuid;
do $$ begin if public.workout_share_status(current_setting('qa.w')::uuid) is not null then raise exception 'Reopened visible';end if;end $$;
update public.workouts set ended_at=now() where id=current_setting('qa.w')::uuid;
do $$ begin if public.workout_share_status(current_setting('qa.w')::uuid) is null then raise exception 'Re-completion missing';end if;end $$;
delete from public.workouts where id=current_setting('qa.w')::uuid;
do $$ begin if exists(select 1 from public.community_workout_shares where author_id=auth.uid()) then raise exception 'Deleted source visible';end if;end $$;
-- A member without a public profile remains private until their authored identity is created.
select set_config('request.jwt.claim.sub',current_setting('qa.b'),true);
with w as(insert into public.workouts(name,ended_at) values('Pre-profile workout',now()) returning id)
select set_config('qa.preprofile',id::text,true) from w;
insert into public.workout_sets(workout_id,exercise,set_number,weight,reps) values(current_setting('qa.preprofile')::uuid,'Custom',1,10,8);
do $$ begin if public.workout_share_status(current_setting('qa.preprofile')::uuid) is not null then raise exception 'Missing profile visible';end if;end $$;
select public.save_user_settings('qa_'||substr(replace(current_setting('qa.b'),'-',''),1,16),'Automatic QA B','it',true,false);
do $$ begin if public.workout_share_status(current_setting('qa.preprofile')::uuid) is null then raise exception 'Profile creation failed backfill';end if;end $$;
-- Chronological keyset pagination is independent of publication timestamps.
select set_config('request.jwt.claim.sub',current_setting('qa.a'),true);
do $$ declare w uuid; i integer; begin
  for i in 1..12 loop
    insert into public.workouts(name,performed_on,ended_at) values('Rollback page '||i,'2025-01-01'::date+i,now()) returning id into w;
    insert into public.workout_sets(workout_id,exercise,set_number,weight,reps) values(w,'Custom page',1,10,8);
  end loop;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.b'),true);
do $$ declare p1 jsonb[];p2 jsonb[];last_row jsonb; begin
  select array_agg(e) into p1 from public.community_feed_v2(null,null,current_setting('qa.a')::uuid,10) e;
  if array_length(p1,1)<>10 or p1[1]->>'performed_on'<>'2025-01-13' then raise exception 'Workout chronology/page size';end if;
  last_row:=p1[10];
  select array_agg(e) into p2 from public.community_feed_v2((last_row->>'performed_on')::date,(last_row->>'id')::uuid,current_setting('qa.a')::uuid,10) e;
  if array_length(p2,1)<>2 then raise exception 'Second page size';end if;
  if exists(select 1 from unnest(p1) a cross join unnest(p2) b where a->>'id'=b->>'id') then raise exception 'Duplicate pages';end if;
end $$;
set local role anon;
do $$ begin
  begin perform id from public.community_workout_shares;raise exception 'Anonymous share read';exception when insufficient_privilege then null;end;
  begin perform username from public.user_profiles;raise exception 'Anonymous member read';exception when insufficient_privilege then null;end;
  begin perform public.community_feed_v2();raise exception 'Anonymous feed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS automatic Community: defaults, history, source edits, OFF/ON, notes, profile onboarding, A/B/anon RLS, chronology/keyset pages; all fixtures rolled back' result;
