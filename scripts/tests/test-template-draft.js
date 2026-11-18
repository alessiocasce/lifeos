import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results', { recursive: true });
const actor = 'owner';
const initial = { id: 'template', name: 'Old name', notes: 'Session note', color_key: 'blue', icon_key: 'dumbbell',
  workout_template_exercises: [{ id: 'old-a', template_id: 'template', exercise: 'Custom A', exercise_id: null, notes: null, exercise_order: 1 },
    { id: 'old-b', template_id: 'template', exercise: 'Custom B', exercise_id: null, notes: 'Keep note', exercise_order: 2 }] };
let state = structuredClone(initial), lostStage = true, writes = 0;
const clone = value => structuredClone(value);
globalThis.__templateDraftClient = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }), getUser: async () => ({ data: { user: { id: actor } } }) },
  from(table) {
    const query = { operation: 'read', filters: [] };
    const execute = () => {
      assert.equal(query.authorization, 'Bearer test-token');
      if (table === 'workout_templates') {
        if (query.operation === 'update') { writes++; state = { ...state, ...query.payload }; return { data: { id: state.id }, error: null }; }
        return { data: clone(state), error: null };
      }
      if (query.operation === 'delete') {
        writes++; const ids = query.filters.find(filter => filter[0] === 'in')[2];
        state.workout_template_exercises = state.workout_template_exercises.filter(row => !ids.includes(row.id));
        return { data: null, error: null };
      }
      const next = new Map(state.workout_template_exercises.map(row => [row.id, row]));
      for (const row of query.payload) next.set(row.id, { ...next.get(row.id), ...row });
      const orders = [...next.values()].map(row => row.exercise_order);
      assert.equal(new Set(orders).size, orders.length, 'No duplicate order during either upsert phase');
      state.workout_template_exercises = [...next.values()]; writes++;
      if (lostStage) { lostStage = false; return { data: null, error: new Error('Simulated lost stage response') }; }
      return { data: clone(query.payload), error: null };
    };
    let proxy;
    proxy = new Proxy({}, { get: (_, method) => method === 'then'
      ? (resolve, reject) => Promise.resolve().then(execute).then(resolve, reject)
      : (...args) => {
        if (['upsert', 'update', 'delete'].includes(method)) { query.operation = method; query.payload = args[0]; }
        else if (method === 'eq' || method === 'in') query.filters.push([method, ...args]);
        else if (method === 'setHeader') query.authorization = args[1];
        return proxy;
      } });
    return proxy;
  },
};
await build({ entryPoints: ['src/services/lifeosApi.js'], bundle: true, platform: 'node', format: 'esm', packages: 'external',
  outfile: 'test-results/template-service-under-test.mjs', plugins: [{ name: 'draft-client', setup(build) {
    build.onResolve({ filter: /lib\/supabaseClient$/ }, () => ({ path: 'client', namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const isSupabaseConfigured=true; export const supabase=globalThis.__templateDraftClient;' }));
  } }] });
const { workoutTemplateApi } = await import('../../test-results/template-service-under-test.mjs');
const draft = { baseline: initial, details: { name: 'New name', notes: initial.notes, color_key: 'green', icon_key: 'dumbbell' },
  exercises: [{ ...initial.workout_template_exercises[1], draft_id: 'old-b' }, { draft_id: 'new-c', exercise: 'Custom C', exercise_id: null, notes: '' }] };
await assert.rejects(workoutTemplateApi.saveDraft('template', draft, actor), /lost stage response/);
const saved = await workoutTemplateApi.saveDraft('template', draft, actor);
assert.equal(saved.name, 'New name'); assert.equal(saved.notes, 'Session note');
assert.deepEqual(saved.workout_template_exercises.map(row => row.id), ['old-b', 'new-c']);
assert.equal(saved.workout_template_exercises[0].notes, 'Keep note');
assert.deepEqual(saved.workout_template_exercises.map(row => row.exercise_order), [1, 2]);
const previousWrites = writes;
await assert.rejects(workoutTemplateApi.saveDraft('template', draft, 'other-user'), /Reload settings/);
assert.equal(writes, previousWrites);
const freshBaseline = clone(state);
const nameOnly = { baseline: freshBaseline, details: { ...freshBaseline, name: 'Metadata only' }, exercises: clone(freshBaseline.workout_template_exercises) };
state.workout_template_exercises.reverse().forEach((row, index) => { row.exercise_order = index + 1; });
await assert.rejects(workoutTemplateApi.saveDraft('template', nameOnly, actor), /Reopen Manage/);
assert.equal(writes, previousWrites, 'External reordering must never be overwritten by a metadata-only edit');
state = clone(freshBaseline);
await workoutTemplateApi.saveDraft('template', nameOnly, actor);
assert.equal(writes, previousWrites + 1, 'Metadata-only save updates metadata without exercise writes');
const writesAfterMetadata = writes;
state.workout_template_exercises.push({ id: 'external', exercise: 'External', exercise_order: 3 });
await assert.rejects(workoutTemplateApi.saveDraft('template', draft, actor), /Reopen Manage/);
assert.equal(writes, writesAfterMetadata);
console.log('Reviewed production save helper: unique staging/final order, lost-response retry, retained IDs/notes, explicit removals, identity rejection and unexpected-row conflict. No live database writes.');
