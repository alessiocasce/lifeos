-- Retired: exact active names are now picker choices, not proof about old rows.
-- The immutable V1 migration retains its original backfill. New corrections must
-- use the reviewed admin-only apply_owner_exercise_revision_v2(owner) operation.
do $$ begin
  raise exception 'Global legacy mapping is retired; use the reviewed owner-scoped revision';
end $$;
-- Historical implementation below is retained only as documentation; the guard
-- above deliberately prevents execution of this file against any database.
-- Idempotent exact/curated-only mapping. No fuzzy assignment or text replacement.
update public.workout_sets set exercise_id=public.resolve_exercise_id(exercise)
where exercise_id is null and public.resolve_exercise_id(exercise) is not null;
update public.workout_template_exercises set exercise_id=public.resolve_exercise_id(exercise)
where exercise_id is null and public.resolve_exercise_id(exercise) is not null;
update public.workouts w set template_snapshot=(select jsonb_agg(
  case when item->>'exercise_id' is null and public.resolve_exercise_id(item->>'exercise') is not null
  then item || jsonb_build_object('exercise_id',public.resolve_exercise_id(item->>'exercise')) else item end order by position)
  from jsonb_array_elements(case when jsonb_typeof(w.template_snapshot)='array' then w.template_snapshot else '[]'::jsonb end) with ordinality as entries(item,position))
where jsonb_typeof(w.template_snapshot)='array' and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(w.template_snapshot)='array' then w.template_snapshot else '[]'::jsonb end) item
  where item->>'exercise_id' is null and public.resolve_exercise_id(item->>'exercise') is not null);
-- Counts are scoped by the caller's existing workout RLS. Admin rollout can report all.
create or replace function public.exercise_legacy_mapping_report()
returns table(source text, exercise text, records bigint, mapped bigint, ambiguous boolean)
language sql stable security invoker set search_path='' as $$
  with records as (
    select 'workout_sets' source, exercise,exercise_id::text from public.workout_sets
    union all select 'workout_template_exercises',exercise,exercise_id::text from public.workout_template_exercises
    union all select 'template_snapshot',e->>'exercise',e->>'exercise_id' from public.workouts w,
      lateral jsonb_array_elements(case when jsonb_typeof(template_snapshot)='array' then template_snapshot else '[]'::jsonb end) e
  ) select r.source,r.exercise,count(*),count(r.exercise_id),
    (select count(distinct a.exercise_id)>1 from public.exercise_aliases a where a.alias=public.normalize_exercise_alias(r.exercise))
    from records r group by r.source,r.exercise;
$$;
revoke all on function public.exercise_legacy_mapping_report() from public,anon;
grant execute on function public.exercise_legacy_mapping_report() to authenticated,service_role;
