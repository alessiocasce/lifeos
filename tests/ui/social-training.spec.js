import { test, expect } from '@playwright/test';
import { localDate } from '../../src/utils/date.js';
import { exerciseCatalog } from '../../src/utils/exerciseCatalog.js';
import { searchExercise } from './exercisePicker.js';
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
  await searchExercise(page,'DB Bench');
  await page.getByRole('button',{name:'Dumbbell Bench Press',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await expect(page.getByRole('textbox',{name:'Weight per dumbbell (kg)',exact:true})).toHaveValue('30');
  await expect(page.getByRole('textbox',{name:'Reps',exact:true})).toHaveValue('8');
  await page.getByRole('textbox',{name:'Weight per dumbbell (kg)',exact:true}).fill('32');
  await page.getByRole('button',{name:'More options',exact:true}).click();
  await page.getByRole('button',{name:'RPE 8',exact:true}).click();
  await page.getByRole('textbox',{name:'Set notes',exact:true}).fill('Never translate this note');
  if(await page.getByRole('dialog').count())await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await settings(page);
  await page.getByRole('combobox',{name:'Language',exact:true}).click();await page.getByRole('option',{name:'Italiano',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Impostazioni',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Allenamento',exact:true}).click();
  await expect(page.getByRole('button',{name:'Esercizio',exact:true})).toContainText('Panca piana con manubri');
  await expect(page.getByRole('textbox',{name:'Peso per manubrio (kg)',exact:true})).toHaveValue('32');
  await page.getByRole('button',{name:'Altre opzioni',exact:true}).click();
  await expect(page.getByRole('button',{name:'RPE 8',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('textbox',{name:'Note della serie',exact:true})).toHaveValue('Never translate this note');
  await page.getByRole('dialog').getByRole('button',{name:'Chiudi',exact:true}).click();
  await page.getByRole('region',{name:'Ultima volta',exact:true}).locator('summary').click();
  await expect(page.getByText('Do not translate my name',{exact:true})).toBeVisible();
  await expect(page.getByText('Original English note',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('italian-live.png'),fullPage:true});
  await page.getByRole('button',{name:'Salva serie',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Ripetizioni',exact:true})).toHaveValue('7');
  await page.getByRole('button',{name:'Altre opzioni',exact:true}).click();
  await expect(page.getByRole('button',{name:'Nessuno',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('textbox',{name:'Note della serie',exact:true})).toHaveValue('');
  await page.getByRole('dialog').getByRole('button',{name:'Chiudi',exact:true}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets[0]);
  expect(saved.exercise_id).toBe(canonical.id);expect(saved.exercise).toBe('Dumbbell Bench Press');
  await page.reload();
  await expect(page.getByRole('heading',{name:'Allenamento',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Ripetizioni',exact:true})).toHaveValue('7');
  await page.getByRole('button',{name:'Cronologia',exact:true}).click();
  await page.getByRole('button',{name:/Do not translate my name/}).click();
  await expect(page.getByRole('region',{name:'Panca piana con manubri',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('italian-training-history.png'),fullPage:true});
});
test('Other stays custom and language is independent for two users',async({page},info)=>{
  await page.goto('/workout');
  await page.getByRole('button',{name:'Exercise',exact:true}).click();
  await page.getByRole('button',{name:'Other exercise',exact:true}).click();
  await page.getByRole('textbox',{name:'Enter exercise name',exact:true}).fill('My pulley experiment');
  await page.screenshot({path:info.outputPath('custom-exercise.png'),fullPage:true});
  await page.getByRole('button',{name:'Use custom exercise',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.getByRole('textbox',{name:'Weight (kg)',exact:true}).fill('12');
  await page.getByRole('textbox',{name:'Reps',exact:true}).fill('10');
  await page.getByRole('button',{name:'Save Set',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets[0]?.exercise_id)).toBeNull();
  if(await page.getByRole('dialog').count())await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await settings(page);
  await page.screenshot({path:info.outputPath('english-settings-mobile.png'),fullPage:true});
  await page.getByRole('combobox',{name:'Language',exact:true}).click();await page.getByRole('option',{name:'Italiano',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Impostazioni',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('italian-settings-mobile.png'),fullPage:true});
  await page.evaluate(()=>window.__qaSignIn('qa-user-b'));
  await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
  await page.evaluate(()=>window.__qaSignIn('qa-user-a'));
  await expect(page.getByRole('heading',{name:'Impostazioni',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Lingua',exact:true}).click();await page.getByRole('option',{name:'English',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
  const rows=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts')));
  expect(rows[0].workout_sets[0].exercise).toBe('My pulley experiment');
});
test('username setup completes before Italian chrome renders across workspaces',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('qa-profile-incomplete','yes'));
  await page.goto('/workout');
  await expect(page.getByRole('heading',{name:'Choose your username',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Username',exact:true}).fill('new_member');
  await page.getByRole('button',{name:'Save username',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Choose your username',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Exercise',exact:true})).toBeVisible();
  await settings(page);
  await expect(page.getByRole('textbox',{name:'Display name',exact:true})).toHaveCount(0);
  await page.getByRole('combobox',{name:'Language',exact:true}).click();await page.getByRole('option',{name:'Italiano',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Impostazioni',exact:true})).toBeVisible();
  for(const title of ['Salute','Calendario','Promemoria','Finanze']) {
    await page.getByRole('button',{name:'Altro',exact:true}).click();
    await page.getByRole('button',{name:title,exact:true}).click();
    await expect(page.getByRole('heading',{name:title,exact:true}).first()).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  for(const title of ['Riepilogo','Progetti','Companion']) {
    if(title==='Progetti')await page.getByRole('button',{name:'Altro',exact:true}).click();
    await page.getByRole('button',{name:title,exact:true}).click();
    await expect(page.getByRole('heading',{name:title,exact:true}).first()).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('cross-language search and recent aliases select one stable identity',async({page},info)=>{
  await page.goto('/workout');
  await searchExercise(page,'PÁNCA PIANA MANUBRI');
  await expect(page.getByRole('button',{name:'Dumbbell Bench Press',exact:true})).toHaveCount(1);
  await page.screenshot({path:info.outputPath('english-catalog-italian-query.png'),fullPage:true});
  await page.getByRole('button',{name:'Dumbbell Bench Press',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await expect(page.getByRole('textbox',{name:'Weight per dumbbell (kg)',exact:true})).toHaveValue('30');
  if(await page.getByRole('dialog').count())await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await settings(page);
  await page.getByRole('combobox',{name:'Language',exact:true}).click();await page.getByRole('option',{name:'Italiano',exact:true}).click();
  await page.getByRole('button',{name:'Allenamento',exact:true}).click();
  await searchExercise(page,'Lat Pulldown',{label:'Esercizio'});
  await expect(page.getByRole('button',{name:'Lat Machine',exact:true})).toHaveCount(1);
  await page.screenshot({path:info.outputPath('italian-catalog-english-query.png'),fullPage:true});
  await page.getByRole('button',{name:'Lat Machine',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  const draft=await page.getByRole('button',{name:'Esercizio',exact:true}).innerText();
  expect(draft).toBe('Lat Machine');
});
