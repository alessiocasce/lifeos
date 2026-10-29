import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { requireConfiguredUserAccess } from '../api/_utils/supabaseAdmin.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
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
  // Owner-only authorization must still fail closed before any admin query.
  const oldOwner=process.env.LIFEOS_ACTION_USER_ID;
  delete process.env.LIFEOS_ACTION_USER_ID;
  await assert.rejects(requireConfiguredUserAccess('user-b-token'), /not configured/);
  if(oldOwner)process.env.LIFEOS_ACTION_USER_ID=oldOwner;
  console.log('PASS real PostgreSQL two-user profile/preference RLS, case-insensitive username uniqueness, rename identity, public whitelist and private defaults');
} finally { await db.close(); }
