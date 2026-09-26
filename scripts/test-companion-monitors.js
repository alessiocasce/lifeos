#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createReliabilityDatabase, fixtureUser } from '../tests/brain/reliabilityDatabase.js';
import { applyBeliefTransition } from '../api/_utils/brainBeliefs.js';
import { syncExternalContext } from '../api/_utils/brainExternalSync.js';
import { loadMonitorPermissions, normalizeMonitorPermissions } from '../api/_utils/brainMonitorPermissions.js';
import { createValidatedMonitor, loadDueMonitors, normalizeMonitorProposal, proposeProjectMonitorFromTurn, retireProjectMonitorFromTurn, transitionMonitorState } from '../api/_utils/brainMonitors.js';
import { decideAttention, decideAccountabilityAttention, nextAvailableAttentionTime, recordAttentionDecision, recordAttentionOutbox } from '../api/_utils/brainAttentionEngine.js';
import { evaluateDueMonitors, evaluateProjectMonitorSignal, nextMonitorCheckAt } from '../api/_utils/brainMonitorEvaluation.js';
import { enqueueOutboxMessage, pollOutboxMessages, proactiveAssistantMetadata } from '../api/_utils/brainOutbox.js';
import { renderApprovedMonitorMessage } from '../api/_utils/brainButler.js';
import { selectProactiveReplyTarget, selectTrustedQuotedProactiveReplyTarget } from '../api/_utils/brainProactiveReplies.js';
import { resolveMonitorProactiveReply } from '../api/_utils/brainMonitorReplies.js';
import { selectBrainTurnInteraction } from '../api/_utils/brainInteractionSelection.js';

const { db, client } = await createReliabilityDatabase();
const now = new Date('2026-09-26T12:00:00.000Z');
const project = (await db.query(`insert into projects(user_id,name,goal_type,current_value,target_value)
  values ($1,'LifeOS','units',0,10) returning id`, [fixtureUser])).rows[0];
const proposal = { monitor_type: 'project_staleness', project_id: project.id,
  reason: 'Check momentum on an active project.', confidence: 0.82 };

