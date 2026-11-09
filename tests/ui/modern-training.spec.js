import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('modern-seeded')) return;
    sessionStorage.setItem('modern-seeded', '1');
    localStorage.setItem('qa-user', JSON.stringify({ id: 'qa-user-a', email: 'qa@example.test' }));
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    localStorage.setItem('qa-workouts', JSON.stringify([{
      id: 'modern-session', user_id: 'qa-user-a', name: 'Modern workout', performed_on: today,
      started_at: new Date(Date.now() - 3600000).toISOString(), ended_at: null,
      template_appearance: { color_key: 'blue', icon_key: 'chest' },
      workout_sets: [{ id: 'existing', workout_id: 'modern-session', user_id: 'qa-user-a', exercise: 'Bench custom', exercise_id: null,
        set_number: 1, weight: 30, reps: 10, is_warmup: false, performed_at: new Date().toISOString() }],
    }]));
  });
});

test('completion removes history action, saves one ordered template and stays dismissed after reload', async ({ page }, info) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'End Workout', exact: true }).click();
  const completion = page.getByRole('region', { name: 'Completed workout', exact: true });
  await expect(completion).toBeVisible();
  await expect(completion.getByRole('button', { name: 'View history', exact: true })).toHaveCount(0);
  await completion.getByRole('button', { name: 'Save as template', exact: true }).dblclick();
  await expect(completion.getByRole('button', { name: 'Template saved', exact: true })).toBeDisabled();
  const templates = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-templates')));
  expect(templates).toHaveLength(1);
  expect(templates[0].workout_template_exercises).toHaveLength(1);
  expect(templates[0].workout_template_exercises[0].exercise).toBe('Bench custom');
  await page.screenshot({ path: 'docs/audits/lifeos-ui/screenshots/training-completion-390.png' });
  await completion.getByRole('button', { name: 'Back to training', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Start your workout', exact: true })).toBeVisible();
  await expect(completion).toHaveCount(0);
});

test('Last Time combines confirmed retired, EZ and text curl sets without mixing another exercise',async({page})=>{
  await page.goto('/workout');
  await page.evaluate(()=>{
    const rows=JSON.parse(localStorage.getItem('qa-workouts'));
    rows.push({id:'curl-history',user_id:'qa-user-a',name:'Combined curl history',performed_on:'2020-01-02',started_at:'2020-01-02T10:00Z',ended_at:'2020-01-02T11:00Z',
      workout_sets:[
        {id:'curl-old',exercise:'Barbell Curl',exercise_id:'860c2371-8592-5ad9-aa43-805984020e52',set_number:1,weight:20,reps:10,is_warmup:false},
        {id:'curl-ez',exercise:'EZ-Bar Curl',exercise_id:'a2bc1c95-14c7-558d-a56b-0973cc4793dd',set_number:2,weight:25,reps:8,is_warmup:false},
        {id:'curl-text',exercise:'Barbell Curl',exercise_id:null,set_number:3,weight:22.5,reps:9,is_warmup:false},
        {id:'not-curl',exercise:'Hammer Curl',exercise_id:null,set_number:1,weight:99,reps:20,is_warmup:false},
      ]});
    localStorage.setItem('qa-workouts',JSON.stringify(rows));
  });
  await page.reload();
  const logger=page.getByRole('region',{name:'Workout set logger',exact:true});
  await logger.getByRole('button',{name:'Exercise',exact:true}).click();
  const picker=page.getByRole('dialog');
  await picker.getByRole('textbox',{name:'Exercise',exact:true}).fill('EZ Bar Curl');
  await picker.getByRole('button',{name:'Barbell Curl',exact:true}).click();
  await picker.waitFor({state:'detached'});
  const last=page.getByRole('region',{name:'Last time',exact:true});
  await last.locator('summary').click();
  await expect(page.getByText('Combined curl history',{exact:true})).toBeVisible();
  await expect(logger.getByLabel('Total load (kg)',{exact:true})).toHaveValue('20');
  await expect(last).toContainText('22.5 kg');
  await expect(last).not.toContainText('99 kg');
});

