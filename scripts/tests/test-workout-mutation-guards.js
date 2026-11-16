import assert from 'node:assert/strict';
import fs from 'node:fs';

// Evaluate the actual service with a recording PostgREST builder, without auth/network.
const source = fs.readFileSync('src/services/lifeosApi.js', 'utf8')
  .replace(/^import .+;\r?$/gm, '')
  .replace(/export const /g, 'const ')
  .replace(/import\.meta\.env/g, '({})');
let calls;
let response;
const builder = {};
for (const method of ['from', 'update', 'delete', 'eq', 'is', 'select', 'single', 'order', 'limit', 'or', 'maybeSingle', 'rpc']) {
  builder[method] = (...args) => { calls.push([method, ...args]); return builder; };
}
builder.then = (resolve, reject) => Promise.resolve(response).then(resolve, reject);
const { workoutApi, workoutSetApi } = new Function('supabase', 'isSupabaseConfigured', `${source}\nreturn { workoutApi, workoutSetApi };`)(builder, true);
const stamp = '2026-10-01T10:00:00.123456+00:00';
const ended = '2026-10-01T11:00:00+00:00';
const reset = () => { calls = []; response = { data: { id: 'row', workout_id: 'workout' }, error: null }; };
for (const [api, session] of [[workoutApi, true], [workoutSetApi, false]]) {
  for (const options of [undefined, {}, { expectedUpdatedAt: undefined }, { expectedUpdatedAt: stamp }, ...(session ? [{ expectedEndedAt: ended }, { expectedEndedAt: null }, { expectedUpdatedAt: stamp, expectedEndedAt: ended }] : [])]) {
    const guarded = options?.expectedUpdatedAt !== undefined || (session && options?.expectedEndedAt !== undefined);
    reset();
    await api.update('row', { notes: 'Correction' }, options);
    assert.deepEqual(calls.find(call => call[0] === 'update')[1], { notes: 'Correction' }, 'guards never write ended_at');
    assert.ok(calls.some(call => call[0] === 'single'));
    if (options?.expectedUpdatedAt !== undefined) assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'updated_at' && call[2] === stamp));
    if (session && options?.expectedEndedAt !== undefined) assert.ok(calls.some(call => call[0] === (options.expectedEndedAt === null ? 'is' : 'eq') && call[1] === 'ended_at' && call[2] === options.expectedEndedAt));
    reset();
    await api.delete('row', options);
    assert.equal(calls.some(call => call[0] === 'single'), Boolean(guarded));
    assert.equal(calls.some(call => call[0] === 'select' && call[1] === 'id'), Boolean(guarded));
    if (!guarded) assert.deepEqual(calls.map(call => call[0]), ['from', 'delete', 'eq']);
  }
  for (const operation of ['update', 'delete']) {
    reset();
    const conflict = { code: 'PGRST116', message: 'No matching row' };
    response = { data: null, error: conflict };
    const args = operation === 'update' ? ['row', { reps: 9 }, { expectedUpdatedAt: stamp }] : ['row', { expectedUpdatedAt: stamp }];
    await assert.rejects(api[operation](...args), /This record changed since it was loaded/);
  }
}
reset();
await workoutSetApi.delete('row', { expectedEndedAt: ended });
assert.deepEqual(calls.map(call => call[0]), ['from', 'delete', 'eq'], 'set API does not accept parent completion predicate');
console.log('PASS service guards: exact timestamp/state filters, SQL null predicate, unchanged payloads, single-row errors and legacy delete behavior');

reset();
response.data = Array.from({ length: 26 }, (_, i) => ({ id: '11111111-1111-4111-8111-' + String(i).padStart(12,'0'),
  performed_on: '2026-11-01', started_at: stamp, workout_sets: [] }));
