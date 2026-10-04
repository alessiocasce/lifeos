import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReliabilityDatabase, fixtureUser } from '../tests/brain/reliabilityDatabase.js';
import { prefillWorkoutTargets } from '../src/utils/workoutPrefill.js';
import { controlWorkoutRestTimer } from '../api/_utils/workoutRestTimer.js';
import { checkProactiveDelivery } from '../api/_utils/brainProactiveDelivery.js';
import { proactiveAssistantMetadata, pollOutboxMessages, ackOutboxMessage, buildProactiveWorkingContextFromOutbox } from '../api/_utils/brainOutbox.js';
import { decideAttention } from '../api/_utils/brainAttentionEngine.js';

const historical = [
  { set_number: 1001, is_warmup: true, weight: 40, reps: 10 },
  { set_number: 1, weight: 80, reps: 8, rpe: 9, notes: 'Past outcome' },
  { set_number: 2, weight: 80, reps: 7 }, { set_number: 3, weight: 77.5, reps: 8 },
];
const draft = { exercise: 'Bench Press', weight: '', reps: '', rpe: '', notes: '', set_number: 1, is_warmup: false };
assert.deepEqual(prefillWorkoutTargets(draft, historical), { ...draft, weight: '80', reps: '8' });
assert.equal(prefillWorkoutTargets({ ...draft, set_number: 1001, is_warmup: true }, historical).weight, '40');
assert.equal(prefillWorkoutTargets({ ...draft, weight: '82.5' }, historical).weight, '82.5');
assert.equal(prefillWorkoutTargets({ ...draft, set_number: 2 }, historical, { afterSave: true }).reps, '7');
assert.deepEqual(prefillWorkoutTargets({ ...draft, set_number: 4, rpe: '9', notes: 'Done' }, historical,
  { afterSave: true, savedSet: { weight: 77.5, reps: 8 } }), { ...draft, set_number: 4, weight: '77.5', reps: '8' });
console.log('PASS prefill targets, warmup isolation, manual values, historical progression, fallback and outcome reset');