try {
  assert.deepEqual(normalizeMonitorPermissions(), { observe: true, remember: true, monitor: false, message: false });
  assert.equal(normalizeMonitorProposal({ ...proposal, monitor_type: 'arbitrary_http' }), null);
  assert.equal(normalizeMonitorProposal({ ...proposal, reason: 'Use API key from env' }), null);
  assert.equal((await createValidatedMonitor({ proposal, userId: fixtureUser, client, now })).status, 'suggested');
  assert.equal((await client.from('brain_monitors').select('id').eq('user_id', fixtureUser)).data.length, 0);
  await applyBeliefTransition({ userId: fixtureUser, client, subjectType: 'companion_permission',
    subjectKey: 'companion.monitor', predicate: 'grant', value: { enabled: true },
    sourceType: 'user_explicit', confidence: 1, idempotencyKey: 'monitor-grant-1', effectiveFrom: now });
  assert.equal((await loadMonitorPermissions({ userId: fixtureUser, client })).monitor, true);
  assert.equal((await loadMonitorPermissions({ userId: fixtureUser, client })).message, false);
  const permissionSync = await syncExternalContext({ userId: fixtureUser, client, now, request: {
    idempotency_key: 'monitor-message-grant-1',
    source: { system: 'test', kind: 'explicit_conversation_sync', captured_at: now.toISOString() },
    summary: 'User explicitly grants low-risk proactive messages.',
    updates: [{ client_update_id: 'grant-message', type: 'monitor_permission', permission: 'message',
      enabled: true, confidence: 1, evidence_summary: 'User explicitly granted MESSAGE permission.' }],
  } });
  assert.equal(permissionSync.status, 'applied');
  assert.equal((await loadMonitorPermissions({ userId: fixtureUser, client })).message, true);
  const created = await createValidatedMonitor({ proposal, userId: fixtureUser, client, now,
    sourceChannel: 'app', sourceRef: { message_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' } });
  assert.equal(created.status, 'created');
  assert.equal(created.monitor.permission_basis, 'standing_monitor');
  assert.equal(created.monitor.source_ref.message_id, 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
  assert.equal((await createValidatedMonitor({ proposal, userId: fixtureUser, client, now, sourceChannel: 'whatsapp' })).monitor.id, created.monitor.id);
  assert.equal((await loadDueMonitors({ userId: fixtureUser, client, now, limit: 100 })).length, 1);
  assert.equal((await proposeProjectMonitorFromTurn({ message: 'I am working on LifeOS now.', channel: 'whatsapp',
    userId: fixtureUser, client, now })).monitor.id, created.monitor.id);
  const signal = { state: 'stale', importance: 3, confidence: 0.82, topic_key: created.monitor.topic_key,
    project_id: project.id, monitor_id: created.monitor.id };
  const quietTime = new Date('2026-09-26T22:30:00Z');
  assert.equal(decideAttention({ signal, permissions: { message: false }, now }).reason_code, 'message_permission_absent');
  assert.equal(decideAttention({ signal, permissions: { message: true }, now: quietTime }).reason_code, 'quiet_hours');
  assert.equal(nextAvailableAttentionTime(quietTime).toISOString(), '2026-09-27T06:00:00.000Z');
  assert.equal(nextMonitorCheckAt({ monitor: created.monitor, now: quietTime,
    decision: { reason_code: 'quiet_hours' } }), '2026-09-27T06:00:00.000Z');
  assert.equal(decideAttention({ signal, permissions: { message: true }, now, dismissalCount: 2 }).reason_code, 'repeated_dismissal');
  assert.equal(decideAttention({ signal: { ...signal, state: 'unchanged' }, permissions: { message: true }, now }).reason_code, 'no_meaningful_change');
  assert.equal(decideAttention({ signal, permissions: { message: true }, now,
    recentOutbox: Array.from({ length: 3 }, (_, i) => ({ id: `${i}`, status: 'sent', created_at: now.toISOString() })) }).reason_code, 'daily_interruption_cap');
  const accountabilityCandidate = { rule_key: 'accountability_habit_missing_shower' };
  assert.equal(decideAccountabilityAttention({ candidate: accountabilityCandidate, now: quietTime }).reason_code, 'quiet_hours');
  assert.equal(decideAccountabilityAttention({ candidate: accountabilityCandidate, now, dailyCount: 4 }).reason_code, 'daily_interruption_cap');
  assert.equal(decideAccountabilityAttention({ candidate: accountabilityCandidate, now, recentRows: [
    { rule_key: accountabilityCandidate.rule_key, status: 'sent', created_at: oldTime(2, now), metadata: { resolution: { type: 'no' } } },
    { rule_key: accountabilityCandidate.rule_key, status: 'sent', created_at: oldTime(3, now), metadata: { resolution: { type: 'later' } } },
  ] }).reason_code, 'repeated_dismissal');
  assert.equal(decideAccountabilityAttention({ candidate: accountabilityCandidate, now, recentRows: [
    { rule_key: accountabilityCandidate.rule_key, status: 'sent', created_at: oldTime(2, now) },
    { rule_key: accountabilityCandidate.rule_key, status: 'sent', created_at: oldTime(3, now) },
  ] }).reason_code, 'unanswered_suppression');
  const temporaryKey = `test-promotion:${created.monitor.id}`;
  const silent = await recordAttentionDecision({ userId: fixtureUser, client, monitor: created.monitor,
    eventKey: temporaryKey, decision: { decision: 'silent', reason_code: 'global_cooldown', importance: 3,
      confidence: 0.82 }, signal, now });
  const promoted = await recordAttentionDecision({ userId: fixtureUser, client, monitor: created.monitor,
    eventKey: temporaryKey, decision: { decision: 'message', reason_code: 'stale_project_high_confidence',
      importance: 3, confidence: 0.82 }, signal, now });
  assert.equal(promoted.duplicate, false);
  assert.equal(promoted.event.id, silent.event.id);
  assert.equal((await recordAttentionDecision({ userId: fixtureUser, client, monitor: created.monitor,
    eventKey: temporaryKey, decision: { decision: 'message', reason_code: 'stale_project_high_confidence',
      importance: 3, confidence: 0.82 }, signal, now })).duplicate, true);
  const approved = decideAttention({ signal, permissions: { message: true }, now });
  assert.equal(approved.decision, 'message');
  assert.equal(renderApprovedMonitorMessage({ monitor: created.monitor, signal, decision: { ...approved, decision: 'silent' } }), null);
  assert.match(renderApprovedMonitorMessage({ monitor: created.monitor, signal, decision: approved }), /LifeOS/);
  const oldActivity = new Date(now.getTime() - 24 * 86400000).toISOString();
  await db.query('update projects set created_at=$1, updated_at=$1 where id=$2', [oldActivity, project.id]);
  const staleProject = (await client.from('projects').select('*').eq('id', project.id).single()).data;
  assert.equal(evaluateProjectMonitorSignal({ monitor: created.monitor, project: staleProject, now }).state, 'stale');
  assert.equal(evaluateProjectMonitorSignal({ monitor: created.monitor, project: staleProject,
    sessionHistoryTruncated: true, now }).state, 'unchanged');
  const preview = await evaluateDueMonitors({ userId: fixtureUser, client, now, recipient: '111@c.us', preview: true });
  assert.equal(preview.candidates.length, 1);
  assert.equal((await client.from('brain_monitors').select('check_count').eq('id', created.monitor.id).single()).data.check_count, 0);
  assert.equal((await client.from('brain_attention_events').select('id').eq('user_id', fixtureUser)).data.length, 1);
  const evaluated = await evaluateDueMonitors({ userId: fixtureUser, client, now, recipient: '111@c.us' });
  assert.equal(evaluated.checked_count, 1);
  assert.equal(evaluated.candidates.length, 1);
  assert.equal(evaluated.candidates[0].source_type, 'monitor');
  const candidate = evaluated.candidates[0];
  const queued = await enqueueOutboxMessage({ userId: fixtureUser, client, recipient: candidate.recipient,
    body: candidate.body, priority: candidate.priority, ruleKey: candidate.rule_key,
    sourceType: candidate.source_type, sourceId: candidate.source_id,
    idempotencyKey: candidate.idempotency_key, scheduledFor: candidate.scheduled_for,
    expiresAt: candidate.expires_at, metadata: candidate.metadata });
  assert.equal(queued.duplicate, false);
  await recordAttentionOutbox({ eventId: candidate.metadata.attention_event_id, outboxId: queued.row.id,
    monitorId: created.monitor.id, userId: fixtureUser, client, now });
  assert.equal((await client.from('brain_attention_events').select('outbox_message_id').eq('user_id', fixtureUser)
    .eq('monitor_id', created.monitor.id).not('outbox_message_id', 'is', null).single()).data.outbox_message_id, queued.row.id);
  await client.from('brain_monitors').update({ next_check_at: created.monitor.next_check_at }).eq('id', created.monitor.id);
  assert.equal((await evaluateDueMonitors({ userId: fixtureUser, client, now, recipient: '111@c.us' })).candidates.length, 0);
  assert.equal((await client.from('brain_attention_events').select('id').eq('user_id', fixtureUser)).data.length, 2);
  assert.notEqual((await client.from('brain_monitors').select('next_check_at').eq('id', created.monitor.id).single()).data.next_check_at,
    created.monitor.next_check_at);
  assert.equal((await pollOutboxMessages({ recipient: '111@c.us', userId: fixtureUser, client, now: now.toISOString() })).length, 1);
  await client.from('brain_outbox_messages').update({ status: 'sent', sent_at: now.toISOString() }).eq('id', queued.row.id);
  assert.equal((await evaluateDueMonitors({ userId: fixtureUser, client, now, recipient: '111@c.us' })).candidates.length, 0);
  const assistant = { id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', role: 'assistant', created_at: now.toISOString(),
    content: queued.row.body, metadata: proactiveAssistantMetadata(queued.row) };
  const brainChat = { conversationHistory: [assistant] };
  const selected = selectProactiveReplyTarget({ message: 'no', brainChat, now });
  assert.equal(selected.reply_type, 'monitor');
  assert.equal(selected.proactive.source_id, created.monitor.id);
  const stale = selectProactiveReplyTarget({ message: 'no', brainChat,
    now: new Date(now.getTime() + 7 * 3600000) });
  assert.equal(stale.type, 'stale');
  assert.equal((await resolveMonitorProactiveReply({ message: 'no', selection: stale,
    userId: fixtureUser, client, now })).plan.needsWrite, false);
  assert.equal((await client.from('brain_monitors').select('metadata').eq('id', created.monitor.id).single()).data.metadata.dismissal_count, undefined);
  assert.equal(selectProactiveReplyTarget({ message: 'Segna memo domani', brainChat, now }).type, 'none');
  const trusted = selectTrustedQuotedProactiveReplyTarget({ message: 'not a priority', assistantMessage: assistant, now });
  assert.equal(trusted.type, 'target');
  assert.equal(trusted.reply_type, 'monitor');
  assert.equal(selectBrainTurnInteraction({ message: 'No. Cancella tutto', brainChat,
    pendingAction: { id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', action_type: 'create_memo' }, now }).path, 'pending_action');
  const firstReply = await resolveMonitorProactiveReply({ message: 'no', selection: selected, userId: fixtureUser, client, now });
  assert.equal(firstReply.plan.needsWrite, false);
  assert.deepEqual(firstReply.actions, []);
  assert.equal((await client.from('brain_monitors').select('state').eq('id', created.monitor.id).single()).data.state, 'active');
  assert.equal((await resolveMonitorProactiveReply({ message: 'no', selection: selected,
    userId: fixtureUser, client, now })).plan.reasoning, 'monitor_already_answered');
  const followup = await enqueueOutboxMessage({ userId: fixtureUser, client, recipient: '111@c.us',
    body: candidate.body, priority: 'low', ruleKey: candidate.rule_key, sourceType: 'monitor',
    sourceId: created.monitor.id, idempotencyKey: `${candidate.idempotency_key}:followup`,
    scheduledFor: now.toISOString(), metadata: candidate.metadata });
  await client.from('brain_outbox_messages').update({ status: 'sent', sent_at: now.toISOString() }).eq('id', followup.row.id);
  const followupSelection = selectTrustedQuotedProactiveReplyTarget({ message: 'not now',
    assistantMessage: { ...assistant, metadata: proactiveAssistantMetadata(followup.row) }, now });
  await resolveMonitorProactiveReply({ message: 'not now', selection: followupSelection, userId: fixtureUser, client, now });
  assert.equal((await client.from('brain_monitors').select('state').eq('id', created.monitor.id).single()).data.state, 'suspended');
  assert.equal(await retireProjectMonitorFromTurn({ message: 'I completed LifeOS.', userId: fixtureUser, client, now }), 1);
  assert.equal((await loadDueMonitors({ userId: fixtureUser, client, now })).length, 0);
  assert.equal((await transitionMonitorState({ monitorId: created.monitor.id, state: 'active', userId: fixtureUser, client, now })).status, 'unchanged');
  assert.equal((await client.from('brain_monitors').select('id').eq('user_id', fixtureUser)).data.length, 1);
  console.log('PASS monitor registry is typed, grounded, permission-gated, deduped and cross-channel resolvable');
} finally {
  await db.close();
}

function oldTime(days, date) { return new Date(date.getTime() - days * 86400000).toISOString(); }
