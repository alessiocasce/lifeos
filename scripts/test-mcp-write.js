#!/usr/bin/env node
import assert from 'node:assert/strict';
import { applyRoutineStateTransition, getCurrentRoutineBelief, listBeliefHistory } from '../api/_utils/brainBeliefs.js';
import { normalizeExternalSyncRequest, syncExternalContext } from '../api/_utils/brainExternalSync.js';
import { buildLifeOSContext, compileLifeOSContext } from '../api/_utils/lifeosContextCompiler.js';
import { buildAccountabilityProactiveCandidates } from '../api/_utils/brainProactiveAccountability.js';
import { handleMcpJsonRpcRequest, validateMcpAuth } from '../api/mcp.js';
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
  assert.throws(() => normalizeExternalSyncRequest(request('sync-5', [routine('u1', 'inactive'), routine('u2', 'active')]), { now: NOW }), /distinct current belief/);
});

test('MCP read credentials cannot sync while a separate write credential can, then reads see current state', async () => {
  const { db, client } = await createReliabilityDatabase();
  try {
    const env = { LIFEOS_MCP_TOKEN: 'read-fixture', LIFEOS_MCP_WRITE_TOKEN: 'write-fixture' };
    const readAuth = validateMcpAuth({ headers: { authorization: 'Bearer read-fixture' } }, env);
    const writeAuth = validateMcpAuth({ headers: { authorization: 'Bearer write-fixture' } }, env);
    const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'sync_context', arguments: request('mcp-1', [routine('u1', 'inactive')]) } };
    const denied = await handleMcpJsonRpcRequest(call, { userId: fixtureUser, client, now: NOW, scopes: readAuth.scopes });
    assert.equal(denied.error.code, -32003);
    assert.equal((await client.from('brain_beliefs').select('*').eq('user_id', fixtureUser)).data.length, 0);
    const applied = await handleMcpJsonRpcRequest(call, { userId: fixtureUser, client, now: NOW, scopes: writeAuth.scopes });
    assert.equal(applied.result.structuredContent.status, 'applied');
    const read = await handleMcpJsonRpcRequest({
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_current_beliefs', arguments: {} },
    }, { userId: fixtureUser, client, scopes: readAuth.scopes });
    assert.equal(read.result.structuredContent.beliefs[0].value.state, 'inactive');
    const replay = await handleMcpJsonRpcRequest(call, { userId: fixtureUser, client, now: NOW, scopes: writeAuth.scopes });
    assert.equal(replay.result.structuredContent.idempotent_replay, true);
    assert.equal((await client.from('brain_beliefs').select('*').eq('user_id', fixtureUser)).data.length, 1);
  } finally { await db.close(); }
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
    const candidatesFor = (belief) => buildAccountabilityProactiveCandidates({
      healthLogs: [{ logged_on: '2026-09-25', wake_time: '08:00', sleep_start: '00:30', hygiene: {} }],
      routineBeliefs: [belief], recipient: 'fixture@lid', now: new Date('2026-09-25T21:45:00Z'),
    }).filter((candidate) => candidate.metadata?.accountability?.habit_id === 'skin');
    assert.equal(candidatesFor(current).length, 0);
    const replay = await syncExternalContext({ request: input, userId: fixtureUser, client, now: NOW });
    assert.equal(replay.idempotent_replay, true);
    assert.deepEqual(replay.results, first.results);
    assert.equal((await listBeliefHistory({ userId: fixtureUser, client, subjectType: 'routine', subjectKey: 'health.habit.skin', predicate: 'status' })).length, 2);
    await assert.rejects(() => syncExternalContext({ request: request('routine-sync-1', [routine('u1', 'active')]), userId: fixtureUser, client, now: NOW }), /different content/);
    await syncExternalContext({ request: request('routine-sync-2', [routine('u1', 'active')]), userId: fixtureUser, client, now: NOW });
    assert(candidatesFor(await getCurrentRoutineBelief({ routineId: 'skin', userId: fixtureUser, client })).length > 0);
  } finally { await db.close(); }
});

