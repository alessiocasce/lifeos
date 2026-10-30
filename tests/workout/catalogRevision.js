import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exerciseCatalog, resolveExercise, exerciseIdentityKey, exerciseLabel, searchExercises } from '../../src/utils/exerciseCatalog.js';
import { ownerExerciseMappings } from '../../src/data/exerciseCatalogRevision.js';

export async function testCatalogRevision(db) {
  await db.exec('reset role');
  const expected={chest:20,back:15,shoulders:11,biceps:10,triceps:8,quadriceps:8,hamstrings:4,glutes:0,calves:1,core:1,full_body:1};
  assert.equal(exerciseCatalog.length,224);
  assert.equal(exerciseCatalog.filter(e=>!e.active).length,145);
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map(c=>[c,exerciseCatalog.filter(e=>e.active&&e.category===c).length])),expected);
  const oldSQL=fs.readFileSync('supabase/migrations/20261029211303_social_training_catalog.sql','utf8');
  const oldIds=[...oldSQL.matchAll(/\('([0-9a-f-]{36})','([a-z0-9_]+)'/g)];
  assert.equal(oldIds.length,217);
  for(const [,id,slug] of oldIds)assert.equal(exerciseCatalog.find(e=>e.slug===slug)?.id,id);
  const labels=[...new Set(exerciseCatalog.flatMap(e=>[e.name_en,e.name_it,...e.aliases]))];
  const sqlResolved=await db.query('select value,public.resolve_exercise_id(value) id from unnest($1::text[]) value',[labels]);
  for(const row of sqlResolved.rows)assert.equal(row.id,resolveExercise(row.value)?.id||null,`SQL/JS mismatch: ${row.value}`);
  const straight=exerciseCatalog.find(e=>e.slug==='barbell_curl');
  const ez=exerciseCatalog.find(e=>e.slug==='ez_bar_curl');
  assert.equal(resolveExercise('Barbell Curl').id,ez.id);
  assert.equal(resolveExercise('Military Press').slug,'barbell_overhead_press');
  assert.equal(resolveExercise('Lateral Raises'),null);
  assert.equal(resolveExercise('Panca Piana'),null);
  assert.equal(resolveExercise({exercise:'Leg Press',exercise_id:null}),null);
  assert.equal(exerciseIdentityKey({exercise:'Leg Press',exercise_id:null}),'legacy:leg press');
  assert.equal(resolveExercise('Incline Bench Press'),null);
  assert.equal(searchExercises('Barbell Curl').some(e=>e.id===straight.id),false);
  assert.notEqual(exerciseIdentityKey({exercise:'Barbell Curl',exercise_id:straight.id}),exerciseIdentityKey({exercise:'Barbell Curl',exercise_id:ez.id}));
  assert.equal(exerciseLabel({exercise:'Old authored label',exercise_id:straight.id},'en'),'Barbell Curl');
  assert.equal(exerciseCatalog.find(e=>e.slug==='boxing_bag').uses_external_load,false);
  assert.equal(exerciseCatalog.find(e=>e.slug==='calf_raises').equipment,'unspecified');
  for(const e of exerciseCatalog.filter(e=>['machine','unspecified','boxing_bag'].includes(e.equipment)))assert.equal(e.leaderboard_eligible,false);

  const owner='33333333-3333-4333-8333-333333333333';
  const other='44444444-4444-4444-8444-444444444444';
  await db.query('insert into auth.users(id) values($1),($2)',[owner,other]);
  for(const table of ['workouts','workout_sets','workout_template_exercises']) {
    await db.exec(`create trigger revision_timestamp before update on public.${table} for each row execute function public.set_updated_at()`);
  }
  const template=(await db.query("insert into workout_templates(user_id,name) values($1,'Local revision fixture') returning id",[owner])).rows[0].id;
  const fixtures=[];
  for(const [index,[name,slug]] of Object.entries(ownerExerciseMappings).entries()) {
    const input=index%3===0 ? `  ${name.toUpperCase().replaceAll(' ','  ')}  ` : name;
    const snapshot=[{exercise:input,exercise_order:1,notes:'Original',extra:{keep:true}}];
    const w=(await db.query("insert into workouts(user_id,name,ended_at,template_snapshot,updated_at) values($1,'Revision fixture',now(),$2,'2001-01-01') returning *",[owner,JSON.stringify(snapshot)])).rows[0];
    const set=(await db.query("insert into workout_sets(user_id,workout_id,exercise,set_number,is_warmup,weight,reps,rpe,notes,performed_at,updated_at) values($1,$2,$3,$4,$5,30,10,8.5,'Original note','2000-01-01','2001-01-01') returning *",[owner,w.id,input,index%2===0?1001:1,index%2===0])).rows[0];
    const item=(await db.query("insert into workout_template_exercises(user_id,template_id,exercise,exercise_order,notes,updated_at) values($1,$2,$3,$4,'Original template note','2001-01-01') returning *",[owner,template,input,index+1])).rows[0];
    fixtures.push({slug,set,item,workout:w});
  }
  const otherWorkout=(await db.query("insert into workouts(user_id,name,ended_at) values($1,'Other fixture',now()) returning id",[other])).rows[0].id;
  const otherSet=(await db.query("insert into workout_sets(user_id,workout_id,exercise,set_number,weight,reps) values($1,$2,'Incline Bench Press',1,12,8) returning *",[other,otherWorkout])).rows[0];
  const inactive=(await db.query("insert into workout_sets(user_id,workout_id,exercise,exercise_id,set_number,weight,reps) values($1,$2,'Barbell Curl',$3,2,12,8) returning *",[owner,fixtures[0].workout.id,straight.id])).rows[0];
  await db.query('select public.apply_owner_exercise_revision_v2($1)',[owner]);
  const withoutIdentity=row=>Object.fromEntries(Object.entries(row).filter(([k])=>!['exercise','exercise_id'].includes(k)));
  for(const fixture of fixtures) {
    const target=exerciseCatalog.find(e=>e.slug===fixture.slug);
    for(const [table,key] of [['workout_sets','set'],['workout_template_exercises','item']]) {
      const current=(await db.query(`select * from public.${table} where id=$1`,[fixture[key].id])).rows[0];
      assert.equal(current.exercise_id,target.id);assert.equal(current.exercise,target.name_en);
      assert.deepEqual(withoutIdentity(current),withoutIdentity(fixture[key]),`Unrelated ${table} fields changed`);
    }
    const current=(await db.query('select * from workouts where id=$1',[fixture.workout.id])).rows[0];
    assert.deepEqual(current,{...fixture.workout,template_snapshot:[{...fixture.workout.template_snapshot[0],exercise:target.name_en,exercise_id:target.id}]});
  }
  assert.deepEqual((await db.query('select * from workout_sets where id=$1',[otherSet.id])).rows[0],otherSet);
  assert.deepEqual((await db.query('select * from workout_sets where id=$1',[inactive.id])).rows[0],inactive);
  assert.deepEqual((await db.query('select public.apply_owner_exercise_revision_v2($1) result',[owner])).rows[0].result,
    {sets_changed:0,template_exercises_changed:0,workout_snapshots_changed:0});
  const forward=fs.readdirSync('supabase/migrations').find(name=>name.endsWith('_exercise_catalog_revision.sql'));
  await db.exec('begin');
  await db.query("select set_config('lifeos.exercise_revision_owner',$1,true)",[owner]);
  await db.exec(fs.readFileSync(`supabase/migrations/${forward}`,'utf8'));
  await db.exec('commit');
  assert.deepEqual((await db.query('select * from workout_sets where id=$1',[inactive.id])).rows[0],inactive);
  const bad=(await db.query("insert into workout_sets(user_id,workout_id,exercise,exercise_id,set_number,weight,reps) values($1,$2,'Panca Piana',$3,77,12,8) returning id",[owner,fixtures[0].workout.id,straight.id])).rows[0].id;
  await assert.rejects(db.query('select public.apply_owner_exercise_revision_v2($1)',[owner]),/conflicts/);
  await db.query('delete from workout_sets where id=$1',[bad]);
  const unknown=(await db.query("insert into workout_sets(user_id,workout_id,exercise,set_number,weight,reps) values($1,$2,'Unexpected custom',77,12,8) returning id",[owner,fixtures[0].workout.id])).rows[0].id;
  await assert.rejects(db.query('select public.apply_owner_exercise_revision_v2($1)',[owner]),/Unexpected owner/);
  await db.query('delete from workout_sets where id=$1',[unknown]);
  assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname='revision_timestamp' and tgenabled='O'")).rows[0].n,3);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.apply_owner_exercise_revision_v2(uuid)','EXECUTE') allowed")).rows[0].allowed,false);
  console.log('PASS 224/79/145 catalog, all original IDs, SQL/JS alias parity, 29 owner mappings, timestamp/snapshot preservation, isolation, inactive identity, idempotency and fail-closed conflicts');
}
