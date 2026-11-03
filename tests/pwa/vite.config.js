import path from 'node:path';
import config from '../../vite.config.js';

export default {
  ...config,
  cacheDir:'node_modules/.vite-pwa-qa',
  plugins:[{
    name:'isolated-pwa-qa',enforce:'pre',
    resolveId(source) {
      if (/services\/lifeosApi(?:\.js)?$/.test(source) || /services\/aiApi(?:\.js)?$/.test(source)) return path.resolve('tests/ui/fixtureApi.js');
      if (/lib\/supabaseClient(?:\.js)?$/.test(source)) return '\0pwa-qa-supabase';
    },
    load(id) { if(id==='\0pwa-qa-supabase') return 'export const isSupabaseConfigured=true;export const supabase=null;'; },
  },...config.plugins],
};
