import assert from 'node:assert/strict';
import { buildBrainTurnContract } from '../api/_utils/brainTurnContract.js';
import { buildAccountabilityProactiveCandidates, enqueueAccountabilitySnoozeOutboxMessage } from '../api/_utils/brainProactiveAccountability.js';
import { resolveProactiveWhatsappReply, selectProactiveReplyTarget, buildProactiveWorkingContextFromOutbox } from '../api/_utils/brainProactiveReplies.js';
import { ensureAccountabilityHealth, resolveAccountabilityTarget, checkProactiveDelivery, accountabilityTargetIsResolved } from '../api/_utils/brainProactiveDelivery.js';
import { enqueueOutboxMessage, pollOutboxMessages, markOutboxSent, proactiveAssistantMetadata } from '../api/_utils/brainOutbox.js';
import { buildWorkoutIntelligence } from '../api/_utils/workoutIntelligence.js';
import { buildOpenLoops } from '../api/_utils/lifeosContextCompiler.js';
import { extractHealthHabitUpdates } from '../api/_utils/lifeosTools.js';
import { sanitizeMcpOutput, compactProactiveDebugOutboxMessage } from '../api/_utils/mcpLifeosData.js';
import { localDate } from '../src/utils/date.js';
import { createReliabilityDatabase, fixtureUser } from '../tests/brain/reliabilityDatabase.js';

const now = new Date('2026-07-07T18:50:00Z');
let failures = 0;
async function check(name, run) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
}
const candidates = buildAccountabilityProactiveCandidates({ healthLogs: [], recipient: 'fixture', now });
const candidate = candidates.find((row) => row.metadata.accountability.habit_id === 'shower');
const historyFor = (row) => ({ conversationHistory: [{ role: 'assistant', created_at: now.toISOString(), metadata: {
  ...proactiveAssistantMetadata(row), working_context: buildProactiveWorkingContextFromOutbox(row),
} }] });
const brainChat = historyFor(candidate);
await check('accountability metadata reaches proactive Brain contract', () => {
  assert.equal(buildBrainTurnContract({ message: 'fatto', source: 'whatsapp', brainChat, now }).winning_path, 'proactive_reply');
});
await check('pending cancellation and independent commands retain priority', () => {
  const pendingAction = { id: 'pending', action_type: 'create_calendar_event', status: 'awaiting_fields', missing_fields: ['end_time'], args: { start_time: '09:30' } };
  assert.equal(buildBrainTurnContract({ message: 'No. Cancella tutto', source: 'whatsapp', brainChat, pendingAction, now }).intent_type, 'pending_cancellation');
  assert.equal(buildBrainTurnContract({ message: 'Segna memo dentista domani', source: 'whatsapp', brainChat, pendingAction, now }).winning_path, 'explicit_command');
  assert.equal(buildBrainTurnContract({ message: 'fatto', source: 'whatsapp', brainChat, pendingAction, now }).winning_path, 'proactive_reply');
});
await check('multiple accountability targets ask rather than guess', async () => {
  const other = candidates.find((row) => row.metadata.accountability.habit_id === 'creatine');
  const history = { conversationHistory: [...brainChat.conversationHistory, ...historyFor(other).conversationHistory] };
  assert.equal(selectProactiveReplyTarget({ message: 'fatto', brainChat: history, now }).type, 'ambiguous');
  const result = await resolveProactiveWhatsappReply({ message: 'fatto', brainChat: history, now });
  assert.deepEqual(result.actions, []);
});
await check('health notes never mutate habits, explicit fields still do', () => {
  for (const notes of ['non ho preso creatina', 'did not take creatine', 'oggi niente creatina', 'creatine mi ha dato fastidio']) {
    assert.deepEqual(extractHealthHabitUpdates({ notes }).updates, {});
  }
  assert.equal(extractHealthHabitUpdates({ creatine: true }).updates.creatine.mode, 'increment');
  assert.equal(extractHealthHabitUpdates({ creatine: false, notes: 'creatine' }).updates.creatine.value, 0);
});
await check('missing/stale sleep is unknown; actual zero remains data', () => {
  for (const sleep_hours of [null, undefined, '']) {
    assert.equal(buildWorkoutIntelligence({ healthLogs: [{ logged_on: '2026-07-07', sleep_hours }], generatedAt: now.toISOString() }).recovery.status, 'unknown');
  }
  assert.equal(buildWorkoutIntelligence({ healthLogs: [{ logged_on: '2026-07-07', sleep_hours: 0 }], generatedAt: now.toISOString() }).recovery.sleep_hours, 0);
  assert.equal(buildWorkoutIntelligence({ healthLogs: [{ logged_on: '2026-06-01', sleep_hours: 4 }], generatedAt: now.toISOString() }).recovery.status, 'unknown');
});
await check('terminal and expired pending snapshots do not resurrect', () => {
  const pending = { id: 'p', action_type: 'create_memo', status: 'awaiting_confirmation' };
  for (const terminal of [{ status: 'cancelled' }, { status: 'completed' }, { expires_at: '2026-07-07T00:00:00Z' }]) {
    const rows = { brainMessages: [
      { id: 'new', created_at: now.toISOString(), metadata: { pending_action: { ...pending, ...terminal } } },
      { id: 'old', created_at: '2026-07-07T10:00:00Z', metadata: { pending_action: pending } },
    ] };
    assert.equal(buildOpenLoops({ rows, now }).loops.filter((loop) => loop.type === 'brain_pending_action').length, 0);
  }
});
await check('MCP counts describe final serialized sets', () => {
  const result = sanitizeMcpOutput({ workouts: [{ sets: Array.from({ length: 121 }, (_, id) => ({ id })) }], returned_set_count: 121, sets_truncated: false });
  assert.equal(result.returned_set_count, result.workouts[0].sets.length);
  assert.equal(result.sets_truncated, true);
});
await check('MCP diagnostics expose resolution and cancellation without arbitrary metadata', () => {
  const result = sanitizeMcpOutput(compactProactiveDebugOutboxMessage({ source_id: 'habit:shower:2026-07-07', metadata: {
    resolution: { type: 'done', source_closed: true, token: 'fixture-only' },
    delivery_revalidation: { reason: 'source_resolved', authorization: 'fixture-only' },
  } }));
  assert.equal(result.resolution.source_closed, true);
  assert.equal(result.delivery_revalidation.reason, 'source_resolved');
  assert.equal(JSON.stringify(result).includes('fixture-only'), false);
});
await check('Rome date differs from UTC at midnight and handles DST', () => {
  assert.equal(localDate(0, new Date('2026-07-07T22:30:00Z')), '2026-07-08');
  assert.equal(localDate(0, new Date('2026-03-29T22:30:00Z')), '2026-03-30');
  assert.equal(localDate(0, new Date('2026-10-25T23:30:00Z')), '2026-10-26');
});

