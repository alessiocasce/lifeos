import { localDate } from '../../src/utils/date';
import { exerciseIdentityKey, resolveExercise } from '../../src/utils/exerciseCatalog';

// Opt-in preview data on the isolated QA origin, never the production API.
if (location.hostname === '127.0.0.1' && new URLSearchParams(location.search).get('history-preview') === '1'
  && !sessionStorage.getItem('qa-history-preview-seeded')) {
  sessionStorage.setItem('qa-history-preview-seeded', 'true');
  localStorage.setItem('qa-user', JSON.stringify({ id: 'qa-user-a', email: 'qa@example.test' }));
  localStorage.setItem('qa-workouts', JSON.stringify([{
    id: 'preview-chest', user_id: 'qa-user-a', name: 'Chest', performed_on: '2026-10-28',
    started_at: '2026-10-28T09:00:00Z', ended_at: '2026-10-28T10:00:00Z', updated_at: '2026-10-28T10:00:00Z',
    template_appearance: { color_key: 'blue', icon_key: 'chest' },
    workout_sets: ['Incline Barbell Bench Press','Dumbbell Bench Press','Pectoral Machine'].flatMap((exercise,index) =>
      [1,2,3].map(number => ({ id: 'preview-' + index + '-' + number, workout_id: 'preview-chest', user_id: 'qa-user-a',
        exercise, exercise_id: resolveExercise(exercise)?.id || null, set_number: number, is_warmup: false,
        weight: index === 1 ? 30 : 50, reps: 10, rpe: number === 2 ? 10 : null,
        notes: index === 0 && number === 2 ? 'Paused last rep' : null,
        performed_at: '2026-10-28T09:30:00Z', updated_at: '2026-10-28T10:00:00Z' }))),
  }]));
}

