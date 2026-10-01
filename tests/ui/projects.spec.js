import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('qa-projects', JSON.stringify([
      { id: '11111111-1111-4111-8111-111111111112', name: 'Release LifeOS', status: 'active', goal_type: 'tasks', current_value: 2, target_value: 8, unit_label: 'tasks', started_on: '2026-09-28', project_sessions: [] },
      { id: '11111111-1111-4111-8111-111111111113', name: 'Study archive', status: 'completed', goal_type: 'hours', target_value: 10, started_on: '2026-09-01', project_sessions: [] },
    ]));
  });
});

async function openProject(page) {
  await page.goto('/projects');
  await page.getByRole('button', { name: /Release LifeOS/ }).click();
  await expect(page.getByRole('heading', { name: 'Start Session', exact: true })).toBeVisible();
}

test('project filter keeps completed work accessible', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Active', exact: true }).click();
  await expect(page.getByRole('button', { name: /Study archive/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'All projects' }).click();
  await expect(page.getByRole('button', { name: /Study archive/ })).toBeVisible();
});

test('empty Projects stays quiet without fake statistics', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qa-projects', '[]'));
  await page.goto('/projects');
  await expect(page.getByText('No projects yet.', { exact: true })).toBeVisible();
  await expect(page.getByText('recorded this week', { exact: false })).toHaveCount(0);
});

test('active session resumes from the list and blocks parallel sessions', async ({ page }) => {
  await page.addInitScript(() => {
    const rows = JSON.parse(localStorage.getItem('qa-projects'));
    rows[0].project_sessions = [{ id: 'qa-live-project', project_id: rows[0].id, started_at: new Date().toISOString(), ended_at: null, target_output: 'Publish this release' }];
    localStorage.setItem('qa-projects', JSON.stringify(rows));
  });
  await page.goto('/projects');
  await page.getByRole('button', { name: /Session in progress/ }).click();
  await expect(page.getByRole('heading', { name: 'Active Session' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: /Study archive/ }).click();
  await expect(page.getByText('Another project session is active.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Session', exact: true })).toHaveCount(0);
});

test('project session target/proof, manual progress and history stay functional', async ({ page }) => {
  await openProject(page);
  await page.getByLabel('Target Output').fill('Ship the release checklist');
  await page.getByRole('button', { name: 'Start Session', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Active Session', exact: true })).toBeVisible();
  await page.getByLabel('Proof of Work').fill('Checklist verified and published');
  await page.getByRole('button', { name: 'End Session', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Start Session', exact: true })).toBeVisible();
  await expect(page.getByText('Checklist verified and published')).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Update progress' }).click();
  await page.getByLabel('Add tasks', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Add Progress', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('qa-projects'))[0].current_value)).toBe(3);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete session', exact: true }).click();
  await expect(page.getByText('Checklist verified and published')).toHaveCount(0);
});

test('project creation/edit and native dialog focus restore correctly', async ({ page }) => {
  await page.goto('/projects');
  const create = page.getByRole('button', { name: 'New Project', exact: true });
  await create.click();
  let editor = page.getByRole('dialog', { name: 'New project', exact: true });
  await editor.getByLabel('Project Name').fill('Research system');
  await editor.getByLabel('Target Value').fill('20');
  await editor.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Research system' })).toBeVisible();
  const edit = page.getByRole('button', { name: 'Edit project', exact: true });
  await edit.click();
  editor = page.getByRole('dialog', { name: 'Edit project', exact: true });
  await editor.getByLabel('Project Name').fill('Research and decisions');
  await editor.getByRole('button', { name: 'Update Project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Research and decisions' })).toBeVisible();
  await edit.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(edit).toBeFocused();
});

test('project money create/edit/delete stays behind a secondary surface', async ({ page }) => {
  await openProject(page);
  await expect(page.getByRole('button', { name: 'Add Expense', exact: true })).not.toBeVisible();
  await page.locator('summary').filter({ hasText: 'Project money' }).click();
  await page.getByRole('button', { name: 'Add Expense', exact: true }).click();
  let editor = page.getByRole('dialog', { name: 'Project Expense', exact: true });
  await editor.getByLabel('Amount').fill('25');
  await editor.getByLabel('Description').fill('Release tooling');
  await editor.getByRole('button', { name: 'Add Expense', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText('Release tooling')).toBeVisible();
  await page.getByRole('button', { name: 'Edit money entry' }).click();
  editor = page.getByRole('dialog', { name: 'Project Expense', exact: true });
  await editor.getByLabel('Amount').fill('30');
  await editor.getByRole('button', { name: 'Update Entry' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('qa-project-money'))[0].amount)).toBe(30);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete money entry' }).click();
  await expect(page.getByText('Release tooling')).toHaveCount(0);
});

test('failed project delete stays on the detail without unhandled exceptions', async ({ page }) => {
  await openProject(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => localStorage.setItem('qa-project-fail', 'true'));
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not saved');
  await expect(page.getByRole('heading', { name: 'Release LifeOS' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('changing projects never silently reuses a session draft', async ({ page }) => {
  await openProject(page);
  await page.getByLabel('Target Output').fill('Only for Release LifeOS');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByLabel('Target Output')).toHaveValue('Only for Release LifeOS');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: /Study archive/ }).click();
  await expect(page.getByLabel('Target Output')).toHaveValue('');
});

for (const [width, height] of [[375, 812], [390, 844], [393, 852], [430, 932], [1280, 800], [1440, 900], [1920, 1080]]) {
  test(`Projects workspace fits ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      const rows = JSON.parse(localStorage.getItem('qa-projects'));
      rows[0].notes = 'Ship the authenticated companion controls and verify the release.';
      rows[0].project_sessions = [{ id: 'qa-prior-project', project_id: rows[0].id, started_at: '2026-09-30T13:00:00Z', ended_at: '2026-09-30T14:30:00Z', duration_minutes: 90, target_output: 'Verify the release checklist', proof_of_work: 'Completed the integration tests and documented remaining deployment checks.' }];
      localStorage.setItem('qa-projects', JSON.stringify(rows));
      localStorage.setItem('qa-project-money', JSON.stringify(Array.from({ length: 7 }, (_, index) => ({ id: `qa-money-${index}`, project_id: rows[0].id, type: 'expense', amount: 10 + index, description: `Development tooling ${index + 1}`, entry_date: '2026-09-30' }))));
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/projects');
    await expect(page.getByRole('button', { name: /Release LifeOS/ })).toBeVisible();
    await page.screenshot({ path: info.outputPath('projects.png'), fullPage: true });
    await page.getByRole('button', { name: /Release LifeOS/ }).click();
    await expect(page.getByRole('region', { name: 'LifeOS Watch' })).toContainText('Off');
    await expect(page.getByRole('button', { name: 'Start Session', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('project-detail.png'), fullPage: true });
    await page.locator('summary').filter({ hasText: 'Project money' }).click();
    await expect(page.getByText('Development tooling 7', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('project-money.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Edit project', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({ path: info.outputPath('project-editor.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
}