const { db, client } = await createReliabilityDatabase();
const userId = fixtureUser;
try {
  for (const [kind, reply] of [['habit_missing', 'fatto'], ['wake_time_missing', '9.30'], ['sleep_start_missing', '2.30']]) {
    await check(`schema-backed journey ${kind}: generate -> enqueue -> claim -> ACK -> contract -> reply -> resolve`, async () => {
      await db.exec('delete from ai_chat_messages; delete from brain_outbox_messages; delete from health_logs;');
      const item = Array.from({ length: 48 }, (_, halfHour) => buildAccountabilityProactiveCandidates({
        healthLogs: [], recipient: 'fixture', now: new Date(Date.UTC(2026, 6, 7, 0, halfHour * 30)),
      })).flat().find((row) => row.metadata.accountability.kind === kind);
      const queued = await enqueueOutboxMessage({ userId, client, recipient: 'fixture', body: item.body, ruleKey: item.rule_key,
        sourceType: item.source_type, sourceId: item.source_id, idempotencyKey: item.idempotency_key,
        scheduledFor: new Date(Date.now() - 60000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), metadata: item.metadata });
      assert.ok(queued.row?.id);
      const claimed = await pollOutboxMessages({ client, userId, recipient: 'fixture' });
      assert.equal(claimed.length, 1);
      const sent = await markOutboxSent({ client, row: claimed[0] });
      const thread = (await db.query(`insert into ai_chat_threads(title) values ('fixture') returning id`)).rows[0];
      const metadata = { ...proactiveAssistantMetadata(sent), working_context: buildProactiveWorkingContextFromOutbox(sent) };
      await client.from('ai_chat_messages').insert({ user_id: userId, thread_id: thread.id, role: 'assistant', content: item.body, metadata }).single();
      const conversation = { conversationHistory: [{ role: 'assistant', created_at: now.toISOString(), metadata }] };
      assert.equal(buildBrainTurnContract({ message: reply, source: 'whatsapp', brainChat: conversation, now }).winning_path, 'proactive_reply');
      const actions = { updateHealthLog: (args) => ensureAccountabilityHealth(args, { client, userId }),
        logSleepStart: (args) => ensureAccountabilityHealth(args, { client, userId }),
        isResolved: (proactive) => accountabilityTargetIsResolved(proactive, { client, userId }),
        resolveTarget: (args) => resolveAccountabilityTarget({ ...args, client, userId }) };
      const result = await resolveProactiveWhatsappReply({ message: reply, brainChat: conversation, now, actions });
      assert.equal(result.actions.length, 1);
      const repeated = await resolveProactiveWhatsappReply({ message: reply, brainChat: conversation, now, actions });
      assert.equal(repeated.actions.length, 0);
      const health = (await db.query('select * from health_logs')).rows[0];
      if (kind === 'habit_missing') assert.equal(health.hygiene[item.metadata.accountability.habit_id].count, 1);
      if (kind === 'wake_time_missing') assert.equal(health.wake_time.slice(0, 5), '09:30');
      if (kind === 'sleep_start_missing') {
        assert.equal(health.sleep_start.slice(0, 5), '02:30');
        assert.equal(new Date(health.logged_on).toISOString().slice(0, 10), item.metadata.accountability.sleep_date);
      }
      const delivery = await checkProactiveDelivery({ row: sent, client, userId });
      assert.equal(delivery.eligible, false);
    });
  }
  await check('no-sleep resolution prevents later same-source prompting without fake sleep', async () => {
    const sent = (await db.query(`select * from brain_outbox_messages where status='sent' limit 1`)).rows[0];
    await db.exec('delete from health_logs');
    await resolveAccountabilityTarget({ proactive: { outbox_message_id: sent.id, source_id: sent.source_id }, resolution: 'no_sleep', client, userId });
    assert.equal((await checkProactiveDelivery({ row: sent, client, userId })).eligible, false);
    assert.equal((await db.query('select * from health_logs')).rows.length, 0);
  });
  await check('snooze retries reuse one row and successful health reply cancels queued fallbacks', async () => {
    await db.exec('delete from ai_chat_messages; delete from brain_outbox_messages; delete from health_logs;');
    const queued = await enqueueOutboxMessage({ userId, client, recipient: 'fixture', body: candidate.body,
      ruleKey: candidate.rule_key, sourceType: 'accountability', sourceId: candidate.source_id,
      idempotencyKey: candidate.idempotency_key, scheduledFor: new Date().toISOString(), metadata: candidate.metadata });
    const proactive = { outbox_message_id: queued.row.id, source_id: candidate.source_id, recipient: 'fixture' };
    const args = { proactive, accountability: candidate.metadata.accountability, client, userId };
    const snoozed = await enqueueAccountabilitySnoozeOutboxMessage(args);
    const repeated = await enqueueAccountabilitySnoozeOutboxMessage(args);
    assert.equal(snoozed.id, repeated.id);
    await resolveAccountabilityTarget({ proactive, resolution: 'snooze', preserveId: snoozed.id, client, userId });
    assert.equal((await db.query('select status from brain_outbox_messages where id=$1', [snoozed.id])).rows[0].status, 'queued');
    await resolveAccountabilityTarget({ proactive, resolution: 'done', client, userId });
    assert.equal((await db.query('select status from brain_outbox_messages where id=$1', [snoozed.id])).rows[0].status, 'cancelled');
  });
  await check('manual health completion invalidates queued accountability before claim', async () => {
    await db.exec('delete from brain_outbox_messages; delete from health_logs;');
    await enqueueOutboxMessage({ userId, client, recipient: 'fixture', body: candidate.body,
      ruleKey: candidate.rule_key, sourceType: 'accountability', sourceId: candidate.source_id,
      idempotencyKey: candidate.idempotency_key, scheduledFor: new Date().toISOString(), metadata: candidate.metadata });
    await ensureAccountabilityHealth({ logged_on: candidate.metadata.accountability.local_date, shower: true, habit_time: '18:30' }, { client, userId });
    assert.equal((await pollOutboxMessages({ client, userId, recipient: 'fixture' })).length, 0);
    assert.equal((await db.query('select status from brain_outbox_messages')).rows[0].status, 'cancelled');
  });
  await check('memo UUID identity survives text schema and closed memo is not delivered', async () => {
    await db.exec('delete from brain_outbox_messages;');
    const memo = (await db.query(`insert into memos(title,status) values ('fixture','done') returning id`)).rows[0];
    const result = await enqueueOutboxMessage({ client, userId, recipient: 'fixture', body: 'fixture',
      ruleKey: 'timed_memo_due', sourceType: 'memo', sourceId: memo.id,
      idempotencyKey: `memo:${memo.id}`, scheduledFor: new Date().toISOString(), metadata: { exact_due_reminder: true } });
    assert.equal(result.row.source_id, memo.id);
    assert.equal((await pollOutboxMessages({ client, userId, recipient: 'fixture' })).length, 0);
    assert.equal((await db.query('select status from brain_outbox_messages')).rows[0].status, 'cancelled');
  });
  await check('interleaved ensure replies produce only one habit target effect', async () => {
    await db.exec('delete from health_logs;');
    const args = { logged_on: '2026-07-07', shower: true, habit_time: '18:30' };
    const results = await Promise.all([ensureAccountabilityHealth(args, { client, userId }), ensureAccountabilityHealth(args, { client, userId })]);
    assert.equal(results.filter((result) => !result.accountability_noop).length, 1);
    const health = (await db.query('select hygiene from health_logs')).rows[0];
    assert.equal(health.hygiene.shower.count, 1);
    assert.deepEqual(health.hygiene.shower.times, ['18:30']);
  });
} finally { await db.close(); }
if (failures) process.exitCode = 1;
