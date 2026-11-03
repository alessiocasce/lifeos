import assert from 'node:assert/strict';
import { createProfileUpgradeDatabase } from '../tests/workout/profileUpgradeDatabase.js';
import { applyCommunityMigration } from '../tests/workout/communityDatabase.js';
import { createAvatarCache } from '../src/utils/avatarCache.js';
import { emptySetDraft, readExerciseDraft, writeWorkoutDraft } from '../src/utils/workoutContinuity.js';
import { checkProactiveDelivery } from '../api/_utils/brainProactiveDelivery.js';

const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const db=await createProfileUpgradeDatabase();
try {
  await applyCommunityMigration(db,'training_profile_upgrade');
  await applyCommunityMigration(db,'username_only_cleanup');
  await db.exec(`alter table auth.users add email_confirmed_at timestamptz,add raw_user_meta_data jsonb;
    insert into auth.users values('${A}',now(),'{}'),('${B}',now(),'{}');`);
  await db.query(`insert into brain_outbox_messages(user_id,recipient,body,rule_key,source_type,source_id,idempotency_key,scheduled_for)
    values($1,'fixture@lid','Legacy rest','workout.rest_timer','workout_rest_timer','legacy-set','legacy-rest',now()),
      ($1,'fixture@lid','Keep reminder','timed_memo_due','memo','memo-source','keep-memo',now())`,[A]);
  await applyCommunityMigration(db,'training_active_identity_media');
  assert.deepEqual((await db.query("select idempotency_key,status from brain_outbox_messages order by idempotency_key")).rows,[{idempotency_key:'keep-memo',status:'queued'},{idempotency_key:'legacy-rest',status:'cancelled'}]);
  await assert.rejects(db.query(`insert into brain_outbox_messages(user_id,recipient,body,rule_key,source_type,source_id,idempotency_key,scheduled_for)
    values($1,'fixture@lid','Forbidden','workout.rest_timer','workout_rest_timer','new-set','new-rest',now())`,[A]),/removed/);
  const as=async(id,sql)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');return db.query(sql);};
  await as(A,"select complete_user_profile('alpha')");
  await assert.rejects(as(B,"select complete_user_profile('ALPHA')"),/already taken/);
  await assert.rejects(as(B,"select complete_user_profile('a@b')"),/username/);
  await db.exec('reset role');
  await db.query("update auth.users set raw_user_meta_data='{"+'"requested_username":"bravo"'+"}'::jsonb where id=$1",[B]);
  await as(B,'select complete_user_profile()');
  assert.equal((await as(B,`select username from user_profiles where user_id='${B}'`)).rows[0].username,'bravo');
  assert.equal((await as(A,`update user_profiles set username='stolen' where user_id='${B}' returning *`)).rows.length,0);
  const template=(await as(A,"insert into workout_templates(name,color_key,icon_key) values('Push','red','chest') returning id")).rows[0].id;
  const workout=(await as(A,`insert into workouts(name,template_id) values('Push','${template}') returning *`)).rows[0];
  assert.deepEqual(workout.template_appearance,{color_key:'red',icon_key:'chest'});
  await as(A,`update workout_templates set color_key='blue' where id='${template}'`);
  assert.deepEqual((await as(A,`update workouts set name='Renamed',template_appearance='{"color_key":"pink","icon_key":"boxing"}' where id='${workout.id}' returning template_appearance`)).rows[0].template_appearance,workout.template_appearance);
  assert.equal((await as(B,`update workouts set name='stolen' where id='${workout.id}' returning id`)).rows.length,0);
  await as(A,`insert into workout_sets(workout_id,exercise,set_number,weight,reps) values('${workout.id}','Bench',1,50,8)`);
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from brain_outbox_messages where source_type='workout_rest_timer' and status in ('queued','claimed')")).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from pg_proc where proname in ('schedule_workout_rest_timer','control_workout_rest_timer')")).rows[0].n,0);
  await db.exec('set role anon');
  assert.equal((await db.query("select username_available('ALPHA') ok")).rows[0].ok,false);
  await assert.rejects(db.query("select complete_user_profile('intruder')"),/permission/);
  await db.exec('reset role');
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[A]);
  await assert.rejects(as(A,"select complete_user_profile('unverified')"),/Confirm your email/);
  await db.exec('reset role');
  const photo=`${A}/00000000-0000-4000-8000-000000000001.jpg`;
  await as(A,`insert into storage.objects(bucket_id,name) values('profile-avatars','${photo}')`);
  await as(A,`select set_profile_avatar('${photo}')`);
  await assert.rejects(as(B,`select set_profile_avatar('${photo}')`),/Invalid profile/);
  console.log('PASS real PostgreSQL: confirmed username finalization/uniqueness/A-B-anon isolation, JPEG ownership, frozen appearance, saved sets without timers');
} finally {await db.close();}

let now=0,calls=0;
const cache=createAvatarCache({now:()=>now});const profile={avatar_path:'owner/photo.webp'};
const loader=async()=>{calls++;return 'signed';};
await Promise.all([cache.load(A,profile,loader),cache.load(A,profile,loader)]);
await cache.load(A,profile,loader);assert.equal(calls,1);assert.equal(cache.peek(A,profile),'signed');assert.equal(cache.peek(B,profile),null);
now=280000;await cache.load(A,profile,loader);assert.equal(calls,2);
cache.invalidate(A,profile);assert.equal(cache.peek(A,profile),null);cache.clear();
const data=new Map();const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
storage.setItem(`lifeos:training:v1:${A}:draft:session`,JSON.stringify({version:1,updated_at:Date.now(),session_id:'session',draft:{...emptySetDraft(),exercise:'Legacy exercise',weight:'22.5',reps:'12',rpe:'8.5',notes:'Keep legacy'}}));
writeWorkoutDraft(A,'session',{...emptySetDraft(),exercise:'Bench',weight:'50',reps:'8',rpe:'7.5',notes:'A'},{storage});
assert.equal(readExerciseDraft(A,'session',{exercise:'Legacy exercise'},{storage}).weight,'22.5');
assert.equal(readExerciseDraft(A,'session',{exercise:'Legacy exercise'},{storage}).notes,'Keep legacy');
writeWorkoutDraft(A,'session',{...emptySetDraft(),exercise:'Curl',weight:'12',reps:'10'},{storage});
assert.equal(readExerciseDraft(A,'session',{exercise:'Bench'},{storage}).weight,'50');
assert.equal(readExerciseDraft(B,'session',{exercise:'Bench'},{storage}),null);
assert.equal(readExerciseDraft(A,'other',{exercise:'Bench'},{storage}),null);
assert.equal((await checkProactiveDelivery({row:{source_type:'workout_rest_timer'},client:{},userId:A})).eligible,false);
console.log('PASS cache deduplication/expiry/viewer isolation/invalidation, exercise draft isolation, retired delivery guard');
