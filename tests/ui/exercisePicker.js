import { exerciseLabel, resolveExercise } from '../../src/utils/exerciseCatalog.js';

export async function searchExercise(page, query, { label='Exercise', scope=page } = {}) {
  const dialog=page.getByRole('dialog');
  if (!await dialog.isVisible()) await scope.getByRole('textbox',{name:label,exact:true}).click();
  await dialog.getByRole('textbox',{name:label,exact:true}).fill(query);
}
export async function selectExercise(page, query, options={}) {
  await searchExercise(page,query,options);
  const exercise=resolveExercise(query);
  const dialog=page.getByRole('dialog');
  if(exercise?.active) await dialog.getByRole('button',{name:exerciseLabel({exercise_id:exercise.id},options.language||'en'),exact:true}).click();
  else {
    await dialog.getByRole('button',{name:'Other exercise',exact:true}).click();
    await dialog.getByRole('textbox',{name:options.label||'Exercise',exact:true}).fill(query);
    await dialog.getByRole('button',{name:'Use custom exercise',exact:true}).click();
  }
}
