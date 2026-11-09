-- Owner-confirmed EZ-bar equivalence. Unapplied; execute in one transaction.
-- Authored text, performance fields, IDs, ownership and timestamps are preserved.
select pg_catalog.pg_advisory_xact_lock(742029301::bigint);
create schema if not exists lifeos_private;
lock table public.workouts,public.workout_sets,public.workout_template_exercises in access exclusive mode;
do $$
declare trg record; modes jsonb; affected_workout record;
begin
  if not exists(select 1 from public.exercise_catalog where id='860c2371-8592-5ad9-aa43-805984020e52' and slug='barbell_curl' and equipment='barbell')
    or not exists(select 1 from public.exercise_catalog where id='a2bc1c95-14c7-558d-a56b-0973cc4793dd' and slug='ez_bar_curl' and equipment='ez_bar') then
    raise exception 'Unexpected curl identities; stop and review';
  end if;
  -- Suspend only timestamp writers, retaining ownership and Community triggers.
  select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'mode',t.tgenabled)),'[]'::jsonb) into modes
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
    where t.tgrelid in('public.workouts'::regclass,'public.workout_sets'::regclass,'public.workout_template_exercises'::regclass)
      and not t.tgisinternal and p.pronamespace='public'::regnamespace and p.proname='set_updated_at' and t.tgenabled<>'D';
  for trg in select * from jsonb_to_recordset(modes) as r("table" text,name text,mode text) loop
    execute format('alter table public.%I disable trigger %I',trg."table",trg.name);
  end loop;
  update public.exercise_catalog set active=false where id='860c2371-8592-5ad9-aa43-805984020e52' and active;
  update public.exercise_catalog set active=true,name_en='Barbell Curl',name_it='Curl con bilanciere EZ'
    where id='a2bc1c95-14c7-558d-a56b-0973cc4793dd' and (active,name_en,name_it) is distinct from (true,'Barbell Curl','Curl con bilanciere EZ');
  update public.workout_sets set exercise_id='a2bc1c95-14c7-558d-a56b-0973cc4793dd'
    where exercise_id='860c2371-8592-5ad9-aa43-805984020e52' or (exercise_id is null and public.normalize_exercise_alias(exercise)
      in('barbell curl','ez-bar curl','ez bar curl','curl con bilanciere','curl con bilanciere ez'));
  update public.workout_template_exercises set exercise_id='a2bc1c95-14c7-558d-a56b-0973cc4793dd'
    where exercise_id='860c2371-8592-5ad9-aa43-805984020e52' or (exercise_id is null and public.normalize_exercise_alias(exercise)
      in('barbell curl','ez-bar curl','ez bar curl','curl con bilanciere','curl con bilanciere ez'));
  with corrected as (
    select w.id,jsonb_agg(case when e->>'exercise_id'='860c2371-8592-5ad9-aa43-805984020e52'
      or (e->>'exercise_id' is null and public.normalize_exercise_alias(e->>'exercise')
        in('barbell curl','ez-bar curl','ez bar curl','curl con bilanciere','curl con bilanciere ez'))
      then e||jsonb_build_object('exercise_id','a2bc1c95-14c7-558d-a56b-0973cc4793dd') else e end order by pos) snapshot
    from public.workouts w cross join lateral jsonb_array_elements(case when jsonb_typeof(w.template_snapshot)='array' then w.template_snapshot else '[]'::jsonb end) with ordinality a(e,pos)
    group by w.id)
  update public.workouts w set template_snapshot=c.snapshot from corrected c where w.id=c.id and w.template_snapshot is distinct from c.snapshot;
  -- Heal projections through the existing privacy-aware writer, not copied notes.
  if to_regprocedure('lifeos_private.sync_community_workout(uuid)') is not null then
    for affected_workout in select distinct workout_id from public.workout_sets where exercise_id='a2bc1c95-14c7-558d-a56b-0973cc4793dd' loop
      perform lifeos_private.sync_community_workout(affected_workout.workout_id);
    end loop;
  end if;
  for trg in select * from jsonb_to_recordset(modes) as r("table" text,name text,mode text) loop
    execute format('alter table public.%I enable %strigger %I',trg."table",case trg.mode when 'A' then 'always ' when 'R' then 'replica ' else '' end,trg.name);
  end loop;
