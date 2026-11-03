import { test, expect } from '@playwright/test';
import { localDate } from '../../src/utils/date.js';
import { resolveExercise } from '../../src/utils/exerciseCatalog.js';

test.beforeEach(async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(({today,a})=>{
    if(sessionStorage.getItem('correction-seeded'))return;
    sessionStorage.setItem('correction-seeded','1');
    localStorage.setItem('qa-templates','[]');
    localStorage.setItem('qa-workouts',JSON.stringify([
      {id:'current',user_id:'qa-user-a',name:'Current',performed_on:today,started_at:today+'T08:00:00Z',template_appearance:{color_key:'purple',icon_key:'back'},template_snapshot:[{exercise:a.name_en,exercise_id:a.id,exercise_order:1}],workout_sets:[]},
      {id:'past',user_id:'qa-user-a',name:'Past',performed_on:'2026-01-01',ended_at:'2026-01-01T09:00:00Z',workout_sets:[{id:'old',exercise:a.name_en,exercise_id:a.id,set_number:1,weight:55,reps:8,rpe:7.5}]},
    ]));
  },{today:localDate(),a:resolveExercise('Barbell Curl')});
});
const field=(page,name)=>page.getByRole('textbox',{name,exact:true});
const close=async page=>{await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);};

test('caret is at end on each tap, decimal typing and steppers remain usable',async({page})=>{
  await page.goto('/workout');
  await expect(field(page,'Weight (kg)')).toHaveValue('55');
  for(const label of ['Weight (kg)','Reps'])for(const value of ['', '0','8','12','55','57.5','102.5']){
    const input=field(page,label);await input.fill(value);
    for(const x of [5,30,55]){
      await input.click({position:{x,y:20}});
      await expect.poll(()=>input.evaluate(e=>[e.selectionStart,e.selectionEnd])).toEqual([value.length,value.length]);
    }
  }
  await field(page,'Weight (kg)').fill('57.5');await page.getByRole('button',{name:'Increase Weight (kg)',exact:true}).click();await expect(field(page,'Weight (kg)')).toHaveValue('60');
  await field(page,'Weight (kg)').click();await field(page,'Weight (kg)').press('ArrowLeft');await field(page,'Weight (kg)').press('Backspace');await expect(field(page,'Weight (kg)')).toHaveValue('0');
});

test('RPE single selector, null save, integer save, legacy fractional edits and no end confirmation',async({page})=>{
  await page.goto('/workout');await page.getByRole('button',{name:'More options',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('textbox',{name:/RPE/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/RPE \d/})).toHaveCount(5);
  for(const n of [6,7,8,9,10]){const choice=page.getByRole('button',{name:'RPE '+n,exact:true});await choice.click();await expect(choice).toHaveAttribute('aria-pressed','true');}
  await page.getByRole('button',{name:'None',exact:true}).click();await close(page);
  await page.getByRole('button',{name:'Save Set',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets[0].rpe)).toBeNull();
  await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'RPE 8',exact:true}).click();await close(page);
  await page.getByRole('button',{name:'Save Set',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets[1].rpe)).toBe(8);
  await field(page,'Weight (kg)').fill('60');
  let confirmations=0;page.on('dialog',d=>{confirmations++;d.dismiss();});
  await page.getByRole('button',{name:'End Workout',exact:true}).click();await expect(page.getByText('Session complete',{exact:true})).toBeVisible();
  expect(confirmations).toBe(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets.length)).toBe(2);
  await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('button',{name:/Past/}).click();await expect(page.getByText('RPE 7.5',{exact:true})).toBeVisible();
});

test('legacy set edit preserves fractional RPE until explicitly cleared',async({page})=>{
  await page.goto('/workout');await page.getByRole('button',{name:'Save Set',exact:true}).click();
  await page.evaluate(()=>{const rows=JSON.parse(localStorage.getItem('qa-workouts'));rows[0].workout_sets[0].rpe=7.5;localStorage.setItem('qa-workouts',JSON.stringify(rows));});
  await page.reload();await page.getByRole('button',{name:'Edit set',exact:true}).click();
  const edit=page.getByRole('group',{name:'Edit workout set'});
  await expect(edit).toContainText('Previous RPE: 7.5');
  await edit.getByRole('textbox',{name:'Reps',exact:true}).fill('9');await edit.getByRole('button',{name:'Save edit',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets[0].rpe)).toBe(7.5);
  await page.getByRole('button',{name:'Edit set',exact:true}).click();await edit.getByRole('button',{name:'None',exact:true}).click();await edit.getByRole('button',{name:'Save edit',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets[0].rpe)).toBeNull();
});

