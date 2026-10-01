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
export const healthLogApi = {
  list: async () => JSON.parse(localStorage.getItem('qa-health') || '[]'),
  getByDate: async (date) => (await healthLogApi.list()).find((row) => row.logged_on === date) ?? null,
  create: async (payload) => {
    if (localStorage.getItem('qa-health-fail')) throw new Error('Health changes were not saved.');
    const row = { ...payload, id: crypto.randomUUID(), updated_at: new Date().toISOString() };
    localStorage.setItem('qa-health', JSON.stringify([row, ...await healthLogApi.list()]));
    return row;
  },
  update: async (id, patch) => {
    if (localStorage.getItem('qa-health-fail')) throw new Error('Health changes were not saved.');
    const rows = (await healthLogApi.list()).map((row) => row.id === id ? { ...row, ...patch, updated_at: new Date().toISOString() } : row);
    localStorage.setItem('qa-health', JSON.stringify(rows));
    return rows.find((row) => row.id === id);
  },
};
export const expenseApi = emptyApi;
export const calendarEventApi = {
  list: async () => JSON.parse(localStorage.getItem('qa-calendar') || '[]'),
  listByRange: async (start, end) => {
    if (localStorage.getItem('qa-calendar-fail')) throw new Error('Test calendar unavailable');
    return (await calendarEventApi.list()).filter((row) => row.event_date >= start && row.event_date <= end);
  },
};
export const memoApi = { list: async () => JSON.parse(localStorage.getItem('qa-memos') || '[]') };
export const projectApi = { list: async () => JSON.parse(localStorage.getItem('qa-projects') || '[]') };
export const projectSessionApi = emptyApi;
export const projectMoneyEntryApi = emptyApi;
export const dailyReviewApi = emptyApi;
export const aiActionLogApi = emptyApi;
export const aiChatMessageApi = { list: async (threadId) => JSON.parse(localStorage.getItem('qa-chat-messages') || '[]').filter((row) => row.thread_id === threadId) };
export const aiChatThreadApi = {
  list: async () => JSON.parse(localStorage.getItem('qa-chat-threads') || '[]'),
  create: async () => {
    const thread = { id: crypto.randomUUID(), title: 'New conversation', status: 'active', updated_at: new Date().toISOString() };
    localStorage.setItem('qa-chat-threads', JSON.stringify([thread, ...await aiChatThreadApi.list()]));
    return thread;
  },
};
export async function sendLifeOSAiMessage(message, threadId, { clientRequestId }) {
  const requests = JSON.parse(localStorage.getItem('qa-brain-requests') || '[]');
  localStorage.setItem('qa-brain-requests', JSON.stringify([...requests, { message, threadId, clientRequestId }]));
  if (localStorage.getItem('qa-brain-fail')) throw new Error('Test Brain unavailable.');
  const rows = JSON.parse(localStorage.getItem('qa-chat-messages') || '[]');
  const answer = 'Recorded in this test conversation.';
  if (!rows.some((row) => row.client_request_id === clientRequestId)) {
    for (const [role, content] of [['user', message], ['assistant', answer]]) rows.push({ id: crypto.randomUUID(), thread_id: threadId, role, content, client_request_id: clientRequestId, created_at: new Date().toISOString() });
    localStorage.setItem('qa-chat-messages', JSON.stringify(rows));
  }
  return { answer, thread_id: threadId, actions: [] };
}
export const aiInsightApi = emptyApi;
export const aiMemoryApi = {
  list: async () => JSON.parse(localStorage.getItem('qa-memories') || '[]'),
  update: async (id, patch) => {
    if (localStorage.getItem('qa-memory-fail')) throw new Error('Memory was not saved.');
    const rows = JSON.parse(localStorage.getItem('qa-memories') || '[]').map((row) => row.id === id ? { ...row, ...patch } : row);
    localStorage.setItem('qa-memories', JSON.stringify(rows)); return rows.find((row) => row.id === id);
  },
  archive: async (id) => {
    const rows = JSON.parse(localStorage.getItem('qa-memories') || '[]');
    const row = rows.find((item) => item.id === id);
    localStorage.setItem('qa-memories', JSON.stringify(rows.filter((item) => item.id !== id)));
    return row;
  },
};
export const aiReportApi = emptyApi;

const watchState = () => JSON.parse(localStorage.getItem('qa-watch') || '{"watch":null,"context":[{"field":"next_action","text":"Review release checklist"}],"permissions":{"monitor":false,"message":false}}');
export const companionAppApi = {
  context: async () => {
    if (localStorage.getItem('qa-context-fail')) throw new Error('Current understanding is unavailable.');
    return { permissions: watchState().permissions, assumptions: [{ label: 'Creatine', text: 'inactive', kind: 'routine', uncertain: false }], watches: [] };
  },
  watch: async () => watchState(),
  permissions: async () => ({ permissions: watchState().permissions }),
  setPermission: async (permission, enabled) => {
    const data = watchState();
    data.permissions[permission] = enabled;
    localStorage.setItem('qa-watch', JSON.stringify(data));
    return { permissions: data.permissions };
  },
  setWatch: async (projectId, operation) => {
    if (localStorage.getItem('qa-watch-fail')) throw new Error('Watch was not saved.');
    const data = watchState();
    if (operation === 'enable' && !data.permissions.monitor) throw new Error('Monitoring permission required.');
    data.watch = { id: data.watch?.id || 'qa-watch-id', state: { enable: 'active', suspend: 'suspended', retire: 'retired' }[operation], last_checked_at: null, last_triggered_at: null };
    localStorage.setItem('qa-watch', JSON.stringify(data));
    return data;
  },
};
