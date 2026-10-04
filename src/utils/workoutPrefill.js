// Only targets are copied. RPE and notes are outcomes of the completed set.
export function prefillWorkoutTargets(draft, historicalSets = [], { afterSave = false, savedSet = null } = {}) {
  const warmup = Boolean(draft.is_warmup);
  const number = Number(draft.set_number);
  const candidates = historicalSets.filter((set) => Boolean(set.is_warmup) === warmup)
    .slice().sort((a, b) => Number(a.set_number) - Number(b.set_number));
  const target = candidates.find((set) => Number(set.set_number) === number)
    || (warmup ? candidates[number - 1001] : null)
    || (afterSave ? savedSet : null);
  const numeric = (value) => value !== null && value !== '' && Number.isFinite(Number(value)) ? String(value) : '';
  return {
    ...draft,
    weight: afterSave || draft.weight === '' ? numeric(target?.weight) : draft.weight,
    reps: afterSave || draft.reps === '' ? numeric(target?.reps) : draft.reps,
    ...(afterSave ? { rpe: '', notes: '' } : {}),
  };
}
