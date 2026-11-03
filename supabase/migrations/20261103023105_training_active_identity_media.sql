-- Forward-only expansion. Workout contents, historical notes and identity remain intact.
alter table public.workouts add column template_appearance jsonb;
alter table public.workouts add constraint workouts_template_appearance_valid check (
  template_appearance is null or (jsonb_typeof(template_appearance)='object'
    and template_appearance ?& array['color_key','icon_key']
    and template_appearance->>'color_key' in ('red','blue','purple','amber','green','cyan','pink','slate')
    and template_appearance->>'icon_key' in ('chest','back','shoulders','biceps','triceps','quads','hamstrings','calves','core','full_body','boxing','dumbbell')));
create function lifeos_private.capture_workout_appearance() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then new.template_appearance:=old.template_appearance;
  else
    new.template_appearance:=null;
    if new.template_id is not null then
      select jsonb_build_object('color_key',t.color_key,'icon_key',t.icon_key) into new.template_appearance
      from public.workout_templates t where t.id=new.template_id and t.user_id=new.user_id;
    end if;
  end if;
  return new;
end $$;
revoke all on function lifeos_private.capture_workout_appearance() from public,anon,authenticated;
create trigger capture_workout_appearance before insert or update on public.workouts
for each row execute function lifeos_private.capture_workout_appearance();

-- Disable the producer before retiring its RPCs. Never touch other outbox sources.
drop trigger if exists workout_set_rest_timer on public.workout_sets;
drop trigger if exists workout_close_rest_timer on public.workouts;
update public.brain_outbox_messages set status='cancelled'
where source_type='workout_rest_timer' and status in ('queued','claimed');
drop function if exists public.after_workout_set_rest_timer();
drop function if exists public.cancel_workout_rest_on_close();
drop function if exists public.control_workout_rest_timer(uuid,text,text,uuid,boolean,integer);
drop function if exists public.schedule_workout_rest_timer(uuid);
-- Keep old preferences inert for recovery, with no application access or writer.
revoke all on public.workout_rest_preferences from public,anon,authenticated;
create function lifeos_private.reject_retired_rest_timer() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.source_type='workout_rest_timer' and new.status in ('queued','claimed') then
    raise exception 'Workout rest timer has been removed' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function lifeos_private.reject_retired_rest_timer() from public,anon,authenticated;
create trigger reject_retired_rest_timer before insert or update on public.brain_outbox_messages
for each row execute function lifeos_private.reject_retired_rest_timer();

-- JPEG fallback keeps the bucket private and the identical UUID/owner path scope.
alter table public.user_profiles drop constraint if exists user_profiles_avatar_path_check;
alter table public.user_profiles drop constraint if exists user_profiles_check;
alter table public.user_profiles add constraint user_profiles_avatar_path_check
check(avatar_path is null or avatar_path ~ ('^'||user_id::text||'/[0-9a-f-]{36}[.](webp|jpg)$'));
update storage.buckets set allowed_mime_types=array['image/webp','image/jpeg'],file_size_limit=1048576
where id='profile-avatars';
alter policy profile_avatars_insert on storage.objects with check (
  bucket_id='profile-avatars' and name ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}[.](webp|jpg)$'));
alter policy profile_avatars_update on storage.objects with check (
  bucket_id='profile-avatars' and name ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}[.](webp|jpg)$'));
create or replace function public.set_profile_avatar(p_path text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_path is not null and (p_path !~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}[.](webp|jpg)$')
    or not exists(select 1 from storage.objects where bucket_id='profile-avatars' and name=p_path)) then
    raise exception 'Invalid profile photo' using errcode='22023';
  end if;
  update public.user_profiles set avatar_path=p_path,avatar_url=null where user_id=auth.uid();
  if not found then raise exception 'Set a username before adding a photo' using errcode='22023'; end if;
end $$;
revoke all on function public.set_profile_avatar(text) from public,anon;
grant execute on function public.set_profile_avatar(text) to authenticated;

-- Availability is only a hint; the existing lower(username) unique index wins races.
create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(p_username ~ '^[A-Za-z][A-Za-z0-9_]{2,23}$',false)
    and not exists(select 1 from public.user_profiles where lower(username)=lower(p_username));
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon,authenticated;
create function public.complete_user_profile(p_username text default null) returns void
language plpgsql security definer set search_path='' as $$
declare candidate text; confirmed boolean; requested_language text; uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select email_confirmed_at is not null,coalesce(p_username,raw_user_meta_data->>'requested_username'),raw_user_meta_data->>'requested_language'
    into confirmed,candidate,requested_language from auth.users where id=uid;
  if not coalesce(confirmed,false) then raise exception 'Confirm your email before choosing a username' using errcode='42501'; end if;
  -- Metadata is an untrusted suggestion, never an ownership/permission claim.
  if candidate is null or candidate !~ '^[A-Za-z][A-Za-z0-9_]{2,23}$' then
    raise exception 'Use a 3–24 character username starting with a letter.' using errcode='22023';
  end if;
  insert into public.user_profiles(user_id,username) values(uid,candidate)
    on conflict(user_id) do nothing;
  insert into public.user_preferences(user_id,language,workout_sharing,share_workout_notes)
    values(uid,case when requested_language='it' then 'it' else 'en' end,true,false)
    on conflict(user_id) do nothing;
exception when unique_violation then
  raise exception 'Username is already taken. Choose another username.' using errcode='23505';
end $$;
revoke all on function public.complete_user_profile(text) from public,anon;
grant execute on function public.complete_user_profile(text) to authenticated;
