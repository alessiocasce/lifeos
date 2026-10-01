import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createReliabilityDatabase, fixtureUser } from '../tests/brain/reliabilityDatabase.js';
import { readProjectWatch, mutateCompanionApp } from '../api/_utils/companionApp.js';
import { applyBeliefTransition } from '../api/_utils/brainBeliefs.js';
import { createActionsHandler } from '../api/ai/actions.js';
import { HttpError } from '../api/_utils/http.js';

const { db, client } = await createReliabilityDatabase();
const now = new Date();
const userId = fixtureUser;
const other = '22222222-2222-4222-8222-222222222222';
const mutate = (body) => mutateCompanionApp({ userId, client, now, body });
const grant = (permission, enabled, request_id = crypto.randomUUID()) => mutate({ action: 'companion_permission', permission, enabled, request_id });
try {
  const project = (await db.query("insert into projects(user_id,name,goal_type,current_value,target_value) values ($1,'Launch project','units',0,10) returning id", [userId])).rows[0];
  const read = () => readProjectWatch({ userId, projectId: project.id, client, now });
  const write = (operation, watch_id) => mutate({ action: 'project_watch', project_id: project.id, operation, ...(watch_id ? { watch_id } : {}) });
  assert.equal((await read()).watch, null);
  await assert.rejects(write('enable'), { status: 403 });
  await assert.rejects(mutate({ action: 'companion_permission', permission: 'admin', enabled: true, request_id: crypto.randomUUID() }), { status: 400 });
  await assert.rejects(mutate({ action: 'project_watch', project_id: project.id, operation: 'enable', user_id: other }), { status: 400 });
  const key = crypto.randomUUID();
  await grant('monitor', true, key);
  await grant('monitor', true, key);
  assert.equal((await db.query("select count(*)::int as n from brain_beliefs where subject_key='companion.monitor'")).rows[0].n, 1);
  const enabled = await write('enable');
  assert.equal(enabled.watch.state, 'active');
  assert.equal(enabled.permissions.message, false);
  const id = enabled.watch.id;
  assert.equal((await write('enable', id)).watch.id, id);
  const persisted = (await db.query('select * from brain_monitors where id=$1', [id])).rows[0];
  assert.equal(persisted.permission_basis, 'standing_monitor');
  assert.equal(persisted.monitor_type, 'project_staleness');
  assert.equal((await write('suspend', id)).watch.state, 'suspended');
  await grant('monitor', false);
  await assert.rejects(write('enable', id), { status: 403 });
  await grant('monitor', true);
  assert.equal((await write('enable', id)).watch.state, 'active');
  await assert.rejects(write('suspend', crypto.randomUUID()), { status: 409 });
  await applyBeliefTransition({ userId, client, subjectType: 'project_context', subjectKey: `project.${project.id}`,
    predicate: 'next_action', value: { value: 'Review the release checklist.' }, sourceType: 'user_explicit',
    confidence: 1, effectiveFrom: now, idempotencyKey: 'watch-context' });
  assert.deepEqual((await read()).context, [{ field: 'next_action', text: 'Review the release checklist.' }]);
  assert.equal((await write('retire', id)).watch.state, 'retired');
  await assert.rejects(write('enable', id), { status: 409 });
  const paused = (await db.query("insert into projects(user_id,name,status,goal_type,current_value,target_value) values ($1,'Paused project','paused','tasks',0,1) returning id", [userId])).rows[0];
  await assert.rejects(mutate({ action: 'project_watch', project_id: paused.id, operation: 'enable' }), { status: 409 });
  await db.query("update projects set status='active' where id=$1", [paused.id]);
  const expiring = await mutate({ action: 'project_watch', project_id: paused.id, operation: 'enable' });
  const future = new Date(now.getTime() + 46 * 86400000);
  assert.equal((await readProjectWatch({ userId, projectId: paused.id, client, now: future })).watch.state, 'expired');
  await assert.rejects(mutateCompanionApp({ userId, client, now: future, body: {
    action: 'project_watch', project_id: paused.id, operation: 'enable', watch_id: expiring.watch.id,
  } }), { status: 409 });
  await db.query('insert into auth.users values ($1)', [other]);
  await assert.rejects(readProjectWatch({ userId: other, projectId: project.id, client, now }), { status: 404 });
  await assert.rejects(mutateCompanionApp({ userId: other, client, now, body: { action: 'project_watch', project_id: project.id, operation: 'suspend', watch_id: id } }), { status: 404 });
  for (const table of ['brain_outbox_messages', 'brain_attention_events', 'ai_action_logs']) {
    assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0);
  }
  console.log('PASS app Watch: permission gating, typed persistence, replay, suspend/resume/retire, scoping, current context and no delivery side effects');

  let writes = 0;
  const handler = createActionsHandler({
    requireUser: async (token) => { if (token !== 'test-session') throw new HttpError(403, 'Wrong account.'); return { id: userId }; },
    mutate: async (args) => { assert.equal(args.userId, userId); writes += 1; return { watch: null }; },
    readWatch: async (args) => { assert.equal(args.userId, userId); return { watch: null }; },
  });
  async function call(token, method = 'POST', url = '/api/ai/actions') {
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value ? JSON.parse(value) : null; } };
    await handler({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, body: { action: 'project_watch' } }, res);
    return res;
  }
  assert.equal((await call(null)).statusCode, 401);
  assert.equal((await call('another-session')).statusCode, 403);
  const oldToken = process.env.LIFEOS_ACTION_TOKEN;
  process.env.LIFEOS_ACTION_TOKEN = 'test-automation';
  try { assert.equal((await call('test-automation')).statusCode, 401); }
  finally { if (oldToken === undefined) delete process.env.LIFEOS_ACTION_TOKEN; else process.env.LIFEOS_ACTION_TOKEN = oldToken; }
  assert.equal(writes, 0);
  assert.equal((await call('test-session')).statusCode, 200);
  assert.equal(writes, 1);
  const readResponse = await call('test-session', 'GET', `/api/ai/actions?view=project_watch&project_id=${project.id}`);
  assert.equal(readResponse.statusCode, 200);
  assert.equal(readResponse.headers['cache-control'], 'no-store');
  console.log('PASS app route: absent/invalid/automation credentials denied, verified user scoped, successful reads never cached');
} finally { await db.close(); }
