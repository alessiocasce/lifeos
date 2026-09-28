import { localDate } from '../../src/utils/date';

const user = () => JSON.parse(localStorage.getItem('qa-user') ?? '{"id":"qa-user-a","email":"qa@example.test"}');
const initialSession = () => ({
  id: 'qa-session-a', user_id: 'qa-user-a', name: 'Pull session', performed_on: localDate(),
  started_at: new Date().toISOString(), ended_at: null, template_snapshot: [], workout_sets: [],
});
const read = () => JSON.parse(localStorage.getItem('qa-workouts') || JSON.stringify([initialSession()]));
const write = (rows) => localStorage.setItem('qa-workouts', JSON.stringify(rows));
let authListener;
window.__qaSignIn = (id) => {
  const next = { id, email: `${id}@example.test` };
  localStorage.setItem('qa-user', JSON.stringify(next));
  authListener?.('SIGNED_IN', { user: next });
};
window.__qaAuthRefresh = () => authListener?.('TOKEN_REFRESHED', { user: user() });
const emptyApi = new Proxy({}, { get: () => async () => [] });
export const authApi = {
  getSession: async () => ({ session: user() ? { user: user() } : null }),
  onAuthStateChange: (fn) => { authListener = fn; return { unsubscribe() { authListener = null; } }; },
  signOut: async () => { localStorage.setItem('qa-user', 'null'); authListener?.('SIGNED_OUT', null); },
  signInWithPassword: async () => { window.__qaSignIn('qa-user-b'); return { session: { user: user() } }; },
};
export const workoutApi = {
  list: async () => {
    await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-load-delay') || 0)));
    if (localStorage.getItem('qa-fail-load')) throw new Error('Test network unavailable');
    return read().filter((row) => row.user_id === user()?.id);
  },
  create: async (payload) => {
    const row = { ...payload, id: crypto.randomUUID(), user_id: user().id, workout_sets: [] };
    write([row, ...read()]); return row;
  },
  update: async (id, patch) => {
    const rows = read().map((row) => row.id === id ? { ...row, ...patch } : row);
    write(rows); return rows.find((row) => row.id === id);
  },
  delete: async (id) => write(read().filter((row) => row.id !== id)),
};
export const workoutSetApi = {
  create: async (payload) => {
    if (localStorage.getItem('qa-fail-save')) throw new Error('Test connection lost. Set not saved.');
    const row = { ...payload, id: crypto.randomUUID(), user_id: user().id };
    write(read().map((session) => session.id === row.workout_id ? { ...session, workout_sets: [...session.workout_sets, row] } : session));
    return row;
  },
  update: async (id, patch) => {
    let updated;
    write(read().map((session) => ({ ...session, workout_sets: session.workout_sets.map((set) => {
      if (set.id !== id) return set;
      updated = { ...set, ...patch }; return updated;
    }) })));
    return updated;
  },
  delete: async (id) => write(read().map((session) => ({ ...session, workout_sets: session.workout_sets.filter((set) => set.id !== id) }))),
};
export const workoutTemplateApi = emptyApi;
export const workoutTemplateExerciseApi = emptyApi;
export const healthLogApi = emptyApi;
export const expenseApi = emptyApi;
export const calendarEventApi = emptyApi;
export const memoApi = emptyApi;
export const projectApi = emptyApi;
export const projectSessionApi = emptyApi;
export const projectMoneyEntryApi = emptyApi;
export const dailyReviewApi = emptyApi;
export const aiActionLogApi = emptyApi;
export const aiChatMessageApi = emptyApi;
export const aiChatThreadApi = emptyApi;
export const aiInsightApi = emptyApi;
export const aiMemoryApi = emptyApi;
export const aiReportApi = emptyApi;
