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
  signInWithPassword: async () => {
    localStorage.setItem('qa-auth-attempts', String(Number(localStorage.getItem('qa-auth-attempts') || 0) + 1));
    await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-auth-delay') || 0)));
    if (localStorage.getItem('qa-auth-fail')) throw new Error('Test sign-in failed. Try again.');
    window.__qaSignIn('qa-user-b'); return { session: { user: user() } };
  },
  signUp: async () => {
    localStorage.setItem('qa-auth-attempts', String(Number(localStorage.getItem('qa-auth-attempts') || 0) + 1));
    if (localStorage.getItem('qa-auth-fail')) throw new Error('Test account creation failed. Try again.');
    return { session: null, user: { id: 'qa-unconfirmed' } };
  },
};
export const workoutApi = {
  list: async () => {
    await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-load-delay') || 0)));
    if (localStorage.getItem('qa-fail-load')) throw new Error('Test network unavailable');
    return read().filter((row) => row.user_id === user()?.id);
  },
  create: async (payload) => {
    await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-session-delay') || 0)));
    if (localStorage.getItem('qa-session-fail')) throw new Error('Workout session was not started.');
    const row = { ...payload, id: crypto.randomUUID(), user_id: user().id, workout_sets: [] };
    write([row, ...read()]); return row;
  },
  update: async (id, patch) => {
    if (patch.ended_at) localStorage.removeItem('qa-rest-timer');
    const rows = read().map((row) => row.id === id ? { ...row, ...patch } : row);
    write(rows); return rows.find((row) => row.id === id);
  },
  delete: async (id) => {
    await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-session-delete-delay') || 0)));
    if (localStorage.getItem('qa-session-delete-fail')) throw new Error('Workout session was not deleted.');
    localStorage.removeItem('qa-rest-timer');
    write(read().filter((row) => row.id !== id));
  },
};
export const workoutSetApi = {
  create: async (payload) => {
    if (localStorage.getItem('qa-fail-save')) throw new Error('Test connection lost. Set not saved.');
    const row = { ...payload, id: crypto.randomUUID(), user_id: user().id };
    const preferences = JSON.parse(localStorage.getItem('qa-rest-preferences') || 'null');
    if (preferences?.enabled) {
      const scheduled = Date.now() + preferences.duration_seconds * 1000;
      localStorage.setItem('qa-rest-timer', JSON.stringify({ id: row.id, workout_id: row.workout_id, exercise: row.exercise,
        next_set_number: row.is_warmup ? null : row.set_number + 1,
        scheduled_for: new Date(scheduled).toISOString(), expires_at: new Date(scheduled + 300000).toISOString() }));
    }
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
const templateRows = () => JSON.parse(localStorage.getItem('qa-templates') || '[]');
const saveTemplates = (rows) => localStorage.setItem('qa-templates', JSON.stringify(rows));
const templateMutation = async () => {
  await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-template-delay') || 0)));
  if (localStorage.getItem('qa-template-fail')) throw new Error('Template changes were not saved.');
};
export const workoutTemplateApi = {
  list: async () => templateRows().filter((row) => row.user_id === user()?.id),
  create: async (payload) => {
    await templateMutation(); const row = { ...payload, id: crypto.randomUUID(), user_id: user().id, workout_template_exercises: [] };
    saveTemplates([row, ...templateRows()]); return row;
  },
  update: async (id, patch) => {
    await templateMutation(); const rows = templateRows().map((row) => row.id === id ? { ...row, ...patch } : row);
    saveTemplates(rows); return rows.find((row) => row.id === id);
  },
  delete: async (id) => { await templateMutation(); saveTemplates(templateRows().filter((row) => row.id !== id)); },
};
export const workoutTemplateExerciseApi = {
  create: async (payload) => {
    await templateMutation(); const row = { ...payload, id: crypto.randomUUID(), user_id: user().id };
    saveTemplates(templateRows().map((template) => template.id === row.template_id ? { ...template, workout_template_exercises: [...template.workout_template_exercises, row] } : template)); return row;
  },
  update: async (id, patch) => {
    await templateMutation(); let updated;
    saveTemplates(templateRows().map((template) => ({ ...template, workout_template_exercises: template.workout_template_exercises.map((row) => {
      if (row.id !== id) return row;
      updated = { ...row, ...patch }; return updated;
    }) }))); return updated;
  },
  delete: async (id) => {
    await templateMutation(); saveTemplates(templateRows().map((template) => ({ ...template, workout_template_exercises: template.workout_template_exercises.filter((row) => row.id !== id) })));
  },
  reorder: async (updates) => {
    await templateMutation(); const result = [];
    saveTemplates(templateRows().map((template) => ({ ...template, workout_template_exercises: template.workout_template_exercises.map((row) => {
      const patch = updates.find((update) => update.id === row.id);
      if (!patch) return row;
      const next = { ...row, ...patch }; result.push(next); return next;
    }) }))); return result;
  },
};
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
const expenseRows = () => JSON.parse(localStorage.getItem('qa-expenses') || '[]');
const expenseMutation = async () => {
  await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-expense-delay') || 0)));
  if (localStorage.getItem('qa-expense-fail')) throw new Error('Expense changes were not saved.');
};
export const expenseApi = {
  list: async () => { if (localStorage.getItem('qa-expense-load-fail')) throw new Error('Expense history unavailable'); return expenseRows(); },
  listByDateRange: async (start, end) => (await expenseApi.list()).filter((row) => row.spent_on >= start && row.spent_on < end),
  create: async (payload) => {
    await expenseMutation(); const row = { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    localStorage.setItem('qa-expenses', JSON.stringify([row, ...expenseRows()])); return row;
  },
  update: async (id, patch) => {
    await expenseMutation(); const rows = expenseRows().map((row) => row.id === id ? { ...row, ...patch } : row);
    localStorage.setItem('qa-expenses', JSON.stringify(rows)); return rows.find((row) => row.id === id);
  },
  delete: async (id) => { await expenseMutation(); localStorage.setItem('qa-expenses', JSON.stringify(expenseRows().filter((row) => row.id !== id))); },
};
export const calendarEventApi = {
  list: async () => JSON.parse(localStorage.getItem('qa-calendar') || '[]'),
  listByRange: async (start, end) => {
    if (localStorage.getItem('qa-calendar-fail')) throw new Error('Test calendar unavailable');
    return (await calendarEventApi.list()).filter((row) => row.event_date >= start && row.event_date <= end);
  },
  create: async (payload) => {
    await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-calendar-delay') || 0)));
    if (localStorage.getItem('qa-calendar-fail')) throw new Error('Calendar changes were not saved.');
    const row = { ...payload, id: crypto.randomUUID() };
    localStorage.setItem('qa-calendar', JSON.stringify([row, ...await calendarEventApi.list()])); return row;
  },
  update: async (id, patch) => {
    if (localStorage.getItem('qa-calendar-fail')) throw new Error('Calendar changes were not saved.');
    const rows = (await calendarEventApi.list()).map((row) => row.id === id ? { ...row, ...patch } : row);
    localStorage.setItem('qa-calendar', JSON.stringify(rows)); return rows.find((row) => row.id === id);
  },
  delete: async (id) => {
    if (localStorage.getItem('qa-calendar-fail')) throw new Error('Calendar changes were not saved.');
    localStorage.setItem('qa-calendar', JSON.stringify((await calendarEventApi.list()).filter((row) => row.id !== id)));
  },
};
const checkMemoFailure = () => { if (localStorage.getItem('qa-memo-fail')) throw new Error('Memo changes were not saved.'); };
export const memoApi = {
  list: async () => JSON.parse(localStorage.getItem('qa-memos') || '[]'),
  create: async (payload) => {
    await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-memo-delay') || 0)));
    checkMemoFailure();
    const row = { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    localStorage.setItem('qa-memos', JSON.stringify([row, ...await memoApi.list()])); return row;
  },
  update: async (id, patch) => {
    checkMemoFailure();
    const rows = (await memoApi.list()).map((row) => row.id === id ? { ...row, ...patch, updated_at: new Date().toISOString() } : row);
    localStorage.setItem('qa-memos', JSON.stringify(rows)); return rows.find((row) => row.id === id);
  },
  delete: async (id) => { checkMemoFailure(); localStorage.setItem('qa-memos', JSON.stringify((await memoApi.list()).filter((row) => row.id !== id))); },
};
const readProjects = () => JSON.parse(localStorage.getItem('qa-projects') || '[]');
const writeProjects = (rows) => localStorage.setItem('qa-projects', JSON.stringify(rows));
const checkProjectFailure = () => { if (localStorage.getItem('qa-project-fail')) throw new Error('Project changes were not saved.'); };
export const projectApi = {
  list: async () => readProjects(),
  create: async (payload) => {
    checkProjectFailure();
    const row = { ...payload, id: crypto.randomUUID(), project_sessions: [] };
    writeProjects([row, ...readProjects()]); return row;
  },
  update: async (id, patch) => {
    checkProjectFailure();
    const rows = readProjects().map((row) => row.id === id ? { ...row, ...patch } : row);
    writeProjects(rows); return rows.find((row) => row.id === id);
  },
  delete: async (id) => { checkProjectFailure(); writeProjects(readProjects().filter((row) => row.id !== id)); },
};
export const projectSessionApi = {
  create: async (payload) => {
    checkProjectFailure();
    const row = { ...payload, id: crypto.randomUUID() };
    writeProjects(readProjects().map((project) => project.id === row.project_id ? { ...project, project_sessions: [row, ...(project.project_sessions || [])] } : project));
    return row;
  },
  update: async (id, patch) => {
    checkProjectFailure();
    let updated;
    writeProjects(readProjects().map((project) => ({ ...project, project_sessions: (project.project_sessions || []).map((row) => {
      if (row.id !== id) return row;
      updated = { ...row, ...patch }; return updated;
    }) })));
    return updated;
  },
  delete: async (id) => {
    checkProjectFailure();
    writeProjects(readProjects().map((project) => ({ ...project, project_sessions: (project.project_sessions || []).filter((row) => row.id !== id) })));
  },
};
export const projectMoneyEntryApi = {
  list: async () => JSON.parse(localStorage.getItem('qa-project-money') || '[]'),
  create: async (payload) => {
    checkProjectFailure();
    const row = { ...payload, id: crypto.randomUUID() };
    localStorage.setItem('qa-project-money', JSON.stringify([row, ...await projectMoneyEntryApi.list()])); return row;
  },
  update: async (id, patch) => {
    checkProjectFailure();
    const rows = (await projectMoneyEntryApi.list()).map((row) => row.id === id ? { ...row, ...patch } : row);
    localStorage.setItem('qa-project-money', JSON.stringify(rows)); return rows.find((row) => row.id === id);
  },
  delete: async (id) => {
    checkProjectFailure();
    localStorage.setItem('qa-project-money', JSON.stringify((await projectMoneyEntryApi.list()).filter((row) => row.id !== id)));
  },
};
export const dailyReviewApi = emptyApi;
export const aiActionLogApi = { list: async () => JSON.parse(localStorage.getItem('qa-action-logs') || '[]') };
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
export const aiInsightApi = { list: async () => JSON.parse(localStorage.getItem('qa-insights') || '[]') };
export const aiMemoryApi = {
  list: async () => JSON.parse(localStorage.getItem('qa-memories') || '[]'),
  update: async (id, patch) => {
    if (localStorage.getItem('qa-memory-fail')) throw new Error('Memory was not saved.');
    const rows = JSON.parse(localStorage.getItem('qa-memories') || '[]').map((row) => row.id === id ? { ...row, ...patch } : row);
    localStorage.setItem('qa-memories', JSON.stringify(rows)); return rows.find((row) => row.id === id);
  },
  archive: async (id) => {
    await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-memory-delay') || 0)));
    if (localStorage.getItem('qa-memory-fail')) throw new Error('Memory was not forgotten.');
    const rows = JSON.parse(localStorage.getItem('qa-memories') || '[]');
    const row = rows.find((item) => item.id === id);
    localStorage.setItem('qa-memories', JSON.stringify(rows.filter((item) => item.id !== id)));
    return row;
  },
};
const reportRows = () => JSON.parse(localStorage.getItem('qa-reports') || '[]');
const reportMutation = async () => {
  await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-report-delay') || 0)));
  if (localStorage.getItem('qa-report-fail')) throw new Error('Report was not saved or archived.');
};
export const aiReportApi = {
  list: async () => reportRows(),
  saveMessage: async (payload) => {
    await reportMutation();
    const row = { ...payload, id: crypto.randomUUID(), status: 'active', created_at: new Date().toISOString() };
    localStorage.setItem('qa-reports', JSON.stringify([row, ...reportRows()]));
    return row;
  },
  archive: async (id) => {
    await reportMutation();
    const row = reportRows().find((item) => item.id === id);
    localStorage.setItem('qa-reports', JSON.stringify(reportRows().filter((item) => item.id !== id)));
    return { ...row, status: 'archived' };
  },
  reembed: async () => {
    await reportMutation();
    return { processed_count: 1, ready_count: 1, configured: true };
  },
};

const watchState = () => JSON.parse(localStorage.getItem('qa-watch') || '{"watch":null,"context":[{"field":"next_action","text":"Review release checklist"}],"permissions":{"monitor":false,"message":false}}');
const shares = () => JSON.parse(localStorage.getItem('qa-community-shares') || '[]');
const storeShares = rows => localStorage.setItem('qa-community-shares', JSON.stringify(rows));
export const communityApi = {
  async feed(userId, { cursor, author } = {}) {
    const rows = shares().filter(s => !author || s.author_id === author).sort((a,b) => b.published_at.localeCompare(a.published_at) || b.id.localeCompare(a.id));
    await new Promise(resolve => setTimeout(resolve, Number(localStorage.getItem('qa-community-delay') || 0)));
    if (localStorage.getItem('qa-community-fail')) throw new Error('Unavailable');
    return rows.slice(cursor ? rows.findIndex(s => s.id === cursor.id) + 1 : 0).slice(0,10);
  },
  async detail(userId, id) { return shares().find(s => s.id === id) || null; },
  async members(userId, { search = '', offset = 0 } = {}) { return JSON.parse(localStorage.getItem('qa-community-members') || '[]').filter(p => `${p.username} ${p.display_name}`.toLowerCase().includes(search.toLowerCase())).slice(offset, offset + 20); },
  async member(userId, id) { return JSON.parse(localStorage.getItem('qa-community-members') || '[]').find(p => p.user_id === id) || null; },
  async status(userId, workoutId) { return shares().find(s => s.source === workoutId && s.author_id === userId)?.id || null; },
  async preview(userId, workoutId, notes, rpe) {
    const w = read().find(w => w.id === workoutId && w.user_id === userId);
    const settings = await userSettingsApi.read();
    if (!w?.ended_at || !settings.preferences.workout_sharing || (notes && !settings.preferences.share_workout_notes)) throw new Error('Not allowed');
    return { title: w.name, performed_on: w.performed_on, notes: notes ? w.notes : null, sets: w.workout_sets.map(s => ({ ...s, notes: notes ? s.notes : null, rpe: rpe ? s.rpe : null })), exercise_count: new Set(w.workout_sets.map(s => s.exercise_id || s.exercise)).size, set_count: w.workout_sets.length };
  },
  async publish(userId, workoutId, notes, rpe) {
    const value = await this.preview(userId, workoutId, notes, rpe);
    const previous = shares().find(s => s.source === workoutId);
    const profile = (await userSettingsApi.read()).profile;
    const row = { ...value, id: previous?.id || crypto.randomUUID(), source: workoutId, author_id: userId, author: { ...profile, user_id: userId }, published_at: previous?.published_at || new Date().toISOString(), exercise_preview: value.sets.slice(0,3) };
    storeShares([...shares().filter(s => s.id !== row.id), row]);return row;
  },
  async withdraw(userId, workoutId) { storeShares(shares().filter(s => s.source !== workoutId || s.author_id !== userId)); },
  async withdrawShared(userId, id) { storeShares(shares().filter(s => s.id !== id || s.author_id !== userId)); },
};
export const userSettingsApi = {
  read: async () => JSON.parse(localStorage.getItem(`qa-settings:${user().id}`) || JSON.stringify({ profile: localStorage.getItem('qa-profile-incomplete') ? null : { username: 'qa_user', display_name: 'QA User' }, preferences: { language: 'en', workout_sharing: false, share_workout_notes: false } })),
  async save(profile, preferences) { const next = { profile, preferences }; localStorage.setItem(`qa-settings:${user().id}`, JSON.stringify(next)); if (!preferences.workout_sharing) storeShares(shares().filter(s => s.author_id !== user().id)); else if (!preferences.share_workout_notes) storeShares(shares().map(s => s.author_id === user().id ? { ...s, notes: null, sets: s.sets.map(v => ({...v, notes:null})) } : s)); return next; },
  async savePreferences(preferences) { const next = { ...await this.read(), preferences }; localStorage.setItem(`qa-settings:${user().id}`, JSON.stringify(next)); return preferences; },
};

export const workoutRestApi = {
  status: async () => ({ preferences: JSON.parse(localStorage.getItem('qa-rest-preferences') || '{"enabled":false,"duration_seconds":120}'), timer: JSON.parse(localStorage.getItem('qa-rest-timer') || 'null') }),
  control: async (body) => {
    if (body.operation === 'configure') localStorage.setItem('qa-rest-preferences', JSON.stringify({ enabled: body.enabled, duration_seconds: body.duration_seconds }));
    if (body.operation === 'cancel' || (body.operation === 'configure' && !body.enabled)) localStorage.removeItem('qa-rest-timer');
    return workoutRestApi.status();
  },
};

export const companionAppApi = {
  context: async () => {
    await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-context-delay') || 0)));
    if (localStorage.getItem('qa-context-fail')) throw new Error('Current understanding is unavailable.');
    return { permissions: watchState().permissions, assumptions: JSON.parse(localStorage.getItem('qa-assumptions') || '[{"label":"Creatine","text":"inactive","kind":"routine","uncertain":false}]'), watches: [] };
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
