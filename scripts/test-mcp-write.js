#!/usr/bin/env node
import assert from 'node:assert/strict';
import { applyRoutineStateTransition, getCurrentRoutineBelief, listBeliefHistory } from '../api/_utils/brainBeliefs.js';
import { normalizeExternalSyncRequest, syncExternalContext } from '../api/_utils/brainExternalSync.js';
import { buildLifeOSContext } from '../api/_utils/lifeosContextCompiler.js';
import { createReliabilityDatabase, fixtureUser } from '../tests/brain/reliabilityDatabase.js';

const NOW = new Date('2026-09-25T12:00:00Z');
const CAPTURED = '2026-09-25T10:30:00Z';
const tests = [];
const request = (key, updates) => ({
  idempotency_key: key,
  source: { system: 'chatgpt', kind: 'explicit_conversation_sync', captured_at: CAPTURED, reference: 'conversation-opaque-1' },
  summary: 'User asked to sync current changes.',
  updates,
});
const routine = (id, state, extra = {}) => ({
  client_update_id: id, type: 'routine_state', routine_id: 'skin', state,
  confidence: 0.99, evidence_summary: 'User explicitly described their current skincare routine.', ...extra,
});

test('strict semantic envelope rejects unsupported and secret-like data', () => {
  assert.throws(() => normalizeExternalSyncRequest(request('sync-1', [{ ...routine('u1', 'inactive'), table: 'health_logs' }]), { now: NOW }), /unsupported fields/);
  assert.throws(() => normalizeExternalSyncRequest(request('sync-2', [routine('u1', 'inactive', { routine_id: 'unknown_habit' })]), { now: NOW }), /tracked Health routines/);
  assert.throws(() => normalizeExternalSyncRequest(request('sync-3', [{
    client_update_id: 'u1', type: 'preference', key: 'communication.style', value: 'Bearer abc', confidence: 0.99, evidence_summary: 'User asked for it.',
  }]), { now: NOW }), /invalid/);
  assert.throws(() => normalizeExternalSyncRequest(request('sync-4', [routine('u1', 'inactive'), routine('u1', 'active')]), { now: NOW }), /unique/);
});

test('routine sync supersedes current state, replays exactly, and conflicts on changed payload', async () => {
  const { db, client } = await createReliabilityDatabase();
  try {
    await applyRoutineStateTransition({ userId: fixtureUser, client, routineId: 'skin', state: 'active', idempotencyKey: 'seed:skin:active' });
    const input = request('routine-sync-1', [routine('u1', 'inactive')]);
    const first = await syncExternalContext({ request: input, userId: fixtureUser, client, now: NOW });
    assert.equal(first.status, 'applied');
    assert.equal(first.results[0].current_value.state, 'inactive');
    const current = await getCurrentRoutineBelief({ routineId: 'skin', userId: fixtureUser, client });
    assert.equal(current.value.state, 'inactive');
    assert.equal(current.source_type, 'external_sync');
    assert.equal(current.provenance.evidence_summary, routine('u1', 'inactive').evidence_summary);
    const replay = await syncExternalContext({ request: input, userId: fixtureUser, client, now: NOW });
    assert.equal(replay.idempotent_replay, true);
    assert.deepEqual(replay.results, first.results);
    assert.equal((await listBeliefHistory({ userId: fixtureUser, client, subjectType: 'routine', subjectKey: 'health.habit.skin', predicate: 'status' })).length, 2);
    await assert.rejects(() => syncExternalContext({ request: request('routine-sync-1', [routine('u1', 'active')]), userId: fixtureUser, client, now: NOW }), /different content/);
  } finally { await db.close(); }
});

