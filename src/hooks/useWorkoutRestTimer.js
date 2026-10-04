import { useCallback, useEffect, useRef, useState } from 'react';
import { workoutRestApi } from '../services/lifeosApi';

export function useWorkoutRestTimer(userId, session) {
  const [state, setState] = useState({ preferences: { enabled: false, duration_seconds: 120 }, timer: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const scope = useRef(userId);
  const requestVersion = useRef(0);
  const busyRef = useRef(false);
  scope.current = userId;
  const refresh = useCallback(async () => {
    if (!userId || busyRef.current) return;
    const version = ++requestVersion.current;
    try {
      const result = await workoutRestApi.status();
      if (scope.current !== userId || requestVersion.current !== version) return;
      setNow(Date.now()); setState(result); setError('');
    } catch { if (scope.current === userId && requestVersion.current === version) setError('Rest timer unavailable. Retry to verify WhatsApp scheduling.'); }
  }, [userId]);
  useEffect(() => {
    setState({ preferences: { enabled: false, duration_seconds: 120 }, timer: null });
    setBusy(false);
    busyRef.current = false;
    void refresh();
    const visible = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); void refresh(); } };
    window.addEventListener('pageshow', visible);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('pageshow', visible); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  useEffect(() => { void refresh(); }, [session?.workout_sets?.length, session?.ended_at, session?.id, refresh]);
  useEffect(() => {
    if (!state.timer) return;
    // Display only: durable scheduling is a database/outbox responsibility.
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const reconcile = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15000);
    return () => { clearInterval(tick); clearInterval(reconcile); };
  }, [state.timer?.id, refresh]);
  const control = async (body) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError('');
    const version = ++requestVersion.current;
    try { const next = await workoutRestApi.control(body); if (scope.current === userId && requestVersion.current === version) { setNow(Date.now()); setState(next); } }
    catch { if (scope.current === userId) setError('Rest timer change failed. Retry; the previous setting may still be active.'); }
    finally { if (scope.current === userId) { busyRef.current = false; setBusy(false); } }
  };
  const timer = state.timer && state.timer.workout_id === session?.id && !session?.ended_at && Date.parse(state.timer.expires_at) > now ? state.timer : null;
  return { ...state, timer, error, busy, refresh, control,
    remaining: timer ? Math.max(0, Math.ceil((Date.parse(timer.scheduled_for) - now) / 1000)) : 0 };
}
