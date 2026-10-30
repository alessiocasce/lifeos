import fs from 'node:fs';
const path = 'supabase/schema.sql';
const marker = '\n-- Social Training foundation (generated from targeted migrations).\n';
const migrations = fs.readdirSync('supabase/migrations').filter(name => /social_training_(identity|catalog)|exercise_catalog_revision/.test(name)).sort();
const original = fs.readFileSync(path,'utf8');
const next = original.split(marker)[0].trimEnd() + marker + migrations.map(name => fs.readFileSync(`supabase/migrations/${name}`,'utf8').trim()).join('\n\n') + '\n';
if (process.argv.includes('--check')) {
  if (original.replaceAll('\r\n','\n') !== next.replaceAll('\r\n','\n')) throw new Error('Social schema differs from migrations');
} else fs.writeFileSync(path,next);
