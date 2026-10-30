import { test, expect } from '@playwright/test';
import { exerciseCatalog } from '../../src/utils/exerciseCatalog.js';
const bench = exerciseCatalog.find(e => e.slug === 'dumbbell_flat_bench_press');

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({ id }) => {
    if (sessionStorage.getItem('community-seed')) return;
    sessionStorage.setItem('community-seed', 'yes');
    const a = { user_id:'qa-user-a', username:'alpha', display_name:'Alpha Athlete' };
    const b = { user_id:'qa-user-b', username:'bravo', display_name:'Bravo Athlete' };
    localStorage.setItem('qa-community-members', JSON.stringify([a,b]));
    localStorage.setItem('qa-settings:qa-user-a', JSON.stringify({profile:a,preferences:{language:'en',workout_sharing:false,share_workout_notes:false}}));
    localStorage.setItem('qa-settings:qa-user-b', JSON.stringify({profile:b,preferences:{language:'it',workout_sharing:false,share_workout_notes:false}}));
    const sets = [{ exercise:'Dumbbell Bench Press',exercise_id:id,set_number:1001,is_warmup:true,weight:10,reps:12,rpe:null,notes:null },
      { exercise:'Dumbbell Bench Press',exercise_id:id,set_number:1,is_warmup:false,weight:30,reps:10,rpe:8,notes:null }];
    localStorage.setItem('qa-community-shares', JSON.stringify(Array.from({length:12},(_,i)=>({id:`post-${String(12-i).padStart(2,'0')}`,title:`Shared workout ${i+1}`,performed_on:'2026-10-28',published_at:'2026-10-29T12:00:00Z',author_id:b.user_id,author:b,sets,exercise_count:1,set_count:2,exercise_preview:[sets[0]]}))));
    localStorage.setItem('qa-workouts', JSON.stringify([
      {id:'current',user_id:a.user_id,name:'Current private',performed_on:'2026-10-30',started_at:'2026-10-30T12:00:00Z',workout_sets:[]},
      {id:'old',user_id:a.user_id,name:'Private historical workout',performed_on:'2026-10-28',started_at:'2026-10-28T12:00:00Z',ended_at:'2026-10-28T13:00:00Z',notes:'Private session note',workout_sets:sets.map((s,i)=>({...s,id:`set-${i}`,notes:i?'Private set note':null}))},
    ]));
  }, {id:bench.id});
});