end $$;
insert into public.exercise_aliases(alias,exercise_id)
  select public.normalize_exercise_alias(label),'a2bc1c95-14c7-558d-a56b-0973cc4793dd'::uuid
    from unnest(array['Barbell Curl','EZ-Bar Curl','EZ Bar Curl','Curl con bilanciere','Curl con bilanciere EZ']) label on conflict do nothing;
-- Equivalent aliases now point only to the canonical UUID. Keep unrelated
-- straight-specific legacy labels with their inactive catalog definition.
delete from public.exercise_aliases where exercise_id='860c2371-8592-5ad9-aa43-805984020e52'
  and alias in('barbell curl','ez-bar curl','ez bar curl','curl con bilanciere','curl con bilanciere ez');
-- Keep the retired FK definition, but exclude its aliases from text resolution.
create or replace function public.resolve_exercise_id(value text) returns uuid language sql stable security invoker set search_path='' as $$
  with exact as (select id from public.exercise_catalog where active and (public.normalize_exercise_alias(name_en)=public.normalize_exercise_alias(value) or public.normalize_exercise_alias(name_it)=public.normalize_exercise_alias(value))),
  aliases as (select distinct exercise_id id from public.exercise_aliases where alias=public.normalize_exercise_alias(value) and exercise_id<>'860c2371-8592-5ad9-aa43-805984020e52')
  select case when (select count(*) from exact)=1 then (select id from exact limit 1)
    when (select count(*) from aliases)=1 then (select id from aliases limit 1) else null end;
$$;

-- Stale/offline clients may still submit the retired picker UUID after rollout.
-- Normalize only the explicitly confirmed identity; normal RLS still checks owner.
create or replace function lifeos_private.normalize_confirmed_curl() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_table_name='workouts' then
    if jsonb_typeof(new.template_snapshot)='array' then
      select coalesce(jsonb_agg(case when e->>'exercise_id'='860c2371-8592-5ad9-aa43-805984020e52'
        or (e->>'exercise_id' is null and public.normalize_exercise_alias(e->>'exercise')
          in('barbell curl','ez-bar curl','ez bar curl','curl con bilanciere','curl con bilanciere ez'))
        then e||jsonb_build_object('exercise_id','a2bc1c95-14c7-558d-a56b-0973cc4793dd') else e end order by pos),'[]'::jsonb)
      into new.template_snapshot from jsonb_array_elements(new.template_snapshot) with ordinality a(e,pos);
    end if;
  elsif new.exercise_id='860c2371-8592-5ad9-aa43-805984020e52' or (new.exercise_id is null and public.normalize_exercise_alias(new.exercise)
    in('barbell curl','ez-bar curl','ez bar curl','curl con bilanciere','curl con bilanciere ez')) then
    new.exercise_id:='a2bc1c95-14c7-558d-a56b-0973cc4793dd';
  end if;
  return new;
end $$;
revoke all on function lifeos_private.normalize_confirmed_curl() from public,anon,authenticated,service_role;
drop trigger if exists normalize_confirmed_curl on public.workout_sets;
create trigger normalize_confirmed_curl before insert or update of exercise,exercise_id on public.workout_sets
  for each row execute function lifeos_private.normalize_confirmed_curl();
drop trigger if exists normalize_confirmed_curl on public.workout_template_exercises;
create trigger normalize_confirmed_curl before insert or update of exercise,exercise_id on public.workout_template_exercises
  for each row execute function lifeos_private.normalize_confirmed_curl();
drop trigger if exists normalize_confirmed_curl on public.workouts;
create trigger normalize_confirmed_curl before insert or update of template_snapshot on public.workouts
  for each row execute function lifeos_private.normalize_confirmed_curl();
