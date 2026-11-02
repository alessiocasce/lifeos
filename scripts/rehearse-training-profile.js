import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createProfileUpgradeDatabase } from '../tests/workout/profileUpgradeDatabase.js';
import { applyCommunityMigration } from '../tests/workout/communityDatabase.js';
if (!process.env.LIFEOS_PROFILE_REHEARSAL_FILE) throw new Error('Restricted logical backup required');
const backup=JSON.parse(fs.readFileSync(process.env.LIFEOS_PROFILE_REHEARSAL_FILE,'utf8'));
const db=await createProfileUpgradeDatabase();
try {
  const tables=['workout_templates','workouts','workout_sets','workout_template_exercises','user_preferences','user_profiles','workout_rest_preferences'];
  const users=[...new Set(tables.flatMap(table=>backup.tables[table].map(row=>row.user_id)))];
  for(const id of users)await db.query('insert into auth.users values($1)',[id]);
  await db.exec('delete from user_preferences');
  for(const table of tables)await db.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},$1::jsonb)`,[JSON.stringify(backup.tables[table])]);
  const snapshot=async()=>{
    const result={};
    for(const table of tables){
      const strip=table==='user_profiles'?"-'display_name'-'avatar_path'":table==='workout_templates'?"-'color_key'-'icon_key'":'';
      result[table]=(await db.query(`select to_jsonb(t)${strip} r from public.${table} t order by user_id,to_jsonb(t)::text`)).rows;
    }
    return result;
  };
  const before=await snapshot();
  const shares=(await db.query('select to_jsonb(s) r from community_workout_shares s order by id')).rows;
  await applyCommunityMigration(db,'training_profile_upgrade');
  await applyCommunityMigration(db,'username_only_cleanup');
  assert.deepEqual(await snapshot(),before);
  assert.deepEqual((await db.query('select to_jsonb(s) r from community_workout_shares s order by id')).rows,shares);
  assert.equal((await db.query("select color_key,icon_key from workout_templates where name='Chest + Triceps'")).rows[0].color_key,'red');
  console.log(JSON.stringify({backup_rehearsal:'passed',users:users.length,workouts:before.workouts.length,sets:before.workout_sets.length,templates:before.workout_templates.length,shares:shares.length,source_fields_timestamps_usernames_preferences_rest:'unchanged'}));
} finally {await db.close();}
