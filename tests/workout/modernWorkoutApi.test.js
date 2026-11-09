import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('history filters execute on the authenticated Supabase query before bounded keyset paging', async () => {
  const calls = [];
  const query = new Proxy({}, { get: (_, method) => method === 'then'
    ? resolve => resolve({ data: [], error: null })
    : (...args) => { calls.push([method, ...args]); return query; } });
  globalThis.__modernWorkoutClient = { from: name => { calls.push(['from',name]); return query; } };
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, ws: false }, plugins: [{
    name: 'isolated-workout-filter-client', enforce: 'pre',
    resolveId(source) { if (/lib\/supabaseClient$/.test(source)) return '\0modern-workout-client'; },
    load(id) { if (id === '\0modern-workout-client') return 'export const isSupabaseConfigured = true; export const supabase = globalThis.__modernWorkoutClient;'; },
  }] });
  try {
    const { workoutApi } = await server.ssrLoadModule('/src/services/lifeosApi.js');
    const id = '11111111-1111-4111-8111-111111111111';
    await workoutApi.page(null, 100, { from: '2026-10-26', to: '2026-11-01', templateId: id });
    assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['gte','performed_on','2026-10-26'])));
    assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['lte','performed_on','2026-11-01'])));
    assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq','template_id',id])));
    assert.ok(calls.some(call => call[0] === 'limit' && call[1] === 26));
    calls.length = 0;
    await workoutApi.page(null, 25, { templateId: null });
    assert.ok(calls.some(call => call[0] === 'is' && call[1] === 'template_id' && call[2] === null));
    await assert.rejects(() => workoutApi.page(null, 25, { templateId: 'untrusted,or' }), /Invalid workout template/);
    assert.ok(!calls.some(call => call[0] === 'rpc' || call[0] === 'insert' || call[0] === 'update'));
  } finally { await server.close(); delete globalThis.__modernWorkoutClient; }
});
