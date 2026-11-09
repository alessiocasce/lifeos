import assert from 'node:assert/strict';
import { timerPresentation, validateRestPreference, validatePushSubscription } from '../src/utils/workoutRest.js';
import { inspectPushDevice } from '../src/utils/workoutPushDevice.js';

assert.equal(validateRestPreference({ enabled: true, seconds: 120, notifications: false }).seconds, 120);
for (const seconds of [0, 14, 301, 'bad', 15.5]) assert.throws(() => validateRestPreference({ seconds }), /duration/i);
for (const [seconds, tone] of [[61, 'normal'], [60, 'warning'], [11, 'warning'], [10, 'urgent'], [0, 'ended']]) {
  const value = timerPresentation(new Date(100000 + seconds * 1000).toISOString(), 100000);
  assert.equal(value.tone, tone);
}
assert.equal(timerPresentation('invalid', 0).remaining, 0);
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/fixture', keys: { auth: 'A'.repeat(22), p256dh: 'B'.repeat(87) } };
assert.equal(validatePushSubscription(subscription).endpoint, subscription.endpoint);
for (const endpoint of ['http://fcm.googleapis.com/x', 'https://localhost/x', 'https://evil.test/x', 'https://fcm.googleapis.com.evil.test/x', 'https://fcm.googleapis.com:444/x']) {
  assert.throws(() => validatePushSubscription({ ...subscription, endpoint }), /subscription/i);
}
console.log('PASS rest duration, deadline thresholds and push endpoint security');
let device={endpoint:'https://fcm.googleapis.com/fixture',expirationTime:null};
const scope={Notification:{permission:'granted'},navigator:{serviceWorker:{getRegistration:async()=>({active:{},pushManager:{getSubscription:async()=>device}})}}};
const lookup=async()=>({registered:true,configured:true,publicKey:'fixture'});
assert.equal((await inspectPushDevice({scope,lookup})).status,'ready');
device=null;assert.equal((await inspectPushDevice({scope,lookup})).status,'reconnect','PWA reopen detects revoked/missing device without changing global preference');
device={endpoint:'https://fcm.googleapis.com/fixture'};
assert.equal((await inspectPushDevice({scope,lookup:async()=>({configured:true,publicKey:'fixture',registered:false})})).status,'reconnect','provider-removed server registration requires fresh reconnect');
assert.equal((await inspectPushDevice({scope,lookup:async()=>{throw new Error('offline');}})).status,'unverified');
scope.Notification.permission='denied';assert.equal((await inspectPushDevice({scope,lookup})).status,'blocked');
scope.Notification.permission='granted';device.expirationTime=1;assert.equal((await inspectPushDevice({scope,lookup})).status,'reconnect');
device={endpoint:'https://fcm.googleapis.com/fixture'};
const declarative={Notification:{permission:'granted'},pushManager:{getSubscription:async()=>device}};
assert.equal((await inspectPushDevice({scope:declarative,lookup})).status,'ready','declarative manager works without installed worker');
console.log('PASS device reconciliation: missing/revoked/expired/blocked/offline, reopened PWA, private server registration and declarative window manager.');
