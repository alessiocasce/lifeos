import { exerciseLabel, resolveExercise } from '../../src/utils/exerciseCatalog.js';

export async function searchExercise(page, query, { label='Exercise', scope=page } = {}) {
  const dialog=page.getByRole('dialog',{name:/^(Choose exercise|Scegli esercizio)$/,exact:true});
  if (!await dialog.isVisible()) await scope.getByRole('button',{name:label,exact:true}).and(scope.locator('[aria-haspopup="dialog"]')).click();
  if (await dialog.getByRole('button',{name:/^(Choose another exercise|Scegli un altro esercizio)$/,exact:true}).isVisible()) await dialog.getByRole('button',{name:/^(Choose another exercise|Scegli un altro esercizio)$/,exact:true}).click();
  await dialog.getByRole('textbox').fill(query);
}
export async function selectExercise(page, query, options={}) {
  const language = options.language || (options.label === 'Esercizio' ? 'it' : 'en');
  await searchExercise(page,query,options);
  const exercise=resolveExercise(query);
  const dialog=page.getByRole('dialog',{name:/^(Choose exercise|Scegli esercizio)$/,exact:true});
  if(exercise?.active) await dialog.getByRole('button',{name:exerciseLabel({exercise_id:exercise.id},language),exact:true}).click();
  else {
    if (!await dialog.getByRole('button',{name:language === 'it' ? 'Usa esercizio personalizzato' : 'Use custom exercise',exact:true}).isVisible()) {
      await dialog.getByRole('button',{name:language === 'it' ? 'Altro esercizio' : 'Other exercise',exact:true}).click();
      await dialog.getByRole('textbox').fill(query);
    }
    await dialog.getByRole('button',{name:language === 'it' ? 'Usa esercizio personalizzato' : 'Use custom exercise',exact:true}).click();
  }
  await dialog.waitFor({state:'detached'});
}