const firstPage = await workoutApi.page();
assert.equal(firstPage.rows.length, 25);
assert.equal(firstPage.hasMore, true);
assert.equal(firstPage.cursor.started, stamp, 'cursor retains Postgres microseconds');
assert.ok(calls.some(call => call[0] === 'limit' && call[1] === 26));
calls = [];
await workoutApi.page(firstPage.cursor);
assert.ok(calls.find(call => call[0] === 'or')[1].includes('started_at.is.null'), 'older null-start rows remain reachable');
calls = [];
await workoutApi.page({ ...firstPage.cursor, started: null });
assert.ok(calls.find(call => call[0] === 'or')[1].includes('started_at.is.null,id.lt.'));
await assert.rejects(workoutApi.page({ date: 'invalid', started: null, id: 'injected' }), /Invalid/);
console.log('PASS actual service keyset contract: bounded page+lookahead, precise timestamp/UUID ties, null-start continuation and cursor validation');

// Execute each actual wrapper around a deferred API call to simulate A -> B/logout.
const context = fs.readFileSync('src/context/LifeOSContext.jsx', 'utf8');
for (const [name, next, apiName, method, update] of [
  ['updateWorkoutSession', 'endWorkoutSession', 'workoutApi', 'update', true],
  ['deleteWorkoutSession', 'createWorkoutSet', 'workoutApi', 'delete', false],
  ['updateWorkoutSet', 'deleteWorkoutSet', 'workoutSetApi', 'update', true],
  ['deleteWorkoutSet', 'deleteWorkoutExercise', 'workoutSetApi', 'delete', false],
]) {
  const start = context.indexOf(`      ${name}: async`);
  const end = context.indexOf(`      ${next}:`, start);
  assert.ok(start >= 0 && end > start);
  for (const destination of ['B', null, 'A']) {
    const lastAuthUserId = { current: 'A' };
    let finish;
    let sideEffects = 0;
    let forwarded;
    const mockApi = { [method]: (...args) => {
      forwarded = args;
      return new Promise(resolve => { finish = resolve; });
    } };
    const effect = () => { sideEffects++; };
    const wrapper = new Function(apiName, 'authUser', 'lastAuthUserId', 'clearWorkoutDraft', 'setWorkoutSessions', 'workoutSessions', 'activeWorkoutId', 'setActiveWorkoutId', 'today', 'compareWorkoutSets',
      `return ({${context.slice(start, end)}}).${name};`)(mockApi, { id: 'A' }, lastAuthUserId, effect, effect, [], null, effect, () => '2026-10-01', () => 0);
    const options = { expectedUpdatedAt: stamp, ...(name.includes('Session') ? { expectedEndedAt: ended } : {}) };
    const args = update ? ['row', { notes: 'Correction' }, options] : ['row', options];
    const pending = wrapper(...args);
    assert.deepEqual(forwarded, args);
    lastAuthUserId.current = destination;
    finish({ id: 'row', workout_id: 'workout', ended_at: ended });
    if (destination !== 'A') {
      await assert.rejects(pending, /Account changed/);
      assert.equal(sideEffects, 0, `${name} must not mutate state/storage after account change`);
    } else {
      await pending;
      assert.ok(sideEffects > 0);
    }
  }
}
console.log('PASS all four context wrappers forward options and reject A -> B/logout responses before state or draft changes; same-account success preserved');

const atomicStart = context.indexOf('      deleteWorkoutExercise: async');
const atomicEnd = context.indexOf('      reloadWorkoutTemplates:', atomicStart);
const atomicWrapper = context.slice(atomicStart, atomicEnd).trim().replace(/^deleteWorkoutExercise:\s*/, '').replace(/,$/, '');
for (const destination of ['A', 'B', null]) {
  let finish;
  let effects = 0;
  const identity = { current: 'A' };
  const wrapper = new Function('authUser', 'lastAuthUserId', 'workoutSetApi', 'setWorkoutSessions', `return ${atomicWrapper}`)(
    { id: 'A' }, identity, { deleteExercise: () => new Promise(resolve => { finish = resolve; }) }, () => { effects++; });
  const pending = wrapper('workout', ended, [{ id: 'set', updated_at: stamp }]);
  identity.current = destination;
  finish(['set']);
  if (destination === 'A') { await pending; assert.equal(effects, 1); }
  else { await assert.rejects(pending, /Account changed/); assert.equal(effects, 0); }
}
console.log('PASS atomic exercise wrapper rejects stale-account results before applying its returned IDs');
