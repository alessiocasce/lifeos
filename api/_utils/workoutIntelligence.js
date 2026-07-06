import { safePreview } from './brainTrace.js';

const DEFAULT_EXERCISE_LIMIT = 12;
const DEFAULT_TOP_SET_LIMIT = 8;

export function buildWorkoutIntelligence({
  workouts = [],
  sets = null,
  healthLogs = [],
  days = 30,
  generatedAt = new Date().toISOString(),
  maxExercises = DEFAULT_EXERCISE_LIMIT,
  maxTopSets = DEFAULT_TOP_SET_LIMIT,
} = {}) {
  const normalizedWorkouts = normalizeWorkouts(workouts);
  const normalizedSets = normalizeWorkoutSets(normalizedWorkouts, sets);
  const workingSets = normalizedSets.filter((set) => !set.is_warmup);
  const exerciseNames = [...new Set(workingSets.map((set) => set.exercise).filter(Boolean))];
  const warnings = [];

  if (!normalizedWorkouts.length) warnings.push('no_recent_workouts');
  if (normalizedWorkouts.length && !workingSets.length) warnings.push('no_recent_working_sets');
  if (normalizedWorkouts.length < 2) warnings.push('limited_workout_history');

  const latestSession = buildLatestSessionSummary(normalizedWorkouts[0], normalizedSets, maxTopSets);
  const exerciseProgression = buildExerciseProgression({
    workouts: normalizedWorkouts,
    sets: workingSets,
    maxExercises,
  });
  const recovery = buildRecoveryCaveat(healthLogs);

  return {
    generated_at: generatedAt,
    range: { days: normalizePositiveInteger(days, 30) },
    data_quality: {
      workout_count: normalizedWorkouts.length,
      set_count: normalizedSets.length,
      working_set_count: workingSets.length,
      exercise_count: exerciseNames.length,
      warnings,
    },
    latest_session: latestSession,
    exercise_progression: exerciseProgression,
    next_session: buildNextSessionSuggestion({ latestSession, exerciseProgression, recovery }),
    recovery,
    warnings,
  };
}

export function buildExerciseProgression({ workouts = [], sets = [], maxExercises = DEFAULT_EXERCISE_LIMIT } = {}) {
  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]));
  const exerciseGroups = groupBy(sets.filter((set) => !set.is_warmup && set.exercise), 'exercise');
  return [...exerciseGroups.entries()]
    .map(([exercise, exerciseSets]) => buildExerciseProgressionEntry(exercise, exerciseSets, workoutById))
    .sort(compareProgressionEntries)
    .slice(0, normalizePositiveInteger(maxExercises, DEFAULT_EXERCISE_LIMIT));
}

export function estimateOneRepMax(weight, reps) {
  const normalizedWeight = Number(weight);
  const normalizedReps = Number(reps);
  if (!Number.isFinite(normalizedWeight) || !Number.isFinite(normalizedReps) || normalizedWeight <= 0 || normalizedReps <= 0) {
    return null;
  }
  return round(normalizedWeight * (1 + normalizedReps / 30), 1);
}

function normalizeWorkouts(workouts) {
  return (Array.isArray(workouts) ? workouts : [])
    .filter((workout) => workout && typeof workout === 'object')
    .map((workout) => ({
      id: workout.id ?? null,
      name: safePreview(workout.name || 'Workout', 120),
      performed_on: workout.performed_on ?? null,
      started_at: workout.started_at ?? null,
      ended_at: workout.ended_at ?? null,
      notes: safePreview(workout.notes, 240),
      workout_sets: Array.isArray(workout.workout_sets) ? workout.workout_sets : [],
    }))
    .sort(compareWorkoutsDesc);
}

function normalizeWorkoutSets(workouts, sets) {
  const sourceSets = Array.isArray(sets)
    ? sets
    : workouts.flatMap((workout) => (workout.workout_sets ?? []).map((set) => ({
      ...set,
      workout_id: set.workout_id ?? workout.id,
      workout_name: workout.name,
      performed_on: set.performed_on ?? workout.performed_on,
    })));

  return sourceSets
    .filter((set) => set && typeof set === 'object')
    .map((set) => ({
      id: set.id ?? null,
      workout_id: set.workout_id ?? null,
      workout_name: set.workout_name ?? null,
      performed_on: set.performed_on ?? null,
      exercise: safePreview(set.exercise || 'Unknown', 120),
      set_number: finiteOrNull(set.set_number),
      is_warmup: Boolean(set.is_warmup),
      weight: finiteOrRaw(set.weight),
      reps: finiteOrRaw(set.reps),
      rpe: finiteOrRaw(set.rpe),
      performed_at: set.performed_at ?? null,
      notes: safePreview(set.notes, 180),
    }))
    .sort(compareWorkoutSets);
}

