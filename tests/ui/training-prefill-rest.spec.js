import { test, expect } from '@playwright/test';
import { localDate } from '../../src/utils/date.js';
import { searchExercise, selectExercise } from './exercisePicker.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript((today) => {
    if (sessionStorage.getItem('prefill-seeded')) return;
    sessionStorage.setItem('prefill-seeded', 'true');
    const set = (id, number, weight, reps, warmup = false) => ({ id, exercise: 'Barbell Bench Press', set_number: number, weight, reps, is_warmup: warmup, rpe: 9, notes: 'Historical outcome' });
    localStorage.setItem('qa-workouts', JSON.stringify([
      { id: 'current', user_id: 'qa-user-a', name: 'Push Day', performed_on: today, started_at: today + 'T12:00:00Z', workout_sets: [] },
      { id: 'previous', user_id: 'qa-user-a', name: 'Last Push', performed_on: '2026-09-28', started_at: '2026-09-28T12:00:00Z', ended_at: '2026-09-28T13:00:00Z', workout_sets: [
        set('w1', 1001, 40, 10, true), set('w2', 1002, 60, 6, true), set('s1', 1, 80, 8), set('s2', 2, 80, 7), set('s3', 3, 77.5, 8),
      ] },
    ]));
  }, localDate());
});
const field = (page, name) => page.getByRole('textbox', { name, exact: true });

test('committed exercise and saved sets prefill targets, never outcomes or manual values', async ({ page }) => {
  await page.goto('/workout');
  await selectExercise(page,'Barbell Bench Press');
  await expect(field(page, 'Weight (kg)')).toHaveValue('80');
  await expect(field(page, 'Reps')).toHaveValue('8');
  await field(page, 'Weight (kg)').fill('82.5');
  await page.getByRole('button',{name:'More options',exact:true}).click();
  await field(page,'RPE optional').fill('8');
  await field(page,'Set notes').fill('Actual outcome');
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Save Set',exact:true}).click();
  await expect(field(page,'Weight (kg)')).toHaveValue('80');
  await expect(field(page,'Reps')).toHaveValue('7');
  await page.getByRole('button',{name:'More options',exact:true}).click();
  await expect(field(page,'RPE optional')).toHaveValue('');
  await expect(field(page,'Set notes')).toHaveValue('');
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'History',exact:true}).click();
  await page.getByRole('button',{name:/Last Push/}).click();
  await page.getByRole('button',{name:'Live',exact:true}).click();
  await expect(field(page,'Reps')).toHaveValue('7');
  await page.reload();
  await expect(field(page,'Reps')).toHaveValue('7');
  await field(page,'Weight (kg)').fill('');await field(page,'Reps').fill('');
  await page.getByRole('button',{name:'More options',exact:true}).click();
  await page.getByRole('checkbox',{name:'Warmup set'}).check();
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await expect(field(page,'Weight (kg)')).toHaveValue('40');
  await expect(field(page,'Reps')).toHaveValue('10');
  await page.getByRole('button',{name:'Save Set',exact:true}).click();
  await expect(field(page,'Weight (kg)')).toHaveValue('60');
  await expect(field(page,'Reps')).toHaveValue('6');
});

test('rest timer is absent and a failed set save retains the workout draft', async ({page}) => {
  await page.goto('/workout');
  await selectExercise(page,'Barbell Bench Press');
  await expect(page.getByText(/Rest timer/)).toHaveCount(0);
  await page.evaluate(()=>localStorage.setItem('qa-fail-save','true'));
  await page.getByRole('button',{name:'Save Set',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Set not saved');
  await expect(field(page,'Weight (kg)')).toHaveValue('80');
  await expect(page.getByRole('timer')).toHaveCount(0);
});
