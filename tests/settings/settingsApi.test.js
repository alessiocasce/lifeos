import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('public settings API normalizes identity, preserves other profile fields, and binds requests to the authenticated owner', async () => {
  const calls = [];
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  let signedIn = A;
  let table;
  const query = new Proxy({}, { get: (_, method) => method === 'then'
    ? resolve => resolve({ data: table === 'availability' ? true : table === 'user_preferences' ? null : { user_id: A, username: 'ale_123', avatar_path: 'unchanged' }, error: null })
    : (...args) => { calls.push([method, ...args]); return query; } });
  globalThis.__settingsClient = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: signedIn, user: { id: signedIn } } } }),
      getUser: async token => ({ data: { user: { id: token } } }),
      signUp: async payload => { calls.push(['signup', payload]); return { data: { session: null }, error: null }; },
    },
    from: name => { table = name; calls.push(['from', name]); return query; },
    rpc: (name, payload) => { table = name === 'username_available' ? 'availability' : 'rpc'; calls.push(['rpc', name, payload]); return query; },
  };
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, plugins: [{
    name: 'isolated-settings-client', enforce: 'pre',
    resolveId(source) { if (/lib\/supabaseClient$/.test(source)) return '\0settings-client'; },
    load(id) { if (id === '\0settings-client') return 'export const isSupabaseConfigured = true; export const supabase = globalThis.__settingsClient;'; },
  }] });
  try {
    const { userSettingsApi, identityApi, authApi, workoutTemplateApi, workoutTemplateExerciseApi } = await server.ssrLoadModule('/src/services/lifeosApi.js');
    await userSettingsApi.saveProfile({ username: ' Ale_123 ', avatar_path: 'arbitrary' }, A);
    assert.deepEqual(calls.find(call => call[0] === 'upsert')[1], { user_id: A, username: 'ale_123' });
    assert.ok(calls.some(call => call[0] === 'setHeader' && call[1] === 'Authorization' && call[2] === `Bearer ${A}`));
    assert.ok(!calls.some(call => call[0] === 'rpc' && call[1] === 'set_user_preferences'), 'username-only saving never overwrites preferences');
    calls.length = 0;
    await userSettingsApi.savePreferences({ workout_sharing: false }, A);
    assert.deepEqual(calls.find(call => call[0] === 'upsert')?.[1], { user_id: A, workout_sharing: false }, 'autosave patches only the changed field, not a stale full preference snapshot');
    signedIn = B;
    const count = calls.length;
    await assert.rejects(userSettingsApi.saveProfile({ username: 'intruder' }, A), /Reload settings/);
    assert.equal(calls.length, count, 'stale owner rejected before querying');
    for (const api of [workoutTemplateApi, workoutTemplateExerciseApi]) {
      await assert.rejects(api.create({ name: 'Private A workout', exercise: 'Private A exercise', template_id: 'template-a' }, A), /Reload settings/);
      assert.equal(calls.length, count, 'completion template writes must reject stale owners before querying');
    }
    const { workoutRestApi } = await server.ssrLoadModule('/src/services/workoutRestApi.js');
    await assert.rejects(workoutRestApi.save({ enabled: true, seconds: 120 }, A), /Account changed/);
    signedIn = A;
    calls.length = 0;
    await workoutRestApi.save({ enabled: true, seconds: 120, notifications: false }, A);
    assert.equal(calls.find(call => call[0] === 'upsert')[1].user_id,A);
    assert.ok(calls.some(call => call[0] === 'setHeader' && call[2] === `Bearer ${A}`));
    await workoutRestApi.cancel();
    assert.ok(calls.some(call => call[0] === 'rpc' && call[1] === 'cancel_workout_web_rest'));
    await identityApi.available('  UPPER_Name ');
    assert.deepEqual(calls.findLast(call => call[0] === 'rpc'), ['rpc', 'username_available', { p_username: 'upper_name' }]);
    await identityApi.complete('  NEW_USER ', A);
    assert.deepEqual(calls.findLast(call => call[0] === 'rpc'), ['rpc', 'complete_user_profile', { p_username: 'new_user' }]);
    const result = await userSettingsApi.read(A);
    assert.deepEqual(result.preferences, { language: 'it', workout_sharing: true, share_workout_notes: false });
    await authApi.signUp({ email: 'fixture@example.test', password: 'fixture-only', username: 'UPPER_USER' });
    const signup = calls.find(call => call[0] === 'signup')[1];
    assert.equal(signup.options.data.requested_username, 'upper_user');
    assert.equal(signup.options.data.requested_language, 'it');
  } finally { await server.close(); delete globalThis.__settingsClient; }
});
