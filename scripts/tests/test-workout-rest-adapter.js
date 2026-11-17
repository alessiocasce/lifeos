import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createWorkoutRestCoordinator } from '../../src/utils/workoutRestCoordinator.js';

// Exercise the production adapter; substitute only auth, database and browser transports.
let user = 'A', current = true, pause = null;
let recovery = null;
const requests = [];
const preference = { enabled: true, seconds: 60, notifications: false };
globalThis.__restClient = {
  auth: { getSession: async () => ({ data: { session: { user: { id: user }, access_token: `token-${user}` } } }) },
  from(table) { return query(table); },
  rpc(name, args) { return query(name, args); },
};
function query(table, args) {
  const request = { table, args, filters: [], token: null };
  const q = {
    select() { return q; }, eq(...filter) { request.filters.push(filter); return q; },
    in() { return q; }, order() { return q; }, limit() { return q; }, maybeSingle() { return q; },
    upsert(value) { request.value = value; return q; },
    setHeader(_name, token) { request.token = token; return q; },
    async then(resolve, reject) {
      requests.push(request);
      if (pause) { const action = pause; pause = null; await action(); }
      if (recovery && table === 'workout_web_rest_preferences') {
        if (request.value) {
          recovery.saves++;
          if (recovery.mode === 'lost') recovery.preference = request.value;
          if (recovery.mode !== 'ok') return Promise.resolve({ error: { message: 'private database detail' } }).then(resolve, reject);
          recovery.preference = request.value;
        } else {
          recovery.reads++;
          if (recovery.readFails) return Promise.resolve({ error: { message: 'private read detail' } }).then(resolve, reject);
        }
        return Promise.resolve({ data: recovery.preference }).then(resolve, reject);
      }
      return Promise.resolve({ data: table === 'workout_web_rest_preferences' ? preference : [] }).then(resolve, reject);
    },
  };
  return q;
}
const source = fs.readFileSync('src/services/workoutRestApi.js', 'utf8')
  .replace("import { supabase } from '../lib/supabaseClient';", 'const supabase = globalThis.__restClient;')
  .replace("'../utils/workoutRest'", JSON.stringify(pathToFileURL(`${process.cwd()}/src/utils/workoutRest.js`).href))
  .replace("'../utils/workoutPushDevice'", JSON.stringify(pathToFileURL(`${process.cwd()}/src/utils/workoutPushDevice.js`).href));
