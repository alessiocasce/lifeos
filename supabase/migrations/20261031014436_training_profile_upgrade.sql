-- Expand first; the old app remains compatible until the username-only cleanup.
alter table public.workout_templates
  add column color_key text not null default 'slate'
    check(color_key in ('red','blue','purple','amber','green','cyan','pink','slate')),
  add column icon_key text not null default 'dumbbell'
    check(icon_key in ('chest','back','shoulders','biceps','triceps','quads','hamstrings','calves','core','full_body','boxing','dumbbell'));

-- Assign only visual defaults to exact existing example names. The schema lock
-- protects this brief timestamp-trigger pause; historical template dates stay put.
do $$ declare pause_updated boolean; begin
  select exists(select 1 from pg_trigger where tgrelid='public.workout_templates'::regclass
    and tgname='set_workout_templates_updated_at' and tgenabled='O') into pause_updated;
  if pause_updated then alter table public.workout_templates disable trigger set_workout_templates_updated_at; end if;
  update public.workout_templates t set color_key=v.color_key,icon_key=v.icon_key
  from (values('chest + triceps','red','chest'),('back + biceps','blue','back'),
    ('quads','green','quads'),('hamstrings','amber','hamstrings'),('shoulders + arms','purple','shoulders')) v(name,color_key,icon_key)
  where lower(trim(t.name))=v.name;
  if pause_updated then alter table public.workout_templates enable trigger set_workout_templates_updated_at; end if;
end $$;

alter table public.user_profiles add column avatar_path text
  check(avatar_path is null or (avatar_path ~ ('^'||user_id::text||'/[0-9a-f-]{36}\.webp$')));
grant insert(avatar_path),update(avatar_path) on public.user_profiles to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-avatars','profile-avatars',false,1048576,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy profile_avatars_read on storage.objects for select to authenticated
using(bucket_id='profile-avatars' and (
  split_part(name,'/',1)=(select auth.uid())::text or
  exists(select 1 from public.user_profiles p where p.avatar_path=name)));
create policy profile_avatars_insert on storage.objects for insert to authenticated
with check(bucket_id='profile-avatars' and name ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}\.webp$'));
create policy profile_avatars_update on storage.objects for update to authenticated
using(bucket_id='profile-avatars' and split_part(name,'/',1)=(select auth.uid())::text)
with check(bucket_id='profile-avatars' and name ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}\.webp$'));
create policy profile_avatars_delete on storage.objects for delete to authenticated
using(bucket_id='profile-avatars' and split_part(name,'/',1)=(select auth.uid())::text);

create function public.set_profile_avatar(p_path text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_path is not null and (p_path !~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}\.webp$')
    or not exists(select 1 from storage.objects where bucket_id='profile-avatars' and name=p_path)) then
    raise exception 'Invalid profile photo' using errcode='22023';
  end if;
  update public.user_profiles set avatar_path=p_path,avatar_url=null where user_id=auth.uid();
  if not found then raise exception 'Set a username before adding a photo' using errcode='22023'; end if;
end $$;
revoke all on function public.set_profile_avatar(text) from public,anon;
grant execute on function public.set_profile_avatar(text) to authenticated;

-- Keep the legacy five-argument RPC only during the expand/deploy window.
create function public.save_user_settings(p_username text,p_language text,p_workout_sharing boolean,p_share_notes boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.user_profiles(user_id,username,display_name) values(auth.uid(),trim(p_username),trim(p_username))
  on conflict(user_id) do update set username=excluded.username;
  perform public.set_user_preferences(p_language,p_workout_sharing,p_share_notes);
end $$;
revoke all on function public.save_user_settings(text,text,boolean,boolean) from public,anon;
grant execute on function public.save_user_settings(text,text,boolean,boolean) to authenticated;

create or replace function public.community_feed_v2(p_before_date date default null,p_before_id uuid default null,p_author uuid default null,p_limit integer default 10)
returns setof jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',s.id,'author_id',s.author_id,'title',s.title,'performed_on',s.performed_on,
    'exercise_count',s.exercise_count,'set_count',s.set_count,'published_at',s.published_at,
    'exercise_preview',(select jsonb_agg(e) from (select distinct jsonb_build_object('exercise',e->>'exercise','exercise_id',e->>'exercise_id') e from jsonb_array_elements(s.sets) e limit 3) preview),
    'author',jsonb_build_object('user_id',p.user_id,'username',p.username,'avatar_url',p.avatar_url,'avatar_path',p.avatar_path))
  from public.community_workout_shares s join public.user_profiles p on p.user_id=s.author_id
  where (p_author is null or s.author_id=p_author)
    and (p_before_date is null or (s.performed_on,s.id)<(p_before_date,p_before_id))
  order by s.performed_on desc,s.id desc limit greatest(1,least(coalesce(p_limit,10),20));
$$;
