import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createProfileUpgradeDatabase } from '../tests/workout/profileUpgradeDatabase.js';
import { applyCommunityMigration } from '../tests/workout/communityDatabase.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const db = await createProfileUpgradeDatabase();
try {
  for (const suffix of ['training_profile_upgrade', 'username_only_cleanup', 'training_active_identity_media']) {
    await applyCommunityMigration(db, suffix);
  }
  // The shared harness loads table/RLS definitions, but not base timestamp triggers.
  const schema = fs.readFileSync('supabase/schema.sql', 'utf8');
  const atomicSql = fs.readFileSync(fs.readdirSync('supabase/migrations').map(name => 'supabase/migrations/' + name).find(name => name.endsWith('_workout_history_atomic_delete.sql')), 'utf8');
  assert.ok(schema.includes(atomicSql.trim()), 'fresh schema contains the exact atomic deletion migration');
  await db.exec(atomicSql);
  for (const table of ['workouts', 'workout_sets']) {
    const start = schema.indexOf(`drop trigger if exists set_${table}_updated_at`);
    const end = schema.indexOf(';', schema.indexOf('for each row', start));
    assert.ok(start >= 0 && end > start);
    await db.exec(schema.slice(start, end + 1));
  }
  await db.query('insert into auth.users(id) values($1),($2)', [A, B]);
  const as = async (actor, sql, params = []) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor || '']);
    await db.exec(`set role ${actor ? 'authenticated' : 'anon'}`);
    return db.query(sql, params);
  };
  await as(A, "select save_user_settings('alpha','en',true,false)");
  await as(B, "select save_user_settings('bravo','en',true,false)");
  const workout = (await as(A, `insert into workouts(name,performed_on,started_at,ended_at,notes)
    values('History','2026-10-01','2026-10-01T10:00:00Z','2026-10-01T11:00:00Z','PRIVATE WORKOUT') returning *`)).rows[0];
  const insertSet = (exercise, number) => as(A, `insert into workout_sets(workout_id,exercise,set_number,weight,reps,notes)
    values($1,$2,$3,20,8,'PRIVATE SET') returning *`, [workout.id, exercise, number]);
  const first = (await insertSet('Custom press', 1)).rows[0];
  await insertSet('Custom row', 1);
  await insertSet('Custom row', 2);
  const readShare = async () => (await as(B, `select id,title,performed_on::text,notes,notes_consent,sets,set_count,exercise_count,published_at
    from community_workout_shares where author_id=$1`, [A])).rows[0];
  const originalShare = await readShare();
  const atomicA = (await insertSet('Atomic exercise', 1)).rows[0];
  const atomicB = (await insertSet('Atomic exercise', 2)).rows[0];
  const snapshot = [atomicA, atomicB].map(set => ({ id: set.id, updated_at: set.updated_at }));
  const removeAtomic = (actor, expected = snapshot) => as(actor,
    'select delete_historical_workout_exercise($1,$2,$3::jsonb) removed', [workout.id, workout.ended_at, JSON.stringify(expected)]);
  await assert.rejects(removeAtomic(B), /unavailable|changed/);
  await assert.rejects(removeAtomic(null), /permission denied/);
  await assert.rejects(removeAtomic(A, [snapshot[0]]), /changed/);
  await assert.rejects(removeAtomic(A, [snapshot[0], snapshot[0]]), /changed/);
  await assert.rejects(removeAtomic(A, [snapshot[0], { ...snapshot[1], updated_at: '2000-01-01T00:00:00Z' }]), /changed/);
  await db.exec('reset role');
  await db.exec(`create function public.qa_delete_fault() returns trigger language plpgsql as $$begin
    if old.id='${atomicB.id}'::uuid then raise exception 'QA deletion fault'; end if; return old; end$$;
    create trigger qa_delete_fault before delete on public.workout_sets for each row execute function public.qa_delete_fault();`);
  await assert.rejects(removeAtomic(A), /QA deletion fault/);
  assert.equal((await as(A, 'select id from workout_sets where workout_id=$1', [workout.id])).rows.length, 5, 'mid-delete failure rolls back every set');
  assert.equal((await readShare()).set_count, 5, 'projection also rolls back');
  await db.exec('reset role; drop trigger qa_delete_fault on public.workout_sets; drop function public.qa_delete_fault();');
  const removed = (await removeAtomic(A)).rows[0].removed;
  assert.deepEqual(removed.sort(), [atomicA.id, atomicB.id].sort());
  assert.equal((await readShare()).set_count, 3);
  const permissions = (await db.query(`select prosecdef,proconfig,
    has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') member
    from pg_proc where proname='delete_historical_workout_exercise'`)).rows[0];
  assert.equal(permissions.prosecdef, false);
  assert.equal(permissions.anon, false);
  assert.equal(permissions.member, true);
  console.log('PASS atomic exercise RPC: A/B/anonymous authorization, exact membership/version checks, mid-delete fault rollback including Community, invoker/fixed search path/grants');
  const verify = async (count, exercises) => {
    const share = await readShare();
    assert.equal(share.id, originalShare.id, 'eligible edits keep share identity');
    assert.deepEqual(share.published_at, originalShare.published_at);
    assert.equal(share.set_count, count);
    assert.equal(share.exercise_count, exercises);
    assert.equal(share.notes, null);
    assert.equal(share.notes_consent, false);
    assert.ok(share.sets.every(set => set.notes === null));
    const source = (await as(A, 'select * from workouts where id=$1', [workout.id])).rows[0];
    assert.deepEqual(source.ended_at, workout.ended_at, 'history edit must not reopen');
    assert.deepEqual(source.started_at, workout.started_at);
    assert.equal(source.notes, 'PRIVATE WORKOUT');
    return share;
  };
  await as(A, "update workouts set name='Corrected history' where id=$1", [workout.id]);
  assert.equal((await verify(3, 2)).title, 'Corrected history');
  await as(A, "update workouts set performed_on='2026-09-30' where id=$1", [workout.id]);
  assert.equal(String((await verify(3, 2)).performed_on).slice(0, 10), '2026-09-30');
  await as(A, 'update workout_sets set weight=32.5,reps=10,rpe=8.5 where id=$1', [first.id]);
  const updatedSet = (await verify(3, 2)).sets.find(set => set.exercise === 'Custom press');
  assert.equal(updatedSet.weight, 32.5);
  assert.equal(updatedSet.reps, 10);
  assert.equal(updatedSet.rpe, 8.5);
  const added = (await insertSet('Custom press', 2)).rows[0];
  await verify(4, 2);
  await as(A, 'delete from workout_sets where id=$1', [added.id]);
  await verify(3, 2);
  assert.equal((await as(A, 'delete from workout_sets where workout_id=$1 and exercise=$2 returning id', [workout.id, 'Custom row'])).rows.length, 2);
  await verify(1, 1);
  console.log('PASS completed name/date/set edit/add/delete/exercise removal: ended_at retained, automatic projection refreshed with stable share ID/audit time and private notes');

  await as(A, "select set_user_preferences('en',true,true)");
  const consented = await readShare();
  assert.equal(consented.id, originalShare.id);
  assert.equal(consented.notes, 'PRIVATE WORKOUT');
  assert.equal(consented.sets[0].notes, 'PRIVATE SET');
  await as(A, "select set_user_preferences('en',true,false)");
  await verify(1, 1);
  assert.equal((await as(A, 'select notes from workout_sets where id=$1', [first.id])).rows[0].notes, 'PRIVATE SET');

  for (const table of ['workouts', 'workout_sets']) {
    const id = table === 'workouts' ? workout.id : first.id;
    assert.equal((await as(B, `select id from ${table} where id=$1`, [id])).rows.length, 0);
    assert.equal((await as(B, `update ${table} set notes='intrusion' where id=$1 returning id`, [id])).rows.length, 0);
    assert.equal((await as(B, `delete from ${table} where id=$1 returning id`, [id])).rows.length, 0);
    for (const sql of [`select id from ${table}`, `update ${table} set notes='anon' where id=$1`, `delete from ${table} where id=$1`]) {
      await assert.rejects(as(null, sql, sql.includes('$1') ? [id] : []), /permission denied/);
    }
  }
  await assert.rejects(as(B, "insert into workout_sets(workout_id,exercise,set_number,weight,reps) values($1,'Intrusion',1,20,8)", [workout.id]), /row-level security/);
  await assert.rejects(as(B, "insert into workout_sets(user_id,workout_id,exercise,set_number,weight,reps) values($1,$2,'Intrusion',1,20,8)", [A, workout.id]), /row-level security/);
  await assert.rejects(as(A, 'update workouts set user_id=$1 where id=$2', [B, workout.id]), /row-level security/);
  await assert.rejects(as(A, 'update workout_sets set user_id=$1 where id=$2', [B, first.id]), /row-level security/);
  await assert.rejects(as(null, "insert into workouts(name) values('Anon')"), /permission denied/);
  await assert.rejects(as(null, "insert into workout_sets(workout_id,exercise,set_number,weight,reps) values($1,'Anon',1,20,8)", [workout.id]), /permission denied/);
  await assert.rejects(as(B, 'select source_workout_id from community_workout_shares'), /permission denied/);
  await assert.rejects(as(B, 'delete from community_workout_shares where id=$1', [originalShare.id]), /permission denied/);
  await assert.rejects(as(B, 'select lifeos_private.sync_community_workout($1)', [workout.id]), /permission denied/);
  await assert.rejects(as(null, 'select id from community_workout_shares'), /permission denied/);
  await verify(1, 1);
  console.log('PASS notes opt-in/revoke preserves private source; B cannot read/change/delete private sources or inject foreign sets; anonymous denied; projection internals protected');

  const version = (await as(A, 'select updated_at::text version from workout_sets where id=$1', [first.id])).rows[0].version;
  const parentVersion = (await as(A, 'select updated_at::text version from workouts where id=$1', [workout.id])).rows[0].version;
  assert.equal((await as(A, 'update workout_sets set reps=11 where id=$1 and updated_at=$2 returning id', [first.id, version])).rows.length, 1);
  assert.equal((await as(A, 'update workout_sets set reps=12 where id=$1 and updated_at=$2 returning id', [first.id, version])).rows.length, 0);
  assert.equal((await as(A, 'delete from workout_sets where id=$1 and updated_at=$2 returning id', [first.id, version])).rows.length, 0);
  assert.equal((await as(A, 'select updated_at::text version from workouts where id=$1', [workout.id])).rows[0].version, parentVersion, 'set edits do not advance parent revision');
  assert.equal((await as(A, 'update workouts set name=$1 where id=$2 and ended_at is null returning id', ['Stale open state', workout.id])).rows.length, 0);
  assert.equal((await as(A, 'update workouts set name=name where id=$1 and updated_at=$2 and ended_at=$3 returning id', [workout.id, parentVersion, workout.ended_at])).rows.length, 1);
  assert.equal((await as(A, 'update workouts set name=$1 where id=$2 and updated_at=$3 returning id', ['Stale name', workout.id, parentVersion])).rows.length, 0);
  assert.equal((await as(A, 'delete from workouts where id=$1 and updated_at=$2 returning id', [workout.id, parentVersion])).rows.length, 0);
  console.log('PASS SQL optimistic predicates reject stale set writes/deletes and wrong completion state; parent updated_at does NOT version child sets');
  await as(A, 'delete from workout_sets where id=$1', [first.id]);
  assert.equal(await readShare(), undefined, 'last-set removal withdraws ineligible share');
  assert.deepEqual((await as(A, 'select ended_at from workouts where id=$1', [workout.id])).rows[0].ended_at, workout.ended_at);
  await insertSet('Custom press', 1);
  await as(A, 'delete from workouts where id=$1', [workout.id]);
  assert.equal(await readShare(), undefined);
  assert.equal((await as(A, 'select id from workout_sets where workout_id=$1', [workout.id])).rows.length, 0);
  console.log('PASS final-set removal withdraws share without reopening; session delete cascades sets and projection');
} finally {
  await db.close();
}
