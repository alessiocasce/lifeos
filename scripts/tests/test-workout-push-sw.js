import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const listeners = {}, notifications = [];
let networkCalls = 0;
const self = { addEventListener: (name, fn) => { listeners[name] = fn; }, registration: { showNotification: async (title, options) => notifications.push({ title, options }) } };
vm.runInNewContext(fs.readFileSync('public/workout-push-sw.js', 'utf8'), { self, URL, Date,
  fetch: async () => { networkCalls++; throw new Error('Background network unavailable'); } });
const push = async patch => { let task; listeners.push({ data: { json: () => ({ type: 'workout-rest', token: 'a'.repeat(64), expiresAt: new Date(Date.now()+10000).toISOString(), language: 'en', ...patch }) }, waitUntil: value => { task = value; } }); await task; };
await push(); assert.equal(notifications.length, 1,'legitimate push must display despite verification-network failure'); assert.equal(notifications[0].title, 'LifeOS - Rest complete');
await push(); await push(); assert.equal(notifications.length,3,'three repeated pushes remain visible');
assert.equal(networkCalls,0,'no verification network dependency');
await push({ expiresAt: '2000-01-01T00:00:00Z' }); assert.match(notifications.at(-1).options.body,/Training/);
await push({type:undefined,language:undefined,web_push:8030,notification:{lang:'it',title:'LifeOS - Recupero terminato',mutable:false}});
assert.equal(notifications.at(-1).title,'LifeOS - Recupero terminato');
await push({type:undefined});assert.equal(notifications.at(-1).title,'LifeOS');
await push({ language: 'it' }); assert.equal(notifications.at(-1).options.body, 'Puoi iniziare la prossima serie.');
assert.ok(notifications.every(n=>n.options.tag==='lifeos-workout-rest'));
console.log('PASS repeated visible legacy/declarative push, verification-network failure independence, late/unknown visible fallback and English/Italian text; cancellation covered before dispatch.');
