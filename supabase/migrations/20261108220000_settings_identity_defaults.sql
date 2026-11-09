-- Forward-only Settings/identity correction. Apply in one migration transaction.
-- No workout/source/ownership rewrite; case-insensitive profile links still resolve.
-- Match the existing Community writer lock order before taking a profile table lock.
select pg_catalog.pg_advisory_xact_lock(742029301::bigint);
lock table public.user_profiles in share row exclusive mode;
do $$
begin
  if exists (select 1 from public.user_profiles group by lower(trim(username)) having count(*) > 1) then
    raise exception 'Resolve case-insensitive username collisions before applying Settings identity defaults' using errcode='23505';
  end if;
end $$;

create or replace function lifeos_private.normalize_profile_username() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  new.username := lower(trim(new.username));
  return new;
end $$;
revoke all on function lifeos_private.normalize_profile_username() from public,anon,authenticated;
drop trigger if exists normalize_profile_username on public.user_profiles;
create trigger normalize_profile_username before insert or update of username on public.user_profiles
for each row execute function lifeos_private.normalize_profile_username();
update public.user_profiles set username=lower(trim(username)) where username is distinct from lower(trim(username));
alter table public.user_profiles drop constraint if exists user_profiles_username_lowercase;
alter table public.user_profiles add constraint user_profiles_username_lowercase check(username=lower(trim(username)));
create unique index if not exists user_profiles_username_ci on public.user_profiles(lower(username));
alter table public.user_preferences alter column language set default 'it';
-- Sharing is independently opt-out; never reset an existing explicit choice.
alter table public.user_preferences alter column workout_sharing set default true;
alter table public.user_preferences alter column share_workout_notes set default false;

create or replace function lifeos_private.initialize_training_preferences() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Metadata only chooses a language, never authorization or public identity.
  insert into public.user_preferences(user_id,language,workout_sharing,share_workout_notes)
    values(new.id,case when new.raw_user_meta_data->>'requested_language'='en' then 'en' else 'it' end,true,false)
    on conflict(user_id) do nothing;
  return null;
end $$;
revoke all on function lifeos_private.initialize_training_preferences() from public,anon,authenticated,service_role;

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(lower(trim(p_username)) ~ '^[a-z][a-z0-9_]{2,23}$',false)
    and not exists(select 1 from public.user_profiles where lower(username)=lower(trim(p_username)));
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon,authenticated;

create or replace function public.complete_user_profile(p_username text default null) returns void
language plpgsql security definer set search_path='' as $$
declare candidate text; confirmed boolean; requested_language text; uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select email_confirmed_at is not null,lower(trim(coalesce(p_username,raw_user_meta_data->>'requested_username'))),raw_user_meta_data->>'requested_language'
    into confirmed,candidate,requested_language from auth.users where id=uid;
  if not coalesce(confirmed,false) then raise exception 'Confirm your email before choosing a username' using errcode='42501'; end if;
  if candidate is null or candidate !~ '^[a-z][a-z0-9_]{2,23}$' then
    raise exception 'Use a 3–24 character username starting with a letter.' using errcode='22023';
  end if;
  insert into public.user_preferences(user_id,language,workout_sharing,share_workout_notes)
    values(uid,case when requested_language='en' then 'en' else 'it' end,true,false) on conflict(user_id) do nothing;
  insert into public.user_profiles(user_id,username) values(uid,candidate) on conflict(user_id) do nothing;
exception when unique_violation then
  raise exception 'Username is already taken. Choose another username.' using errcode='23505';
end $$;
revoke all on function public.complete_user_profile(text) from public,anon;
grant execute on function public.complete_user_profile(text) to authenticated;
