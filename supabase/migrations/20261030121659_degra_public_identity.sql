-- Runtime admin parameter, never a committed private UUID. No authentication account is created.
create function public.configure_degra_member(p_user uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(742029301::bigint);
  if p_user is null or not exists(select 1 from auth.users where id=p_user)
    or exists(select 1 from public.user_profiles where user_id=p_user and lower(username)<>'degra')
    or (select count(*) from public.workouts where user_id=p_user)<>2
    or (select count(*) from public.workouts where user_id=p_user and ended_at is not null)<>2
    or (select count(*) from public.workout_sets where user_id=p_user)<>16 then
    raise exception 'Authorized member cohort changed; review before provisioning';
  end if;
  if exists(select 1 from public.user_profiles where lower(username)='degra' and user_id<>p_user) then raise exception 'Username unavailable'; end if;
  insert into public.user_preferences(user_id,workout_sharing,share_workout_notes)
  values(p_user,true,false) on conflict(user_id) do update set workout_sharing=true,share_workout_notes=false
  where (user_preferences.workout_sharing,user_preferences.share_workout_notes) is distinct from (true,false);
  insert into public.user_profiles(user_id,username,display_name) values(p_user,'degra','degra')
  on conflict(user_id) do update set username='degra',display_name='degra'
  where (user_profiles.username,user_profiles.display_name) is distinct from ('degra','degra');
  perform lifeos_private.sync_community_member(p_user);
end $$;
revoke all on function public.configure_degra_member(uuid) from public,anon,authenticated,service_role;