test('baseline is clean, deliberate edits survive reload, and repeated Escape restores focus',async({page})=>{
  await page.goto('/workout');await expect(field(page,'Weight (kg)')).toHaveValue('55');
  const dirty=()=>page.evaluate(async()=>{const {hasWorkoutDraftEdits}=await import('/src/utils/workoutContinuity.js');return hasWorkoutDraftEdits('qa-user-a','current');});
  expect(await dirty()).toBe(false);await field(page,'Weight (kg)').fill('60');expect(await dirty()).toBe(true);await page.reload();expect(await dirty()).toBe(true);
  for(let i=0;i<3;i++){
    await page.getByRole('button',{name:'Exercise',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Exercise',exact:true})).toBeFocused();
  }
  expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
  await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('button',{name:'Live',exact:true}).click();await expect(field(page,'Weight (kg)')).toHaveValue('60');
});

test('Italian Training options and Application updates preserve the workout draft',async({page},info)=>{
  await page.goto('/workout');await expect(field(page,'Weight (kg)')).toHaveValue('55');await field(page,'Weight (kg)').fill('57.5');
  await page.goto('/settings');await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('it');
  await expect(page.getByRole('button',{name:'Cerca aggiornamenti',exact:true})).toBeVisible();
  await page.goto('/workout');await expect(field(page,'Peso (kg)')).toHaveValue('57.5');
  await page.getByRole('button',{name:'Altre opzioni',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Note della serie');await expect(page.getByRole('button',{name:'RPE 7',exact:true})).toBeVisible();
  await page.getByRole('dialog').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished)));
  await page.screenshot({path:info.outputPath('italian-options.png')});
});

for(const count of [1,2,5,10,20]) test('content-sized compact picker '+count+' exercises',async({page})=>{
  await page.goto('/workout');
  await page.evaluate(count=>{const rows=JSON.parse(localStorage.getItem('qa-workouts'));rows[0].template_snapshot=Array.from({length:count},(_,i)=>({exercise:'Exercise '+i+(i===count-1?' with a long descriptive name that wraps naturally':''),exercise_order:i+1}));localStorage.setItem('qa-workouts',JSON.stringify(rows));},count);
  await page.reload();await page.getByRole('button',{name:'Exercise',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  const metrics=await dialog.evaluate(e=>{const r=e.getBoundingClientRect();return {height:r.height,width:r.width,viewport:innerHeight,rows:[...e.querySelectorAll('.training-exercise-plan > button:not(.training-another-exercise)')].map(n=>n.getBoundingClientRect().height)};});
  expect(metrics.height).toBeLessThan(metrics.viewport);expect(metrics.width).toBeLessThanOrEqual(390);
  expect(metrics.rows).toHaveLength(count);for(const h of metrics.rows)expect(h).toBeLessThan(85);
  if(count<3)expect(metrics.height).toBeLessThan(350);
  await close(page);await expect(page.getByRole('button',{name:'Exercise',exact:true})).toBeFocused();
  expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
});

for(const width of [375,390,430,768,1024,1440]) test('stable sheets and creation at '+width,async({page},info)=>{
  await page.setViewportSize({width,height:844});await page.goto('/workout');
  for(const name of ['More options','Workout options','Exercise']){
    await page.getByRole('button',{name,exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished)));
    const rect=await page.getByRole('dialog').boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(width+1);expect(rect.y+rect.height).toBeLessThanOrEqual(845);
    await page.screenshot({path:info.outputPath(name+'.png')});await close(page);
  }
  expect(await page.evaluate(()=>visualViewport.scale)).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Manage',exact:true}).click();await page.getByRole('button',{name:'Create template',exact:true}).click();
  await expect(page.getByRole('button',{name:'Purple',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('create.png'),fullPage:true});
});
