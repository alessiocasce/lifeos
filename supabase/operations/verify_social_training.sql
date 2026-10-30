-- Controlled production/local smoke. All fixtures and changes are rolled back.
-- Execute as the migration/admin connection; checks themselves use authenticated/anon.
begin;
select set_config('lifeos.qa_user_a',gen_random_uuid()::text,true),
       set_config('lifeos.qa_user_b',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('lifeos.qa_user_a')::uuid),(current_setting('lifeos.qa_user_b')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('lifeos.qa_user_a'),true);
select public.save_user_settings('qa_'||substr(replace(current_setting('lifeos.qa_user_a'),'-',''),1,16),'Rollout QA A','en',false,false);
with w as (insert into public.workouts(name,ended_at) values('ROLLBACK-ONLY Training QA',now()) returning id)
select set_config('lifeos.qa_workout_a',id::text,true) from w;
insert into public.workout_sets(workout_id,exercise,exercise_id,set_number,weight,reps)
values(current_setting('lifeos.qa_workout_a')::uuid,'Dumbbell Bench Press',public.resolve_exercise_id('Panca Piana Manubri'),1,30,10),
      (current_setting('lifeos.qa_workout_a')::uuid,'Rollout QA custom',null,2,12,8);
select set_config('request.jwt.claim.sub',current_setting('lifeos.qa_user_b'),true);
select public.save_user_settings('qa_'||substr(replace(current_setting('lifeos.qa_user_b'),'-',''),1,16),'Rollout QA B','it',false,false);
do $$
declare affected integer; private_table text; visible integer;
begin
  if (select count(*) from public.user_preferences) <> 1 or
     (select language from public.user_preferences) <> 'it' then raise exception 'Preference isolation failed'; end if;
  if (select count(*) from public.user_profiles where user_id in(current_setting('lifeos.qa_user_a')::uuid,current_setting('lifeos.qa_user_b')::uuid)) <> 2 then raise exception 'Public profile projection failed'; end if;
  update public.user_profiles set display_name='Forbidden' where user_id=current_setting('lifeos.qa_user_a')::uuid;
  get diagnostics affected=row_count;
  if affected <> 0 then raise exception 'Cross-user profile update allowed'; end if;
  update public.user_preferences set language='en' where user_id=current_setting('lifeos.qa_user_a')::uuid;
  get diagnostics affected=row_count;
  if affected <> 0 then raise exception 'Cross-user preference update allowed'; end if;
  update public.workout_sets set weight=999 where workout_id=current_setting('lifeos.qa_workout_a')::uuid;
  get diagnostics affected=row_count;
  if affected <> 0 then raise exception 'Cross-user workout update allowed'; end if;
  foreach private_table in array array['workouts','workout_sets','workout_templates','workout_template_exercises','ai_memories','projects','health_logs','expenses','memos','calendar_events'] loop
    execute format('select count(*) from public.%I where user_id <> auth.uid()',private_table) into visible;
    if visible <> 0 then raise exception 'Private rows visible in %',private_table; end if;
  end loop;
  if (select count(*) from public.exercise_catalog) <> 224 or (select count(*) from public.exercise_catalog where active) <> 79 then raise exception 'Catalog count incorrect'; end if;
  if public.resolve_exercise_id('Panca Piana con Manubri') is distinct from public.resolve_exercise_id('Dumbbell Bench Press') then raise exception 'Bilingual identity mismatch'; end if;
  begin
    update public.exercise_catalog set name_en='Forbidden';
    raise exception 'Catalog mutation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_user_settings(upper('qa_'||substr(replace(current_setting('lifeos.qa_user_a'),'-',''),1,16)),'Duplicate','en',false,false);
    raise exception 'Case-insensitive username uniqueness failed';
  exception when unique_violation then null;
  end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('lifeos.qa_user_a'),true);
do $$ begin
  if (select language from public.user_preferences) <> 'en' or
     (select count(*) from public.user_preferences where workout_sharing or share_workout_notes) <> 0 or
     (select count(*) from public.workout_sets where workout_id=current_setting('lifeos.qa_workout_a')::uuid) <> 2 then raise exception 'Owner data/defaults changed'; end if;
end $$;
set local role anon;
do $$ begin
  begin
    insert into public.user_profiles(username,display_name) values('anon_qa','Forbidden');
    raise exception 'Anonymous profile write allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_user_preferences('it',false,false);
    raise exception 'Anonymous preference write allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'PASS: authenticated A/B RLS, private tables, canonical/custom set inserts, catalog grants, bilingual IDs, username uniqueness, anonymous writes; rollback-only fixtures' as result;
rollback;
