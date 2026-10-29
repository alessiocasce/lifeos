import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { requireConfiguredUserAccess } from '../api/_utils/supabaseAdmin.js';
import { exerciseCatalog,resolveExercise,exerciseIdentityKey,exerciseLabel,searchExercises } from '../src/utils/exerciseCatalog.js';
import { setLanguage,t,formatDate } from '../src/i18n/index.js';
import { prefillWorkoutTargets } from '../src/utils/workoutPrefill.js';
import { captureSettingsIdentity } from '../src/utils/userSettingsIdentity.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let activeSettingsUser = A;
const settingsClient = { auth: {
  getSession: async () => ({ data: { session: { access_token: activeSettingsUser } } }),
  getUser: async (token) => ({ data: { user: { id: token } } }),
} };
const captured = await captureSettingsIdentity(settingsClient, A);
activeSettingsUser = B;
const boundRequest = { setHeader(name, value) { this[name] = value; return this; } };
assert.equal(captured.authorize(boundRequest).Authorization, `Bearer ${A}`);
await assert.rejects(captureSettingsIdentity(settingsClient, A), /Reload settings/);
assert.equal((await captureSettingsIdentity(settingsClient, B)).userId, B);
const db = new PGlite();
try {
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key); insert into auth.users values('${A}'),('${B}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    create function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;`);
  await db.exec(fs.readFileSync('supabase/migrations/20261029200856_social_training_identity.sql','utf8'));
  const as = async (id, sql) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); return db.query(sql); };
  await as(A,"select save_user_settings('alpha','Alpha','it',false,false)");
  await as(B,"select save_user_settings('bravo','Bravo','en',false,false)");
  assert.equal((await as(A,'select count(*)::integer n from user_profiles')).rows[0].n,2);
  assert.equal((await as(A,'select count(*)::integer n from user_preferences')).rows[0].n,1);
  assert.equal((await as(A,`update user_profiles set display_name='hacked' where user_id='${B}' returning *`)).rows.length,0);
  assert.equal((await as(A,`update user_preferences set language='it' where user_id='${B}' returning *`)).rows.length,0);
  await assert.rejects(as(A,`insert into user_profiles(user_id,username,display_name) values('${B}','hacker','No')`));
  await assert.rejects(as(A,"select save_user_settings('BRAVO','Duplicate','it',false,false)"), /unique/);
  await assert.rejects(as(A,"select save_user_settings('bad@email','No','it',false,false)"), /check/);
  assert.deepEqual((await as(B,'select language,workout_sharing,share_workout_notes from user_preferences')).rows[0],{language:'en',workout_sharing:false,share_workout_notes:false});
  assert.deepEqual((await as(A,"select column_name from information_schema.columns where table_name='user_profiles' order by ordinal_position")).rows.map(r=>r.column_name),['user_id','username','display_name','avatar_url','created_at','updated_at']);
  await as(A,"select save_user_settings('alpha_new','Alpha','it',false,false)");
  assert.equal((await as(A,"select user_id from user_profiles where username='alpha_new'")).rows[0].user_id,A);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select * from user_profiles'),/permission denied/);
  await db.exec('reset role');
  const schema=fs.readFileSync('supabase/schema.sql','utf8');
  const privateTables = ['workouts','workout_templates','workout_template_exercises','workout_sets','ai_memories','projects','health_logs','expenses','memos','calendar_events'];
  for(const table of [...privateTables,'brain_outbox_messages']) {
    const start=schema.indexOf(`create table if not exists public.${table} (`);
    await db.exec(schema.slice(start,schema.indexOf('\n);',start)+3));
  }
  await db.exec(fs.readFileSync('supabase/migrations/20261004134735_workout_rest_timer.sql','utf8'));
  for(const table of privateTables) {
    await db.exec(`alter table public.${table} enable row level security; grant select,insert,update,delete on public.${table} to authenticated;`);
    const start=schema.indexOf(`create policy "${table} are user scoped"`);
    await db.exec(schema.slice(start,schema.indexOf(';',start)+1));
  }
  const w=(await as(A,"insert into workouts(name) values('Private') returning id")).rows[0].id;
  const snapshot = [{exercise:'Panca Piana Manubri',target_sets:3,note:'Keep authored snapshot'}, {exercise:'Incline Bench Press',target_sets:4}];
  await as(A,`update workouts set template_snapshot='${JSON.stringify(snapshot)}'::jsonb where id='${w}'`);
  const template = (await as(A,"insert into workout_templates(name) values('Private template') returning id")).rows[0].id;
  await as(A,`insert into workout_template_exercises(template_id,exercise,exercise_order) values('${template}','Panca Piana Manubri',1),('${template}','Incline Bench Press',2)`);
  await as(A,`insert into workout_sets(workout_id,exercise,set_number,weight,reps) values('${w}','Dumbell Bench Press',1,30,8),('${w}','Bench Press',2,80,8),('${w}','My custom move',3,12,10)`);
  assert.equal((await as(B,'select * from workout_sets')).rows.length,0);
  assert.equal((await as(B,`update workout_sets set weight=999 where workout_id='${w}' returning id`)).rows.length,0);
  assert.equal((await as(B,'select * from workouts')).rows.length,0);
  await db.exec('reset role');
  await db.exec(fs.readFileSync('supabase/migrations/20261029201131_social_training_catalog.sql','utf8'));
  const mapped=await as(A,'select exercise,exercise_id from workout_sets order by set_number');
  assert.equal(mapped.rows[0].exercise_id,resolveExercise('Panca piana con manubri').id);
  assert.equal(mapped.rows[1].exercise_id,null);
  assert.equal(mapped.rows[2].exercise_id,null);
  const snapshotAfter = (await as(A,`select template_snapshot from workouts where id='${w}'`)).rows[0].template_snapshot;
  assert.deepEqual(snapshotAfter, [{...snapshot[0],exercise_id:resolveExercise('Dumbbell Bench Press').id},snapshot[1]]);
  assert.deepEqual((await as(A,`select exercise,exercise_id from workout_template_exercises where template_id='${template}' order by exercise_order`)).rows,
    [{exercise:'Panca Piana Manubri',exercise_id:resolveExercise('Dumbbell Bench Press').id},{exercise:'Incline Bench Press',exercise_id:null}]);
  const report=await as(A,'select * from exercise_legacy_mapping_report()');
  assert.equal(report.rows.find(r=>r.exercise==='Bench Press').ambiguous,true);
  await assert.rejects(as(A,"insert into exercise_catalog(id,slug,name_en,name_it,category,primary_muscle_group,equipment,load_type,uses_external_load) values(gen_random_uuid(),'bad','Bad','No','x','x','x','bodyweight',false)"),/permission/);
  assert.equal((await as(B,'select * from exercise_legacy_mapping_report()')).rows.length,0);
  await db.exec('reset role');
  await db.exec(fs.readFileSync('supabase/operations/map_legacy_exercises.sql','utf8'));
  assert.deepEqual((await as(A,'select exercise,exercise_id from workout_sets order by set_number')).rows,mapped.rows);
  await assert.rejects(as(A,"select control_workout_rest_timer(auth.uid(),'configure','isolated@lid',null,true,120)"),/permission denied/);
  await db.exec('reset role');
  await db.query("select control_workout_rest_timer($1,'configure','isolated@lid',null,true,120)",[A]);
  await as(A,`insert into workout_sets(workout_id,exercise,exercise_id,set_number,weight,reps) values('${w}','Panca piana con manubri','${resolveExercise('Dumbbell Bench Press').id}',2,30,7)`);
  await db.exec('reset role');
  assert.equal((await db.query("select metadata #>> '{workout_rest,next_set_number}' next from brain_outbox_messages where source_type='workout_rest_timer' and status='queued'")).rows[0].next,'3');
  console.log('PASS durable timer next-set numbering spans canonical/legacy translations');
  await db.exec('reset role');
  await db.exec(fs.readFileSync('supabase/operations/verify_social_training.sql','utf8'));
  console.log('PASS shared rollback-only deployment verification SQL');
  const english=resolveExercise('Dumbbell Bench Press'),italian=resolveExercise('Panca Piana con Manubri');
  assert.equal(english.id,italian.id);
  assert.notEqual(english.id,resolveExercise('Barbell Bench Press').id);
  assert.equal(resolveExercise('Bench Press'),null);
  assert.equal(exerciseIdentityKey({exercise:'Translated',exercise_id:english.id}),exerciseIdentityKey('DB Bench Press'));
  assert.notEqual(exerciseIdentityKey({exercise:'Same',exercise_id:english.id}),exerciseIdentityKey({exercise:'Same',exercise_id:resolveExercise('Barbell Bench Press').id}));
  assert.equal(searchExercises('panca manubri').some(e=>e.id===english.id),true);
  for (const alias of ['Panca Piana Manubri','  db BENCH press  ','Dumbell Bench Press']) assert.equal(resolveExercise(alias).id,english.id);
  for (const alias of ['DB Incline Press','Incline Dumbell Press','Panca Inclinata Manubri']) assert.equal(resolveExercise(alias).slug,'dumbbell_incline_bench_press');
  assert.equal(resolveExercise('Dumbell Romanian Deadlift').slug,'dumbbell_romanian_deadlift');
  for (const ambiguous of ['Incline Bench Press','Panca Piana','Leg Press','Lat Machine','Triceps Pulldown','Single Tricep Overhead']) assert.equal(resolveExercise(ambiguous),null);
  assert.equal(searchExercises('PÁNCA PIANA MANUBRI').some(e=>e.id===english.id),true);
  assert.equal(searchExercises('Lat Pulldown').some(e=>e.slug==='lat_pulldown'),true);
  assert.equal(exerciseCatalog.length,217);
  assert.equal(english.load_type,'per_implement');
  assert.equal(resolveExercise('Pull-Up').leaderboard_eligible,false);
  setLanguage('it');
  assert.equal(t('Settings'),'Impostazioni');
  assert.equal(exerciseLabel({exercise:'User-authored custom name',exercise_id:null}),'User-authored custom name');
  assert.equal(exerciseLabel({exercise:'Dumbbell Bench Press',exercise_id:english.id}),'Panca piana con manubri');
  assert.match(formatDate('2026-10-29'),/29 ott 2026/);
  setLanguage('en');
  assert.equal(prefillWorkoutTargets({weight:'',reps:'',set_number:1,is_warmup:false},[{set_number:1001,is_warmup:true,weight:10,reps:12},{set_number:1,weight:30,reps:8}]).weight,'30');
  console.log('PASS canonical bilingual IDs, equipment distinctions, exact/ambiguous/custom legacy mapping, idempotent backfill, catalog grants and private workouts');
  // Owner-only authorization must still fail closed before any admin query.
  const oldEnv=Object.fromEntries(['LIFEOS_ACTION_USER_ID','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;
  try {
    process.env.LIFEOS_ACTION_USER_ID=A;process.env.SUPABASE_URL='https://auth-fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-key';
    globalThis.fetch=async(url,options)=>{
      assert.equal(new URL(url).hostname,'auth-fixture.invalid');
      const token=new Headers(options.headers).get('authorization');
      return new Response(JSON.stringify({id:token.endsWith('user-a-token')?A:B,aud:'authenticated',role:'authenticated'}),{status:200,headers:{'content-type':'application/json'}});
    };
    await assert.rejects(requireConfiguredUserAccess('user-b-token'),error=>error.status===403 || error.statusCode===403);
    assert.equal((await requireConfiguredUserAccess('user-a-token')).id,A);
  } finally {globalThis.fetch=originalFetch;for(const [key,value] of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  console.log('PASS real PostgreSQL two-user profile/preference RLS, case-insensitive username uniqueness, rename identity, public whitelist and private defaults');
} finally { await db.close(); }