test('preference supersession and grounded project context reach the shared compiler', async () => {
  const { db, client } = await createReliabilityDatabase();
  try {
    const projectId = '22222222-2222-4222-8222-222222222222';
    const inserted = await client.from('projects').insert({
      id: projectId, user_id: fixtureUser, name: 'Hair Style', status: 'active', target_value: 20, current_value: 4,
    }).select().single();
    assert.equal(inserted.error, null);
    const pref = (text) => ({ client_update_id: 'p1', type: 'preference', key: 'communication.style', value: text, confidence: 0.96, evidence_summary: 'Explicit communication preference.' });
    await syncExternalContext({ request: request('pref-1', [pref('concise and casual')]), userId: fixtureUser, client, now: NOW });
    await syncExternalContext({ request: request('pref-2', [pref('concise, casual, more detail when asked')]), userId: fixtureUser, client, now: NOW });
    const projectSync = await syncExternalContext({ request: request('project-1', [{
      client_update_id: 'x1', type: 'project_context', project_name: ' hair  style ', field: 'current_focus',
      value: 'client feedback and booking integration', confidence: 0.96, evidence_summary: 'User confirmed the current project focus.',
    }]), userId: fixtureUser, client, now: NOW });
    assert.equal(projectSync.status, 'applied');
    const beliefs = (await client.from('brain_beliefs').select('*').eq('user_id', fixtureUser).eq('record_status', 'current')).data;
    const context = buildLifeOSContext({ rows: { projects: [inserted.data], beliefs }, now: NOW });
    assert.equal(context.beliefs.preferences[0].value.value, 'concise, casual, more detail when asked');
    assert.equal(context.beliefs.project_context[0].value.value, 'client feedback and booking integration');
    const history = (await client.from('brain_beliefs').select('*').eq('user_id', fixtureUser).eq('subject_type', 'preference')).data;
    assert.equal(history.length, 2);
    assert.equal(history.filter((row) => row.record_status === 'current').length, 1);
    const project = (await client.from('projects').select('*').eq('user_id', fixtureUser).eq('id', projectId).maybeSingle()).data;
    assert.equal(Number(project.current_value), 4);
  } finally { await db.close(); }
});

test('invalid mixed and unknown/ambiguous project requests write nothing', async () => {
  const { db, client } = await createReliabilityDatabase();
  try {
    const project = (name, id) => ({ id, user_id: fixtureUser, name, status: 'active', target_value: 10 });
    await client.from('projects').insert(project('Hair Style', '22222222-2222-4222-8222-222222222222'));
    await client.from('projects').insert(project(' hair   style ', '33333333-3333-4333-8333-333333333333'));
    const projectUpdate = (name) => ({ client_update_id: 'x1', type: 'project_context', project_name: name, field: 'next_action', value: 'Ask for feedback', confidence: 0.9, evidence_summary: 'Explicit project action.' });
    for (const [key, update] of [['unknown-1', projectUpdate('Unknown')], ['ambiguous-1', projectUpdate('Hair Style')]]) {
      await assert.rejects(() => syncExternalContext({ request: request(key, [routine('u1', 'inactive'), update]), userId: fixtureUser, client, now: NOW }), /Project/);
    }
    await assert.rejects(() => syncExternalContext({ request: request('mixed-1', [routine('u1', 'inactive'), { ...routine('u2', 'active'), type: 'unsupported' }]), userId: fixtureUser, client, now: NOW }), /Unsupported/);
    assert.equal((await client.from('brain_beliefs').select('*').eq('user_id', fixtureUser)).data.length, 0);
    assert.equal((await client.from('brain_external_sync_requests').select('*').eq('user_id', fixtureUser)).data.length, 0);
    assert.equal((await client.from('projects').select('*').eq('user_id', fixtureUser)).data.length, 2);
  } finally { await db.close(); }
});

test('successful sync changes only beliefs and audit, never operational tables', async () => {
  const { db, client } = await createReliabilityDatabase();
  try {
    const result = await syncExternalContext({ request: request('isolated-1', [routine('u1', 'inactive')]), userId: fixtureUser, client, now: NOW });
    assert.equal(result.status, 'applied');
    for (const table of ['health_logs', 'memos', 'brain_outbox_messages', 'brain_proactive_rules', 'project_sessions']) {
      const rows = await client.from(table).select('*').eq('user_id', fixtureUser);
      assert.equal(rows.data.length, 0, `${table} was unexpectedly modified`);
    }
    assert.equal((await client.from('brain_external_sync_requests').select('*').eq('user_id', fixtureUser)).data.length, 1);
  } finally { await db.close(); }
});

for (const entry of tests) {
  try { await entry.fn(); console.log(`PASS ${entry.name}`); }
  catch (error) { console.error(`FAIL ${entry.name}: ${error.message}`); process.exitCode = 1; }
}
if (!process.exitCode) console.log(`MCP semantic sync: ${tests.length} tests passed.`);

function test(name, fn) { tests.push({ name, fn }); }
