-- Rollback-only fixtures; ordinary roles exercise every authorization boundary.
begin;
select set_config('qa.a',gen_random_uuid()::text,true),set_config('qa.b',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('qa.a')::uuid),(current_setting('qa.b')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.a'),true);
select public.save_user_settings('qa_'||substr(replace(current_setting('qa.a'),'-',''),1,16),'Community QA A','en',false,false);
with w as(insert into public.workouts(name,notes,ended_at) values('Rollback-only shared','PRIVATE SESSION NOTE',now()) returning id)
select set_config('qa.w',id::text,true) from w;
with w as(insert into public.workouts(name) values('Rollback-only active') returning id)
select set_config('qa.active',id::text,true) from w;
insert into public.workout_sets(workout_id,exercise,exercise_id,set_number,weight,reps,rpe,notes)
values(current_setting('qa.w')::uuid,'Dumbbell Bench Press',public.resolve_exercise_id('Dumbbell Bench Press'),1,30,10,8,'PRIVATE SET NOTE'),
 (current_setting('qa.w')::uuid,'My authored custom',null,1001,10,12,null,'PRIVATE WARMUP NOTE');
do $$ begin
  begin perform public.publish_workout_share(current_setting('qa.w')::uuid,false,true,true);raise exception 'Sharing OFF bypass';exception when insufficient_privilege then null;end;
end $$;
select public.set_user_preferences('en',true,false);
do $$ begin
  begin perform public.publish_workout_share(current_setting('qa.active')::uuid,false,true,true);raise exception 'Active publish bypass';exception when raise_exception then if sqlerrm<>'Only completed workouts can be shared' then raise;end if;end;
  begin perform public.publish_workout_share(current_setting('qa.w')::uuid,true,true,true);raise exception 'Notes bypass';exception when insufficient_privilege then null;end;
  perform public.publish_workout_share(current_setting('qa.w')::uuid,false,true,false);
  if exists(select 1 from public.community_workout_shares) then raise exception 'Preview published';end if;
end $$;
select public.publish_workout_share(current_setting('qa.w')::uuid,false,true,true);
select public.publish_workout_share(current_setting('qa.w')::uuid,false,true,true);
select public.save_user_settings('qa_'||substr(replace(current_setting('qa.a'),'-',''),1,16),'Community QA A','en',true,true);
select public.publish_workout_share(current_setting('qa.w')::uuid,true,true,true);
select set_config('qa.share',public.workout_share_status(current_setting('qa.w')::uuid)::text,true);
select set_config('request.jwt.claim.sub',current_setting('qa.b'),true);
select public.save_user_settings('qa_'||substr(replace(current_setting('qa.b'),'-',''),1,16),'Community QA B','it',false,false);
select public.set_user_preferences('it',true,false);
do $$ begin
  if (select count(*) from public.community_feed(null,null,current_setting('qa.a')::uuid,10))<>1 then raise exception 'Idempotent feed missing';end if;
  if (select notes from public.community_workout_shares where author_id=current_setting('qa.a')::uuid)<>'PRIVATE SESSION NOTE' then raise exception 'Explicit notes missing';end if;
  if exists(select 1 from public.community_workout_shares s cross join lateral jsonb_array_elements(s.sets) e
      cross join lateral jsonb_object_keys(e) k where k not in('exercise','exercise_id','set_number','is_warmup','weight','reps','rpe','notes')) then raise exception 'Unexpected private set fields';end if;
  if exists(select 1 from public.workouts where user_id=current_setting('qa.a')::uuid) or exists(select 1 from public.workout_sets where user_id=current_setting('qa.a')::uuid) then raise exception 'Private source leak';end if;
  begin perform public.publish_workout_share(current_setting('qa.w')::uuid,false,true,true);raise exception 'Cross publish';exception when insufficient_privilege then null;end;
  begin perform public.withdraw_workout_share(current_setting('qa.w')::uuid);raise exception 'Cross revoke';exception when insufficient_privilege then null;end;
  begin perform public.withdraw_community_share(current_setting('qa.share')::uuid);raise exception 'Cross public-ID revoke';exception when insufficient_privilege then null;end;
  begin perform source_workout_id from public.community_workout_shares;raise exception 'Private source ID leak';exception when insufficient_privilege then null;end;
  begin delete from public.community_workout_shares;raise exception 'Direct delete allowed';exception when insufficient_privilege then null;end;
  begin insert into public.workout_sets(workout_id,exercise,set_number,weight,reps) values(current_setting('qa.w')::uuid,'Intrusion',5,1,1);raise exception 'Foreign source insertion allowed';exception when insufficient_privilege then null;end;
  if public.workout_share_status(current_setting('qa.w')::uuid) is not null then raise exception 'Owner status leak';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.a'),true);
select public.set_user_preferences('en',true,false);
select set_config('request.jwt.claim.sub',current_setting('qa.b'),true);
do $$ begin
  if exists(select 1 from public.community_workout_shares s cross join lateral jsonb_array_elements(s.sets) e
      where author_id=current_setting('qa.a')::uuid and (s.notes is not null or e->>'notes' is not null or s.notes_consent)) then raise exception 'Revoked notes leaked';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.a'),true);
select public.set_user_preferences('en',false,false);
select public.set_user_preferences('en',true,true);
do $$ begin if exists(select 1 from public.community_workout_shares where author_id=auth.uid()) then raise exception 'Sharing resurrected';end if;end $$;
select public.publish_workout_share(current_setting('qa.w')::uuid,false,false,true);
do $$ begin
  if exists(select 1 from public.community_workout_shares s cross join lateral jsonb_array_elements(s.sets) e where author_id=auth.uid() and e->>'rpe' is not null) then raise exception 'RPE opt-out failed';end if;
end $$;
update public.workout_sets set reps=11 where workout_id=current_setting('qa.w')::uuid and set_number=1;
do $$ begin if public.workout_share_status(current_setting('qa.w')::uuid) is not null then raise exception 'Set edit did not withdraw';end if;end $$;
select public.publish_workout_share(current_setting('qa.w')::uuid,false,true,true);
update public.workouts set ended_at=null where id=current_setting('qa.w')::uuid;
do $$ begin if public.workout_share_status(current_setting('qa.w')::uuid) is not null then raise exception 'Reopen did not withdraw';end if;end $$;
update public.workouts set ended_at=now() where id=current_setting('qa.w')::uuid;
select public.publish_workout_share(current_setting('qa.w')::uuid,false,true,true);
select public.withdraw_community_share(public.workout_share_status(current_setting('qa.w')::uuid));
do $$ begin if public.workout_share_status(current_setting('qa.w')::uuid) is not null then raise exception 'Withdrawal failed';end if;end $$;
select public.publish_workout_share(current_setting('qa.w')::uuid,false,true,true);
delete from public.workouts where id=current_setting('qa.w')::uuid;
do $$ begin if exists(select 1 from public.community_workout_shares where author_id=auth.uid()) then raise exception 'Deletion left stale share';end if;end $$;
-- More than one feed page; timestamp ties use UUID ordering.
do $$ declare w uuid; i integer; begin
  for i in 1..12 loop
    insert into public.workouts(name,ended_at) values('Rollback page '||i,now()) returning id into w;
    insert into public.workout_sets(workout_id,exercise,set_number,weight,reps) values(w,'Custom page',1,10,8);
    perform public.publish_workout_share(w,false,true,true);
  end loop;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.b'),true);
do $$ declare page1 jsonb[];page2 jsonb[];last_row jsonb; begin
  select array_agg(e) into page1 from public.community_feed(null,null,current_setting('qa.a')::uuid,10) e;
  if array_length(page1,1)<>10 then raise exception 'First page size';end if;
  last_row:=page1[10];
  select array_agg(e) into page2 from public.community_feed((last_row->>'published_at')::timestamptz,(last_row->>'id')::uuid,current_setting('qa.a')::uuid,10) e;
  if array_length(page2,1)<>2 then raise exception 'Second page size';end if;
  if exists(select 1 from unnest(page1) a cross join unnest(page2) b where a->>'id'=b->>'id') then raise exception 'Duplicate feed IDs';end if;
end $$;
set local role anon;
do $$ begin
  begin perform id from public.community_workout_shares;raise exception 'Anonymous share read';exception when insufficient_privilege then null;end;
  begin perform username from public.user_profiles;raise exception 'Anonymous member read';exception when insufficient_privilege then null;end;
  begin perform public.community_feed();raise exception 'Anonymous feed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS Community: real authenticated A/B and anon roles; privacy/notes revocation, ownership, active rejection, source invalidation, idempotency, keyset pages; all fixtures rolled back' result;
