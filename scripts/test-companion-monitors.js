#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createReliabilityDatabase, fixtureUser } from '../tests/brain/reliabilityDatabase.js';
import { applyBeliefTransition } from '../api/_utils/brainBeliefs.js';
import { syncExternalContext } from '../api/_utils/brainExternalSync.js';
import { loadMonitorPermissions, normalizeMonitorPermissions } from '../api/_utils/brainMonitorPermissions.js';
import { createValidatedMonitor, loadDueMonitors, normalizeMonitorProposal, proposeProjectMonitorFromTurn, retireProjectMonitorFromTurn, transitionMonitorState } from '../api/_utils/brainMonitors.js';

const { db, client } = await createReliabilityDatabase();
const now = new Date();
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
  assert.equal(await retireProjectMonitorFromTurn({ message: 'I completed LifeOS.', userId: fixtureUser, client, now }), 1);
  assert.equal((await loadDueMonitors({ userId: fixtureUser, client, now })).length, 0);
  assert.equal((await transitionMonitorState({ monitorId: created.monitor.id, state: 'active', userId: fixtureUser, client, now })).status, 'unchanged');
  assert.equal((await client.from('brain_monitors').select('id').eq('user_id', fixtureUser)).data.length, 1);
  console.log('PASS monitor registry is typed, grounded, permission-gated, deduped and cross-channel resolvable');
} finally {
  await db.close();
}
