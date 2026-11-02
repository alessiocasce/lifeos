-- Apply ONLY after the username-only frontend is serving production.
drop function public.save_user_settings(text,text,text,boolean,boolean);
-- The one-off, administrator-only cohort provisioner is no longer a live API.
drop function public.configure_degra_member(uuid);
create or replace function public.save_user_settings(p_username text,p_language text,p_workout_sharing boolean,p_share_notes boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.user_profiles(user_id,username) values(auth.uid(),trim(p_username))
  on conflict(user_id) do update set username=excluded.username;
  perform public.set_user_preferences(p_language,p_workout_sharing,p_share_notes);
end $$;
-- Retain the old feed pagination contract, but no obsolete public-name field.
create or replace function public.community_feed(p_before_time timestamptz default null,p_before_id uuid default null,p_author uuid default null,p_limit integer default 10)
returns setof jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',s.id,'author_id',s.author_id,'title',s.title,'performed_on',s.performed_on,
    'exercise_count',s.exercise_count,'set_count',s.set_count,'published_at',s.published_at,
    'exercise_preview',(select jsonb_agg(e) from (select distinct jsonb_build_object('exercise',e->>'exercise','exercise_id',e->>'exercise_id') e from jsonb_array_elements(s.sets) e limit 3) preview),
    'author',jsonb_build_object('user_id',p.user_id,'username',p.username,'avatar_url',p.avatar_url,'avatar_path',p.avatar_path))
  from public.community_workout_shares s join public.user_profiles p on p.user_id=s.author_id
  where (p_author is null or s.author_id=p_author)
    and (p_before_time is null or (s.published_at,s.id)<(p_before_time,p_before_id))
  order by s.published_at desc,s.id desc limit greatest(1,least(coalesce(p_limit,10),20));
$$;
alter table public.user_profiles drop column display_name;
