import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const listeners = {}, notifications = [];
let current = true;
const self = { addEventListener: (name, fn) => { listeners[name] = fn; }, registration: { showNotification: async (title, options) => notifications.push({ title, options }) } };
vm.runInNewContext(fs.readFileSync('public/workout-push-sw.js', 'utf8'), { self, URL, Date,
  fetch: async () => ({ ok: true, json: async () => ({ data: { current } }) }) });
const push = async patch => { let task; listeners.push({ data: { json: () => ({ type: 'workout-rest', token: 'a'.repeat(64), expiresAt: new Date(Date.now()+10000).toISOString(), language: 'en', ...patch }) }, waitUntil: value => { task = value; } }); await task; };
await push(); assert.equal(notifications.length, 1); assert.equal(notifications[0].title, 'LifeOS - Rest complete');
current = false; await push(); assert.equal(notifications.length, 1, 'cancelled push never displays');
current = true; await push({ expiresAt: '2000-01-01T00:00:00Z' }); assert.equal(notifications.length, 1);
await push({ token: 'invalid' }); assert.equal(notifications.length, 1);
await push({ expiresAt: 'invalid' }); assert.equal(notifications.length, 1);
await push({ language: 'it' }); assert.equal(notifications.at(-1).options.body, 'Puoi iniziare la prossima serie.');
console.log('PASS service-worker push: current-only notification, expiry, token validation, English/Italian text');
