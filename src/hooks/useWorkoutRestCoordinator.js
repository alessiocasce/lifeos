import { useLayoutEffect, useRef, useState } from 'react';
import { workoutRestApi } from '../services/workoutRestApi';
import { createWorkoutRestCoordinator } from '../utils/workoutRestCoordinator';

const empty = Object.freeze({ preference: null, timer: null, device: Object.freeze({ status: 'checking' }),
  loading: false, mutation: null, refreshError: null, mutationError: null });
const obsolete = () => Promise.resolve({ status: 'obsolete' });

export function useWorkoutRestCoordinator({ userId, workoutId, ended }) {
  const current = useRef(null);
  const [attachment, setAttachment] = useState(null);
  useLayoutEffect(() => {
    if (!userId || !workoutId || ended) return;
    // Create inside every setup: StrictMode cleanup permanently disposes its own instance.
    const coordinator = createWorkoutRestCoordinator({ userId, workoutId, adapter: workoutRestApi });
    const owner = { userId, workoutId, coordinator };
    current.current = owner;
    const publish = () => setAttachment({ ...owner, snapshot: coordinator.getSnapshot() });
    const unsubscribe = coordinator.subscribe(publish);
    publish();
    const refresh = () => coordinator.refresh();
    const saved = event => {
      if (event.detail?.userId === userId && event.detail?.sessionId === workoutId) refresh();
    };
    const resumed = () => { if (document.visibilityState === 'visible') refresh(); };
    const changed = event => { if (event.data?.type === 'lifeos:push-subscription-changed') refresh(); };
    window.addEventListener('lifeos:workout-set-saved', saved);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', resumed);
    navigator.serviceWorker?.addEventListener('message', changed);
    refresh();
    return () => {
      current.current = null;
      unsubscribe();
      coordinator.dispose();
      window.removeEventListener('lifeos:workout-set-saved', saved);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', resumed);
      navigator.serviceWorker?.removeEventListener('message', changed);
    };
  }, [userId, workoutId, ended]);
  const attached = !ended && attachment?.userId === userId && attachment?.workoutId === workoutId
    && attachment?.coordinator === current.current?.coordinator;
  const invoke = (action, ...args) => attached ? attachment.coordinator[action](...args) : obsolete();
  return {
    snapshot: attached ? attachment.snapshot : empty,
    refresh: () => invoke('refresh'),
    updatePreferences: patch => invoke('updatePreferences', patch),
    setNotifications: enabled => invoke('setNotifications', enabled),
    reconnectNotifications: () => invoke('reconnectNotifications'),
    cancelTimer: () => invoke('cancelTimer'),
  };
}
