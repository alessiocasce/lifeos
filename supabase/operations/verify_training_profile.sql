-- Rollback-only ordinary-role verification. No real accounts or workouts changed.
begin;
select set_config('qa.profile_a',gen_random_uuid()::text,true),set_config('qa.profile_b',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('qa.profile_a')::uuid),(current_setting('qa.profile_b')::uuid);
select set_config('request.jwt.claim.sub',current_setting('qa.profile_a'),true);
set local role authenticated;
select public.save_user_settings('qa_'||substr(replace(current_setting('qa.profile_a'),'-',''),1,16),'it',true,false);
insert into public.workout_templates(name,color_key,icon_key) values('QA visual template','red','chest');
do $$ begin
  if not exists(select 1 from public.workout_templates where name='QA visual template' and color_key='red' and icon_key='chest') then raise exception 'Visual persistence failed';end if;
  begin insert into public.workout_templates(name,color_key) values('Bad','url(evil)');raise exception 'Unsafe color accepted';exception when check_violation then null;end;
  begin perform public.set_profile_avatar(current_setting('qa.profile_b')||'/11111111-1111-4111-8111-111111111111.webp');raise exception 'Cross-user avatar accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.profile_b'),true);
set local role authenticated;
select public.save_user_settings('qa_'||substr(replace(current_setting('qa.profile_b'),'-',''),1,16),'en',false,false);
do $$ begin
  if exists(select 1 from public.workout_templates where name='QA visual template') then raise exception 'Cross-user template read';end if;
  update public.user_profiles set username='forbidden' where user_id=current_setting('qa.profile_a')::uuid;
  if found then raise exception 'Cross-user profile update';end if;
  begin perform public.save_user_settings(upper('qa_'||substr(replace(current_setting('qa.profile_a'),'-',''),1,16)),'en',false,false);raise exception 'Duplicate username accepted';exception when unique_violation then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.save_user_settings('anonymous','en',false,false);raise exception 'Anonymous settings write';exception when insufficient_privilege then null;end;
  begin perform public.set_profile_avatar(null);raise exception 'Anonymous avatar write';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='user_profiles' and column_name='display_name') then raise exception 'Legacy column remains';end if;
  if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and prosrc ilike '%display_name%') then raise exception 'Legacy function remains';end if;
  if not exists(select 1 from storage.buckets where id='profile-avatars' and not public and file_size_limit=1048576 and allowed_mime_types=array['image/webp']) then raise exception 'Unsafe bucket';end if;
end $$;
rollback;
select 'PASS username-only settings, template visuals, avatar paths, A/B/anonymous isolation; rolled back' result;
