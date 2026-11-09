-- Transaction-scoped production smoke. Never commit the temporary workout/sets.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare a uuid; w uuid; s uuid; first_timer uuid; n integer;
begin
  select id into a from auth.users order by id limit 1;
  if a is null then raise exception 'No authenticated identity'; end if;
  insert into public.workouts(user_id,name,performed_on,started_at)
    values(a,'Transaction-only release QA',current_date,now()) returning id into w;
  insert into public.workout_web_rest_preferences(user_id,enabled,notifications,seconds)
    values(a,false,false,15) on conflict(user_id) do update set enabled=false,notifications=false,seconds=15;
  insert into public.workout_sets(user_id,workout_id,exercise,set_number,weight,reps)
    values(a,w,'Transaction QA',1,10,8);
  if exists(select 1 from public.workout_rest_timers where workout_id=w) then raise exception 'OFF scheduled timer'; end if;
  update public.workout_web_rest_preferences set enabled=true where user_id=a;
  insert into public.workout_sets(user_id,workout_id,exercise,set_number,weight,reps)
    values(a,w,'Transaction QA',2,10,8) returning id into s;
  select id into first_timer from public.workout_rest_timers where set_id=s;
  if first_timer is null then raise exception 'Enabled timer missing'; end if;
  if exists(select 1 from public.workout_rest_timers where id=first_timer and
    (scheduled_for<>statement_timestamp()+interval '15 seconds' or expires_at<>scheduled_for+interval '300 seconds' or delivery_enabled)) then
    raise exception 'Deadline/expiry/notification default incorrect';
  end if;
  update public.workout_sets set reps=9 where id=s;
  if (select count(*) from public.workout_rest_timers where set_id=s)<>1 then raise exception 'Duplicate timer'; end if;
  insert into public.workout_sets(user_id,workout_id,exercise,set_number,weight,reps)
    values(a,w,'Transaction QA',3,10,8);
  if (select state from public.workout_rest_timers where id=first_timer)<>'cancelled' then raise exception 'Replacement did not cancel'; end if;
  if (select count(*) from public.workout_rest_timers where workout_id=w and state='queued')<>1 then raise exception 'Pending count'; end if;
  update public.workout_web_rest_preferences set enabled=false where user_id=a;
  if exists(select 1 from public.workout_rest_timers where workout_id=w and state='queued') then raise exception 'Disable cancellation'; end if;
  update public.workout_web_rest_preferences set enabled=true where user_id=a;
  insert into public.workout_sets(user_id,workout_id,exercise,set_number,weight,reps)
    values(a,w,'Transaction QA',4,10,8);
  update public.workouts set ended_at=now() where id=w;
  if exists(select 1 from public.workout_rest_timers where workout_id=w and state='queued') then raise exception 'End cancellation'; end if;
  select count(*) into n from public.workout_sets where workout_id=w;
  if n<>4 then raise exception 'Workout sets lost'; end if;
  insert into public.workout_sets(user_id,workout_id,exercise,set_number,weight,reps)
    values(a,w,'Transaction QA',5,10,8);
  if (select count(*) from public.workout_rest_timers where workout_id=w)<>3 then raise exception 'Historical set armed timer'; end if;
end $$;
select json_build_object('timer_off',true,'deadline_expiry',true,'idempotency',true,
  'replacement',true,'disable',true,'end',true,'historical_not_armed',true) transaction_smoke;
rollback;
