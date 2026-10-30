-- Admin-only, explicit-owner correction. No owner identifier is stored in the repo.
create or replace function public.apply_owner_exercise_revision_v2(p_owner uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  trg record;
  saved_triggers jsonb;
  changed_sets integer; changed_templates integer; changed_snapshots integer;
begin
  if p_owner is null or not exists(select 1 from auth.users where id=p_owner) then
    raise exception 'Verified owner identity required';
  end if;
  -- Prevent concurrent changes while timestamp triggers are temporarily suspended.
  lock table public.workouts,public.workout_sets,public.workout_template_exercises in access exclusive mode;
  create temporary table if not exists lifeos_exercise_revision_map(original_name text primary key,target_id uuid,target_name text) on commit drop;
  truncate pg_temp.lifeos_exercise_revision_map;
  insert into pg_temp.lifeos_exercise_revision_map
    select public.normalize_exercise_alias(m.original_name),c.id,c.name_en
    from public.exercise_revision_owner_targets_v2() m join public.exercise_catalog c on c.slug=m.target_slug;
  if (select count(*) from pg_temp.lifeos_exercise_revision_map) <> 29 then raise exception 'Approved mapping incomplete'; end if;
  if exists(select 1 from public.workout_sets s join pg_temp.lifeos_exercise_revision_map m on m.original_name=public.normalize_exercise_alias(s.exercise)
      where s.user_id=p_owner and s.exercise_id is not null and s.exercise_id<>m.target_id)
    or exists(select 1 from public.workout_template_exercises s join pg_temp.lifeos_exercise_revision_map m on m.original_name=public.normalize_exercise_alias(s.exercise)
      where s.user_id=p_owner and s.exercise_id is not null and s.exercise_id<>m.target_id)
    or exists(select 1 from public.workouts w cross join lateral jsonb_array_elements(case when jsonb_typeof(w.template_snapshot)='array' then w.template_snapshot else '[]'::jsonb end) e
      join pg_temp.lifeos_exercise_revision_map m on m.original_name=public.normalize_exercise_alias(e->>'exercise')
      where w.user_id=p_owner and e->>'exercise_id' is not null and e->>'exercise_id'<>m.target_id::text)
  then raise exception 'Existing canonical identity conflicts with approved target; stop and review'; end if;
  if exists(select 1 from public.workout_sets s left join pg_temp.lifeos_exercise_revision_map m on m.original_name=public.normalize_exercise_alias(s.exercise)
      where s.user_id=p_owner and s.exercise_id is null and m.target_id is null)
    or exists(select 1 from public.workout_template_exercises s left join pg_temp.lifeos_exercise_revision_map m on m.original_name=public.normalize_exercise_alias(s.exercise)
      where s.user_id=p_owner and s.exercise_id is null and m.target_id is null)
    or exists(select 1 from public.workouts w cross join lateral jsonb_array_elements(case when jsonb_typeof(w.template_snapshot)='array' then w.template_snapshot else '[]'::jsonb end) e
      left join pg_temp.lifeos_exercise_revision_map m on m.original_name=public.normalize_exercise_alias(e->>'exercise')
      where w.user_id=p_owner and e ? 'exercise' and e->>'exercise_id' is null and m.target_id is null)
  then raise exception 'Unexpected owner exercise names; stop and audit'; end if;
  if exists(select 1 from public.workout_sets s
      left join pg_temp.lifeos_exercise_revision_map m on m.original_name=public.normalize_exercise_alias(s.exercise)
      join public.exercise_catalog c on c.id=coalesce(s.exercise_id,m.target_id)
      where s.user_id=p_owner group by s.workout_id,c.name_en,s.set_number having count(*)>1)
  then raise exception 'Canonical text would collide with existing set numbers; no records changed'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'mode',t.tgenabled)),'[]'::jsonb) into saved_triggers
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
    where t.tgrelid in('public.workouts'::regclass,'public.workout_sets'::regclass,'public.workout_template_exercises'::regclass)
      and not t.tgisinternal and p.pronamespace='public'::regnamespace and p.proname='set_updated_at' and t.tgenabled<>'D';
  for trg in select * from jsonb_to_recordset(saved_triggers) as r("table" text,name text,mode text) loop
    execute format('alter table public.%I disable trigger %I',trg."table",trg.name);
  end loop;
  with targets as (select s.id,c.id target_id,c.name_en from public.workout_sets s
    left join pg_temp.lifeos_exercise_revision_map m on m.original_name=public.normalize_exercise_alias(s.exercise)
    join public.exercise_catalog c on c.id=coalesce(s.exercise_id,m.target_id) where s.user_id=p_owner)
  update public.workout_sets s set exercise=t.name_en,exercise_id=t.target_id from targets t
    where s.id=t.id and (s.exercise,s.exercise_id) is distinct from (t.name_en,t.target_id);
  get diagnostics changed_sets=row_count;
  with targets as (select s.id,c.id target_id,c.name_en from public.workout_template_exercises s
    left join pg_temp.lifeos_exercise_revision_map m on m.original_name=public.normalize_exercise_alias(s.exercise)
    join public.exercise_catalog c on c.id=coalesce(s.exercise_id,m.target_id) where s.user_id=p_owner)
  update public.workout_template_exercises s set exercise=t.name_en,exercise_id=t.target_id from targets t
    where s.id=t.id and (s.exercise,s.exercise_id) is distinct from (t.name_en,t.target_id);
  get diagnostics changed_templates=row_count;
  with targets as (
    select w.id,jsonb_agg(case when c.id is not null then e||jsonb_build_object('exercise',c.name_en,'exercise_id',c.id) else e end order by pos) snapshot
    from public.workouts w cross join lateral jsonb_array_elements(case when jsonb_typeof(w.template_snapshot)='array' then w.template_snapshot else '[]'::jsonb end) with ordinality as a(e,pos)
    left join pg_temp.lifeos_exercise_revision_map m on m.original_name=public.normalize_exercise_alias(e->>'exercise')
    left join public.exercise_catalog c on c.id::text=coalesce(e->>'exercise_id',m.target_id::text)
    where w.user_id=p_owner group by w.id)
  update public.workouts w set template_snapshot=t.snapshot from targets t where w.id=t.id and w.template_snapshot is distinct from t.snapshot;
  get diagnostics changed_snapshots=row_count;
  for trg in select * from jsonb_to_recordset(saved_triggers) as r("table" text,name text,mode text) loop
    execute format('alter table public.%I enable %strigger %I',trg."table",case trg.mode when 'A' then 'always ' when 'R' then 'replica ' else '' end,trg.name);
  end loop;
  return jsonb_build_object('sets_changed',changed_sets,'template_exercises_changed',changed_templates,'workout_snapshots_changed',changed_snapshots);
end;
$$;
revoke all on function public.apply_owner_exercise_revision_v2(uuid) from public,anon,authenticated,service_role;
-- Only the migration/admin owner can invoke this function. Fresh installs have no personal history.
do $$ begin
  if nullif(current_setting('lifeos.exercise_revision_owner',true),'') is not null then
    perform public.apply_owner_exercise_revision_v2(current_setting('lifeos.exercise_revision_owner')::uuid);
  end if;
end $$;