function buildLatestSessionSummary(workout, allSets, maxTopSets) {
  if (!workout) return null;
  const sessionSets = allSets.filter((set) => set.workout_id === workout.id);
  const workingSets = sessionSets.filter((set) => !set.is_warmup);
  const byExercise = groupBy(sessionSets, 'exercise');
  const exercises = [...byExercise.entries()].map(([exercise, exerciseSets]) => {
    const exerciseWorkingSets = exerciseSets.filter((set) => !set.is_warmup);
    return {
      exercise,
      set_count: exerciseSets.length,
      working_set_count: exerciseWorkingSets.length,
      warmup_set_count: exerciseSets.length - exerciseWorkingSets.length,
      top_set: compactSetWithEstimate(pickTopSet(exerciseWorkingSets)),
      total_reps: sumFinite(exerciseWorkingSets.map((set) => set.reps)),
      total_volume: calculateVolume(exerciseWorkingSets),
    };
  });

  const topSets = workingSets
    .map(compactSetWithEstimate)
    .filter(Boolean)
    .sort(compareTopSetsDesc)
    .slice(0, normalizePositiveInteger(maxTopSets, DEFAULT_TOP_SET_LIMIT));

  return {
    id: workout.id,
    name: workout.name,
    performed_on: workout.performed_on,
    started_at: workout.started_at,
    ended_at: workout.ended_at,
    notes: workout.notes,
    set_count: sessionSets.length,
    working_set_count: workingSets.length,
    exercise_count: exercises.length,
    top_sets: topSets,
    exercises,
  };
}

function buildExerciseProgressionEntry(exercise, sets, workoutById) {
  const sessionGroups = groupBy(sets, 'workout_id');
  const sessions = [...sessionGroups.entries()]
    .map(([workoutId, sessionSets]) => {
      const workout = workoutById.get(workoutId) ?? {};
      const topSet = pickTopSet(sessionSets);
      return {
        workout_id: workoutId,
        workout_name: workout.name ?? sessionSets[0]?.workout_name ?? null,
        performed_on: workout.performed_on ?? sessionSets[0]?.performed_on ?? null,
        set_count: sessionSets.length,
        total_reps: sumFinite(sessionSets.map((set) => set.reps)),
        total_volume: calculateVolume(sessionSets),
        top_set: compactSetWithEstimate(topSet),
      };
    })
    .filter((session) => session.top_set)
    .sort(compareSessionsDesc);

  const latest = sessions[0] ?? null;
  const previous = sessions[1] ?? null;
  const best = [...sessions].sort((a, b) => compareTopSetsDesc(a.top_set, b.top_set))[0] ?? null;
  const trend = compareSessionTrend(latest, previous);
  const volumeTrend = compareVolumeTrend(latest, previous);
  const plateau = detectPlateau(sessions.slice(0, 3));

  return {
    exercise,
    sessions_analyzed: sessions.length,
    latest_session_date: latest?.performed_on ?? null,
    previous_session_date: previous?.performed_on ?? null,
    latest_top_set: latest?.top_set ?? null,
    previous_top_set: previous?.top_set ?? null,
    best_top_set: best?.top_set ?? null,
    total_recent_working_sets: sumFinite(sessions.map((session) => session.set_count)),
    volume_trend: volumeTrend,
    estimated_1rm_trend: trend,
    plateau,
    next_target: buildNextTarget({ latest, previous, plateau }),
    warnings: buildProgressionWarnings(sessions),
  };
}

