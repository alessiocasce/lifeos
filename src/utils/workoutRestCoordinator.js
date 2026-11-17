const success = Object.freeze({ status: 'success' });
const obsolete = Object.freeze({ status: 'obsolete' });
const busy = Object.freeze({ status: 'busy' });
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
const failure = (operation, code, message) => ({ status: 'failure', error: { operation, code, message } });
const notificationFailures = new Map([
  ['Notification permission was not granted.', 'permission_denied'],
  ['Install LifeOS on your Home Screen to enable supported notifications.', 'unsupported'],
  ['Background notifications need server configuration. The countdown still works.', 'unavailable'],
  ['The LifeOS service worker is not ready. Reopen the installed app.', 'device_unavailable'],
  ['Device subscription could not be renewed. Reopen LifeOS and retry.', 'renewal_failed'],
]);
function immutable(value) {
  if (!value || typeof value !== 'object') return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutable(item)])));
}

export function createWorkoutRestCoordinator({ userId, workoutId, adapter }) {
  if (!userId || !workoutId || !adapter) throw new Error('A rest coordinator requires an account, workout and adapter.');
  let disposed = false;
  let read = null;
  let mutation = null;
  let pendingRefresh = null;
  let snapshot = immutable({ preference: null, timer: null, device: { status: 'checking' }, loading: false,
    mutation: null, refreshError: null, mutationError: null });
  const listeners = new Set();
  const isCurrent = () => !disposed;
  const publish = patch => {
    if (disposed) return;
    snapshot = immutable({ ...snapshot, ...patch });
    listeners.forEach(listener => listener());
  };
  function performRead() {
    const task = deferred();
    read = task;
    const valid = () => isCurrent() && read === task;
    publish({ loading: true });
    (async () => {
      let outcome;
      try {
        const next = await adapter.read(workoutId, userId, { isCurrent: valid });
        if (!valid()) return task.resolve(obsolete);
        publish({ preference: next.preference, timer: next.timer, device: next.device, loading: false, refreshError: null });
        outcome = success;
      } catch (error) {
        if (!valid()) return task.resolve(obsolete);
        if (error?.code === 'obsolete') {
          publish({ loading: false });
          outcome = obsolete;
        } else {
          outcome = failure('refresh', 'refresh_failed', 'Training timer is unavailable. Your workout is still saved.');
          publish({ loading: false, refreshError: outcome.error,
            ...(snapshot.preference?.notifications ? { device: { status: 'unverified' } } : {}) });
        }
      }
      if (read === task) read = null;
      task.resolve(outcome);
    })();
    return task.promise;
  }
  function refresh() {
    if (disposed) return Promise.resolve(obsolete);
    if (mutation) {
      if (mutation.reconciliation) return mutation.reconciliation;
      if (read) return read.promise;
      pendingRefresh ||= deferred();
      return pendingRefresh.promise;
    }
    return read?.promise || performRead();
  }
  function mutate(operation, effect, valid = true) {
    if (disposed) return Promise.resolve(obsolete);
    if (mutation) return Promise.resolve(busy);
    if (!snapshot.preference) {
      const outcome = failure(operation, 'not_loaded', 'Load the rest timer before changing its settings.');
      publish({ mutationError: outcome.error });
      return Promise.resolve(outcome);
    }
    if (!valid) {
      const outcome = failure(operation, 'invalid_preference', 'Choose a rest duration from 15 to 300 seconds and valid timer settings.');
      publish({ mutationError: outcome.error });
      return Promise.resolve(outcome);
    }
    const task = deferred();
    mutation = task;
    if (read) { read.resolve(obsolete); read = null; }
    publish({ mutation: operation, loading: false, mutationError: null });
    (async () => {
      let outcome;
      try {
        const patch = await effect();
        if (!isCurrent()) return task.resolve(obsolete);
        publish({ ...patch, mutationError: null });
        outcome = success;
      } catch (error) {
        if (!isCurrent()) return task.resolve(obsolete);
        if (error?.code === 'obsolete') outcome = obsolete;
        else {
          const code = notificationFailures.get(error?.message);
          outcome = failure(operation, code || 'mutation_failed', code ? error.message : 'Training timer is unavailable. Your workout is still saved.');
          publish({ mutationError: outcome.error,
            ...(['setNotifications', 'reconnectNotifications'].includes(operation) ? { device: { status: 'unverified' } } : {}) });
        }
      }
      if (isCurrent() && pendingRefresh) {
        const waiting = pendingRefresh;
        pendingRefresh = null;
        task.reconciliation = performRead();
        waiting.resolve(await task.reconciliation);
      }
      if (isCurrent()) { mutation = null; publish({ mutation: null }); }
      task.resolve(isCurrent() ? outcome : obsolete);
    })();
    return task.promise;
  }
  function updatePreferences(patch) {
    const valid = patch && typeof patch === 'object' && !Array.isArray(patch) && Object.keys(patch).length > 0
      && Object.keys(patch).every(key => key === 'enabled' || key === 'seconds')
      && (!Object.hasOwn(patch, 'enabled') || typeof patch.enabled === 'boolean')
      && (!Object.hasOwn(patch, 'seconds') || (Number.isInteger(patch.seconds) && patch.seconds >= 15 && patch.seconds <= 300));
    return mutate('updatePreferences', async () => {
      const preference = await adapter.save({ ...snapshot.preference, ...patch }, userId, { isCurrent });
      return { preference, ...(preference.enabled ? {} : { timer: null }) };
    }, valid);
  }
  function notifications(enabled, operation) {
    return mutate(operation, async () => {
      // This call stays before the first await so permission belongs to the control's gesture.
      if (enabled) await adapter.enableNotifications(userId, { reconnect: true, isCurrent });
      if (!isCurrent()) throw Object.assign(new Error('Obsolete rest view.'), { code: 'obsolete' });
      const preference = await adapter.save({ ...snapshot.preference, notifications: enabled }, userId, { isCurrent });
      return { preference, device: { status: enabled ? 'ready' : 'off' } };
    }, typeof enabled === 'boolean');
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { if (!disposed) listeners.add(listener); return () => listeners.delete(listener); },
    refresh,
    updatePreferences,
    setNotifications: enabled => notifications(enabled, 'setNotifications'),
    reconnectNotifications: () => notifications(true, 'reconnectNotifications'),
    cancelTimer: () => mutate('cancelTimer', async () => {
      await adapter.cancel(workoutId, userId, { isCurrent });
      return { timer: null };
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      read?.resolve(obsolete);
      mutation?.resolve(obsolete);
      pendingRefresh?.resolve(obsolete);
      read = null;
      mutation = null;
      pendingRefresh = null;
    },
  };
}
