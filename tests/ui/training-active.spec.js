import { test, expect } from '@playwright/test';
import { localDate } from '../../src/utils/date.js';
import { TEMPLATE_COLORS } from '../../src/utils/templateAppearance.js';
import { resolveExercise } from '../../src/utils/exerciseCatalog.js';
import { selectExercise } from './exercisePicker.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/*',route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({today,a,b}) => {
    if (sessionStorage.getItem('active-v3')) return;
    sessionStorage.setItem('active-v3','1');
    const plan=[{exercise:a.name_en,exercise_id:a.id,exercise_order:1},{exercise:b.name_en,exercise_id:b.id,exercise_order:2}];
    localStorage.setItem('qa-workouts',JSON.stringify([
      {id:'current',user_id:'qa-user-a',name:'Chest + Triceps',performed_on:today,started_at:today+'T10:00:00Z',template_snapshot:plan,template_appearance:{color_key:'red',icon_key:'chest'},workout_sets:[]},
      {id:'past',user_id:'qa-user-a',name:'Previous Push',performed_on:'2026-01-01',started_at:'2026-01-01T10:00:00Z',ended_at:'2026-01-01T11:00:00Z',workout_sets:[
        {id:'a1',exercise:a.name_en,exercise_id:a.id,set_number:1001,is_warmup:true,weight:20,reps:10},
        {id:'a2',exercise:a.name_en,exercise_id:a.id,set_number:1,weight:55,reps:8,rpe:7.5,notes:'Paused'},
        {id:'b1',exercise:b.name_en,exercise_id:b.id,set_number:1,weight:30,reps:10},
      ]},
    ]));
    localStorage.setItem('qa-templates','[]');
  },{today:localDate(),a:resolveExercise('Incline Barbell Bench Press'),b:resolveExercise('Dumbbell Bench Press')});
});
const field=(page,name)=>page.getByRole('textbox',{name,exact:true});
async function switchPlan(page,name) {
  await page.getByRole('button',{name:'Exercise',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:new RegExp(name)}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('exercise drafts are independent, durable, with own prefill and outcome state',async({page})=>{
  await page.goto('/workout');
  await expect(field(page,'Weight (kg)')).toHaveValue('55');
  await field(page,'Weight (kg)').fill('57.5');
  await page.getByRole('button',{name:'More options',exact:true}).click();
  await page.getByRole('button',{name:'RPE 7',exact:true}).click();
  await field(page,'Set notes').fill('Only A');
  await page.getByRole('checkbox',{name:'Warmup set'}).check();
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await switchPlan(page,'Dumbbell Bench Press');
  await expect(field(page,'Weight (kg)')).toHaveValue('30');
  await page.getByRole('button',{name:'More options',exact:true}).click();
  await expect(field(page,'Set notes')).toHaveValue('');
  await expect(page.getByRole('button',{name:'None',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('checkbox',{name:'Warmup set'})).not.toBeChecked();
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await field(page,'Reps').fill('11');
  await page.reload();
  await expect(field(page,'Reps')).toHaveValue('11');
  await switchPlan(page,'Incline Barbell Bench Press');
  await expect(field(page,'Weight (kg)')).toHaveValue('57.5');
  await page.getByRole('button',{name:'More options',exact:true}).click();
  await expect(field(page,'Set notes')).toHaveValue('Only A');
  await expect(page.getByRole('button',{name:'RPE 7',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'None',exact:true}).click();
  await page.getByRole('checkbox',{name:'Warmup set'}).uncheck();
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Save Set',exact:true}).click();
  await expect(page.getByRole('region',{name:'Sets logged',exact:true})).toContainText('57.5');
  const set=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa-workouts'))[0].workout_sets[0]);
  expect(set).toMatchObject({rpe:null,notes:'Only A',is_warmup:false});
  await switchPlan(page,'Dumbbell Bench Press');
  await expect(page.getByRole('region',{name:'Sets logged',exact:true})).not.toContainText('57.5');
  await expect(page.getByRole('timer')).toHaveCount(0);
  await expect(page.getByText(/Rest timer/)).toHaveCount(0);
});

test('last time, counters, catalog override, options, set editing/deletion, end and History',async({page})=>{
  await page.goto('/workout');
  const last=page.locator('.training-last');
  await expect(last).not.toHaveAttribute('open','');
  await last.locator('summary').click();
  await expect(last).toContainText('20 kg × 10');await expect(last).toContainText('RPE 7.5');
  await page.getByRole('button',{name:'Increase Weight (kg)',exact:true}).click();
  await expect(field(page,'Weight (kg)')).toHaveValue('57.5');
  await field(page,'Weight (kg)').fill('56.25');
  await page.getByRole('button',{name:'Save Set',exact:true}).click();
  await page.getByRole('button',{name:'Edit set',exact:true}).click();
  const edit=page.getByRole('group',{name:'Edit workout set'});
  await edit.getByRole('textbox',{name:/Weight/}).fill('58.5');
  await edit.getByRole('button',{name:'Save edit'}).click();
  await expect(page.getByRole('region',{name:'Sets logged'})).toContainText('58.5');
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Delete set',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit set',exact:true})).toHaveCount(1);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete set',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit set',exact:true})).toHaveCount(0);
  await selectExercise(page,'Barbell Curl');
  await expect(field(page,'Weight (kg)')).toHaveValue('');
  await page.getByRole('button',{name:'Workout options',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'End Workout'})).toHaveCount(0);
  await page.getByRole('button',{name:'Edit workout details',exact:true}).click();
  await field(page,'Name').fill('Renamed workout');
  await page.getByRole('button',{name:'Save changes'}).click();
  await expect(page.getByRole('heading',{name:'Renamed workout'})).toBeVisible();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'End Workout',exact:true}).click();
  await expect(page.getByText('Session complete',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'History',exact:true}).click();
  await expect(page.getByRole('button',{name:/Renamed workout/})).toBeVisible();
});

