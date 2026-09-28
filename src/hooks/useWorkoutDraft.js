import { useCallback, useRef, useState } from 'react';
import { emptySetDraft, readWorkoutDraft, sanitizeSetDraft, writeWorkoutDraft } from '../utils/workoutContinuity';

export function useWorkoutDraft(userId, session) {
  const sessionId = session && !session.ended_at ? session.id : null;
  const key = `${userId || ''}:${sessionId || ''}`;
  const [state, setState] = useState(() => ({ key, draft: readWorkoutDraft(userId, sessionId) }));
  const current = useRef(state);
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  // Discard the previous session's render before any effect can persist its fields
  // under the new session. No save-on-unmount race or background timer is needed.
  let resolved = state;
  if (state.key !== key) {
    resolved = { key, draft: sessionId ? readWorkoutDraft(userId, sessionId) : emptySetDraft() };
    setState(resolved);
  }
  current.current = resolved;

  const updateDraft = useCallback((update) => {
    if (current.current.key !== key) return;
    const previous = current.current.draft;
    const next = sanitizeSetDraft(typeof update === 'function' ? update(previous) : update);
    if (Object.keys(next).every((field) => next[field] === previous[field])) return;
    const envelope = { key, draft: next };
    current.current = envelope;
    // Synchronous persistence at each input boundary survives abrupt process death.
    if (userId && sessionId) setStorageUnavailable(!writeWorkoutDraft(userId, sessionId, next));
    setState(envelope);
  }, [key, userId, sessionId]);

  return [resolved.draft, updateDraft, storageUnavailable];
}
