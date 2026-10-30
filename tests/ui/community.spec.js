import { test, expect } from '@playwright/test';
import { exerciseCatalog } from '../../src/utils/exerciseCatalog.js';
const bench = exerciseCatalog.find(e => e.slug === 'dumbbell_flat_bench_press');
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({ id }) => {
    if (sessionStorage.getItem('community-seed')) return;
    sessionStorage.setItem('community-seed', 'yes');
    const a = { user_id:'qa-user-a', username:'casce', display_name:'casce' };
    const b = { user_id:'qa-user-b', username:'degra', display_name:'degra' };
    localStorage.setItem('qa-community-members', JSON.stringify([a,b]));
    for (const [p,language] of [[a,'en'],[b,'it']]) localStorage.setItem(`qa-settings:${p.user_id}`,JSON.stringify({profile:p,preferences:{language,workout_sharing:true,share_workout_notes:false}}));
    const sets = [{exercise:'Dumbbell Bench Press',exercise_id:id,set_number:1001,is_warmup:true,weight:10,reps:12,rpe:null,notes:null},
      {exercise:'Dumbbell Bench Press',exercise_id:id,set_number:1,is_warmup:false,weight:30,reps:10,rpe:8,notes:null}];
    const seeded=Array.from({length:11},(_,i)=>({id:`seed-${i}`,title:`Shared workout ${i+1}`,performed_on:i<2?`2026-10-${21-i}`:`2025-01-${String(i+1).padStart(2,'0')}`,published_at:'2030-01-01T12:00:00Z',author_id:i<2?b.user_id:a.user_id,author:i<2?b:a,sets,exercise_count:1,set_count:2,exercise_preview:[sets[0]]}));
    seeded.push({id:'historical-share',source:'old',title:'Historical workout',performed_on:'2026-10-28',published_at:'2030-01-01T12:00:00Z',author_id:a.user_id,author:a,sets,exercise_count:1,set_count:2,exercise_preview:[sets[0]]});
    localStorage.setItem('qa-community-shares',JSON.stringify(seeded));
    localStorage.setItem('qa-workouts',JSON.stringify([
      {id:'current',user_id:a.user_id,name:'Current private',performed_on:'2026-10-30',started_at:'2026-10-30T12:00:00Z',workout_sets:[]},
      {id:'old',user_id:a.user_id,name:'Historical workout',performed_on:'2026-10-28',started_at:'2026-10-28T12:00:00Z',ended_at:'2026-10-28T13:00:00Z',notes:'Private session note',workout_sets:sets.map((s,i)=>({...s,id:`set-${i}`,notes:i?'Private set note':null}))},
    ]));
  },{id:bench.id});
});

for (const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]) test(`automatic Community and degra profile ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/community');
  await expect(page.getByRole('article')).toHaveCount(10);
  await expect(page.getByRole('article').first().getByRole('heading')).toHaveText('Historical workout');
  await page.getByRole('button',{name:'Load more',exact:true}).click();
  await expect(page.getByRole('article')).toHaveCount(12);
  await page.screenshot({path:info.outputPath('automatic-feed.png'),fullPage:true});
  await page.getByRole('button',{name:/Historical workout/}).click();
  await expect(page.getByRole('heading',{name:'Dumbbell Bench Press',exact:true})).toBeVisible();
  await expect(page.getByText('RPE 8',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Stop sharing',exact:true})).toHaveCount(0);
  await page.reload();await expect(page.getByRole('heading',{name:'Dumbbell Bench Press',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to Community',exact:true}).click();
  await page.getByRole('tab',{name:'Members',exact:true}).click();
  await page.getByRole('textbox',{name:'Find members',exact:true}).fill('degra');
  await page.getByRole('button',{name:'degra @degra',exact:true}).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('degra-profile.png'),fullPage:true});expect(errors).toEqual([]);
});

async function history(page) {
  await page.goto('/workout');await page.getByRole('button',{name:'History',exact:true}).click();
  await page.getByRole('button',{name:/Historical workout/}).click();
}
test('global OFF hides history and ON restores it without manual publication',async({page})=>{
  await history(page);
  await expect(page.getByRole('button',{name:'View in Community',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Share with Community',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'View in Community',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Historical workout',exact:true})).toBeVisible();
  const oldLink=page.url();await page.goto('/settings');
  await expect(page.getByText(/all completed workouts, including past workouts/)).toBeVisible();
  await page.getByRole('checkbox',{name:'Share completed workouts',exact:true}).uncheck();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Settings saved.');
  await page.goto(oldLink);await expect(page.getByText('This workout is private or unavailable.',{exact:true})).toBeVisible();
  await history(page);await expect(page.getByRole('button',{name:'View in Community',exact:true})).toHaveCount(0);
  await page.goto('/settings');await page.getByRole('checkbox',{name:'Share completed workouts',exact:true}).check();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Settings saved.');
  await history(page);await page.getByRole('button',{name:'View in Community',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Historical workout',exact:true})).toBeVisible();
});

test('notes are controlled only by global preference and remain private by default',async({page})=>{
  await history(page);await page.getByRole('button',{name:'View in Community',exact:true}).click();
  await expect(page.getByText('Private set note',{exact:true})).toHaveCount(0);
  await page.goto('/settings');await page.getByRole('checkbox',{name:'Share set notes',exact:true}).check();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Settings saved.');
  await history(page);await page.getByRole('button',{name:'View in Community',exact:true}).click();
  await expect(page.getByText('Private set note',{exact:true})).toBeVisible();
  await expect(page.getByText('Private session note',{exact:true})).toBeVisible();
  await page.goto('/settings');await page.getByRole('checkbox',{name:'Share set notes',exact:true}).uncheck();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Settings saved.');
  await history(page);await page.getByRole('button',{name:'View in Community',exact:true}).click();
  await expect(page.getByText('Private set note',{exact:true})).toHaveCount(0);
});

test('Italian member and delayed old-account requests stay isolated',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('qa-community-delay','800'));
  await page.goto('/community');await page.evaluate(()=>{localStorage.removeItem('qa-community-delay');window.__qaSignIn('qa-user-b');});
  await expect(page.getByRole('tab',{name:'Bacheca',exact:true})).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(10);
  await page.getByRole('button',{name:/Historical workout/}).click();
  await expect(page.getByRole('heading',{name:'Panca piana con manubri',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Interrompi condivisione',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Torna alla Community',exact:true}).click();
  await page.getByRole('tab',{name:'Membri',exact:true}).click();
  await page.getByRole('textbox',{name:'Cerca membri',exact:true}).fill('nobody');
  await expect(page.getByText('Nessun membro trovato.',{exact:true})).toBeVisible();
});

test('revoked detail and feed errors recover without obsolete publication controls',async({page})=>{
  await page.goto('/community#share=missing');await expect(page.getByText('This workout is private or unavailable.',{exact:true})).toBeVisible();
  await page.evaluate(()=>localStorage.setItem('qa-community-fail','yes'));await page.getByRole('button',{name:'Back to Community',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Community is unavailable. Try again.');
  await page.evaluate(()=>localStorage.removeItem('qa-community-fail'));await page.getByRole('button',{name:'Retry',exact:true}).press('Enter');
  await expect(page.getByRole('article')).toHaveCount(10);
});
