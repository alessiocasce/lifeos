import {test,expect} from '@playwright/test';
import {localDate} from '../../src/utils/date.js';
import {resolveExercise} from '../../src/utils/exerciseCatalog.js';

test.beforeEach(async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(({today,id})=>{
    if(sessionStorage.getItem('nav-seed'))return;sessionStorage.setItem('nav-seed','1');
    localStorage.setItem('qa-workouts',JSON.stringify([{id:'current',user_id:'qa-user-a',name:'Current',performed_on:today,started_at:today+'T08:00:00Z',template_appearance:{color_key:'purple',icon_key:'back'},template_snapshot:Array.from({length:20},(_,i)=>({exercise:i?'Template exercise '+i:'Barbell Curl',exercise_id:i?null:id,exercise_order:i+1})),workout_sets:[]}]));
    localStorage.setItem('qa-templates','[]');
  },{today:localDate(),id:resolveExercise('Barbell Curl').id});
});
const dialog=page=>page.getByRole('dialog',{name:'Choose exercise',exact:true});
const settle=async page=>{await page.getByRole('dialog').evaluate(e=>Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished)));};
const close=async page=>{await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);};

for(const width of [375,390,430])test('dock and floating sheet measurements at '+width,async({page},info)=>{
  await page.setViewportSize({width,height:844});await page.goto('/workout');
  await expect(page.locator('.mobile-dock')).toBeVisible();
  const metrics=[];
  const measure=async label=>{const m=await page.locator('.mobile-dock').evaluate(e=>{const r=e.getBoundingClientRect();return {height:r.height,bottom:r.bottom,visibleBottom:visualViewport.offsetTop+visualViewport.height,scale:visualViewport.scale};});metrics.push({label,...m});expect(Math.abs(m.bottom-m.visibleBottom)).toBeLessThan(1.5);return m;};
  const initial=await measure('first shell frame');
  await expect(page.getByRole('button',{name:'Workout options',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('initial-dock.png')});
  for(const name of ['Command','Community','Training','Companion','More']){
    await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name,exact:true}).click();
    expect((await measure(name)).height).toBe(initial.height);
    if(name==='More')await page.getByRole('button',{name:'Close utilities',exact:true}).click();
  }
  await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name:'Training',exact:true}).click();
  for(const height of [700,844]){await page.setViewportSize({width,height});expect((await measure('viewport '+height)).height).toBe(initial.height);}
  await page.getByRole('button',{name:'Workout options',exact:true}).click();await settle(page);
  const box=await page.getByRole('dialog').evaluate(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {bottom:r.bottom,top:r.top,left:r.left,right:r.right,radius:c.borderBottomLeftRadius,visibleBottom:visualViewport.offsetTop+visualViewport.height};});
  expect(box.visibleBottom-box.bottom).toBeGreaterThanOrEqual(9);expect(box.visibleBottom-box.bottom).toBeLessThan(12);expect(box.radius).toBe('22px');expect(box.top).toBeGreaterThan(0);expect(box.left).toBeGreaterThan(0);expect(box.right).toBeLessThan(width);
  await page.screenshot({path:info.outputPath('floating-options.png')});await close(page);
  await page.getByRole('button',{name:'Workout options',exact:true}).click();await page.getByRole('button',{name:'Edit workout details',exact:true}).click();
  await page.getByRole('dialog',{name:'Edit workout details',exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Name',exact:true}).focus();await page.setViewportSize({width,height:500});await settle(page);
  const keyboardSheet=await page.getByRole('dialog').boundingBox();expect(keyboardSheet.y).toBeGreaterThanOrEqual(0);expect(keyboardSheet.y+keyboardSheet.height).toBeLessThanOrEqual(490.5);await expect(page.getByRole('dialog').getByRole('button',{name:'Close',exact:true})).toBeVisible();await close(page);await page.setViewportSize({width,height:844});
  await info.attach('dock-measurements',{body:JSON.stringify(metrics,null,2),contentType:'application/json'});
});