for (const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]) {
  test(`Community feed, members and read-only detail ${width}`, async ({page},info) => {
    await page.setViewportSize({width,height});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/community');
    await expect(page.getByRole('article')).toHaveCount(10);
    await page.getByRole('button',{name:'Load more',exact:true}).click();
    await expect(page.getByRole('article')).toHaveCount(12);
    await page.screenshot({path:info.outputPath('community-feed.png'),fullPage:true});
    await page.getByRole('button',{name:/Shared workout 1 /}).click();
    await expect(page.getByRole('heading',{name:'Dumbbell Bench Press',exact:true})).toBeVisible();
    await expect(page.getByText('RPE 8',{exact:true})).toBeVisible();
    await expect(page.getByText('W',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Edit set',exact:true})).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading',{name:'Dumbbell Bench Press',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Back to Community',exact:true}).click();
    await page.getByRole('tab',{name:'Members',exact:true}).click();
    await page.getByRole('textbox',{name:'Find members',exact:true}).fill('bravo');
    await expect(page.getByRole('button',{name:'Alpha Athlete @alpha',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Bravo Athlete @bravo',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Shared workouts',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('community-member.png'),fullPage:true});
    expect(errors).toEqual([]);
  });
}

async function history(page) {
  await page.goto('/workout');
  await page.getByRole('button',{name:'History',exact:true}).click();
  await page.getByRole('button',{name:/Private historical workout/}).click();
}
test('sharing is explicit, preview/cancel hides notes and owner can revoke', async ({page},info) => {
  await history(page);
  await expect(page.getByRole('button',{name:'Share with Community',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Open Training privacy settings',exact:true}).click();
  await page.getByRole('checkbox',{name:'Share completed workouts',exact:true}).check();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await history(page);
  await page.getByRole('button',{name:'Share with Community',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('button',{name:'Confirm sharing',exact:true})).toBeEnabled();
  await expect(dialog.getByText('Private set note',{exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('checkbox',{name:'Include workout and set notes',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-community-shares')).filter(s=>s.source==='old').length)).toBe(0);
  await page.getByRole('button',{name:'Share with Community',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Confirm sharing',exact:true}).click();
  await page.getByRole('button',{name:'View in Community',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Private historical workout',exact:true})).toBeVisible();
  await expect(page.getByText('Private set note',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Stop sharing',exact:true}).click();
  await expect(page.getByText('This workout is private or unavailable.',{exact:true})).toBeVisible();
  await history(page);
  await expect(page.getByRole('button',{name:'Share with Community',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('history-share-controls.png'),fullPage:true});
});

test('Italian account and delayed old-account responses stay isolated', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('qa-community-delay','800'));
  await page.goto('/community');
  await page.evaluate(()=>{localStorage.removeItem('qa-community-delay');window.__qaSignIn('qa-user-b');});
  await expect(page.getByRole('tab',{name:'Bacheca',exact:true})).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(10);
  await page.getByRole('button',{name:/Shared workout 1 /}).click();
  await expect(page.getByRole('heading',{name:'Panca piana con manubri',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Torna alla Community',exact:true}).click();
  await page.getByRole('tab',{name:'Membri',exact:true}).click();
  await page.getByRole('textbox',{name:'Cerca membri',exact:true}).fill('nobody');
  await expect(page.getByText('Nessun membro trovato.',{exact:true})).toBeVisible();
});

test('notes require per-share consent; privacy revocation does not resurrect shares', async ({page},info) => {
  await page.goto('/settings');
  await page.getByRole('checkbox',{name:'Share completed workouts',exact:true}).check();
  await page.getByRole('checkbox',{name:'Share set notes',exact:true}).check();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await history(page);
  await page.getByRole('button',{name:'Share with Community',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox',{name:'Include workout and set notes',exact:true})).not.toBeChecked();
  await dialog.getByRole('checkbox',{name:'Include workout and set notes',exact:true}).check();
  await expect(dialog.getByText('Private set note',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('explicit-notes-preview-mobile.png'),fullPage:true});
  await dialog.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'Share with Community',exact:true}).click();
  await page.getByRole('dialog').getByRole('checkbox',{name:'Include workout and set notes',exact:true}).check();
  await expect(page.getByRole('dialog').getByText('Private set note',{exact:true})).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'Confirm sharing',exact:true}).click();
  const shareId=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-community-shares')).find(s=>s.source==='old').id);
  await page.goto('/settings');
  await page.getByRole('checkbox',{name:'Share set notes',exact:true}).uncheck();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await page.goto(`/community#share=${shareId}`);
  await expect(page.getByRole('heading',{name:'Private historical workout',exact:true})).toBeVisible();
  await expect(page.getByText('Private set note',{exact:true})).toHaveCount(0);
  await page.goto('/settings');
  await page.getByRole('checkbox',{name:'Share completed workouts',exact:true}).uncheck();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Settings saved.');
  await page.getByRole('checkbox',{name:'Share completed workouts',exact:true}).check();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await page.goto(`/community#share=${shareId}`);
  await expect(page.getByText('This workout is private or unavailable.',{exact:true})).toBeVisible();
});

test('revoked detail and feed errors are useful, keyboard navigation remains available', async ({page}) => {
  await page.goto('/community#share=missing');
  await expect(page.getByText('This workout is private or unavailable.',{exact:true})).toBeVisible();
  await page.evaluate(()=>localStorage.setItem('qa-community-fail','yes'));
  await page.getByRole('button',{name:'Back to Community',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Community is unavailable. Try again.');
  await page.evaluate(()=>localStorage.removeItem('qa-community-fail'));
  await page.getByRole('button',{name:'Retry',exact:true}).press('Enter');
  await expect(page.getByRole('article')).toHaveCount(10);
});
