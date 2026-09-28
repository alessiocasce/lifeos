import path from 'node:path';
import { createServer } from 'vite';

// Test-only service substitution. This server never talks to production Supabase.
const server = await createServer({
  server: { host: '127.0.0.1', port: 4178, strictPort: true },
  plugins: [{
    name: 'lifeos-ui-qa-services', enforce: 'pre',
    resolveId(source) {
      if (/services\/lifeosApi(?:\.js)?$/.test(source)) return path.resolve('tests/ui/fixtureApi.js');
      if (/lib\/supabaseClient(?:\.js)?$/.test(source)) return '\0qa-supabase';
      return null;
    },
    load(id) {
      if (id === '\0qa-supabase') return 'export const isSupabaseConfigured = true; export const supabase = null;';
      return null;
    },
  }],
});
await server.listen();
console.log('Isolated LifeOS UI QA: http://127.0.0.1:4178');
