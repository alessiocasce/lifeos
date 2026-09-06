import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReliabilityDatabase, fixtureUser } from '../tests/brain/reliabilityDatabase.js';

const { db } = await createReliabilityDatabase();
try {
  const release = readFileSync(new URL('../supabase/releases/reliability.sql', import.meta.url), 'utf8').trim();
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  assert.ok(schema.includes(release), 'fresh schema must include the exact release DDL');
  await db.exec('alter table brain_outbox_messages alter column source_id type uuid using source_id::uuid;');
  const oldId = '00000000-0000-4000-8000-000000000099';
  await db.query(`insert into brain_outbox_messages(recipient,body,rule_key,source_type,source_id,idempotency_key,scheduled_for,metadata)
    values ('fixture','fixture','timed_memo_due','memo',$1,'legacy-memo',now(),$2)`, [oldId, { exact_due_reminder: true }]);
  await db.exec(release);
  assert.equal((await db.query('select source_id from brain_outbox_messages')).rows[0].source_id, oldId);
  await db.exec('delete from brain_outbox_messages;');
  console.log('PASS legacy UUID migration preserves values and release SQL matches fresh schema');
  const insert = (key, profile = {}) => db.query(`insert into brain_outbox_messages
    (recipient,body,rule_key,source_type,source_id,idempotency_key,scheduled_for,metadata)
    values ('fixture','check','accountability_habit_missing','accountability',$1,$1,now(),$2) returning id`,
  [key, { attention_profile: { max_per_day: 20, min_gap_minutes: 20, ...profile } }]);
  const first = (await insert('habit:shower:2026-07-07')).rows[0];
  await assert.rejects(insert('habit:creatine:2026-07-07'), /attention_deferred/);
  await assert.rejects(insert('habit:shower:2026-07-07'), /duplicate key/);
  console.log('PASS actual schema accepts semantic source IDs and enforces admission/uniqueness');
  await db.query(`update brain_outbox_messages set created_at=now()-interval '1 hour' where id=$1`, [first.id]);
  const second = (await insert('habit:skin:2026-07-07')).rows[0];
  await db.query(`update brain_outbox_messages set status='claimed',claimed_at=now(),attempts=1 where id=$1`, [first.id]);
  const blocked = await db.query(`update brain_outbox_messages set status='claimed',claimed_at=now(),attempts=1 where id=$1 returning id`, [second.id]);
  assert.equal(blocked.rows.length, 0);
  console.log('PASS database prevents backlog delivery bursts');
  const project = (await db.query(`insert into projects(name,goal_type,current_value,target_value) values ('fixture','units',5,10) returning id`)).rows[0];
  const session = (await db.query(`insert into project_sessions(project_id,started_at,progress_delta) values ($1,now(),2) returning id`, [project.id])).rows[0];
  const progress = async () => Number((await db.query('select current_value from projects where id=$1', [project.id])).rows[0].current_value);
  assert.equal(await progress(), 5);
  await db.query('update project_sessions set ended_at=now() where id=$1', [session.id]);
  assert.equal(await progress(), 7);
  await db.query('update project_sessions set progress_delta=4 where id=$1', [session.id]);
  assert.equal(await progress(), 9);
  await db.query('update project_sessions set ended_at=null where id=$1', [session.id]);
  assert.equal(await progress(), 5);
  await db.query('update project_sessions set ended_at=now() where id=$1', [session.id]);
  await db.query('delete from project_sessions where id=$1', [session.id]);
  assert.equal(await progress(), 5);
  console.log('PASS project completion/edit/reopen/delete reconcile in the database transaction');
  const hours = (await db.query(`insert into projects(name,goal_type,current_value,target_value) values ('hours','hours',0,10) returning id`)).rows[0];
  await db.query('insert into project_sessions(project_id,started_at,ended_at,progress_delta) values ($1,now(),now(),3)', [hours.id]);
  assert.equal(Number((await db.query('select current_value from projects where id=$1', [hours.id])).rows[0].current_value), 0);
  await db.query(`insert into health_logs(user_id,logged_on,hygiene) values ($1,'2026-07-07',$2)`, [fixtureUser, { shower: { count: 1, times: ['18:30'] } }]);
  await assert.rejects(db.query(`insert into health_logs(user_id,logged_on) values ($1,'2026-07-07')`, [fixtureUser]), /duplicate key/);
  console.log('PASS health JSON/day uniqueness and non-hour project authority contracts');
} catch (error) { console.error(`FAIL schema contracts: ${error.message}`); process.exitCode = 1; }
finally { await db.close(); }
