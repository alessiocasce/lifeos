import { test, expect } from '@playwright/test';
import { localDate } from '../../src/utils/date.js';
import { exerciseCatalog } from '../../src/utils/exerciseCatalog.js';
const canonical=exerciseCatalog.find(e=>e.slug==='dumbbell_flat_bench_press');
test.beforeEach(async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(({today,id})=>{
    if(sessionStorage.getItem('social-seed'))return;sessionStorage.setItem('social-seed','yes');
    localStorage.setItem('qa-workouts',JSON.stringify([
      {id:'current',user_id:'qa-user-a',name:'My authored workout',performed_on:today,started_at:today+'T12:00:00Z',workout_sets:[]},
      {id:'old',user_id:'qa-user-a',name:'Do not translate my name',performed_on:'2026-09-28',started_at:'2026-09-28T12:00:00Z',ended_at:'2026-09-28T13:00:00Z',workout_sets:[
        {id:'old-w',exercise:'Dumbell Bench Press',set_number:1001,is_warmup:true,weight:10,reps:12,notes:'Keep my exact note'},
        {id:'old-1',exercise:'Dumbbell Bench Press',exercise_id:id,set_number:1,weight:30,reps:8,rpe:9,notes:'Original English note'},
        {id:'old-2',exercise:'Dumbbell Bench Press',exercise_id:id,set_number:2,weight:30,reps:7,rpe:9.5},
      ]},
    ]));
  },{today:localDate(),id:canonical.id});
});
async function settings(page,language='en') {
  await page.getByRole('button',{name:language==='it'?'Altro':'More',exact:true}).click();
  await page.getByRole('button',{name:language==='it'?'Impostazioni':'Settings',exact:true}).click();
}
test('bilingual catalog, Last Time and unsaved draft survive Settings and reload',async({page},info)=>{
  await page.goto('/workout');
  await page.getByRole('textbox',{name:'Exercise',exact:true}).fill('DB Bench');
  await page.getByRole('button',{name:'Dumbbell Bench Press',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Weight kg',exact:true})).toHaveValue('30');
  await expect(page.getByRole('textbox',{name:'Reps',exact:true})).toHaveValue('8');
  await page.getByRole('textbox',{name:'Weight kg',exact:true}).fill('32');
  await page.getByText('RPE & notes',{exact:true}).click();
  await page.getByRole('textbox',{name:'RPE optional',exact:true}).fill('8.5');
  await page.getByRole('textbox',{name:'Notes optional',exact:true}).fill('Never translate this note');
  await settings(page);
  await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('it');
  await expect(page.getByRole('heading',{name:'Impostazioni',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Allenamento',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Esercizio',exact:true})).toHaveValue('Panca piana con manubri');
  await expect(page.getByRole('textbox',{name:'Carico kg',exact:true})).toHaveValue('32');
  if(!await page.getByRole('textbox',{name:'RPE facoltativo',exact:true}).isVisible())await page.getByText('RPE e note',{exact:true}).click();
  await expect(page.getByRole('textbox',{name:'RPE facoltativo',exact:true})).toHaveValue('8.5');
  await expect(page.getByRole('textbox',{name:'Note facoltative',exact:true})).toHaveValue('Never translate this note');
  await expect(page.getByText('Do not translate my name',{exact:true})).toBeVisible();
  await expect(page.getByText('Original English note',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Salva serie',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Ripetizioni',exact:true})).toHaveValue('7');
  await expect(page.getByRole('textbox',{name:'RPE facoltativo',exact:true})).toHaveValue('');
  await expect(page.getByRole('textbox',{name:'Note facoltative',exact:true})).toHaveValue('');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets[0]);
  expect(saved.exercise_id).toBe(canonical.id);expect(saved.exercise).toBe('Dumbbell Bench Press');
  await page.reload();
  await expect(page.getByRole('heading',{name:'Allenamento',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Ripetizioni',exact:true})).toHaveValue('7');
  await page.getByRole('button',{name:'Cronologia',exact:true}).click();
  await page.getByRole('button',{name:/Do not translate my name/}).click();
  await expect(page.getByRole('heading',{name:'Panca piana con manubri',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('italian-training-history.png'),fullPage:true});
});
test('Other stays custom and language is independent for two users',async({page},info)=>{
  await page.goto('/workout');
  await page.getByRole('textbox',{name:'Exercise',exact:true}).click();
  await page.getByRole('button',{name:'Other exercise',exact:true}).click();
  await page.getByRole('textbox',{name:'Exercise',exact:true}).fill('My pulley experiment');
  await page.getByRole('button',{name:'Use custom exercise',exact:true}).click();
  await page.getByRole('textbox',{name:'Weight kg',exact:true}).fill('12');
  await page.getByRole('textbox',{name:'Reps',exact:true}).fill('10');
  await page.getByRole('button',{name:'Save Set',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets[0].exercise_id)).toBeNull();
  await settings(page);await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('it');
  await expect(page.getByRole('heading',{name:'Impostazioni',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('italian-settings-mobile.png'),fullPage:true});
  await page.evaluate(()=>window.__qaSignIn('qa-user-b'));
  await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
  await page.evaluate(()=>window.__qaSignIn('qa-user-a'));
  await expect(page.getByRole('heading',{name:'Impostazioni',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Lingua',exact:true}).selectOption('en');
  await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
  const rows=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts')));
  expect(rows[0].workout_sets[0].exercise).toBe('My pulley experiment');
});
test('incomplete onboarding is non-blocking and Italian chrome renders across workspaces',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('qa-profile-incomplete','yes'));
  await page.goto('/workout');await expect(page.getByRole('textbox',{name:'Exercise',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Set up your profile and language',exact:true}).click();
  await page.getByRole('textbox',{name:'Username',exact:true}).fill('new_member');
  await page.getByRole('textbox',{name:'Display name',exact:true}).fill('My authored name');
  await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('it');
  await page.getByRole('button',{name:'Salva impostazioni',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Impostazioni salvate.');
  for(const title of ['Salute','Calendario','Promemoria','Finanze']) {
    await page.getByRole('button',{name:'Altro',exact:true}).click();
    await page.getByRole('button',{name:title,exact:true}).click();
    await expect(page.getByRole('heading',{name:title,exact:true}).first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  for(const title of ['Riepilogo','Progetti','Companion']) {
    await page.getByRole('button',{name:title,exact:true}).click();
    await expect(page.getByRole('heading',{name:title,exact:true}).first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
