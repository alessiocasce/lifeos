-- Explicitly approved historical cohort only. No global shorthand aliases.
create function public.map_second_training_cohort(p_user uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare trg record; saved jsonb; changed integer;
begin
  lock table public.workout_sets in access exclusive mode;
  create temporary table cohort_targets(original text,target text,n integer) on commit drop;
  insert into cohort_targets values
    ('Panca Inclinata','Incline Barbell Bench Press',3),
    ('Panca Piana','Dumbbell Bench Press',3),
    ('Macchinario pettorali','Pectoral Machine',3),
    ('Pushdown tricipiti','Rope Triceps Pushdown',4),
    ('Overhead tricipiti','Single Overhead Cable Triceps',3);
  if p_user is null or (select count(*) from public.workout_sets where user_id=p_user)<>16 then raise exception 'Cohort size changed'; end if;
  if exists(select 1 from cohort_targets m where
      (select count(*) from public.workout_sets s join public.exercise_catalog c on c.name_en=m.target
       where s.user_id=p_user and ((s.exercise=m.original and s.exercise_id is null) or (s.exercise=c.name_en and s.exercise_id=c.id)))<>m.n)
    or (select count(*) from public.exercise_catalog c join cohort_targets m on c.name_en=m.target)<>5
  then raise exception 'Cohort distribution/identity changed'; end if;
  -- Current verified cohort has no template exercises or snapshot references.
  if exists(select 1 from public.workout_template_exercises where user_id=p_user)
    or exists(select 1 from public.workouts where user_id=p_user and template_snapshot is not null and template_snapshot<>'[]'::jsonb)
  then raise exception 'Additional template references require review'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'mode',t.tgenabled)),'[]') into saved
    from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='public.workout_sets'::regclass
    and p.pronamespace='public'::regnamespace and p.proname='set_updated_at' and not t.tgisinternal and t.tgenabled<>'D';
  for trg in select * from jsonb_to_recordset(saved) as r(name text,mode text) loop
    execute format('alter table public.workout_sets disable trigger %I',trg.name);
  end loop;
  update public.workout_sets s set exercise=c.name_en,exercise_id=c.id from pg_temp.cohort_targets m
    join public.exercise_catalog c on c.name_en=m.target
    where s.user_id=p_user and s.exercise=m.original and s.exercise_id is null;
  get diagnostics changed=row_count;
  for trg in select * from jsonb_to_recordset(saved) as r(name text,mode text) loop
    execute format('alter table public.workout_sets enable %strigger %I',case trg.mode when 'A' then 'always ' when 'R' then 'replica ' else '' end,trg.name);
  end loop;
  drop table pg_temp.cohort_targets;
  return changed;
end $$;
revoke all on function public.map_second_training_cohort(uuid) from public,anon,authenticated,service_role;
