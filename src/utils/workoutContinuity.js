const VERSION = 1;
const MAX_AGE_MS = 36 * 60 * 60 * 1000;
const PREFIX = 'lifeos:training:v1:';

export const emptySetDraft = () => ({
  exercise: '', exercise_id: null, set_number: 1, weight: '', reps: '', rpe: '', is_warmup: false, notes: '',
});

function storageOrNull(storage) {
  try { return storage ?? globalThis.localStorage ?? null; } catch { return null; }
}

function keyFor(userId, suffix) {
  return userId ? `${PREFIX}${encodeURIComponent(userId)}:${suffix}` : null;
}

function read(key, storage, now) {
  try {
    const target = storageOrNull(storage);
    const row = JSON.parse(target?.getItem(key) || 'null');
    if (!row || row.version !== VERSION || !Number.isFinite(row.updated_at)
      || row.updated_at > now + 60000 || now - row.updated_at > MAX_AGE_MS) {
      if (key) target?.removeItem(key);
      return null;
    }
    return row;
  } catch { return null; }
}

function write(key, value, storage, now) {
  if (!key) return false;
  try {
    const target = storageOrNull(storage);
    if (!target) return false;
    target.setItem(key, JSON.stringify({ ...value, version: VERSION, updated_at: now }));
    return true;
  } catch { return false; }
}

export function sanitizeSetDraft(input) {
  const value = input && typeof input === 'object' ? input : {};
  const text = (field, max) => typeof value[field] === 'string' ? value[field].slice(0, max) : '';
  const numericInput = (field) => {
    const raw = typeof value[field] === 'number' ? String(value[field]) : text(field, 12);
    return /^\d{0,6}(?:[.,]\d{0,3})?$/.test(raw) ? raw : '';
  };
  const draft = {
    exercise: text('exercise', 160),
    exercise_id: typeof value.exercise_id === 'string' && /^[0-9a-f-]{36}$/i.test(value.exercise_id) ? value.exercise_id : null,
    set_number: Number.isInteger(value.set_number) && value.set_number > 0 && value.set_number < 10000 ? value.set_number : 1,
    weight: numericInput('weight'), reps: numericInput('reps'), rpe: numericInput('rpe'),
    is_warmup: value.is_warmup === true, notes: text('notes', 2000),
  };
  if (value.baseline && typeof value.baseline === 'object') {
    draft.baseline = Object.fromEntries(['weight','reps','rpe','is_warmup','notes'].map(field => [field, field === 'is_warmup' ? value.baseline[field] === true : String(value.baseline[field] ?? '').slice(0, field === 'notes' ? 2000 : 12)]));
  }
  return draft;
}

export function withDraftBaseline(draft) {
  return { ...draft, baseline: Object.fromEntries(['weight','reps','rpe','is_warmup','notes'].map(field => [field,draft[field]])) };
}

export function draftHasEdits(draft) {
  if (!draft) return false;
  // Older drafts have no trustworthy baseline; protect them conservatively.
  const baseline = draft.baseline || { weight:'',reps:'',rpe:'',is_warmup:false,notes:'' };
  return ['weight','reps','rpe','is_warmup','notes'].some(field => draft[field] !== baseline[field]);
}

export function hasWorkoutDraftEdits(userId, sessionId, options = {}) {
  const row = read(keyFor(userId, `draft:${encodeURIComponent(sessionId)}`), options.storage, options.now ?? Date.now());
  return row?.session_id === sessionId && [row.draft,...Object.values(row.exercises || {})].some(draftHasEdits);
}

export function readWorkoutDraft(userId, sessionId, { storage, now = Date.now() } = {}) {
  if (!userId || !sessionId) return emptySetDraft();
  const row = read(keyFor(userId, `draft:${encodeURIComponent(sessionId)}`), storage, now);
  return row?.session_id === sessionId ? sanitizeSetDraft(row.draft) : emptySetDraft();
}

export function writeWorkoutDraft(userId, sessionId, draft, { storage, now = Date.now() } = {}) {
  if (!userId || !sessionId) return false;
  const key = keyFor(userId, `draft:${encodeURIComponent(sessionId)}`);
  const saved = read(key, storage, now);
  const previous = saved?.session_id === sessionId ? saved : null;
  const exercises = { ...(previous?.exercises || {}) };
  const priorDraft = sanitizeSetDraft(previous?.draft);
  if (priorDraft.exercise.trim()) exercises[draftExerciseKey(priorDraft)] = priorDraft;
  const next = sanitizeSetDraft(draft);
  if (next.exercise.trim()) {
    delete exercises[draftExerciseKey(next)];
    exercises[draftExerciseKey(next)] = next;
  }
  return write(key, {
    session_id: sessionId, draft: next, exercises: Object.fromEntries(Object.entries(exercises).slice(-100)),
  }, storage, now);
}

function draftExerciseKey(value) {
  return value.exercise_id ? `id:${value.exercise_id}` : `text:${String(value.exercise || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export function readExerciseDraft(userId, sessionId, exercise, { storage, now = Date.now() } = {}) {
  if (!userId || !sessionId) return null;
  const row = read(keyFor(userId, `draft:${encodeURIComponent(sessionId)}`), storage, now);
  if (row?.session_id !== sessionId) return null;
  const key = draftExerciseKey(exercise);
  const draft = row.exercises?.[key] || (draftExerciseKey(row.draft || {}) === key ? row.draft : null);
  return draft ? sanitizeSetDraft(draft) : null;
}

export function clearWorkoutDraft(userId, sessionId, { storage } = {}) {
  try { storageOrNull(storage)?.removeItem(keyFor(userId, `draft:${encodeURIComponent(sessionId)}`)); } catch { /* Storage may be unavailable. */ }
}

export function readTrainingWorkspace(userId, { storage, now = Date.now() } = {}) {
  if (!userId) return null;
  const row = read(keyFor(userId, 'workspace'), storage, now);
  if (!row || typeof row.tab !== 'string' || !['home', 'workout', 'projects', 'health', 'assistant', 'calendar', 'memos', 'finances', 'settings'].includes(row.tab)) return null;
  return { tab: row.tab, sessionId: typeof row.sessionId === 'string' ? row.sessionId.slice(0, 100) : null };
}

export function writeTrainingWorkspace(userId, workspace, { storage, now = Date.now() } = {}) {
  return write(keyFor(userId, 'workspace'), { tab: workspace.tab, sessionId: workspace.sessionId || null }, storage, now);
}

export function clearTrainingUser(userId, { storage } = {}) {
  if (!userId) return;
  try {
    const target = storageOrNull(storage);
    const prefix = keyFor(userId, '');
    const keys = Array.from({ length: target?.length || 0 }, (_, index) => target.key(index));
    keys.filter((key) => key?.startsWith(prefix)).forEach((key) => target.removeItem(key));
  } catch { /* Sign-out must still succeed when storage is unavailable. */ }
}

export function chooseWorkoutSession(rows, currentId, workspace, today) {
  const sessions = Array.isArray(rows) ? rows : [];
  const current = sessions.find((session) => session.id === currentId);
  if (current) return current.id;
  const saved = sessions.find((session) => session.id === workspace?.sessionId && !session.ended_at);
  return saved?.id ?? sessions.find((session) => !session.ended_at)?.id
    ?? sessions.find((session) => session.performed_on === today)?.id ?? null;
}

export function shouldResumeTraining({ pathname, workspace, sessions, userNavigated }) {
  return !userNavigated && pathname === '/' && workspace?.tab === 'workout'
    && Array.isArray(sessions) && sessions.some((session) => session.id === workspace.sessionId && !session.ended_at);
}
