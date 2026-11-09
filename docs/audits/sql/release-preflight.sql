-- Read-only. Run on wrqscqhclepwxxkazbnc before approval and again after rollout.
-- Returns aggregate counts/digests only, never private records or credentials.
with curl_names(value) as (values('barbell curl'),('ez-bar curl'),('ez bar curl'),('curl con bilanciere'),('curl con bilanciere ez')),
set_counts as (
  select count(*) total,
    count(*) filter(where exercise_id='860c2371-8592-5ad9-aa43-805984020e52') retired,
    count(*) filter(where exercise_id='a2bc1c95-14c7-558d-a56b-0973cc4793dd') canonical,
    count(*) filter(where exercise_id is null and public.normalize_exercise_alias(exercise) in(select value from curl_names)) confirmed_text,
    md5(coalesce(string_agg((to_jsonb(s)-'exercise_id')::text,'' order by id),'')) protected_digest from public.workout_sets s),
template_counts as (
  select count(*) total,
    count(*) filter(where exercise_id='860c2371-8592-5ad9-aa43-805984020e52') retired,
    count(*) filter(where exercise_id='a2bc1c95-14c7-558d-a56b-0973cc4793dd') canonical,
    count(*) filter(where exercise_id is null and public.normalize_exercise_alias(exercise) in(select value from curl_names)) confirmed_text,
    md5(coalesce(string_agg((to_jsonb(s)-'exercise_id')::text,'' order by id),'')) protected_digest from public.workout_template_exercises s),
snapshots as (
  select w.id,e,pos from public.workouts w cross join lateral jsonb_array_elements(case when jsonb_typeof(w.template_snapshot)='array' then w.template_snapshot else '[]'::jsonb end) with ordinality a(e,pos)),
snapshot_counts as (
  select count(*) total_entries,
    count(*) filter(where e->>'exercise_id'='860c2371-8592-5ad9-aa43-805984020e52') retired,
    count(*) filter(where e->>'exercise_id'='a2bc1c95-14c7-558d-a56b-0973cc4793dd') canonical,
    count(*) filter(where e->>'exercise_id' is null and public.normalize_exercise_alias(e->>'exercise') in(select value from curl_names)) confirmed_text,
    count(distinct id) filter(where e->>'exercise_id'='860c2371-8592-5ad9-aa43-805984020e52' or (e->>'exercise_id' is null and public.normalize_exercise_alias(e->>'exercise') in(select value from curl_names))) affected_workouts,
    md5(coalesce(string_agg((e-'exercise_id')::text,'' order by id,pos),'')) protected_digest from snapshots),
projections as (select source_workout_id,e from public.community_workout_shares cross join lateral jsonb_array_elements(sets)e),
projection_counts as (
  select count(*) total_entries,
    count(*) filter(where e->>'exercise_id'='860c2371-8592-5ad9-aa43-805984020e52') retired,
    count(*) filter(where e->>'exercise_id'='a2bc1c95-14c7-558d-a56b-0973cc4793dd') canonical,
    count(*) filter(where e->>'exercise_id' is null and public.normalize_exercise_alias(e->>'exercise') in(select value from curl_names)) confirmed_text,
    count(distinct source_workout_id) filter(where e->>'exercise_id'='860c2371-8592-5ad9-aa43-805984020e52' or (e->>'exercise_id' is null and public.normalize_exercise_alias(e->>'exercise') in(select value from curl_names))) affected_shares from projections)
select jsonb_build_object(
  'database',current_database(),'server_version',current_setting('server_version'),
  'pending_migrations_already_recorded',(select coalesce(jsonb_agg(version),'[]') from supabase_migrations.schema_migrations where version in('20261108120000','20261108121000','20261108220000')),
  'latest_migration',(select max(version) from supabase_migrations.schema_migrations),
  'sets',(select to_jsonb(s) from set_counts s),'template_exercises',(select to_jsonb(t) from template_counts t),
  'snapshots',(select to_jsonb(s) from snapshot_counts s),'community',(select to_jsonb(p) from projection_counts p),
  'workouts',jsonb_build_object('total',(select count(*) from public.workouts),'protected_digest',(select md5(coalesce(string_agg((to_jsonb(w)-'template_snapshot')::text,'' order by id),'')) from public.workouts w)),
  'templates',(select count(*) from public.workout_templates),
  'username_collisions',(select count(*) from(select lower(trim(username)) from public.user_profiles group by 1 having count(*)>1)c),
  'uppercase_usernames',(select count(*) from public.user_profiles where username is distinct from lower(trim(username))),
  'preferences',(select jsonb_agg(p) from(select language,workout_sharing,share_workout_notes,count(*) users from public.user_preferences group by 1,2,3)p),
  'scheduler_extensions',(select jsonb_agg(extname) from pg_extension where extname in('pg_cron','pg_net')),
  'push_objects',jsonb_build_object('preferences',to_regclass('public.workout_web_rest_preferences'),'timers',to_regclass('public.workout_rest_timers'),'subscriptions',to_regclass('public.workout_push_subscriptions')),
  'private_table_rls',(select jsonb_object_agg(relname,relrowsecurity) from pg_class where oid in('public.workouts'::regclass,'public.workout_sets'::regclass,'public.workout_templates'::regclass,'public.workout_template_exercises'::regclass,'public.user_preferences'::regclass)),
  'exercise_foreign_keys',(select jsonb_agg(x) from(select tc.table_schema,tc.table_name,kcu.column_name from information_schema.table_constraints tc join information_schema.key_column_usage kcu using(constraint_catalog,constraint_schema,constraint_name) join information_schema.constraint_column_usage ccu using(constraint_catalog,constraint_schema,constraint_name) where tc.constraint_type='FOREIGN KEY' and ccu.table_name='exercise_catalog')x)
) preflight;
