-- Public identity is explicitly authored; never copy auth metadata or emails.
create table public.user_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-zA-Z][a-zA-Z0-9_]{2,23}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  avatar_url text check (avatar_url is null or (length(avatar_url) <= 1000 and avatar_url ~ '^https://')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index user_profiles_username_ci on public.user_profiles(lower(username));
alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from public, anon, authenticated;
grant select, delete on public.user_profiles to authenticated;
grant insert(user_id,username,display_name,avatar_url), update(username,display_name,avatar_url) on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;
create policy profiles_read on public.user_profiles for select to authenticated using (true);
create policy profiles_insert on public.user_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update on public.user_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy profiles_delete on public.user_profiles for delete to authenticated using ((select auth.uid()) = user_id);
create table public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  language text not null default 'en' check (language in ('en','it')),
  workout_sharing boolean not null default false, share_workout_notes boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from public, anon, authenticated;
grant select, delete on public.user_preferences to authenticated;
grant insert(user_id,language,workout_sharing,share_workout_notes), update(language,workout_sharing,share_workout_notes) on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;
create policy preferences_own on public.user_preferences for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create trigger user_profiles_updated before update on public.user_profiles for each row execute function public.set_updated_at();
create trigger user_preferences_updated before update on public.user_preferences for each row execute function public.set_updated_at();
-- No existing private policies change. Sharing flags publish nothing in Phase 0.
create function public.set_user_preferences(p_language text, p_workout_sharing boolean, p_share_notes boolean)
returns public.user_preferences language sql security invoker set search_path = '' as $$
  insert into public.user_preferences(user_id,language,workout_sharing,share_workout_notes)
  values(auth.uid(),p_language,p_workout_sharing,p_share_notes)
  on conflict(user_id) do update set language=excluded.language,workout_sharing=excluded.workout_sharing,share_workout_notes=excluded.share_workout_notes returning *;
$$;
revoke all on function public.set_user_preferences(text,boolean,boolean) from public, anon;
grant execute on function public.set_user_preferences(text,boolean,boolean) to authenticated;
create function public.save_user_settings(p_username text,p_display_name text,p_language text,p_workout_sharing boolean,p_share_notes boolean)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.user_profiles(user_id,username,display_name) values(auth.uid(),trim(p_username),trim(p_display_name))
  on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name;
  perform public.set_user_preferences(p_language,p_workout_sharing,p_share_notes);
end;
$$;
revoke all on function public.save_user_settings(text,text,text,boolean,boolean) from public, anon;
grant execute on function public.save_user_settings(text,text,text,boolean,boolean) to authenticated;