function buildNextTarget({ latest, previous, plateau }) {
  const topSet = latest?.top_set;
  if (!topSet) {
    return {
      type: 'data_needed',
      confidence: 'low',
      text: 'Not enough working-set data to recommend a target.',
    };
  }
  const weight = Number(topSet.weight);
  const reps = Number(topSet.reps);
  const rpe = Number(topSet.rpe);
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) {
    return {
      type: 'repeat_baseline',
      confidence: 'low',
      text: `Repeat ${topSet.exercise} with clean logged sets before increasing load.`,
    };
  }
  if (!previous) {
    return {
      type: 'repeat_baseline',
      confidence: 'low',
      weight,
      reps,
      text: `Repeat ${topSet.exercise} ${formatSetTarget(weight, reps)} before escalating.`,
    };
  }
  if (Number.isFinite(rpe) && rpe >= 9.5) {
    return {
      type: 'maintain',
      confidence: 'medium',
      weight,
      reps,
      text: `Keep ${topSet.exercise} around ${formatSetTarget(weight, reps)}; latest top set was near max effort.`,
    };
  }
  if (plateau) {
    return {
      type: 'plateau_management',
      confidence: 'medium',
      weight,
      reps,
      text: `Do not force a jump on ${topSet.exercise}; repeat ${formatSetTarget(weight, reps)} or use a smaller back-off set.`,
    };
  }
  if (reps < 12) {
    return {
      type: 'reps',
      confidence: 'medium',
      weight,
      reps: reps + 1,
      text: `Try ${topSet.exercise} ${formatSetTarget(weight, reps + 1)} if warmups feel normal.`,
    };
  }
  const nextWeight = round(weight + inferSmallWeightJump(weight), 2);
  return {
    type: 'weight',
    confidence: 'medium',
    weight: nextWeight,
    reps: Math.max(5, Math.min(8, reps - 2)),
    text: `Consider the smallest load jump on ${topSet.exercise}: about ${formatSetTarget(nextWeight, Math.max(5, Math.min(8, reps - 2)))}.`,
  };
}

function buildRecoveryCaveat(healthLogs) {
  const latest = (Array.isArray(healthLogs) ? healthLogs : [])
    .filter((log) => log && Number.isFinite(Number(log.sleep_hours)))
    .sort((a, b) => String(b.logged_on || '').localeCompare(String(a.logged_on || '')))[0];

  if (!latest) {
    return {
      status: 'unknown',
      based_on: null,
      sleep_hours: null,
      caveat: null,
    };
  }

  const sleepHours = round(Number(latest.sleep_hours), 1);
  if (sleepHours < 5.5) {
    return {
      status: 'caution',
      based_on: latest.logged_on ?? null,
      sleep_hours: sleepHours,
      caveat: `Latest logged sleep is ${sleepHours}h; keep targets conservative.`,
    };
  }
  if (sleepHours < 6.5) {
    return {
      status: 'watch',
      based_on: latest.logged_on ?? null,
      sleep_hours: sleepHours,
      caveat: `Latest logged sleep is ${sleepHours}h; use warmups to decide whether to push.`,
    };
  }
  return {
    status: 'normal',
    based_on: latest.logged_on ?? null,
    sleep_hours: sleepHours,
    caveat: `Latest logged sleep is ${sleepHours}h; no sleep-based training warning.`,
  };
}

function buildNextSessionSuggestion({ latestSession, exerciseProgression, recovery }) {
  if (!latestSession || !exerciseProgression.length) {
    return {
      status: 'insufficient_data',
      suggestion: 'Log at least one full workout with working sets before asking for next-session targets.',
      reason: 'No recent working-set progression is available.',
      target_exercises: [],
    };
  }
  const candidate = exerciseProgression.find((entry) => entry.next_target?.type !== 'data_needed') ?? exerciseProgression[0];
  const recoveryPrefix = recovery.status === 'caution'
    ? 'Keep the next workout conservative. '
    : '';
  return {
    status: recovery.status === 'caution' ? 'caution' : 'ready',
    suggestion: `${recoveryPrefix}${candidate.next_target?.text ?? `Use ${candidate.exercise} as the first target exercise.`}`,
    reason: recovery.caveat || `Based on recent ${candidate.exercise} working sets.`,
    target_exercises: exerciseProgression.slice(0, 3).map((entry) => ({
      exercise: entry.exercise,
      target: entry.next_target,
      trend: entry.estimated_1rm_trend,
      plateau: entry.plateau,
    })),
  };
}

function pickTopSet(sets) {
  return [...(sets ?? [])].filter((set) => !set.is_warmup).sort(compareTopSetsDesc)[0] ?? null;
}

function compactSetWithEstimate(set) {
  if (!set) return null;
  return {
    id: set.id,
    workout_id: set.workout_id,
    exercise: set.exercise,
    set_number: set.set_number,
    weight: set.weight,
    reps: set.reps,
    rpe: set.rpe,
    estimated_1rm: estimateOneRepMax(set.weight, set.reps),
    performed_at: set.performed_at,
    notes: set.notes,
  };
}

