import { useCallback, useEffect, useRef, useState } from 'react';
import { workoutApi } from '../services/lifeosApi';
import { loadFilteredWorkoutPage } from '../utils/workoutHistoryFilter';

export function useWorkoutHistoryFilter(userId, filter, enabled) {
  const key = JSON.stringify([userId, enabled, filter]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const [state, setState] = useState({ key, rows: [], cursor: null, hasMore: false, loading: false, error: '' });
  const stateRef = useRef(state);
  stateRef.current = state;
  const load = useCallback(async (reset = false) => {
    if (!enabled || !userId || (!reset && inFlight.current)) return;
    const token = ++sequence.current;
    const valid = () => token === sequence.current && currentKey.current === key;
    inFlight.current = true;
    const previous = stateRef.current.key === key ? stateRef.current : { rows: [], cursor: null };
    setState({ ...previous, key, loading: true, error: '' });
    try {
      const result = await loadFilteredWorkoutPage((...args) => workoutApi.page(...args), filter, reset ? null : previous.cursor, valid);
      if (valid() && result) setState({ key, ...result, rows: [...new Map([...(reset ? [] : previous.rows), ...result.rows].map(row => [row.id, row])).values()], loading: false, error: '' });
    } catch (error) {
      if (valid()) setState(value => ({ ...value, key, loading: false, error: error.message || 'Unable to load workouts.' }));
    } finally { if (valid()) inFlight.current = false; }
  }, [key]);
  useEffect(() => {
    if (enabled) load(true);
    return () => { sequence.current++; inFlight.current = false; };
  }, [load, enabled]);
  const visible = state.key === key ? state : { rows: [], hasMore: false, loading: enabled, error: '' };
  return { ...visible, loadMore: () => load(), reload: () => load(true) };
}
