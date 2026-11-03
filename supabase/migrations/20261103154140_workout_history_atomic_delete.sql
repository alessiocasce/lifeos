-- Atomic historical exercise deletion. Existing RLS and Community triggers remain authoritative.
create or replace function public.delete_historical_workout_exercise(
  p_workout_id uuid, p_ended_at timestamptz, p_sets jsonb
) returns uuid[] language plpgsql security invoker set search_path='' as $$
declare
  target public.workout_sets;
  ids uuid[];
  total integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_sets) is distinct from 'array' then
    raise exception 'Expected saved sets' using errcode='22023';
  end if;
  if jsonb_array_length(p_sets) < 1 or jsonb_array_length(p_sets) > 5000 then
    raise exception 'Expected saved sets' using errcode='22023';
  end if;
  -- Match the existing BEFORE STATEMENT Community writer gate lock order.
  perform pg_catalog.pg_advisory_xact_lock(742029301::bigint);
  perform 1 from public.workouts where id=p_workout_id and user_id=auth.uid()
    and ended_at=p_ended_at and ended_at is not null for update;
  if not found then raise exception 'Workout changed or unavailable. Refresh History.' using errcode='40001'; end if;
  select * into target from public.workout_sets
    where id=(p_sets->0->>'id')::uuid and workout_id=p_workout_id and user_id=auth.uid();
  if not found then raise exception 'Exercise changed. Refresh History.' using errcode='40001'; end if;
  perform 1 from public.workout_sets s where s.workout_id=p_workout_id and s.user_id=auth.uid()
    and (case when target.exercise_id is not null then s.exercise_id=target.exercise_id
      else s.exercise_id is null and public.normalize_exercise_alias(s.exercise)=public.normalize_exercise_alias(target.exercise) end)
    for update;
  select array_agg(s.id order by s.id),count(*) into ids,total
    from public.workout_sets s where s.workout_id=p_workout_id and s.user_id=auth.uid()
    and (case when target.exercise_id is not null then s.exercise_id=target.exercise_id
      else s.exercise_id is null and public.normalize_exercise_alias(s.exercise)=public.normalize_exercise_alias(target.exercise) end);
  if total <> jsonb_array_length(p_sets)
    or (select count(distinct (e->>'id')::uuid) from jsonb_array_elements(p_sets) e) <> total
    or exists (
      select 1 from jsonb_array_elements(p_sets) e
      where not exists(select 1 from public.workout_sets s where s.id=(e->>'id')::uuid
        and s.id=any(ids) and s.updated_at=(e->>'updated_at')::timestamptz)
    ) then
    raise exception 'Exercise changed. Refresh History before deleting.' using errcode='40001';
  end if;
  delete from public.workout_sets where workout_id=p_workout_id and user_id=auth.uid() and id=any(ids);
  get diagnostics total = row_count;
  if total <> cardinality(ids) then raise exception 'Exercise deletion failed' using errcode='40001'; end if;
  return ids;
end $$;
revoke all on function public.delete_historical_workout_exercise(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.delete_historical_workout_exercise(uuid,timestamptz,jsonb) to authenticated;

create index if not exists workouts_history_cursor on public.workouts(user_id,performed_on desc,started_at desc nulls last,id desc);
