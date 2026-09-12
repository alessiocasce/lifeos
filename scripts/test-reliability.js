import assert from 'node:assert/strict';
import { buildBrainTurnContract } from '../api/_utils/brainTurnContract.js';
import { buildAccountabilityProactiveCandidates, enqueueAccountabilitySnoozeOutboxMessage } from '../api/_utils/brainProactiveAccountability.js';
import { resolveProactiveWhatsappReply, selectProactiveReplyTarget, buildProactiveWorkingContextFromOutbox } from '../api/_utils/brainProactiveReplies.js';
import { ensureAccountabilityHealth, resolveAccountabilityTarget, checkProactiveDelivery, accountabilityTargetIsResolved } from '../api/_utils/brainProactiveDelivery.js';
import { ackOutboxMessage, enqueueOutboxMessage, pollOutboxMessages, markOutboxSent, proactiveAssistantMetadata, persistSentProactiveMessageToWhatsappThread } from '../api/_utils/brainOutbox.js';
import { persistBrainAssistantMessage } from '../api/_utils/brain.js';
import {
  claimWhatsappInboundReceipt,
  completeWhatsappInboundReceipt,
  closeBrainInteraction,
  loadBrainInteractionState,
  recordWhatsappMessageDeliveries,
  recordWhatsappMessageDelivery,
  resolveWhatsappQuotedDelivery,
  hydrateLegacyProactiveMessage,
  markWhatsappInboundReceiptFailedBeforeEffect,
  fingerprintWhatsappProviderMessageId,
  normalizeWhatsappProviderMessageId,
  setBrainInteractionPendingDelivery,
} from '../api/_utils/brainWhatsappReliability.js';
import { canonicalizeWhatsappSender } from '../api/_utils/whatsappBridge.js';
import { selectBrainTurnInteraction } from '../api/_utils/brainInteractionSelection.js';
import { parseExplicitHealthSelfReport, resolveExplicitHealthSelfReport } from '../api/_utils/brainHealthSelfReports.js';
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
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.stack || error.message}`); }
}
const candidates = buildAccountabilityProactiveCandidates({ healthLogs: [], recipient: 'fixture', now });
const candidate = candidates.find((row) => row.metadata.accountability.habit_id === 'shower');
const historyFor = (row) => ({ conversationHistory: [{ role: 'assistant', created_at: now.toISOString(), metadata: {
  ...proactiveAssistantMetadata(row), working_context: buildProactiveWorkingContextFromOutbox(row),
} }] });
const brainChat = historyFor(candidate);
await check('backend provider IDs preserve full suffixes and reject object coercion', () => {
  assert.equal(normalizeWhatsappProviderMessageId('provider:device:full-suffix'), 'provider:device:full-suffix');
  assert.equal(normalizeWhatsappProviderMessageId({ _serialized: 'not-accepted-at-backend' }), null);
  assert.equal(normalizeWhatsappProviderMessageId('[object Object]'), null);
});
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
  await check('real assistant persistence preserves nested accountability metadata', async () => {
    await db.exec('delete from brain_interaction_state; delete from brain_whatsapp_message_deliveries; delete from brain_whatsapp_inbound_receipts; delete from ai_chat_messages; delete from ai_chat_threads;');
    const thread = (await db.query(`insert into ai_chat_threads(title) values ('persistence') returning *`)).rows[0];
    const chat = { thread, source: 'app', assistantPersisted: false };
    const saved = await persistBrainAssistantMessage({
      chat, answer: 'Doccia fatta oggi?', actions: [], recordRefs: [], client, userId,
      extraMetadata: {
        proactive_message: true,
        outbox_message_id: '00000000-0000-4000-8000-000000000001',
        source_type: 'accountability', source_id: 'habit:shower:2026-07-07', expected_reply_type: 'accountability',
        accountability: { kind: 'habit_missing', habit_id: 'shower', local_date: '2026-07-07' },
      },
    });
    assert.equal(saved.metadata.metadata_version, 2);
    assert.equal(saved.metadata.accountability.kind, 'habit_missing');
    assert.notEqual(saved.metadata.accountability, '[object Object]');
  });

  await check('durable inbound receipt replays completed response without a second claim', async () => {
    await db.exec('delete from brain_whatsapp_inbound_receipts; delete from ai_chat_messages; delete from ai_chat_threads;');
    const thread = (await db.query(`insert into ai_chat_threads(title) values ('receipt') returning *`)).rows[0];
    const assistant = (await db.query(`insert into ai_chat_messages(user_id,thread_id,role,content) values ($1,$2,'assistant','ok') returning *`, [userId, thread.id])).rows[0];
    const first = await claimWhatsappInboundReceipt({ userId, recipient: 'fixture', providerMessageId: 'provider:one', client, now });
    assert.equal(first.mode, 'claimed');
    const concurrent = await claimWhatsappInboundReceipt({ userId, recipient: 'fixture', providerMessageId: 'provider:one', client, now });
    assert.equal(concurrent.mode, 'processing');
    await completeWhatsappInboundReceipt({ receiptId: first.receipt.id, leaseToken: first.leaseToken, userId, client,
      result: { answer: 'ok', thread_id: thread.id, persisted_message: assistant, actions: [] } });
    const replay = await claimWhatsappInboundReceipt({ userId, recipient: 'fixture', providerMessageId: 'provider:one', client, now });
    assert.equal(replay.mode, 'replay');
    assert.equal(replay.response.assistant_message_id, assistant.id);
    assert.equal((await db.query(`select count(*)::int as count from brain_whatsapp_inbound_receipts`)).rows[0].count, 1);
  });

  await check('receipt failed before Brain effects can be reclaimed safely', async () => {
    await db.exec('delete from brain_whatsapp_inbound_receipts;');
    const first = await claimWhatsappInboundReceipt({ userId, recipient: 'fixture', providerMessageId: 'provider:retryable', client, now });
    await markWhatsappInboundReceiptFailedBeforeEffect({ receiptId: first.receipt.id, leaseToken: first.leaseToken,
      userId, client, error: new Error('fixture-before-effect') });
    const retry = await claimWhatsappInboundReceipt({ userId, recipient: 'fixture', providerMessageId: 'provider:retryable', client, now });
    assert.equal(retry.mode, 'claimed');
    assert.notEqual(retry.leaseToken, first.leaseToken);
  });

  await check('provider delivery activates one scoped interaction and quoted lookup resolves it', async () => {
    await db.exec('delete from brain_interaction_state; delete from brain_whatsapp_message_deliveries; delete from ai_chat_messages; delete from ai_chat_threads;');
    const thread = (await db.query(`insert into ai_chat_threads(title,metadata) values ('delivery',$1) returning *`, [{ source: 'whatsapp', whatsapp_sender: 'fixture' }])).rows[0];
    const pending = { id: 'pending-wake', action_type: 'update_health_log', status: 'awaiting_confirmation', args: { logged_on: '2026-07-07', wake_time: '08:35' } };
    const chat = { thread, source: 'whatsapp', channelMetadata: { whatsapp_sender: 'fixture' }, assistantPersisted: false };
    const assistant = await persistBrainAssistantMessage({ chat, answer: 'Confermi il risveglio alle 08:35?', pendingAction: pending,
      actions: [], recordRefs: [], client, userId });
    assert.equal((await loadBrainInteractionState({ threadId: thread.id, userId, client, now })).state, 'pending_delivery');
    await recordWhatsappMessageDelivery({ assistantMessageId: assistant.id, threadId: thread.id, recipient: 'fixture',
      providerMessageId: 'provider:pending', userId, client, sentAt: now.toISOString() });
    assert.equal((await loadBrainInteractionState({ threadId: thread.id, userId, client, now })).state, 'active');
    const quoted = await resolveWhatsappQuotedDelivery({ recipient: 'fixture', providerMessageId: 'provider:pending', userId, client });
    assert.equal(quoted.message.id, assistant.id);
    const selected = selectBrainTurnInteraction({ message: 'si', pendingAction: pending, activeInteraction: await loadBrainInteractionState({ threadId: thread.id, userId, client, now }), brainChat: { conversationHistory: [assistant] }, now });
    assert.equal(selected.path, 'pending_action');
    assert.equal(selected.pending_action_id, pending.id);
  });

  await check('interaction ownership uses version fencing and provider mappings are scope-safe', async () => {
    await db.exec('delete from brain_interaction_state; delete from brain_whatsapp_message_deliveries; delete from ai_chat_messages; delete from ai_chat_threads;');
    const thread = (await db.query(`insert into ai_chat_threads(title,metadata) values ('owner-cas',$1) returning *`, [{ source: 'whatsapp', whatsapp_sender: 'fixture' }])).rows[0];
    const first = (await db.query(`insert into ai_chat_messages(user_id,thread_id,role,content) values ($1,$2,'assistant','first') returning *`, [userId, thread.id])).rows[0];
    const second = (await db.query(`insert into ai_chat_messages(user_id,thread_id,role,content) values ($1,$2,'assistant','second') returning *`, [userId, thread.id])).rows[0];
    const owner1 = await setBrainInteractionPendingDelivery({ userId, threadId: thread.id, assistantMessageId: first.id,
      pendingAction: { id: 'pending-1' }, ownerPayload: { pending_action: { id: 'pending-1' } }, client, openedAt: now });
    const owner2 = await setBrainInteractionPendingDelivery({ userId, threadId: thread.id, assistantMessageId: second.id,
      pendingAction: { id: 'pending-2' }, ownerPayload: { pending_action: { id: 'pending-2' } }, client, openedAt: now });
    assert.equal(owner2.version, owner1.version + 1);
    assert.equal(await closeBrainInteraction({ userId, threadId: thread.id, assistantMessageId: first.id,
      expectedVersion: owner1.version, client }), null);
    assert.equal((await loadBrainInteractionState({ threadId: thread.id, userId, client, now })).assistant_message_id, second.id);
    await recordWhatsappMessageDelivery({ userId, threadId: thread.id, assistantMessageId: second.id,
      recipient: 'fixture', providerMessageId: 'provider:full:suffix:one', client, sentAt: now.toISOString() });
    await assert.rejects(recordWhatsappMessageDelivery({ userId, threadId: thread.id, assistantMessageId: first.id,
      recipient: 'fixture', providerMessageId: 'provider:full:suffix:one', client, sentAt: now.toISOString() }), /already mapped/);
    assert.equal(await resolveWhatsappQuotedDelivery({ userId, recipient: 'other', providerMessageId: 'provider:full:suffix:one', client }), null);
    const scope = await resolveWhatsappQuotedDelivery({ userId, recipient: 'other', providerMessageId: 'provider:full:suffix:one', client, detailed: true });
    assert.equal(scope.status, 'recipient_mismatch');
    const unknown = await resolveWhatsappQuotedDelivery({ userId, recipient: 'fixture', providerMessageId: 'provider:unknown', client, detailed: true });
    assert.equal(unknown.status, 'provider_id_not_found');
    assert.equal(unknown.target, null);
  });

  await check('proactive sent ACK requires identity and persists singular/plural physical mappings before reply', async () => {
    await db.exec('delete from brain_interaction_state; delete from brain_whatsapp_message_deliveries; delete from ai_chat_messages; delete from brain_outbox_messages; delete from ai_chat_threads;');
    const recipient = 'fixture@lid';
    const thread = (await db.query(`insert into ai_chat_threads(title,metadata) values ('ack-mapping',$1) returning id`, [{ source: 'whatsapp', whatsapp_sender: recipient }])).rows[0];
    const queueAndClaim = async (suffix) => {
      return (await db.query(`
        insert into brain_outbox_messages
          (user_id,channel,recipient,body,status,priority,rule_key,source_type,source_id,idempotency_key,scheduled_for,expires_at,claimed_at,attempts,metadata)
        values ($1,'whatsapp',$2,$3,'claimed','normal',$4,$5,$6,$7,now()-interval '1 minute',now()+interval '1 day',now(),1,$8)
        returning *
      `, [userId, recipient, `fixture-${suffix}`, candidate.rule_key, candidate.source_type,
        `${candidate.source_id}:${suffix}`, `ack-mapping:${suffix}`, {
          ...candidate.metadata,
          exact_due_reminder: true,
        }])).rows[0];
    };

    const single = await queueAndClaim('single');
    await assert.rejects(ackOutboxMessage({
      userId, client, recipient, messageId: single.id, deliveryAttempt: single.attempts,
      status: 'sent', metadata: {}, findThread: async () => thread,
    }), /requires a provider message ID/);
    assert.equal((await db.query('select status from brain_outbox_messages where id=$1', [single.id])).rows[0].status, 'claimed');

    const sentProviderId = 'true_fixture@lid_ACK_SINGLE';
    const sentFingerprint = fingerprintWhatsappProviderMessageId(sentProviderId);
    const acked = await ackOutboxMessage({
      userId, client, recipient, messageId: single.id, deliveryAttempt: single.attempts,
      status: 'sent', metadata: { provider_message_id: sentProviderId }, findThread: async () => thread,
    });
    assert.equal(acked.status, 'sent');
    assert.deepEqual(acked.delivery_mapping.provider_id_fingerprints, [sentFingerprint]);
    assert.equal(acked.delivery_mapping.received_count, 1);
    assert.equal(acked.delivery_mapping.persisted_count, 1);
    const persistedSingle = (await db.query('select * from brain_whatsapp_message_deliveries where outbox_message_id=$1', [single.id])).rows;
    assert.equal(persistedSingle.length, 1);
    const persistedFingerprint = fingerprintWhatsappProviderMessageId(persistedSingle[0].provider_message_id);
    const quotedFingerprint = fingerprintWhatsappProviderMessageId(sentProviderId);
    assert.equal(persistedFingerprint, sentFingerprint);
    assert.equal(quotedFingerprint, persistedFingerprint);
    const exactLookup = await resolveWhatsappQuotedDelivery({
      userId, client, recipient, providerMessageId: sentProviderId, detailed: true,
    });
    assert.equal(exactLookup.status, 'resolved');
    assert.equal(exactLookup.target.delivery.outbox_message_id, single.id);
    assert.equal(exactLookup.target.message.id, acked.delivery_mapping.assistant_message_id);

    const otherThread = (await db.query(`insert into ai_chat_threads(title,metadata) values ('ack-other',$1) returning id`, [{ source: 'whatsapp', whatsapp_sender: recipient }])).rows[0];
    await assert.rejects(recordWhatsappMessageDelivery({
      userId,
      client,
      recipient,
      threadId: otherThread.id,
      assistantMessageId: acked.delivery_mapping.assistant_message_id,
      providerMessageId: 'true_fixture@lid_WRONG_THREAD',
    }), /Assistant message not found/);

    const duplicateAck = await ackOutboxMessage({
      userId, client, recipient, messageId: single.id, deliveryAttempt: single.attempts,
      status: 'sent', metadata: { provider_message_id: sentProviderId }, findThread: async () => thread,
    });
    assert.equal(duplicateAck.delivery_mapping.duplicate_count, 1);
    assert.equal((await db.query('select count(*)::int as count from brain_whatsapp_message_deliveries where outbox_message_id=$1', [single.id])).rows[0].count, 1);

    const chunked = await queueAndClaim('chunked');
    const chunkIds = ['true_fixture@lid_ACK_A', 'true_fixture@lid_ACK_B', 'true_fixture@lid_ACK_C'];
    const chunkedAck = await ackOutboxMessage({
      userId, client, recipient, messageId: chunked.id, deliveryAttempt: chunked.attempts,
      status: 'sent', metadata: { provider_message_ids: chunkIds }, findThread: async () => thread,
    });
    assert.equal(chunkedAck.delivery_mapping.persisted_count, 3);
    for (const providerMessageId of chunkIds) {
      const resolved = await resolveWhatsappQuotedDelivery({ userId, client, recipient, providerMessageId, detailed: true });
      assert.equal(resolved.status, 'resolved');
      assert.equal(resolved.target.delivery.outbox_message_id, chunked.id);
    }
  });

  await check('fresh native quotes resolve wake, sleep and habit prompts out of order with persisted mappings', async () => {
    await db.exec('delete from brain_interaction_state; delete from brain_whatsapp_message_deliveries; delete from brain_whatsapp_inbound_receipts; delete from ai_chat_messages; delete from brain_outbox_messages; delete from health_logs; delete from ai_chat_threads;');
    const thread = (await db.query(`insert into ai_chat_threads(title,metadata) values ('native-quotes',$1) returning id`, [{ source: 'whatsapp', whatsapp_sender: 'fixture' }])).rows[0];
    const candidateFor = (kind, habitId = null) => Array.from({ length: 48 }, (_, halfHour) => buildAccountabilityProactiveCandidates({
      healthLogs: [], recipient: 'fixture', now: new Date(Date.UTC(2026, 6, 7, 0, halfHour * 30)),
    })).flat().find((row) => row.metadata.accountability.kind === kind
      && (!habitId || row.metadata.accountability.habit_id === habitId));
    const deliver = async (item, providerMessageIds) => {
      const queued = await enqueueOutboxMessage({ userId, client, recipient: 'fixture', body: item.body,
        ruleKey: item.rule_key, sourceType: item.source_type, sourceId: item.source_id,
        idempotencyKey: `native:${providerMessageIds[0]}`, scheduledFor: new Date(Date.now() - 60000).toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(), metadata: item.metadata });
      const claimed = (await db.query(`update brain_outbox_messages set status='claimed',claimed_at=now(),attempts=attempts+1 where id=$1 returning *`, [queued.row.id])).rows[0];
      const sent = await markOutboxSent({ client, row: claimed });
      const assistant = await persistSentProactiveMessageToWhatsappThread({ userId, recipient: 'fixture', outboxMessage: sent, client,
        findThread: async () => thread });
      await recordWhatsappMessageDeliveries({ userId, threadId: thread.id, assistantMessageId: assistant.id,
        recipient: 'fixture', providerMessageIds, outboxMessageId: sent.id, deliveryAttempt: sent.attempts,
        sentAt: now.toISOString(), client });
      const rows = await db.query('select provider_message_id from brain_whatsapp_message_deliveries where assistant_message_id=$1 order by provider_message_id', [assistant.id]);
      assert.deepEqual(rows.rows.map((row) => row.provider_message_id), [...providerMessageIds].sort());
      await db.query(`update brain_outbox_messages set created_at=now()-interval '1 hour',sent_at=now()-interval '1 hour' where id=$1`, [sent.id]);
      return { item, sent, assistant, providerMessageIds };
    };
    const answer = async (prompt, text, replyNow = now) => {
      const lookup = await resolveWhatsappQuotedDelivery({ userId, recipient: 'fixture',
        providerMessageIds: [prompt.providerMessageIds.at(-1)], detailed: true, client });
      assert.equal(lookup.status, 'resolved');
      const selection = selectBrainTurnInteraction({ message: text, brainChat: { conversationHistory: [] },
        quotedTarget: lookup.target, quotedMessagePresent: true, quotedLookupStatus: lookup.status, now: replyNow });
      assert.equal(selection.path, 'proactive_reply');
      assert.equal(selection.selection_method, 'trusted_native_quote');
      const actions = { updateHealthLog: (args) => ensureAccountabilityHealth(args, { client, userId }),
        logSleepStart: (args) => ensureAccountabilityHealth(args, { client, userId }),
        isResolved: (proactive) => accountabilityTargetIsResolved(proactive, { client, userId }),
        resolveTarget: (args) => resolveAccountabilityTarget({ ...args, client, userId }) };
      return resolveProactiveWhatsappReply({ message: text, brainChat: { conversationHistory: [] }, now: replyNow,
        actions, selection: selection.proactive_selection });
    };

    const wake = await deliver(candidateFor('wake_time_missing'), ['true_fixture@lid_WAKE', 'true_fixture@c.us_WAKE']);
    const sleep = await deliver(candidateFor('sleep_start_missing'), ['true_fixture@lid_SLEEP']);
    const creatine = await deliver(candidateFor('habit_missing', 'creatine'), ['true_fixture@lid_CREATINE']);
    const shower = await deliver(candidateFor('habit_missing', 'shower'), ['true_fixture@lid_SHOWER']);
    assert.equal((await db.query('select count(*)::int as count from brain_whatsapp_message_deliveries')).rows[0].count, 5);

    const sleepResult = await answer(sleep, '3');
    assert.equal(sleepResult.actions.length, 1, JSON.stringify(sleepResult));
    assert.equal(sleepResult.actions[0].type, 'log_sleep_start');
    assert.equal((await answer(wake, '8.30', new Date('2026-07-07T22:30:00Z'))).actions[0].type, 'update_health_log');
    assert.equal((await answer(creatine, 'si')).actions[0].type, 'update_health_log');
    const negative = await answer(shower, 'non ancora');
    assert.deepEqual(negative.actions, []);

    const health = (await db.query('select * from health_logs order by logged_on')).rows;
    const sleepRow = health.find((row) => new Date(row.logged_on).toISOString().slice(0, 10) === sleep.item.metadata.accountability.sleep_date);
    const wakeRow = health.find((row) => new Date(row.logged_on).toISOString().slice(0, 10) === wake.item.metadata.accountability.local_date);
    assert.equal(sleepRow.sleep_start.slice(0, 5), '03:00');
    assert.equal(wakeRow.wake_time.slice(0, 5), '08:30');
    assert.equal(wakeRow.hygiene.creatine.count, 1);
    assert.equal(wakeRow.hygiene.shower, undefined);

    const resolvedLookup = await resolveWhatsappQuotedDelivery({ userId, recipient: 'fixture', providerMessageId: creatine.providerMessageIds[0], detailed: true, client });
    const resolvedSelection = selectBrainTurnInteraction({ message: 'si', quotedTarget: resolvedLookup.target,
      quotedMessagePresent: true, quotedLookupStatus: resolvedLookup.status, now });
    assert.equal(resolvedSelection.intent, 'quoted_target_resolved');
  });

  await check('normal multi-chunk Brain replies keep every physical provider mapping addressable', async () => {
    await db.exec('delete from brain_interaction_state; delete from brain_whatsapp_message_deliveries; delete from ai_chat_messages; delete from ai_chat_threads;');
    const thread = (await db.query(`insert into ai_chat_threads(title,metadata) values ('normal-chunks',$1) returning id`, [{ source: 'whatsapp', whatsapp_sender: 'fixture' }])).rows[0];
    const assistant = (await db.query(`insert into ai_chat_messages(user_id,thread_id,role,content) values ($1,$2,'assistant','chunked') returning *`, [userId, thread.id])).rows[0];
    const ids = ['true_fixture@lid_CHUNK1', 'true_fixture@lid_CHUNK2'];
    await recordWhatsappMessageDeliveries({ userId, threadId: thread.id, assistantMessageId: assistant.id,
      recipient: 'fixture', providerMessageIds: ids, client, sentAt: now.toISOString() });
    for (const id of ids) {
      const result = await resolveWhatsappQuotedDelivery({ userId, recipient: 'fixture', providerMessageId: id, detailed: true, client });
      assert.equal(result.status, 'resolved');
      assert.equal(result.target.message.id, assistant.id);
    }
  });

  await check('sender aliases preserve scoped quote lookup without broadening allowed recipients', async () => {
    const previous = process.env.LIFEOS_WHATSAPP_SENDER_ALIASES;
    process.env.LIFEOS_WHATSAPP_SENDER_ALIASES = 'fixture@c.us=fixture@lid';
    try {
      assert.equal(canonicalizeWhatsappSender('fixture@lid'), 'fixture@c.us');
      assert.equal(canonicalizeWhatsappSender('unknown@lid'), 'unknown@lid');
    } finally {
      if (previous === undefined) delete process.env.LIFEOS_WHATSAPP_SENDER_ALIASES;
      else process.env.LIFEOS_WHATSAPP_SENDER_ALIASES = previous;
    }
  });

  await check('grounded repeated shower report ensures one habit effect and negation does not write', async () => {
    await db.exec('delete from health_logs;');
    const actions = { ensureHealth: (args) => ensureAccountabilityHealth(args, { client, userId }) };
    const report = parseExplicitHealthSelfReport('DOCCIA FATTA', { now });
    const first = await resolveExplicitHealthSelfReport({ report, actions });
    const second = await resolveExplicitHealthSelfReport({ report, actions });
    assert.equal(first.actions.length, 1);
    assert.equal(second.actions.length, 0);
    const negative = await resolveExplicitHealthSelfReport({ report: parseExplicitHealthSelfReport('non ho fatto la doccia', { now }), actions });
    assert.equal(negative.actions.length, 0);
    const health = (await db.query('select hygiene,notes from health_logs')).rows[0];
    assert.equal(health.hygiene.shower.count, 1);
    assert.equal(health.notes, null);
  });

  await check('legacy malformed target hydrates only from its exact scoped outbox link', async () => {
    await db.exec('delete from brain_interaction_state; delete from brain_whatsapp_message_deliveries; delete from ai_chat_messages; delete from brain_outbox_messages; delete from ai_chat_threads;');
    const thread = (await db.query(`insert into ai_chat_threads(title) values ('legacy') returning *`)).rows[0];
    const queued = await enqueueOutboxMessage({ userId, client, recipient: 'fixture', body: candidate.body,
      ruleKey: candidate.rule_key, sourceType: candidate.source_type, sourceId: candidate.source_id,
      idempotencyKey: `legacy:${candidate.idempotency_key}`, scheduledFor: now.toISOString(), metadata: candidate.metadata });
    const message = (await client.from('ai_chat_messages').insert({ user_id: userId, thread_id: thread.id, role: 'assistant', content: candidate.body,
      metadata: { proactive_message: true, expected_reply_type: 'accountability', outbox_message_id: queued.row.id,
        source_type: 'accountability', source_id: queued.row.source_id, accountability: '[object Object]' } }).single()).data;
    const hydrated = await hydrateLegacyProactiveMessage({ message, userId, client });
    assert.equal(hydrated.metadata.accountability.kind, 'habit_missing');
    const mismatch = await hydrateLegacyProactiveMessage({ message: { ...message, metadata: { ...message.metadata, source_id: 'other' } }, userId, client });
    assert.equal(mismatch.metadata.accountability, '[object Object]');
  });

  for (const [kind, reply] of [['habit_missing', 'fatto'], ['wake_time_missing', '9.30'], ['sleep_start_missing', '2.30']]) {
    await check(`schema-backed journey ${kind}: generate -> enqueue -> claim -> ACK -> contract -> reply -> resolve`, async () => {
      await db.exec('delete from brain_interaction_state; delete from brain_whatsapp_message_deliveries; delete from brain_whatsapp_inbound_receipts; delete from ai_chat_messages; delete from brain_outbox_messages; delete from health_logs; delete from ai_chat_threads;');
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
      const thread = (await db.query(`insert into ai_chat_threads(title,metadata) values ('fixture',$1) returning id`, [{ source: 'whatsapp', whatsapp_sender: 'fixture' }])).rows[0];
      const persisted = await persistSentProactiveMessageToWhatsappThread({ userId, recipient: 'fixture', outboxMessage: sent, client,
        findThread: async () => thread });
      const repeatedPersistence = await persistSentProactiveMessageToWhatsappThread({ userId, recipient: 'fixture', outboxMessage: sent, client,
        findThread: async () => thread });
      assert.equal(repeatedPersistence.id, persisted.id);
      assert.equal((await db.query(`select count(*)::int as count from ai_chat_messages where metadata->>'outbox_message_id'=$1`, [sent.id])).rows[0].count, 1);
      assert.equal(persisted.metadata.accountability.kind, kind);
      await recordWhatsappMessageDelivery({ userId, threadId: thread.id, assistantMessageId: persisted.id,
        recipient: 'fixture', providerMessageId: `provider:${kind}`, outboxMessageId: sent.id,
        deliveryAttempt: sent.attempts, sentAt: now.toISOString(), client });
      const activeInteraction = await loadBrainInteractionState({ threadId: thread.id, userId, client, now });
      const conversation = { conversationHistory: [persisted] };
      const interactionSelection = selectBrainTurnInteraction({ message: reply, brainChat: conversation, activeInteraction, now });
      assert.equal(interactionSelection.path, 'proactive_reply');
      assert.equal(buildBrainTurnContract({ message: reply, source: 'whatsapp', brainChat: conversation, interactionSelection, now }).winning_path, 'proactive_reply');
      const actions = { updateHealthLog: (args) => ensureAccountabilityHealth(args, { client, userId }),
        logSleepStart: (args) => ensureAccountabilityHealth(args, { client, userId }),
        isResolved: (proactive) => accountabilityTargetIsResolved(proactive, { client, userId }),
        resolveTarget: (args) => resolveAccountabilityTarget({ ...args, client, userId }) };
      const result = await resolveProactiveWhatsappReply({ message: reply, brainChat: conversation, now, actions, selection: interactionSelection.proactive_selection });
      assert.equal(result.actions.length, 1);
      const repeated = await resolveProactiveWhatsappReply({ message: reply, brainChat: conversation, now, actions, selection: interactionSelection.proactive_selection });
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