const { workoutRestApi: api } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const guard = { isCurrent: () => current };
user = 'B';
await assert.rejects(api.read('workout-a', 'A', guard), /Account changed/);
await assert.rejects(api.cancel('workout-a', 'A', guard), /Account changed/);
assert.equal(requests.length, 0, 'stale owner cannot issue reads or cancellation');
user = 'A';
await api.read('workout-a', 'A', guard);
assert.deepEqual(requests[1].filters, [['user_id', 'A'], ['workout_id', 'workout-a']]);
assert.ok(requests.every(request => request.token === 'Bearer token-A'));
await api.cancel('workout-a', 'A', guard);
assert.deepEqual(requests.at(-1).args, { p_workout_id: 'workout-a' });
await api.cancel();
assert.deepEqual(requests.at(-1).args, { p_workout_id: null }, 'logout cancel-all remains available');
console.log('PASS expected-owner reads, filtered timer, captured credentials and logout cancellation');
const getSession = globalThis.__restClient.auth.getSession;
let finishIdentity;
globalThis.__restClient.auth.getSession = () => new Promise(resolve => { finishIdentity = resolve; });
const staleCancel = api.cancel('workout-a', 'A', guard);
const beforeCancel = requests.length;
user = 'B';
finishIdentity(await getSession());
await assert.rejects(staleCancel, /Account changed/);
assert.equal(requests.length, beforeCancel, 'account switch while identity is awaited never cancels using the new owner');
globalThis.__restClient.auth.getSession = getSession;
user = 'A';
pause = async () => { current = false; user = 'B'; user = 'A'; };
await assert.rejects(api.read('workout-a', 'A', guard), error => error.code === 'obsolete');
const count = requests.length;
await assert.rejects(api.cancel('workout-a', 'A', guard), error => error.code === 'obsolete');
await assert.rejects(api.save(preference, 'A', guard), error => error.code === 'obsolete');
assert.equal(requests.length, count, 'ended lifetime cannot begin another request');
console.log('PASS disposed reads and A -> B -> A lifetime never resume effects');
const effects = [];
let stopAt = null, switchAt = null, subscription = null;
const stage = name => {
  effects.push(name);
  if (stopAt === name) current = false;
  if (switchAt === name) user = 'B';
};
const manager = {
  async getSubscription() { stage('getSubscription'); return subscription; },
  async subscribe(options) { assert.equal(options.userVisibleOnly, true); stage('subscribe-device'); return subscription = { endpoint: 'fixture', toJSON: () => ({ endpoint: 'fixture' }), async unsubscribe() { stage('unsubscribe-device'); subscription = null; } }; },
};
globalThis.window = { Notification: {}, pushManager: manager, addEventListener() {} };
globalThis.Notification = { requestPermission() { stage('permission'); return Promise.resolve('granted'); } };
globalThis.fetch = async (_url, options) => {
  stage(JSON.parse(options.body).operation);
  return { ok: true, json: async () => ({ ok: true, data: { configured: true, publicKey: 'AQID', registered: true } }) };
};
for (const boundary of ['permission', 'config', 'getSubscription', 'subscribe-device', 'unsubscribe', 'unsubscribe-device']) {
  current = true; stopAt = boundary; subscription = null; effects.length = 0;
  if (boundary.startsWith('unsubscribe')) {
    await manager.subscribe({ userVisibleOnly: true }); effects.length = 0;
  }
  await assert.rejects(api.enableNotifications('A', { ...guard, reconnect: true }), error => error.code === 'obsolete');
  assert.equal(effects.at(-1), boundary, `obsolete after ${boundary} cannot start another effect`);
}
current = false; effects.length = 0;
await assert.rejects(api.enableNotifications('A', guard), error => error.code === 'obsolete');
assert.deepEqual(effects, [], 'obsolete user gesture never prompts');
current = true; stopAt = null; subscription = null; effects.length = 0;
const enabling = api.enableNotifications('A', guard);
assert.deepEqual(effects, ['permission'], 'permission begins synchronously before auth/network waits');
await enabling;
console.log('PASS notification user gesture and lifetime exclusion at each awaited effect boundary');
for (const boundary of ['permission', 'config', 'getSubscription', 'subscribe-device']) {
  user = 'A'; current = true; switchAt = boundary; subscription = null; effects.length = 0;
  await assert.rejects(api.enableNotifications('A', { ...guard, reconnect: true }), /Account changed/);
  assert.equal(effects.at(-1), boundary, `account change after ${boundary} cannot start another effect`);
}
user = 'A'; switchAt = null;
console.log('PASS account switches during awaited notification setup');

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const { workoutRestApi: fixture } = await import('../../tests/ui/fixtureRestApi.js');
localStorage.setItem('qa-user', JSON.stringify({ id: 'B' }));
await assert.rejects(fixture.read('workout-a', 'A', guard), /Account changed/);
await assert.rejects(fixture.cancel('workout-a', 'A', guard), /Account changed/);
localStorage.setItem('qa-user', JSON.stringify({ id: 'A' }));
localStorage.setItem('qa-rest:A', JSON.stringify({ preference, timer: { workout_id: 'workout-b' } }));
await fixture.cancel('workout-a', 'A', guard);
assert.equal((await fixture.read('workout-b', 'A', guard)).timer.workout_id, 'workout-b');
current = false;
await assert.rejects(fixture.enableNotifications('A', guard), error => error.code === 'obsolete');
await assert.rejects(fixture.save(preference, 'A', guard), error => error.code === 'obsolete');
current = true;
await fixture.cancel();
assert.equal((await fixture.read('workout-b', 'A', guard)).timer, null);
console.log('PASS fixture expected-owner, workout filtering, lifetime and logout contract');


// Notification failure codes are adapter-owned, with parity for the fixture's permission failure.
const requestPermission = Notification.requestPermission;
Notification.requestPermission = async () => 'denied';
localStorage.setItem('qa-push-fail', 'yes');
for (const adapter of [api, fixture]) {
  await assert.rejects(adapter.enableNotifications('A', guard), error => error.code === 'permission_denied');
}
localStorage.setItem('qa-push-fail', '');
Notification.requestPermission = requestPermission;

// Exercise every other recognized production notification failure at browser/network boundaries.
const fetchNotifications = globalThis.fetch;
for (const code of ['unsupported', 'unavailable', 'device_unavailable', 'renewal_failed']) {
  const savedWindow = window;
  if (code === 'unsupported') globalThis.window = {};
  if (code === 'unavailable') globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, data: { configured: false } }) });
  if (code === 'device_unavailable') globalThis.window = { Notification: {}, PushManager: {} };
  if (code === 'renewal_failed') subscription = { endpoint: 'fixture', async unsubscribe() {} };
  await assert.rejects(api.enableNotifications('A', { ...guard, reconnect: true }), error => error.code === code);
  globalThis.window = savedWindow;
  globalThis.fetch = fetchNotifications;
  subscription = null;
}
console.log('PASS stable notification error codes and production/fixture permission parity');

