import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCommunityDatabase, applyCommunityMigration } from '../tests/workout/communityDatabase.js';
import { exerciseIdentityKey, resolveExercise, exerciseCatalog } from '../src/utils/exerciseCatalog.js';

const oldId='860c2371-8592-5ad9-aa43-805984020e52', target='a2bc1c95-14c7-558d-a56b-0973cc4793dd';
const db=await createCommunityDatabase();
try {
  await applyCommunityMigration(db,'community_automatic_sharing');
  const users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
  const sources={workouts:[],workout_sets:[],workout_template_exercises:[]};
  for(const table of Object.keys(sources)) await db.exec(`create trigger curl_timestamp before update on ${table} for each row execute function set_updated_at()`);
  for(const [index,user] of users.entries()) {
    await db.query('insert into auth.users(id) values($1)',[user]);
    await db.query('insert into user_profiles(user_id,username,display_name) values($1,$2,$2)',[user,`member${index}`]);
    const template=(await db.query("insert into workout_templates(user_id,name) values($1,'Curls') returning id",[user])).rows[0].id;
    const snapshot=[{exercise:'Barbell Curl',exercise_id:oldId,extra:'keep'},{exercise:'EZ Bar Curl',notes:'private'},{exercise:'Hammer Curl',exercise_id:null}];
    const workout=(await db.query("insert into workouts(user_id,name,performed_on,started_at,ended_at,template_snapshot,updated_at) values($1,'History','2020-01-02','2020-01-02T10:00Z','2020-01-02T11:00Z',$2,'2001-01-01') returning *",[user,JSON.stringify(snapshot)])).rows[0];
    sources.workouts.push(workout);
    for(const [n,[name,id]] of [['Barbell Curl',oldId],['EZ-Bar Curl',target],[' barbell  curl ',null],['Hammer Curl',null]].entries()) {
      sources.workout_sets.push((await db.query("insert into workout_sets(user_id,workout_id,exercise,exercise_id,set_number,weight,reps,rpe,notes,performed_at,updated_at) values($1,$2,$3,$4,$5,30,10,8.5,'private','2020-01-02T10:10Z','2001-01-01') returning *",[user,workout.id,name,id,n+1])).rows[0]);
      sources.workout_template_exercises.push((await db.query("insert into workout_template_exercises(user_id,template_id,exercise,exercise_id,exercise_order,updated_at) values($1,$2,$3,$4,$5,'2001-01-01') returning *",[user,template,name,id,n+1])).rows[0]);
    }
  }
  const shares=(await db.query('select id,source_workout_id from community_workout_shares order by id')).rows;
  const migration=fs.readFileSync('supabase/migrations/20261109033551_curl_catalog_identity.sql','utf8');
  await db.exec(`begin;${migration}commit;`);
  for(const [table,rows] of Object.entries(sources)) for(const before of rows) {
    const after=(await db.query(`select * from ${table} where id=$1`,[before.id])).rows[0];
    if(table==='workouts') {
      const expected=before.template_snapshot.map((e,i)=>i<2?{...e,exercise_id:target}:e);
      assert.deepEqual(after,{...before,template_snapshot:expected});
    } else assert.deepEqual(after,{...before,exercise_id:before.exercise_id===oldId || (before.exercise_id===null && /barbell/i.test(before.exercise)) ? target : before.exercise_id});
  }
  assert.deepEqual((await db.query('select id,source_workout_id from community_workout_shares order by id')).rows,shares);
  for(const share of (await db.query('select * from community_workout_shares')).rows) {
    assert.equal(share.set_count,4); assert.equal(share.exercise_count,2);
    assert.ok(share.sets.slice(0,3).every(s=>s.exercise_id===target));
    assert.ok(share.sets.every(s=>s.notes===null));
  }
  const capture=async()=> (await db.query("select jsonb_build_object('sets',(select jsonb_agg(s order by id) from workout_sets s),'workouts',(select jsonb_agg(w order by id) from workouts w),'items',(select jsonb_agg(i order by id) from workout_template_exercises i),'shares',(select jsonb_agg(c order by id) from community_workout_shares c)) state")).rows[0].state;
  const once=await capture(); await db.exec(`begin;${migration}commit;`); assert.deepEqual(await capture(),once);
  const stale=(await db.query("insert into workout_sets(user_id,workout_id,exercise,exercise_id,set_number,weight,reps) values($1,$2,'Barbell Curl',$3,5,20,8) returning exercise_id",[users[0],sources.workouts[0].id,oldId])).rows[0];
  assert.equal(stale.exercise_id,target,'stale client UUID must not recreate the retired identity');
  assert.equal(exerciseIdentityKey({exercise_id:oldId}),exerciseIdentityKey({exercise_id:target}));
  assert.equal(exerciseIdentityKey({exercise:'Barbell Curl',exercise_id:null}),exerciseIdentityKey({exercise_id:target}));
  const labels=[...new Set(exerciseCatalog.flatMap(e=>[e.name_en,e.name_it,...e.aliases]))];
  for(const row of (await db.query('select value,resolve_exercise_id(value) id from unnest($1::text[]) value',[labels])).rows) assert.equal(row.id,resolveExercise(row.value)?.id||null,row.value);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[0]]); await db.exec('set role authenticated');
  assert.equal((await db.query('select distinct user_id from workout_sets')).rows.length,1);
  assert.equal((await db.query('update workout_sets set reps=99 where user_id=$1 returning id',[users[1]])).rows.length,0);
  await db.exec('reset role; set role anon'); await assert.rejects(db.query('select * from workout_sets'),/permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname='curl_timestamp' and tgenabled='O'")).rows[0].n,3);
  console.log('PASS curl reconciliation: two owners, old/new/text identities, preserved source fields/timestamps, templates/snapshots, stable private Community projections, SQL/JS alias parity, repeat-safe migration, RLS.');
  console.log('Isolated rows changed: sets 4/8, template exercises 4/8, snapshot entries 4/6 across 2 workouts; shares refreshed 2/2. Second run: 0 source/projection changes.');
} finally { await db.close(); }
