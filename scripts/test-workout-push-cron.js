import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createProfileUpgradeDatabase} from '../tests/workout/profileUpgradeDatabase.js';
import {applyCommunityMigration} from '../tests/workout/communityDatabase.js';
const db=await createProfileUpgradeDatabase();
try {
  await db.exec('alter table auth.users add email_confirmed_at timestamptz,add raw_user_meta_data jsonb;');
  for(const suffix of ['training_profile_upgrade','username_only_cleanup','training_active_identity_media','workout_web_push']) await applyCommunityMigration(db,suffix);
  // External extension adapters only. The scheduling/check/authorization SQL below is real.
  await db.exec(`create schema cron;create schema net;create schema vault;
    create table cron.job(jobid bigint generated always as identity,jobname text unique,command text,schedule text,active boolean default true);
    create table cron.job_run_details(jobid bigint,end_time timestamptz);
    create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update set schedule=$2,command=$3 returning jobid$$;
    create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create table net._http_response(id bigint,status_code integer,timed_out boolean,error_msg text);
    create table net.http_request_queue(id bigint);
    create table net.calls(id bigint generated always as identity,url text,headers jsonb,body jsonb);
    create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 1000) returns bigint language sql as $$insert into net.calls(url,body,headers) values($1,$2,$4) returning id$$;`);
  const file=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_workout_push_cron.sql'));
  const sql=fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^create extension .*;\r?\n/gm,'');
  assert.ok(sql.trim().length>100,'scheduler implementation is required');
  await db.exec(sql);
  assert.equal((await db.query("select active from cron.job where jobname='lifeos-workout-push'")).rows[0].active,false);
  await db.exec('select lifeos_private.dispatch_due_workout_push()');
  assert.equal((await db.query('select count(*)::int n from net.calls')).rows[0].n,0);
  await db.exec('update lifeos_private.workout_push_scheduler set enabled=true');
  await db.exec('select lifeos_private.dispatch_due_workout_push()');
  assert.equal((await db.query('select count(*)::int n from net.calls')).rows[0].n,0,'idle poll must not invoke Vercel');
  const A='11111111-1111-4111-8111-111111111111';await db.query('insert into auth.users(id) values($1)',[A]);
  const w=(await db.query("insert into workouts(user_id,name) values($1,'QA') returning id",[A])).rows[0].id;
  await db.query('insert into workout_web_rest_preferences(user_id,enabled,notifications,seconds) values($1,true,true,15)',[A]);
  await db.query("insert into workout_push_subscriptions(user_id,endpoint,subscription) values($1,'https://fcm.googleapis.com/qa','{}')",[A]);
  await db.query("insert into workout_sets(user_id,workout_id,exercise,set_number,weight,reps) values($1,$2,'Custom',1,10,8)",[A,w]);
  await db.exec("update workout_rest_timers set scheduled_for=now()-interval '1 second';select lifeos_private.dispatch_due_workout_push()");
  assert.equal((await db.query('select enabled from lifeos_private.workout_push_scheduler')).rows[0].enabled,false,'missing credential fails closed');
  await db.exec("insert into vault.decrypted_secrets values('lifeos_workout_push_dispatch',repeat('q',40));update lifeos_private.workout_push_scheduler set enabled=true;select lifeos_private.dispatch_due_workout_push()");
  assert.equal((await db.query('select count(*)::int n from net.calls')).rows[0].n,1);
  await db.exec('select lifeos_private.dispatch_due_workout_push()');
  assert.equal((await db.query('select count(*)::int n from net.calls')).rows[0].n,1,'inflight dispatch suppresses duplicate HTTP');
  for(let n=1;n<=3;n++) {
    await db.exec(`insert into net._http_response values(${n},503,false,null);select lifeos_private.dispatch_due_workout_push()`);
  }
  const health=(await db.query('select enabled,consecutive_failures,last_error from lifeos_private.workout_push_scheduler')).rows[0];
  assert.equal(health.enabled,false);assert.equal(health.consecutive_failures,3);
  assert.equal((await db.query("select command from cron.job where jobname='lifeos-workout-push'")).rows[0].command.includes('qqqq'),false);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from lifeos_private.workout_push_scheduler'),/permission denied/);
  await assert.rejects(db.query('select lifeos_private.dispatch_due_workout_push()'),/permission denied/);
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select lifeos_private.dispatch_due_workout_push()'),/permission denied/);
  console.log('PASS scheduler SQL: disabled install, idle no-HTTP, missing Vault credential, due-only dispatch, inflight exclusion, 3-failure kill switch, secret-free cron command and A/anon denial. Extension transport mocked; hosted cron not claimed.');
}finally{await db.close();}
