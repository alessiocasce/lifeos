-- Read-only reproduction; aggregate output only. No source IDs, names or notes returned.
with eligible as (
  select s.user_id, w.performed_on, s.exercise_id, s.weight, s.reps
  from public.workout_sets s
  join public.workouts w on w.id = s.workout_id and w.user_id = s.user_id
  join public.exercise_catalog c on c.id = s.exercise_id
  where w.ended_at is not null and not coalesce(s.is_warmup, false)
    and s.reps between 3 and 15
    and ((c.slug in ('barbell_flat_bench_press', 'dumbbell_flat_bench_press',
      'barbell_incline_bench_press', 'dumbbell_incline_bench_press',
      'barbell_overhead_press', 'barbell_back_squat', 'barbell_romanian_deadlift') and s.weight >= 0)
      or (c.slug in ('push_up', 'pull_up') and s.weight = 0))
), points as (
  select user_id, performed_on, exercise_id, weight, reps, count(*) as sets
  from eligible group by user_id, performed_on, exercise_id, weight, reps
  having count(*) >= 2
), ready as (
  select p.* from points p where
    (select count(distinct q.performed_on) from points q
      where q.user_id = p.user_id and q.exercise_id = p.exercise_id
      and q.performed_on < p.performed_on and q.performed_on >= p.performed_on - 90
      and q.weight = p.weight) >= 3
    or (select count(distinct q.performed_on) from points q
      where q.user_id = p.user_id and q.exercise_id = p.exercise_id
      and q.performed_on < p.performed_on and q.performed_on >= p.performed_on - 90
      and q.reps = p.reps) >= 3
)
select (select count(*) from eligible) as candidate_sets,
  (select count(*) from points) as supported_exact_points,
  (select count(*) from ready) as baseline_ready_points,
  (select coalesce(sum(sets), 0) from ready) as sets_in_ready_points;

with s as (
  select s.*, w.ended_at, c.slug, c.load_type
  from public.workout_sets s
  join public.workouts w on w.id = s.workout_id and w.user_id = s.user_id
  left join public.exercise_catalog c on c.id = s.exercise_id
)
select count(*) as total_sets,
  count(*) filter (where ended_at is not null) as completed_sets,
  count(*) filter (where ended_at is not null and not coalesce(is_warmup, false)
    and reps between 1 and 50 and weight >= 0) as valid_working_sets,
  count(*) filter (where ended_at is not null and not coalesce(is_warmup, false)
    and reps between 1 and 50 and weight >= 0 and load_type = 'machine_display') as valid_machine_sets,
  count(*) filter (where ended_at is not null and not coalesce(is_warmup, false)
    and reps between 1 and 50 and weight >= 0 and load_type in ('bodyweight', 'assistance')) as valid_bodyweight_assisted_sets,
  count(*) filter (where exercise_id is null) as unmapped_sets
from s;

select load_type, is_unilateral, count(*) as catalog_count,
  count(*) filter (where active) as active_count
from public.exercise_catalog group by load_type, is_unilateral order by load_type, is_unilateral;
