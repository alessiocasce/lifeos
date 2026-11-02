import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createProfileUpgradeDatabase } from '../tests/workout/profileUpgradeDatabase.js';
import { applyCommunityMigration } from '../tests/workout/communityDatabase.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const db=await createProfileUpgradeDatabase();
try {
  await db.exec(`insert into auth.users values('${A}'),('${B}');insert into user_profiles(user_id,username,display_name) values('${A}','alpha','Authored old name'),('${B}','bravo','Bravo');
    insert into workout_templates(user_id,name,notes) values('${A}','Old template','Keep exact notes');`);
  const before=(await db.query('select to_jsonb(t) r from workout_templates t')).rows[0].r;
  await applyCommunityMigration(db,'training_profile_upgrade');
  // Expand phase still supports old cached clients, and the new signature.
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await db.exec('set role authenticated');
  await db.exec("select save_user_settings('alpha','it',true,false)");
  await db.exec("select save_user_settings('alpha','Old client','it',true,false)");
  await db.exec('reset role');
  await applyCommunityMigration(db,'username_only_cleanup');
  assert.deepEqual((await db.query("select to_jsonb(t)-'color_key'-'icon_key' r from workout_templates t")).rows[0].r,before);
  assert.equal((await db.query("select username from user_profiles where user_id=$1",[B])).rows[0].username,'bravo');
  const photo=`${A}/33333333-3333-4333-8333-333333333333.webp`;
  const as=async(id,sql,params=[])=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');return db.query(sql,params);};
  await as(A,"insert into storage.objects(bucket_id,name) values('profile-avatars',$1)",[photo]);
  await as(A,'select set_profile_avatar($1)',[photo]);
  assert.equal((await as(B,"select name from storage.objects where name=$1",[photo])).rows.length,1);
  assert.equal((await as(B,"delete from storage.objects where name=$1 returning name",[photo])).rows.length,0);
  assert.equal((await as(B,"update storage.objects set name=name where name=$1 returning name",[photo])).rows.length,0);
  await assert.rejects(as(B,"insert into storage.objects(bucket_id,name) values('profile-avatars',$1)",[`${A}/44444444-4444-4444-8444-444444444444.webp`]),/row-level security/);
  await assert.rejects(as(B,'select set_profile_avatar($1)',[photo]),/Invalid profile/);
  await as(A,'select set_profile_avatar(null)');
  assert.equal((await as(B,"select name from storage.objects where name=$1",[photo])).rows.length,0);
  await as(A,"delete from storage.objects where name=$1",[photo]);
  await db.exec('reset role');
  console.log((await db.exec(fs.readFileSync('supabase/operations/verify_training_profile.sql','utf8'))).at(-1).rows[0].result);
  console.log((await db.exec(fs.readFileSync('supabase/operations/verify_community.sql','utf8'))).at(-1).rows[0].result);
  console.log('PASS expand/contract, source preservation, private Storage owner CRUD/member referenced reads and immediate revocation for new requests');
} finally {await db.close();}