test('Manage is a saved-template library with a focused notes-free editor',async({page})=>{
  await page.goto('/workout');await page.getByRole('button',{name:'Manage',exact:true}).click();
  await expect(page.getByRole('form',{name:'Create workout template'})).toHaveCount(0);
  await page.getByRole('button',{name:'Create template',exact:true}).click();
  const create=page.getByRole('form',{name:'Create workout template'});
  await create.getByLabel('Template name').fill('My actual plan');
  await expect(create.getByLabel('Notes',{exact:true})).toHaveCount(0);
  await create.getByRole('button',{name:'Blue',exact:true}).click();
  await create.getByRole('button',{name:'Back',exact:true}).click();
  await create.getByRole('button',{name:'Create template',exact:true}).click();
  const add=page.getByRole('group',{name:'Add template exercise'});
  await selectExercise(page,'Barbell Curl',{label:'Add exercise',scope:add});
  await add.getByRole('button',{name:'Add exercise',exact:true}).filter({hasNot:page.locator('span')}).click();
  await page.getByRole('button',{name:'Your templates',exact:true}).click();
  await expect(page.getByRole('group',{name:'Add template exercise'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/My actual plan/})).toContainText('1 exercises');
  await page.reload();await page.getByRole('button',{name:'Manage',exact:true}).click();
  await expect(page.getByRole('button',{name:/My actual plan/})).toBeVisible();
});

for(const width of [390,768,1024,1440]) test('approved active layout at '+width,async({page},info)=>{
  await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/workout');
  await page.getByRole('button',{name:'Save Set',exact:true}).click();
  await page.screenshot({path:info.outputPath('active.png'),fullPage:true});
  await page.getByRole('button',{name:'More options',exact:true}).click();
  await page.screenshot({path:info.outputPath('options.png'),fullPage:true});
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Exercise',exact:true}).click();
  await page.screenshot({path:info.outputPath('exercise-sheet.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('all allowed session colors and neutral empty workout use controlled accents',async({page})=>{
  await page.goto('/workout');
  for(const [color,hex] of Object.entries(TEMPLATE_COLORS)) {
    await page.evaluate(color=>{const rows=JSON.parse(localStorage.getItem('qa-workouts'));rows[0].template_appearance.color_key=color;localStorage.setItem('qa-workouts',JSON.stringify(rows));},color);
    await page.reload();
    await expect(page.locator('.training-active')).toHaveCSS('--workout-accent',hex);
  }
  await page.evaluate(()=>{const rows=JSON.parse(localStorage.getItem('qa-workouts'));delete rows[0].template_appearance;rows[0].template_id=null;localStorage.setItem('qa-workouts',JSON.stringify(rows));});
  await page.reload();await expect(page.locator('.training-active')).toHaveCSS('--workout-accent',TEMPLATE_COLORS.slate);
});