function compareSessionTrend(latest, previous) {
  if (!latest?.top_set || !previous?.top_set) return 'unknown';
  const latestValue = latest.top_set.estimated_1rm;
  const previousValue = previous.top_set.estimated_1rm;
  if (!Number.isFinite(latestValue) || !Number.isFinite(previousValue)) return 'unknown';
  const delta = latestValue - previousValue;
  const threshold = Math.max(1, previousValue * 0.01);
  if (delta > threshold) return 'up';
  if (delta < -threshold) return 'down';
  return 'flat';
}

function compareVolumeTrend(latest, previous) {
  if (!latest || !previous || !Number.isFinite(latest.total_volume) || !Number.isFinite(previous.total_volume) || previous.total_volume <= 0) {
    return 'unknown';
  }
  const delta = latest.total_volume - previous.total_volume;
  const threshold = Math.max(20, previous.total_volume * 0.05);
  if (delta > threshold) return 'up';
  if (delta < -threshold) return 'down';
  return 'flat';
}

function detectPlateau(sessions) {
  if (!Array.isArray(sessions) || sessions.length < 3) return false;
  const values = sessions.map((session) => session.top_set?.estimated_1rm).filter(Number.isFinite);
  if (values.length < 3) return false;
  return Math.max(...values) - Math.min(...values) <= Math.max(1, values[0] * 0.01);
}

function buildProgressionWarnings(sessions) {
  const warnings = [];
  if (!sessions.length) warnings.push('no_working_sets_for_exercise');
  if (sessions.length === 1) warnings.push('single_session_only');
  if (sessions.some((session) => !Number.isFinite(Number(session.top_set?.weight)) || !Number.isFinite(Number(session.top_set?.reps)))) {
    warnings.push('missing_weight_or_reps');
  }
  return warnings;
}

function compareProgressionEntries(a, b) {
  return String(b.latest_session_date || '').localeCompare(String(a.latest_session_date || ''))
    || b.sessions_analyzed - a.sessions_analyzed
    || String(a.exercise || '').localeCompare(String(b.exercise || ''));
}

function compareWorkoutsDesc(a, b) {
  return String(b.performed_on || '').localeCompare(String(a.performed_on || ''))
    || String(b.started_at || '').localeCompare(String(a.started_at || ''))
    || String(b.id || '').localeCompare(String(a.id || ''));
}

function compareSessionsDesc(a, b) {
  return String(b.performed_on || '').localeCompare(String(a.performed_on || ''))
    || String(b.workout_id || '').localeCompare(String(a.workout_id || ''));
}

function compareWorkoutSets(a, b) {
  return String(a.performed_at || '').localeCompare(String(b.performed_at || ''))
    || String(a.exercise || '').localeCompare(String(b.exercise || ''))
    || compareNullableNumber(a.set_number, b.set_number)
    || String(a.id || '').localeCompare(String(b.id || ''));
}

function compareTopSetsDesc(a, b) {
  const left = a?.estimated_1rm ?? estimateOneRepMax(a?.weight, a?.reps) ?? 0;
  const right = b?.estimated_1rm ?? estimateOneRepMax(b?.weight, b?.reps) ?? 0;
  return right - left
    || Number(b?.weight ?? 0) - Number(a?.weight ?? 0)
    || Number(b?.reps ?? 0) - Number(a?.reps ?? 0)
    || compareNullableNumber(a?.set_number, b?.set_number);
}

function calculateVolume(sets) {
  return round((sets ?? []).reduce((total, set) => {
    const weight = Number(set.weight);
    const reps = Number(set.reps);
    return Number.isFinite(weight) && Number.isFinite(reps) ? total + weight * reps : total;
  }, 0), 1);
}

function sumFinite(values) {
  return (values ?? []).reduce((total, value) => {
    const number = Number(value);
    return Number.isFinite(number) ? total + number : total;
  }, 0);
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows ?? []) {
    const value = row?.[key] ?? 'Unknown';
    const group = map.get(value) ?? [];
    group.push(row);
    map.set(value, group);
  }
  return map;
}

function compareNullableNumber(a, b) {
  const left = Number(a);
  const right = Number(b);
  const leftFinite = Number.isFinite(left);
  const rightFinite = Number.isFinite(right);
  if (leftFinite && rightFinite) return left - right;
  if (leftFinite) return -1;
  if (rightFinite) return 1;
  return 0;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteOrRaw(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function inferSmallWeightJump(weight) {
  return Number(weight) >= 40 ? 2.5 : 1;
}

function formatSetTarget(weight, reps) {
  return `${weight}x${reps}`;
}

function round(value, decimals = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** decimals;
  return Math.round(number * factor) / factor;
}
