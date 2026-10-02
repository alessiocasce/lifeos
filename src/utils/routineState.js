export const routineStateLabels = {
  active: 'Active',
  inactive: 'No longer current',
  suspended: 'Paused',
  uncertain: 'Not certain',
};

export function formatRoutineState(state, uncertain = false) {
  return uncertain ? routineStateLabels.uncertain : routineStateLabels[state] || routineStateLabels.uncertain;
}