test('partial runtime failure resumes per-item without repeating the first belief transition', async () => {
  const { db, client } = await createReliabilityDatabase();
  try {
    let calls = 0;
    const flakyClient = {
      from: (table) => client.from(table),
      rpc: async (name, args) => {
        calls += 1;
        if (calls === 2) return { data: null, error: { code: 'temporary_failure' } };
        return client.rpc(name, args);
      },
    };
    const input = request('partial-1', [routine('u1', 'inactive'), {
      client_update_id: 'u2', type: 'preference', key: 'communication.style', value: 'concise and casual', confidence: 0.95,
      evidence_summary: 'Explicit preference.',
    }]);
    const partial = await syncExternalContext({ request: input, userId: fixtureUser, client: flakyClient, now: NOW });
    assert.equal(partial.status, 'partial');
    assert.equal(partial.results[0].status, 'applied');
    assert.equal(partial.results[1].status, 'failed');
    const completed = await syncExternalContext({ request: input, userId: fixtureUser, client, now: NOW });
    assert.equal(completed.status, 'applied');
    assert.equal(completed.results.length, 2);
    assert.equal((await client.from('brain_beliefs').select('*').eq('user_id', fixtureUser)).data.length, 2);
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
    const compiled = await compileLifeOSContext({ userId: fixtureUser, client, now: NOW });
    assert.equal(compiled.beliefs.preferences[0].value.value, 'concise, casual, more detail when asked');
    assert.equal(compiled.beliefs.project_context[0].project_name, 'Hair Style');
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
    const otherUser = '44444444-4444-4444-8444-444444444444';
    await db.exec(`insert into auth.users(id) values ('${otherUser}')`);
    await client.from('projects').insert({ ...project('Private Project', '55555555-5555-4555-8555-555555555555'), user_id: otherUser });
    const projectUpdate = (name) => ({ client_update_id: 'x1', type: 'project_context', project_name: name, field: 'next_action', value: 'Ask for feedback', confidence: 0.9, evidence_summary: 'Explicit project action.' });
    for (const [key, update] of [['unknown-1', projectUpdate('Unknown')], ['ambiguous-1', projectUpdate('Hair Style')]]) {
      await assert.rejects(() => syncExternalContext({ request: request(key, [routine('u1', 'inactive'), update]), userId: fixtureUser, client, now: NOW }), /Project/);
    }
    await assert.rejects(() => syncExternalContext({ request: request('foreign-1', [{
      ...projectUpdate('Private Project'), project_id: '55555555-5555-4555-8555-555555555555',
    }]), userId: fixtureUser, client, now: NOW }), /Project/);
    await assert.rejects(() => syncExternalContext({ request: request('duplicate-project-1', [
      { ...projectUpdate('Hair Style'), project_id: '22222222-2222-4222-8222-222222222222' },
      { ...projectUpdate('Hair Style'), client_update_id: 'x2', project_id: null },
    ]), userId: fixtureUser, client, now: NOW }), /distinct current belief|ambiguous/);
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
    for (const table of ['health_logs', 'memos', 'calendar_events', 'expenses', 'ai_action_logs', 'brain_outbox_messages', 'brain_proactive_rules', 'project_sessions']) {
      const rows = await client.from(table).select('*').eq('user_id', fixtureUser);
      assert.equal(rows.data.length, 0, `${table} was unexpectedly modified`);
    }
    assert.equal((await client.from('brain_external_sync_requests').select('*').eq('user_id', fixtureUser)).data.length, 1);
  } finally { await db.close(); }
});

test('autobiographical sync requires write scope, grounds projects, replays and remains read-only to search', async () => {
  const { db, client } = await createReliabilityDatabase();
  try {
    const project = (await db.query(`insert into projects(user_id,name,goal_type,current_value,target_value)
      values ($1,'LifeOS','units',0,10) returning id`, [fixtureUser])).rows[0];
    const update = {
      client_update_id: 'memory-1', type: 'autobiographical_memory', memory_kind: 'project_memory',
      category: 'project', title: 'LifeOS decision',
      content: 'LifeOS will use a WhatsApp-first capture flow.', project_id: project.id,
      confidence: 0.97, importance: 5,
      evidence_summary: 'User explicitly decided LifeOS should use WhatsApp-first capture.',
    };
    const call = { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'sync_context', arguments: request('memory-sync-1', [update]) } };
    const read = { userId: fixtureUser, client, now: NOW, scopes: ['lifeos.read'] };
    const write = { ...read, scopes: ['lifeos.write'] };
    assert.equal((await handleMcpJsonRpcRequest(call, read)).error.code, -32003);
    const applied = await handleMcpJsonRpcRequest(call, write);
    assert.equal(applied.result.structuredContent.status, 'applied');
    assert.equal(applied.result.structuredContent.results[0].memory_kind, 'project_memory');
    const replay = await handleMcpJsonRpcRequest(call, write);
    assert.equal(replay.result.structuredContent.idempotent_replay, true);
    assert.equal((await client.from('ai_memories').select('*').eq('user_id', fixtureUser)).data.length, 1);
    const search = await handleMcpJsonRpcRequest({
      jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'search_memory', arguments: { query: 'WhatsApp capture', limit: 3 } },
    }, read);
    assert.equal(search.result.structuredContent.memories[0].project_id, project.id);
    assert.equal(search.result.structuredContent.memories[0].kind, 'project_memory');
    await assert.rejects(() => syncExternalContext({ request: request('bad-project-memory', [{ ...update, project_id: '22222222-2222-4222-8222-222222222222' }]), userId: fixtureUser, client, now: NOW }), /Project/);
    assert.equal((await client.from('brain_external_sync_requests').select('*').eq('user_id', fixtureUser)).data.length, 1);
    for (const table of ['health_logs', 'memos', 'calendar_events', 'expenses', 'brain_outbox_messages', 'project_sessions']) {
      assert.equal((await client.from(table).select('*').eq('user_id', fixtureUser)).data.length, 0, `${table} was modified`);
    }
  } finally { await db.close(); }
});

for (const entry of tests) {
  try { await entry.fn(); console.log(`PASS ${entry.name}`); }
  catch (error) { console.error(`FAIL ${entry.name}: ${error.message}`); process.exitCode = 1; }
}
if (!process.exitCode) console.log(`MCP semantic sync: ${tests.length} tests passed.`);

function test(name, fn) { tests.push({ name, fn }); }