test('warmup is outside options and resets only after successful save', async ({ page }, info) => {
  await page.goto('/workout');
  const logger = page.getByRole('region', { name: 'Workout set logger', exact: true });
  await logger.getByRole('button', { name: 'Exercise', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Barbell Bench Press', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await logger.getByLabel('Total load (kg)', { exact: true }).fill('50');
  await logger.getByLabel('Reps', { exact: true }).fill('8');
  await logger.getByRole('checkbox', { name: 'Warmup set', exact: true }).check();
  await expect(logger.getByLabel('Total load (kg)', { exact: true })).toHaveValue('50');
  await expect(logger.getByLabel('Reps', { exact: true })).toHaveValue('8');
  await page.evaluate(() => localStorage.setItem('qa-fail-save', 'true'));
  await logger.getByRole('button', { name: 'Save Set', exact: true }).click();
  await expect(logger.getByRole('alert')).toContainText('Test connection lost.');
  await expect(logger.getByRole('checkbox', { name: 'Warmup set' })).toBeChecked();
  await page.evaluate(() => localStorage.removeItem('qa-fail-save'));
  await logger.getByRole('button', { name: 'Save Set', exact: true }).click();
  await expect(logger.getByRole('checkbox', { name: 'Warmup set' })).not.toBeChecked();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets.at(-1));
  expect(saved.is_warmup).toBe(true);
  expect(saved.set_number).toBe(1001);
  await page.screenshot({ path: 'docs/audits/lifeos-ui/screenshots/training-warmup-saved-390.png' });
});

test('week and template filters reach older server pages and retain History editing', async ({ page }, info) => {
  await page.addInitScript(() => {
    const rows = JSON.parse(localStorage.getItem('qa-workouts'));
    if (rows.length > 1) return;
    const templateId = '11111111-1111-4111-8111-111111111111';
    localStorage.setItem('qa-templates', JSON.stringify([{ id: templateId, user_id: 'qa-user-a', name: 'Saved push plan', color_key: 'blue', icon_key: 'chest', workout_template_exercises: [] }]));
    rows.push(...Array.from({ length: 30 }, (_, i) => ({
      id: 'old-' + String(i).padStart(2, '0'), user_id: 'qa-user-a', name: i === 29 ? 'Older matching session' : 'Older ' + i,
      performed_on: i === 29 ? '2026-10-01' : '2026-11-01', started_at: '2026-10-01T09:00:00Z', ended_at: '2026-10-01T10:00:00Z',
      template_id: i === 29 ? templateId : null, workout_sets: [],
    })));
    localStorage.setItem('qa-workouts', JSON.stringify(rows));
  });
  await page.goto('/workout');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'By template', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Template', exact: true })).toHaveAccessibleDescription('Deleted template links may appear under No current template.');
  await page.getByRole('combobox', { name: 'Template', exact: true }).selectOption('11111111-1111-4111-8111-111111111111');
  await expect(page.getByRole('button', { name: /Older matching session/ })).toBeVisible();
  await page.getByRole('button', { name: /Older matching session/ }).click();
  await expect(page.getByRole('button', { name: 'Edit workout', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Corrected older session');
  await page.getByRole('button', { name: 'Done editing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Corrected older session', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to History', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Template', exact: true })).toHaveValue('11111111-1111-4111-8111-111111111111');
  await page.getByRole('button', { name: 'By week', exact: true }).click();
  await expect(page.locator('.training-week-days button')).toHaveCount(7);
  await page.screenshot({ path: 'docs/audits/lifeos-ui/screenshots/training-history-week-390.png' });
  await page.getByRole('button', { name: 'All workouts', exact: true }).click();
  await expect(page.getByRole('button', { name: /Older 28/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Corrected older session/ })).toBeVisible();
});

test('template save failure preserves completion and allows a deliberate retry', async ({ page }) => {
  await page.goto('/workout');
  await page.getByRole('button', { name: 'End Workout', exact: true }).click();
  const completion = page.getByRole('region', { name: 'Completed workout', exact: true });
  await page.evaluate(() => localStorage.setItem('qa-template-fail', 'true'));
  await completion.getByRole('button', { name: 'Save as template', exact: true }).click();
  await expect(completion.getByRole('alert')).toBeVisible();
  await expect(completion.getByRole('button', { name: 'Save as template', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qa-templates') || '[]'))).toHaveLength(0);
  await page.evaluate(() => localStorage.removeItem('qa-template-fail'));
  await completion.getByRole('button', { name: 'Save as template', exact: true }).click();
  await expect(completion.getByRole('button', { name: 'Template saved', exact: true })).toBeDisabled();
});

for (const width of [375,390,430,1024,1440]) test('Training controls stay within viewport at ' + width, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/workout');
  await expect(page.getByRole('group', { name: 'Training view', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`modern-training-${width}.png`) });
});