const user = () => JSON.parse(localStorage.getItem('qa-user') ?? '{"id":"qa-user-a","email":"qa@example.test"}');
const initialSession = () => ({
  id: 'qa-session-a', user_id: 'qa-user-a', name: 'Pull session', performed_on: localDate(),
  started_at: new Date().toISOString(), ended_at: null, template_snapshot: [], workout_sets: [],
});
const read = () => JSON.parse(localStorage.getItem('qa-workouts') || JSON.stringify([initialSession()]));
const write = (rows) => { localStorage.setItem('qa-workouts', JSON.stringify(rows)); reconcileCommunityUser(user()?.id); };
const workoutMutation = async (operation, id, patch, options = {}) => {
  const calls = JSON.parse(localStorage.getItem('qa-workout-mutations') || '[]');
  localStorage.setItem('qa-workout-mutations', JSON.stringify([...calls, { operation, id, patch, options }]));
  await new Promise(resolve => setTimeout(resolve, Number(localStorage.getItem(`qa-${operation}-delay`) || 0)));
  if (operation !== 'session-delete' && localStorage.getItem(`qa-${operation}-fail`)) throw new Error('Historical changes were not saved.');
  const row = operation.startsWith('session') ? read().find(row => row.id === id)
    : read().flatMap(row => row.workout_sets).find(row => row.id === id);
  if (Object.entries({ expectedUpdatedAt: 'updated_at', expectedEndedAt: 'ended_at' })
    .some(([key, field]) => options[key] !== undefined && (!row || row[field] !== options[key]))) {
    throw new Error('This record changed. Refresh History before editing.');
  }
};
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
  signUp: async ({ username }) => {
    if (!/^[a-z][a-z0-9_]{2,23}$/i.test(username || '')) throw new Error('Use a 3–24 character username starting with a letter.');
    if (!await identityApi.available(username)) throw new Error('Username is already taken.');
    localStorage.setItem('qa-pending-username', username);
    localStorage.setItem('qa-auth-attempts', String(Number(localStorage.getItem('qa-auth-attempts') || 0) + 1));
    if (localStorage.getItem('qa-auth-fail')) throw new Error('Test account creation failed. Try again.');
    return { session: null, user: { id: 'qa-unconfirmed' } };
  },
};
export const workoutApi = {
  page: async (cursor = null) => {
    if (cursor && localStorage.getItem('qa-history-page-fail')) throw new Error('Older workouts could not be loaded.');
    const rows = (await workoutApi.list()).slice().sort((a,b) => b.performed_on.localeCompare(a.performed_on)
      || (b.started_at || '').localeCompare(a.started_at || '') || b.id.localeCompare(a.id));
    const older = cursor ? rows.filter(row => row.performed_on < cursor.date
      || row.performed_on === cursor.date && ((row.started_at || '') < (cursor.started || '')
        || (row.started_at || '') === (cursor.started || '') && row.id < cursor.id)) : rows;
    const page = older.slice(0, 25);
    const last = page.at(-1);
    return { rows: page, hasMore: older.length > 25, cursor: last ? { id: last.id, date: last.performed_on, started: last.started_at } : null };
  },
  get: async id => read().find(row => row.id === id && row.user_id === user()?.id) || null,
  list: async () => {
    await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-load-delay') || 0)));
    if (localStorage.getItem('qa-fail-load')) throw new Error('Test network unavailable');
    localStorage.setItem('qa-workout-loads', String(Number(localStorage.getItem('qa-workout-loads') || 0) + 1));
    return read().filter((row) => row.user_id === user()?.id);
  },
  create: async (payload) => {
    await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-session-delay') || 0)));
    if (localStorage.getItem('qa-session-fail')) throw new Error('Workout session was not started.');
    const row = { ...payload, id: crypto.randomUUID(), user_id: user().id, workout_sets: [] };
    write([row, ...read()]); return row;
  },
  update: async (id, patch, options) => {
    await workoutMutation('session-update', id, patch, options);
    const rows = read().map((row) => row.id === id ? { ...row, ...patch, updated_at: new Date().toISOString() } : row);
    write(rows); return rows.find((row) => row.id === id);
  },
  delete: async (id, options) => {
    await workoutMutation('session-delete', id, undefined, options);
    await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-session-delete-delay') || 0)));
    if (localStorage.getItem('qa-session-delete-fail')) throw new Error('Workout session was not deleted.');
    write(read().filter((row) => row.id !== id));
  },
};
export const workoutSetApi = {
  deleteExercise: async (workoutId, endedAt, sets) => {
    await workoutMutation('exercise-delete', workoutId);
    const session = read().find(row => row.id === workoutId && row.user_id === user()?.id);
    const group = session?.workout_sets.filter(set => exerciseIdentityKey(set) === exerciseIdentityKey(sets[0])) || [];
    if (!session || session.ended_at !== endedAt || group.length !== sets.length
      || group.some(set => !sets.some(expected => expected.id === set.id && expected.updated_at === set.updated_at))) {
      throw new Error('Exercise changed. Refresh History before deleting.');
    }
    const ids = sets.map(set => set.id);
    write(read().map(row => row.id === workoutId ? { ...row, workout_sets: row.workout_sets.filter(set => !ids.includes(set.id)) } : row));
    return ids;
  },
  create: async (payload) => {
    await workoutMutation('set-create', payload.workout_id, payload);
    if (localStorage.getItem('qa-fail-save')) throw new Error('Test connection lost. Set not saved.');
    const row = { ...payload, id: crypto.randomUUID(), user_id: user().id, updated_at: new Date().toISOString() };
    write(read().map((session) => session.id === row.workout_id ? { ...session, workout_sets: [...session.workout_sets, row] } : session));
    return row;
  },
  update: async (id, patch, options) => {
    await workoutMutation('set-update', id, patch, options);
    let updated;
    write(read().map((session) => ({ ...session, workout_sets: session.workout_sets.map((set) => {
      if (set.id !== id) return set;
      updated = { ...set, workout_id: session.id, ...patch, updated_at: new Date().toISOString() }; return updated;
    }) })));
    return updated;
  },
  delete: async (id, options) => {
    await workoutMutation('set-delete', id, undefined, options);
    write(read().map((session) => ({ ...session, workout_sets: session.workout_sets.filter((set) => set.id !== id) })));
  },
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
const fixtureSettings = id => JSON.parse(localStorage.getItem(`qa-settings:${id}`) || JSON.stringify({ profile: localStorage.getItem('qa-profile-incomplete') ? null : { user_id: id, username: 'qa_user' }, preferences: { language: 'en', workout_sharing: true, share_workout_notes: false } }));
function reconcileCommunityUser(id) {
  if (!id) return;
  const settings = fixtureSettings(id), previous = shares();
  const retained = previous.filter(s => s.author_id !== id || !s.source);
  if (!settings.preferences.workout_sharing || !settings.profile) { storeShares(previous.filter(s => s.author_id !== id)); return; }
  const notes = settings.preferences.share_workout_notes;
  const projected = read().filter(w => w.user_id === id && w.ended_at && w.workout_sets?.length && w.workout_sets.length <= 500).map(w => {
    const sets = w.workout_sets.map(s => ({ exercise:s.exercise,exercise_id:s.exercise_id ?? null,set_number:s.set_number,is_warmup:s.is_warmup,weight:s.weight,reps:s.reps,rpe:s.rpe,notes:notes?s.notes:null }));
    const old = previous.find(s => s.source === w.id);
    return { id:old?.id || crypto.randomUUID(),source:w.id,author_id:id,author:{...settings.profile,user_id:id},title:w.name,performed_on:w.performed_on,
      published_at:old?.published_at || new Date().toISOString(),notes:notes?w.notes:null,sets,set_count:sets.length,exercise_count:new Set(sets.map(s=>s.exercise_id||s.exercise)).size,exercise_preview:sets.slice(0,3) };
  });
  storeShares([...retained,...projected]);
}
export const communityApi = {
  async feed(userId, { cursor, author } = {}) {
    reconcileCommunityUser(userId);
    const rows = shares().filter(s => !author || s.author_id === author).sort((a,b) => b.performed_on.localeCompare(a.performed_on) || b.id.localeCompare(a.id));
    await new Promise(resolve => setTimeout(resolve, Number(localStorage.getItem('qa-community-delay') || 0)));
    if (localStorage.getItem('qa-community-fail')) throw new Error('Unavailable');
    return rows.slice(cursor ? rows.findIndex(s => s.id === cursor.id) + 1 : 0).slice(0,10);
  },
  async detail(userId, id) { reconcileCommunityUser(userId); return shares().find(s => s.id === id) || null; },
  async members(userId, { search = '', offset = 0 } = {}) { return JSON.parse(localStorage.getItem('qa-community-members') || '[]').filter(p => p.username.toLowerCase().includes(search.toLowerCase())).slice(offset, offset + 20); },
  async member(userId, id) { return JSON.parse(localStorage.getItem('qa-community-members') || '[]').find(p => p.user_id === id) || null; },
  async status(userId, workoutId) { reconcileCommunityUser(userId); return shares().find(s => s.source === workoutId && s.author_id === userId)?.id || null; },
};
export const userSettingsApi = {
  read: async () => fixtureSettings(user().id),
  async save(profile, preferences) { const next = { profile, preferences }; localStorage.setItem(`qa-settings:${user().id}`, JSON.stringify(next)); reconcileCommunityUser(user().id); return next; },
  async savePreferences(preferences) { const next = { ...await this.read(), preferences }; localStorage.setItem(`qa-settings:${user().id}`, JSON.stringify(next)); reconcileCommunityUser(user().id); return preferences; },
};
export const identityApi = {
  available: async username => !['taken','qa_user'].includes(username.toLowerCase()),
  async complete(username) {
    const candidate = username || user()?.user_metadata?.requested_username;
    if (!/^[a-z][a-z0-9_]{2,23}$/i.test(candidate || '')) throw new Error('Choose an available username to complete your profile.');
    if (!await this.available(candidate)) throw new Error('Username is already taken.');
    const current = fixtureSettings(user().id);
    localStorage.setItem(`qa-settings:${user().id}`, JSON.stringify({ ...current, profile: { user_id: user().id, username: candidate } }));
  },
};

export const profilePhotoApi = {
  async signedUrl(profile) { return profile?.avatar_url || null; },
  async upload(blob) {
    if (localStorage.getItem('qa-photo-fail')) throw new Error('Profile photo could not be saved.');
    const avatar_url = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
    const next = fixtureSettings(user().id);
    next.profile = { ...next.profile, avatar_path: `${user().id}/photo.webp`, avatar_url };
    localStorage.setItem(`qa-settings:${user().id}`, JSON.stringify(next));
    return next.profile;
  },
  async remove() {
    const next = fixtureSettings(user().id);
    next.profile = { ...next.profile, avatar_path: null, avatar_url: null };
    localStorage.setItem(`qa-settings:${user().id}`, JSON.stringify(next));
    return next.profile;
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
