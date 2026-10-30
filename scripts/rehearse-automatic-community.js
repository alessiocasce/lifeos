// Offline recovery/rehearsal only. Input is a restricted, read-only production capture.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createCommunityDatabase, applyCommunityMigration } from '../tests/workout/communityDatabase.js';
if (!process.env.LIFEOS_COMMUNITY_REHEARSAL_FILE) throw new Error('Restricted backup file required');
const backup = JSON.parse(fs.readFileSync(process.env.LIFEOS_COMMUNITY_REHEARSAL_FILE, 'utf8'));
const db = await createCommunityDatabase();
try {
  const users = [...new Set(backup.tables.workouts.map(w => w.user_id))];
  const second = users.find(id => !backup.tables.user_profiles.some(p => p.user_id === id));
  assert.ok(second, 'Reviewed unprofiled member must be unique');
  for (const id of users) await db.query('insert into auth.users values($1)', [id]);
  for (const table of ['workout_templates','workouts','workout_sets','workout_template_exercises','user_preferences','user_profiles','workout_rest_preferences']) {
    await db.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},$1::jsonb)`, [JSON.stringify(backup.tables[table])]);
  }
  const privateState = async () => {
    const result = {};
    for (const table of ['workouts','workout_sets','workout_templates','workout_template_exercises','workout_rest_preferences']) result[table] = (await db.query(`select to_jsonb(t) row from public.${table} t order by to_jsonb(t)::text`)).rows;
    return result;
  };
  const before = await privateState();
  const existingProfiles = (await db.query('select to_jsonb(p) row from user_profiles p order by user_id')).rows;
  const existingPrefs = (await db.query('select to_jsonb(p) row from user_preferences p order by user_id')).rows;
  await applyCommunityMigration(db, 'community_automatic_sharing');
  await applyCommunityMigration(db, 'degra_public_identity');
  await db.query('select configure_degra_member($1)', [second]);
  assert.deepEqual(await privateState(), before);
  for (const old of existingProfiles) assert.deepEqual((await db.query('select to_jsonb(p) row from user_profiles p where user_id=$1', [old.row.user_id])).rows[0], old);
  for (const old of existingPrefs) assert.deepEqual((await db.query('select to_jsonb(p) row from user_preferences p where user_id=$1', [old.row.user_id])).rows[0], old);
  const state = async () => (await db.query('select to_jsonb(s) row,xmin::text version from community_workout_shares s order by id')).rows;
  const first = await state();
  const expected = backup.tables.workouts.filter(w => w.ended_at && backup.tables.workout_sets.some(s => s.workout_id === w.id)).length;
  assert.equal(first.length, expected);
  assert.ok(first.every(s => !s.row.notes && !s.row.notes_consent && s.row.sets.every(set => set.notes === null)));
  for (const id of users) await db.query('select lifeos_private.sync_community_member($1)', [id]);
  await db.query('select configure_degra_member($1)', [second]);
  assert.deepEqual(await state(), first, 'Repeated reconciliation must not rewrite shares');
  assert.deepEqual(await privateState(), before);
  console.log(JSON.stringify({ actual_backup_rehearsal:'passed', source_workouts:before.workouts.length,source_sets:before.workout_sets.length,
    shares:first.length, source_fields_and_timestamps:'unchanged', existing_profiles_and_preferences:'unchanged',
    repeated_sync:'same IDs and row versions; no duplicate/no-op writes',notes:'all omitted',degra_shares:first.filter(s=>s.row.author_id===second).length }));
} finally { await db.close(); }
