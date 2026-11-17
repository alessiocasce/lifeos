import assert from 'node:assert/strict';
import { createWorkoutRestCoordinator } from '../../src/utils/workoutRestCoordinator.js';

const preference = { enabled: true, seconds: 60, notifications: false };
const timer = { id: 'timer-a', workout_id: 'workout-a', scheduled_for: '2026-11-17T12:00:00Z' };
const data = (patch = {}) => ({ preference: { ...preference }, timer: { ...timer }, device: { status: 'off' }, ...patch });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(userId = 'account-a', workoutId = 'workout-a') {
  const calls = [];
  const adapter = Object.fromEntries(['read', 'save', 'cancel', 'enableNotifications'].map(method => [method, (...args) => {
    const task = deferred();
    calls.push({ method, args, ...task });
    return task.promise;
  }]));
  return { calls, coordinator: createWorkoutRestCoordinator({ userId, workoutId, adapter }) };
}
async function loaded(f = fixture(), initial = data()) {
  const read = f.coordinator.refresh();
  f.calls[0].resolve(initial);
  assert.equal((await read).status, 'success');
  return f;
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

// Construction has no effects; unknown and confirmed facts are immutable stable snapshots.
{
  const f = fixture();
  const initial = f.coordinator.getSnapshot();
  assert.equal(initial.preference, null);
  assert.equal(initial.loading, false);
  assert.equal(initial, f.coordinator.getSnapshot());
  assert.equal(f.calls.length, 0);
  let changes = 0;
  const unsubscribe = f.coordinator.subscribe(() => changes++);
  const source = data();
  const reading = f.coordinator.refresh();
  f.calls[0].resolve(source);
  assert.equal((await reading).status, 'success');
  const confirmed = f.coordinator.getSnapshot();
  source.preference.seconds = 300;
  assert.equal(confirmed.preference.seconds, 60);
  assert.throws(() => { confirmed.timer.id = 'changed'; }, TypeError);
  assert.equal(confirmed, f.coordinator.getSnapshot());
  assert.ok(changes > 0);
  unsubscribe();
  const count = changes;
  f.coordinator.dispose();
  f.coordinator.dispose();
  assert.equal(changes, count);
  assert.equal(f.calls.length, 1);
  assert.equal((await f.coordinator.refresh()).status, 'obsolete');
}

// Failed initial reads remain unknown; retry and joined reads expose only safe owned errors.
{
  const f = fixture();
  const first = f.coordinator.refresh();
  const joined = f.coordinator.refresh();
  assert.equal(f.calls.length, 1);
  f.calls[0].reject(new Error('private provider credential'));
  assert.equal((await first).status, 'failure');
  assert.equal((await joined).status, 'failure');
  assert.equal(f.coordinator.getSnapshot().preference, null);
  assert.equal(f.coordinator.getSnapshot().refreshError.code, 'refresh_failed');
  assert.doesNotMatch(JSON.stringify(f.coordinator.getSnapshot()), /private provider/);
  const retry = f.coordinator.refresh();
  f.calls[1].resolve(data({ preference: { ...preference, notifications: true }, device: { status: 'ready' } }));
  assert.equal((await retry).status, 'success');
  const read = f.coordinator.refresh();
  f.calls[2].reject(new Error('offline'));
  assert.equal((await read).status, 'failure');
  assert.equal(f.coordinator.getSnapshot().preference.notifications, true);
  assert.equal(f.coordinator.getSnapshot().timer.id, 'timer-a');
  assert.equal(f.coordinator.getSnapshot().device.status, 'unverified');
}

// A preference save invalidates old reads, coalesces event refreshes and excludes mutations through readback.
{
  const f = await loaded();
  const oldRead = f.coordinator.refresh();
  const saving = f.coordinator.updatePreferences({ seconds: 90 });
  assert.equal(f.calls[1].args[2].isCurrent(), false);
  const queued = [f.coordinator.refresh(), f.coordinator.refresh(), f.coordinator.refresh()];
  assert.equal((await f.coordinator.updatePreferences({ seconds: 120 })).status, 'busy');
  assert.equal(f.calls.length, 3);
  f.calls[1].resolve(data({ preference: { ...preference, seconds: 15 } }));
  assert.equal((await oldRead).status, 'obsolete');
  assert.equal(f.coordinator.getSnapshot().preference.seconds, 60);
  f.calls[2].resolve({ ...preference, seconds: 90 });
  await flush();
  assert.equal(f.calls.length, 4);
  assert.equal(f.coordinator.getSnapshot().preference.seconds, 90);
  assert.equal((await f.coordinator.cancelTimer()).status, 'busy');
  const joined = f.coordinator.refresh();
  f.calls[3].resolve(data({ preference: { ...preference, seconds: 90 } }));
  assert.equal((await saving).status, 'success');
  for (const result of await Promise.all([...queued, joined])) assert.equal(result.status, 'success');
  assert.equal(f.coordinator.getSnapshot().mutation, null);
  assert.equal(f.calls.length, 4);
}

// Cancellation retains the acknowledged result when queued reconciliation fails; writes are never replayed.
{
  const f = await loaded();
  const cancel = f.coordinator.cancelTimer();
  const reads = [f.coordinator.refresh(), f.coordinator.refresh()];
  assert.equal(f.coordinator.getSnapshot().timer.id, 'timer-a');
  assert.equal(f.calls[1].args[0], 'workout-a');
  assert.equal(f.calls[1].args[1], 'account-a');
  f.calls[1].resolve();
  await flush();
  assert.equal(f.coordinator.getSnapshot().timer, null);
  f.calls[2].reject(new Error('offline'));
  assert.equal((await cancel).status, 'success');
  assert.deepEqual((await Promise.all(reads)).map(result => result.status), ['failure', 'failure']);
  assert.equal(f.coordinator.getSnapshot().timer, null);
  assert.equal(f.coordinator.getSnapshot().refreshError.operation, 'refresh');
  assert.equal(f.coordinator.getSnapshot().mutationError, null);
  assert.equal(f.calls.length, 3);
}

// Narrow preference validation and unloaded commands produce failures with no write/setup effects.
{
  const f = fixture();
  assert.equal((await f.coordinator.updatePreferences({ seconds: 60 })).error.code, 'not_loaded');
  assert.equal(f.calls.length, 0);
  await loaded(f);
  for (const patch of [{ notifications: true }, {}, { enabled: 1 }, { seconds: '90' }, { seconds: 14 }, { seconds: 301 }, { seconds: 60.5 }, null]) {
    assert.equal((await f.coordinator.updatePreferences(patch)).error.code, 'invalid_preference');
    assert.equal(f.calls.length, 1);
  }
}

// Disposal settles pending work without transport completion; A -> B -> A never revives an old lifetime.
{
  const a1 = await loaded();
  const saving = a1.coordinator.updatePreferences({ enabled: false });
  const queued = a1.coordinator.refresh();
  const before = a1.coordinator.getSnapshot();
  let notifications = 0;
  a1.coordinator.subscribe(() => notifications++);
  a1.coordinator.dispose();
  const b = await loaded(fixture('account-b', 'workout-b'));
  b.coordinator.dispose();
  const a2 = await loaded();
  assert.equal((await saving).status, 'obsolete');
  assert.equal((await queued).status, 'obsolete');
  a1.calls[1].resolve({ ...preference, enabled: false });
  await flush();
  assert.equal(a1.calls.length, 2);
  assert.equal(notifications, 0);
  assert.equal(a1.coordinator.getSnapshot(), before);
  assert.equal(a2.coordinator.getSnapshot().preference.enabled, true);
  assert.equal((await a1.coordinator.cancelTimer()).status, 'obsolete');
  const reading = a2.coordinator.refresh();
  a2.coordinator.dispose();
  assert.equal((await reading).status, 'obsolete');
  a2.calls[1].reject(new Error('late transport'));
  await flush();
}

// Notification setup starts directly in the gesture; competing commands never prompt or queue writes.
{
  const f = await loaded();
  const enabling = f.coordinator.setNotifications(true);
  assert.equal(f.calls[1].method, 'enableNotifications');
  assert.equal(f.calls[1].args[0], 'account-a');
  assert.equal(f.calls[1].args[1].reconnect, true);
  assert.equal((await f.coordinator.reconnectNotifications()).status, 'busy');
  assert.equal(f.calls.length, 2);
  f.calls[1].resolve();
  await flush();
  assert.equal(f.calls[2].method, 'save');
  assert.deepEqual(f.calls[2].args[0], { ...preference, notifications: true });
  f.calls[2].resolve({ ...preference, notifications: true });
  assert.equal((await enabling).status, 'success');
  assert.equal(f.coordinator.getSnapshot().device.status, 'ready');
  const off = f.coordinator.setNotifications(false);
  assert.equal(f.calls[3].method, 'save');
  f.calls[3].resolve(preference);
  assert.equal((await off).status, 'success');
  assert.equal(f.coordinator.getSnapshot().timer.id, 'timer-a');
  assert.equal(f.coordinator.getSnapshot().device.status, 'off');
  const reconnect = f.coordinator.reconnectNotifications();
  f.coordinator.dispose();
  assert.equal((await reconnect).status, 'obsolete');
  f.calls[4].resolve();
  await flush();
  assert.equal(f.calls.length, 5);
  assert.equal((await f.coordinator.setNotifications(true)).status, 'obsolete');
}

// An event at readback completion joins that read instead of being stranded in a second pending batch.
{
  const f = await loaded();
  const saving = f.coordinator.updatePreferences({ seconds: 90 });
  const queued = f.coordinator.refresh();
  f.calls[1].resolve({ ...preference, seconds: 90 });
  await flush();
  let edgeRefresh;
  f.calls[2].promise.then(() => { edgeRefresh = f.coordinator.refresh(); });
  f.calls[2].resolve(data({ preference: { ...preference, seconds: 90 } }));
  assert.equal((await saving).status, 'success');
  assert.equal((await queued).status, 'success');
  assert.equal((await edgeRefresh).status, 'success');
  assert.equal(f.calls.length, 3);
}

// A mutation failure survives successful refresh; a new acknowledged mutation clears it independently.
{
  const f = await loaded();
  const saving = f.coordinator.updatePreferences({ seconds: 90 });
  const queued = f.coordinator.refresh();
  f.calls[1].reject(new Error('private database detail'));
  await flush();
  f.calls[2].resolve(data());
  assert.equal((await saving).status, 'failure');
  assert.equal((await queued).status, 'success');
  assert.equal(f.coordinator.getSnapshot().preference.seconds, 60);
  assert.equal(f.coordinator.getSnapshot().mutationError.operation, 'updatePreferences');
  assert.equal(f.coordinator.getSnapshot().refreshError, null);
  const retry = f.coordinator.updatePreferences({ seconds: 90 });
  const refresh = f.coordinator.refresh();
  f.calls[3].resolve({ ...preference, seconds: 90 });
  await flush();
  f.calls[4].reject(new Error('offline'));
  assert.equal((await retry).status, 'success');
  assert.equal((await refresh).status, 'failure');
  assert.equal(f.coordinator.getSnapshot().preference.seconds, 90);
  assert.equal(f.coordinator.getSnapshot().mutationError, null);
  assert.equal(f.coordinator.getSnapshot().refreshError.code, 'refresh_failed');
}

console.log('Workout rest coordinator: PASS');
