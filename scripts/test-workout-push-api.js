import assert from 'node:assert/strict';
import { createActionsHandler } from '../api/ai/actions.js';
import { HttpError } from '../api/_utils/http.js';
import { verifyWorkoutPush, dispatchWorkoutPush, manageWorkoutPush } from '../api/_utils/workoutPush.js';
import { createECDH, randomBytes } from 'node:crypto';
import { generateVAPIDKeys, generateRequestDetails } from 'web-push';

let calls = [];
const handler = createActionsHandler({
  requireUser: async () => { throw new HttpError(403, 'Owner only'); },
  requireTraining: async token => { if (token !== 'member') throw new HttpError(401, 'Unauthorized'); return { id: 'B' }; },
  trainingPush: async input => { calls.push(input); return { subscribed: true }; },
  verifyPush: async token => ({ current: token === 'safe-token' }),
  dispatchPush: async () => ({ claimed: 1 }),
});
const request = async (body, token) => {
  let output;
  const res = { setHeader() {}, end(value) { output = JSON.parse(value); } };
  await handler({ method: 'POST', url: '/api/ai/actions', headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  return { status: res.statusCode, output };
};
assert.equal((await request({ action: 'training_notifications', operation: 'config' })).status, 401);
assert.equal((await request({ action: 'training_notifications', operation: 'config', userId: 'A' }, 'member')).status, 200);
assert.equal(calls[0].userId, 'B');
assert.equal((await request({ action: 'other' }, 'member')).status, 403, 'Training auth must not open Companion controls');
assert.equal((await request({ action: 'training_push_dispatch' }, 'member')).status, 401);
assert.equal((await request({ action: 'training_push_verify', token: 'bad' })).output.data.current, false);
process.env.LIFEOS_PUSH_DISPATCH_SECRET = 'qa-secret';
assert.equal((await request({ action: 'training_push_dispatch' }, 'qa-secret')).status, 200);
assert.equal((await request({ action: 'training_notifications', operation: 'config' }, 'qa-secret')).status, 401);
assert.deepEqual(await verifyWorkoutPush('not-a-token', {}), { current: false });

const token = 'a'.repeat(64);
const tables = {
  workout_rest_timers: [{ id: 'timer', user_id: 'A', workout_id: 'workout', state: 'claimed', delivery_token: token, delivery_enabled: true,
    scheduled_for: new Date(Date.now()-1000).toISOString(), expires_at: new Date(Date.now()+300000).toISOString() }],
  workout_web_rest_preferences: [{ user_id: 'A', enabled: true, notifications: true }],
  user_preferences: [{ user_id: 'A', language: 'en' }],
  workouts: [{ id: 'workout', user_id: 'A', ended_at: null }],
  workout_push_subscriptions: [{ id: 'subscription', user_id: 'A', subscription: { endpoint: 'https://fcm.googleapis.com/fixture', keys: { auth: 'A'.repeat(22), p256dh: 'B'.repeat(87) } } }],
};
const client = {
  from(name) {
    let filters = [], update = null;
    const q = { select() { return q; }, limit() { return q; }, eq(key, value) { filters.push(row => row[key] === value); return q; },
      update(value) { update = value; return q; },
      maybeSingle() { return Promise.resolve({ data: tables[name].find(row => filters.every(test => test(row))) || null }); },
      then(resolve) { const data = tables[name].filter(row => filters.every(test => test(row))); if (update) data.forEach(row => Object.assign(row, update)); return Promise.resolve({ data }).then(resolve); } };
    return q;
  },
  rpc: async () => ({ data: [tables.workout_rest_timers[0]] }),
};
assert.equal((await verifyWorkoutPush(token, client)).current, true);
tables.workout_web_rest_preferences[0].notifications = false;
assert.equal((await verifyWorkoutPush(token, client)).current, false);
tables.workout_web_rest_preferences[0].notifications = true;
tables.workouts[0].ended_at = new Date().toISOString();
assert.equal((await verifyWorkoutPush(token, client)).current, false);
tables.workouts[0].ended_at = null;
Object.assign(process.env, { LIFEOS_PUSH_PUBLIC_KEY: 'fixture', LIFEOS_PUSH_PRIVATE_KEY: 'fixture', LIFEOS_PUSH_SUBJECT: 'mailto:qa@example.test', LIFEOS_PUSH_WORKER_ENABLED: 'true' });
let sent = 0;
assert.deepEqual(await dispatchWorkoutPush({ client, send: async () => { sent++; } }), { claimed: 1, accepted: 1, failed: 0 });
assert.equal(sent, 1); assert.equal(tables.workout_rest_timers[0].state, 'sent');
tables.workout_rest_timers[0].state = 'cancelled';
await dispatchWorkoutPush({ client, send: async () => { sent++; } });
assert.equal(sent, 1);
const vapid = generateVAPIDKeys(), receiver = createECDH('prime256v1'); receiver.generateKeys();
const encrypted = generateRequestDetails({ endpoint: 'https://fcm.googleapis.com/fixture', keys: {
  p256dh: receiver.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url'),
} }, JSON.stringify({ type: 'workout-rest' }), { vapidDetails: { subject: 'mailto:qa@example.test', ...vapid }, TTL: 60 });
assert.ok(encrypted.body.length > 20); assert.match(encrypted.headers.Authorization, /^vapid /);
console.log('PASS Training push API: bearer isolation, preserved Companion owner guard, worker secret, cancellation verification, safe dispatch');

// Exercise the real registration/removal helper, not just the route adapter.
const ledger=[];
const registry={from(){
  let filters=[],operation='read',value;
  const q={select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},
    maybeSingle(){return Promise.resolve({data:ledger.find(row=>filters.every(f=>f(row)))||null});},
    upsert(row){operation='upsert';value=row;return q;},delete(){operation='delete';return q;},
    then(resolve){if(operation==='upsert') {const index=ledger.findIndex(row=>row.endpoint===value.endpoint);if(index<0)ledger.push(value);else ledger[index]=value;}
      if(operation==='delete') for(let i=ledger.length-1;i>=0;i--)if(filters.every(f=>f(ledger[i])))ledger.splice(i,1);
      return Promise.resolve({data:null}).then(resolve);}};return q;
}};
const valid={endpoint:'https://fcm.googleapis.com/qa',keys:{auth:'A'.repeat(22),p256dh:'B'.repeat(87)}};
await manageWorkoutPush({userId:'A',body:{operation:'subscribe',subscription:valid,userId:'B'},client:registry});
await manageWorkoutPush({userId:'A',body:{operation:'subscribe',subscription:valid},client:registry});
assert.equal(ledger.length,1);assert.equal(ledger[0].user_id,'A');
await assert.rejects(manageWorkoutPush({userId:'B',body:{operation:'subscribe',subscription:valid},client:registry}),/previous account/);
await assert.rejects(manageWorkoutPush({userId:'A',body:{operation:'subscribe',subscription:{...valid,endpoint:'https://evil.test/'}},client:registry}),/subscription/i);
await manageWorkoutPush({userId:'B',body:{operation:'unsubscribe',endpoint:valid.endpoint},client:registry});assert.equal(ledger.length,1);
await manageWorkoutPush({userId:'A',body:{operation:'unsubscribe',endpoint:valid.endpoint},client:registry});assert.equal(ledger.length,0);
delete process.env.LIFEOS_PUSH_SUBJECT;
assert.equal((await manageWorkoutPush({userId:'A',body:{operation:'config'},client:registry})).configured,false);
console.log('PASS real push registration/removal: idempotent upsert, cross-account rejection, invalid endpoints, owner-only removal, incomplete server setup stays disabled.');
