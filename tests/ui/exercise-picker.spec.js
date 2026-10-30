import { test, expect } from '@playwright/test';
import { exerciseCatalog } from '../../src/utils/exerciseCatalog.js';
import { localDate } from '../../src/utils/date.js';
import { searchExercise, selectExercise } from './exercisePicker.js';

test.beforeEach(async({page})=>{
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.addInitScript(({today,oldId})=>localStorage.setItem('qa-workouts',JSON.stringify([
    {id:'active',user_id:'qa-user-a',name:'Current workout',performed_on:today,workout_sets:[]},
    {id:'old',user_id:'qa-user-a',name:'Original history',performed_on:'2026-09-28',ended_at:'2026-09-28T14:00:00Z',workout_sets:[
      {id:'inactive',exercise:'Barbell Curl',exercise_id:oldId,set_number:1,weight:25,reps:8,rpe:9,notes:'Keep authored note'},
      {id:'bench',exercise:'Dumbell Bench Press',set_number:1,weight:30,reps:10},
    ]},
  ])),{today:localDate(),oldId:exerciseCatalog.find(e=>e.slug==='barbell_curl').id});
});

for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]) {
  test(`picker layout, active categories and keyboard at ${width}`,async({page},info)=>{
    await page.setViewportSize({width,height});
    await page.goto('/workout');
    await page.getByRole('textbox',{name:'Exercise',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Choose exercise',exact:true});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox')).not.toContainText('Glutes');
    // The inactive straight-bar identity must not masquerade as the new EZ identity in Recent.
    const recent=await dialog.getByRole('button',{name:'Barbell Curl',exact:true}).count();
    expect(recent).toBe(1);
    await expect(dialog.getByRole('group',{name:'Recent',exact:true}).getByRole('button',{name:'Barbell Curl',exact:true})).toHaveCount(0);
    await dialog.getByRole('combobox').selectOption('calves');
    await expect(dialog.getByRole('button',{name:'Calf Raises',exact:true})).toBeVisible();
    await expect(dialog.getByRole('button',{name:'Standing Machine Calf Raise',exact:true})).toHaveCount(0);
    await dialog.getByRole('combobox').selectOption('');
    await dialog.getByRole('textbox').fill('Military Press');
    await dialog.getByRole('textbox').press('ArrowDown');
    await expect(dialog.getByRole('button',{name:'Military Press',exact:true})).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const box=await dialog.boundingBox();expect(box.width).toBeLessThanOrEqual(width);
    if(width===390)expect(box.width).toBeGreaterThanOrEqual(388);
    await page.screenshot({path:info.outputPath(`picker-${width}.png`)});
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('textbox',{name:'Exercise',exact:true})).toHaveValue('Military Press');
    await expect(page.getByRole('textbox',{name:'Exercise',exact:true})).toBeFocused();
    await searchExercise(page,'Bench');await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox',{name:'Exercise',exact:true})).toHaveValue('Military Press');
  });
}

test('boxing requires no external load and removed recent identities remain read-only history',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/workout');await selectExercise(page,'Boxing Bag');
  await page.getByRole('textbox',{name:'Reps',exact:true}).fill('1');
  await page.getByRole('button',{name:'Save Set',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Saved:');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets[0]);
  expect(saved.weight).toBe(0);expect(saved.exercise_id).toBe(exerciseCatalog.find(e=>e.slug==='boxing_bag').id);
  await page.getByRole('button',{name:'History',exact:true}).click();
  await page.getByRole('button',{name:/Original history/}).click();
  await expect(page.getByRole('heading',{name:'Barbell Curl',exact:true})).toBeVisible();
  await expect(page.getByText('Keep authored note',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});