// Same public coordinator + real adapter and browser-fixture contract under lost/failed saves.
async function partialContract(adapter, configure, inspect) {
  for (const mode of ['fail', 'lost', 'readback-fail']) {
    await configure('initial');
    const coordinator = createWorkoutRestCoordinator({ userId: 'A', workoutId: 'workout-a', adapter });
    assert.equal((await coordinator.refresh()).status, 'success');
    await configure(mode);
    const attempt = await coordinator.reconnectNotifications();
    assert.equal(attempt.status, 'failure');
    const facts = inspect();
    assert.equal(facts.registered, true, 'partial recovery retains the actual device registration');
    assert.equal(facts.saves, 1, 'reconciliation never repeats the write');
    assert.equal(facts.reads, 2, 'exactly one forced read follows the initial read');
    if (adapter === api) {
      assert.equal(effects.filter(effect => effect === 'permission').length, 1, 'readback never prompts');
      assert.equal(effects.includes('unsubscribe'), false, 'recovery never unregisters');
    }
    assert.equal(coordinator.getSnapshot().preference.notifications, mode === 'lost');
    assert.equal(coordinator.getSnapshot().mutationError.code, 'notification_preference_save_failed');
    assert.equal(Boolean(coordinator.getSnapshot().refreshError), mode === 'readback-fail');
    assert.doesNotMatch(JSON.stringify(coordinator.getSnapshot()), /private|fixture|endpoint/);
    await configure('ok');
    assert.equal((await coordinator.reconnectNotifications()).status, 'success', 'retry is explicit');
    assert.equal(coordinator.getSnapshot().mutationError, null);
    assert.equal(coordinator.getSnapshot().preference.notifications, true);
    const registered = inspect().registered;
    const beforeEffects = effects.length;
    assert.equal((await coordinator.setNotifications(false)).status, 'success');
    assert.equal(coordinator.getSnapshot().preference.enabled, true);
    assert.equal(inspect().registered, registered, 'opt-out leaves registration alone');
    assert.equal(effects.length, beforeEffects, 'opt-out does not contact push transport');
    coordinator.dispose();
  }
}
window.Notification.permission = 'granted';
await partialContract(api, async mode => {
  if (mode === 'initial') {
    user = 'A'; current = true; stopAt = null; switchAt = null; subscription = null; effects.length = 0;
    recovery = { preference: { ...preference }, mode: 'ok', saves: 0, reads: 0 };
  } else { recovery.mode = mode === 'readback-fail' ? 'fail' : mode; recovery.readFails = mode === 'readback-fail'; }
}, () => ({ ...recovery, registered: Boolean(subscription) }));
console.log('PASS real adapter partial save, lost response, dual failure, retained registration and explicit retry');
recovery = null;

let fixtureReads = 0, fixtureSaves = 0;
const fixtureAdapter = {
  ...fixture,
  read(...args) { fixtureReads++; return fixture.read(...args); },
  save(...args) { fixtureSaves++; return fixture.save(...args); },
};
await partialContract(fixtureAdapter, async mode => {
  if (mode === 'initial') {
    storage.clear(); fixtureReads = 0; fixtureSaves = 0;
    localStorage.setItem('qa-user', JSON.stringify({ id: 'A' }));
    localStorage.setItem('qa-rest:A', JSON.stringify({ preference, timer: null }));
  }
  localStorage.setItem('qa-rest-fail', ['fail', 'readback-fail'].includes(mode) ? 'yes' : '');
  localStorage.setItem('qa-rest-response-lost', mode === 'lost' ? 'yes' : '');
  localStorage.setItem('qa-rest-read-fail', mode === 'readback-fail' ? 'yes' : '');
}, () => ({ registered: localStorage.getItem('qa-push-device') === 'ready', reads: fixtureReads, saves: fixtureSaves }));
console.log('PASS browser fixture equivalent partial failure and explicit retry contract');


// Real adapter transport completion after disposal cannot advance save -> reconciliation or publish readback.
for (const boundary of ['save', 'readback']) {
  user = 'A'; current = true; subscription = null; effects.length = 0;
  recovery = { preference: { ...preference }, mode: 'ok', saves: 0, reads: 0 };
  const coordinator = createWorkoutRestCoordinator({ userId: 'A', workoutId: 'workout-a', adapter: api });
  await coordinator.refresh();
  recovery.mode = 'fail';
  pause = boundary === 'save' ? async () => coordinator.dispose() : async () => { pause = async () => coordinator.dispose(); };
  assert.equal((await coordinator.reconnectNotifications()).status, 'obsolete');
  // Finish already-sent transport promises before inspecting their effect log.
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.ok(subscription, 'disposal leaves completed registration in place');
  assert.equal(recovery.saves, 1);
  assert.equal(recovery.reads, boundary === 'save' ? 1 : 2);
  assert.equal(coordinator.getSnapshot().preference.notifications, false);
}
recovery = null;
console.log('PASS real adapter partial-success disposal before and during reconciliation');