const { db, client } = await createReliabilityDatabase();
try {
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const start = schema.indexOf('create table if not exists public.workout_sets (');
  await db.exec(schema.slice(start, schema.indexOf('\n);', start) + 3));
  const migration = readFileSync(new URL('../supabase/migrations/20261004134735_workout_rest_timer.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // rerunnable DDL, no duplicate triggers
  const control = async (operation, enabled = null, duration = null, setId = null) => (await db.query(
    'select control_workout_rest_timer($1,$2,$3,$4,$5,$6) as result',
    [fixtureUser, operation, 'fixture@lid', setId, enabled, duration])).rows[0].result;
  const workout = (await db.query("insert into workouts(name) values('Push') returning id")).rows[0].id;
  const save = async (number, warmup = false) => (await db.query(`insert into workout_sets(workout_id,exercise,set_number,is_warmup,weight,reps)
    values($1,'Bench Press',$2,$3,80,8) returning *`, [workout, number, warmup])).rows[0];
  assert.equal((await control('status')).preferences.enabled, false);
  await save(1);
  assert.equal((await control('status')).timer, null);
  await control('configure', true, 120);
  const first = await save(2);
  let state = await control('status');
  assert.equal(Date.parse(state.timer.scheduled_for) - new Date(first.created_at).getTime(), 120000);
  assert.equal(Date.parse(state.timer.expires_at) - Date.parse(state.timer.scheduled_for), 300000);
  const firstId = state.timer.id;
  await control('schedule', null, null, first.id);
  assert.equal((await control('status')).timer.id, firstId);
  await control('configure', true, 180);
  assert.equal((await control('status')).timer.scheduled_for, state.timer.scheduled_for);
  const second = await save(1001, true);
  state = await control('status');
  assert.equal(Date.parse(state.timer.scheduled_for) - new Date(second.created_at).getTime(), 180000);
  assert.equal((await db.query('select status from brain_outbox_messages where id=$1', [firstId])).rows[0].status, 'cancelled');
  assert.match(state.timer.body, /the next set/);
  assert.equal(proactiveAssistantMetadata(state.timer).proactive_message, false);
  assert.equal(buildProactiveWorkingContextFromOutbox(state.timer), null);
  assert.equal((await checkProactiveDelivery({ row: state.timer, client, userId: fixtureUser })).eligible, true);
  assert.equal((await checkProactiveDelivery({ row: state.timer, client, userId: fixtureUser, now: new Date('2026-10-02T23:30:00Z') })).eligible, true);
  await control('schedule', null, null, first.id); // late retry must not replace newer timer
  assert.equal((await control('status')).timer.id, state.timer.id);
  await assert.rejects(save(-1), /check constraint/);
  assert.equal((await control('status')).timer.id, state.timer.id);
  // Local-only fault injection: a timer insert fails after cancelling its predecessor.
  await db.exec("alter table brain_outbox_messages add constraint rest_fixture_fault check (source_type <> 'workout_rest_timer' or metadata #>> '{workout_rest,exercise}' <> 'Fault fixture')");
  const failedTimerSet = (await db.query("insert into workout_sets(workout_id,exercise,set_number,weight,reps) values($1,'Fault fixture',1,10,5) returning id", [workout])).rows[0];
  assert.equal((await db.query('select count(*)::integer as count from workout_sets where id=$1', [failedTimerSet.id])).rows[0].count, 1);
  assert.equal((await control('status')).timer.id, state.timer.id);
  assert.equal((await db.query("select count(*)::integer as count from brain_outbox_messages where source_id=$1", [failedTimerSet.id])).rows[0].count, 0);
  await db.exec('alter table brain_outbox_messages drop constraint rest_fixture_fault');
  console.log('PASS timer insertion fault preserves saved set and previous timer (fail-open subtransaction)');
  await control('configure', false, 180);
  assert.equal((await control('status')).timer, null);
  assert.equal((await checkProactiveDelivery({ row: state.timer, client, userId: fixtureUser })).eligible, false);
  await control('configure', true, 15);
  await assert.rejects(control('schedule', null, null, '22222222-2222-4222-8222-222222222222'), /Set not found/);
  await save(3);
  await db.query("update brain_outbox_messages set scheduled_for=now()-interval '1 second' where source_type='workout_rest_timer' and status='queued'");
  const due = await pollOutboxMessages({ recipient: 'fixture@lid', client, userId: fixtureUser });
  assert.equal(due.length, 1);
  const thread = (await db.query('insert into ai_chat_threads(title,metadata) values ($1,$2) returning id',
    ['rest-fixture', { source: 'whatsapp', whatsapp_sender: 'fixture@lid' }])).rows[0];
  const originalMessage = (await db.query('insert into ai_chat_messages(thread_id,role,content) values ($1,$2,$3) returning id',
    [thread.id, 'assistant', 'Existing clarification'])).rows[0];
  await db.query("insert into brain_interaction_state(user_id,thread_id,state,owner_kind,assistant_message_id,opened_at,expires_at) values($1,$2,'active','clarification',$3,now(),now()+interval '1 hour')", [fixtureUser, thread.id, originalMessage.id]);
  const ack = await ackOutboxMessage({ recipient: 'fixture@lid', userId: fixtureUser, client, messageId: due[0].id,
    status: 'sent', metadata: { provider_message_id: 'true_fixture@lid_REST' }, findThread: async () => thread });
  assert.equal(ack.delivery_mapping.persisted_count, 1);
  assert.equal((await db.query('select assistant_message_id from brain_interaction_state where thread_id=$1', [thread.id])).rows[0].assistant_message_id, originalMessage.id);
  // Recent user-armed sends must not throttle an unrelated ordinary memo.
  const memo = (await db.query("insert into brain_outbox_messages(recipient,body,rule_key,source_type,idempotency_key,scheduled_for) values('fixture@lid','memo','memo_overdue_followup','memo','timer-budget-control',now()) returning id")).rows[0];
  await db.query("update brain_outbox_messages set status='cancelled' where id=$1", [memo.id]);
  await save(4);
  await control('cancel');
  assert.equal((await control('status')).timer, null);
  await save(5);
  await db.query('update workouts set ended_at=now() where id=$1', [workout]);
  assert.equal((await control('status')).timer, null);
  await db.query('update workouts set ended_at=null where id=$1', [workout]);
  await save(6);
  await db.query('update brain_outbox_messages set scheduled_for=now()-interval \'10 minutes\',expires_at=now()-interval \'5 minutes\' where source_type=\'workout_rest_timer\' and status=\'queued\'');
  assert.equal((await pollOutboxMessages({ recipient: 'fixture@lid', client, userId: fixtureUser })).length, 0);
  await save(7);
  await db.query('delete from workouts where id=$1', [workout]);
  assert.equal((await control('status')).timer, null);
  await assert.rejects(control('configure', true, 901), /Invalid rest preferences/);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.control_workout_rest_timer(uuid,text,text,uuid,boolean,integer)','execute') as allowed")).rows[0].allowed, false);
  assert.equal((await db.query("select has_function_privilege('anon','public.schedule_workout_rest_timer(uuid)','execute') as allowed")).rows[0].allowed, false);
  console.log('PASS actual SQL durable save scheduling, reset, duplicate/late retries, warmups, failed saves, duration, off, end/delete, expiry and RPC privileges');
  let args;
  const fake = { rpc: async (_, parameters) => { args = parameters; return { data: { preferences: { enabled: true }, timer: null } }; } };
  await controlWorkoutRestTimer({ userId: fixtureUser, body: { operation: 'configure', enabled: true, duration_seconds: 120, recipient: 'attacker' }, client: fake,
    env: { LIFEOS_WHATSAPP_ALLOWED_SENDERS: 'fixture@lid' } });
  assert.equal(args.p_recipient, 'fixture@lid');
  await assert.rejects(controlWorkoutRestTimer({ userId: fixtureUser, body: { operation: 'configure', enabled: true, duration_seconds: 120 }, client: fake, env: {} }), /destination/);
  const quietBypass = await checkProactiveDelivery({ row: state.timer, client, userId: fixtureUser, now: new Date('2026-10-02T23:30:00Z') });
  assert.equal(quietBypass.eligible, false); // deleted source, never resurrected by an exception
  const attention = decideAttention({ signal: { state: 'stale', topic_key: 'project', importance: 4, confidence: 1 }, permissions: { message: true },
    now: new Date('2026-10-02T12:00:00Z'), recentOutbox: Array.from({ length: 10 }, () => ({ source_type: 'workout_rest_timer', status: 'sent', created_at: '2026-10-02T11:59:00Z' })) });
  assert.equal(attention.decision, 'message');
  console.log('PASS configured recipient only, no permission mutation, timer does not consume autonomous attention');
} finally { await db.close(); }