test('one picker dialog, continuous selection border, numbering, Back and scroll restoration',async({page},info)=>{
  await page.goto('/workout');await page.getByRole('button',{name:'Exercise',exact:true}).click();await settle(page);
  const first=dialog(page).getByRole('button',{name:/01.*Barbell Curl/});await expect(first).toHaveAttribute('aria-pressed','true');
  const border=await first.evaluate(e=>{const c=getComputedStyle(e);return [c.borderTopColor,c.borderBottomColor,c.borderLeftColor,c.borderRightColor];});expect(new Set(border).size).toBe(1);
  await expect(dialog(page).getByRole('button',{name:/10.*Template exercise 9/})).toBeVisible();
  await page.screenshot({path:info.outputPath('selected-numbering.png')});
  const node=await dialog(page).elementHandle();
  await dialog(page).getByRole('button',{name:'Choose another exercise',exact:true}).click();
  const scroll=await page.locator('.training-picker-plan').evaluate(e=>e.scrollTop);
  await expect(dialog(page).getByRole('heading',{name:'All exercises',exact:true,level:2})).toBeVisible();
  expect(await node.evaluate(e=>e.isConnected)).toBe(true);
  await expect(dialog(page).getByRole('button',{name:'Back',exact:true})).toBeVisible();
  expect(await dialog(page).getByRole('textbox',{name:'Exercise',exact:true}).evaluate(e=>document.activeElement===e)).toBe(false);
  await settle(page);await page.screenshot({path:info.outputPath('catalog-back.png')});
  await dialog(page).getByRole('combobox',{name:'Exercise category'}).selectOption('back');
  await dialog(page).getByRole('textbox',{name:'Exercise',exact:true}).fill('Pull-Up');
  await expect(dialog(page).getByRole('button',{name:'Pull-Up',exact:true})).toBeVisible();
  await dialog(page).getByRole('button',{name:'Back',exact:true}).click();await settle(page);
  await expect.poll(()=>page.locator('.training-picker-plan').evaluate(e=>e.scrollTop)).toBe(scroll);
  await expect(dialog(page).getByRole('button',{name:'Choose another exercise',exact:true})).toBeFocused();
  await dialog(page).getByRole('button',{name:'Choose another exercise',exact:true}).click();
  await dialog(page).getByRole('button',{name:'Other exercise',exact:true}).click();
  await dialog(page).getByRole('textbox',{name:'Exercise',exact:true}).fill('My custom movement');
  await dialog(page).getByRole('button',{name:'Use custom exercise',exact:true}).click();await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Exercise',exact:true})).toContainText('My custom movement');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts'))[0].template_snapshot.length)).toBe(20);
});

for(const width of [375,390,430])test('empty workout name-only modal: validation, cancel, failure retention, local creation date and one submit '+width,async({page},info)=>{
  await page.setViewportSize({width,height:844});
  await page.goto('/workout');await page.evaluate(()=>localStorage.setItem('qa-workouts','[]'));await page.reload();
  await page.getByRole('button',{name:'Start Empty Workout',exact:true}).click();await settle(page);
  const sheet=page.getByRole('dialog',{name:'New workout',exact:true});
  await expect(sheet.getByRole('textbox')).toHaveCount(1);await expect(sheet.locator('input[type=date]')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('name-only.png')});
  await sheet.getByRole('textbox',{name:'Workout name',exact:true}).fill('   ');await sheet.getByRole('button',{name:'Start workout',exact:true}).click();await expect(sheet.getByRole('alert')).toContainText('Workout name is required.');
  await sheet.getByRole('button',{name:'Cancel',exact:true}).click();await expect(sheet).toHaveCount(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts')).length)).toBe(0);
  await page.getByRole('button',{name:'Start Empty Workout',exact:true}).click();await sheet.getByRole('textbox',{name:'Workout name',exact:true}).fill('  Evening session  ');
  await page.evaluate(()=>localStorage.setItem('qa-session-fail','1'));await sheet.getByRole('button',{name:'Start workout',exact:true}).click();await expect(sheet.getByRole('alert')).toContainText('not started');await expect(sheet.getByRole('textbox')).toHaveValue('  Evening session  ');
  await page.evaluate(()=>{localStorage.removeItem('qa-session-fail');localStorage.setItem('qa-session-delay','500');});
  await page.clock.install({time:new Date('2026-11-03T23:05:00Z')});
  await sheet.getByRole('textbox').press('Enter');await expect(sheet.getByRole('button',{name:'Starting',exact:true})).toBeDisabled();await sheet.getByRole('textbox').press('Enter');
  await page.clock.runFor(800);await expect(sheet).toHaveCount(0);
  const rows=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts')));expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({name:'Evening session',performed_on:'2026-11-04',template_id:null,template_snapshot:[]});expect(Math.abs(Date.parse(rows[0].started_at)-Date.parse('2026-11-03T23:05:00Z'))).toBeLessThan(1000);
  await expect(page.getByRole('region',{name:'Workout set logger'})).toBeVisible();
});
