import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Credentials stay in the child's environment, never argv or diagnostic output.
export function backupEnvironment(){
const match=readFileSync('.env.local','utf8').match(/^LIFEOS_BACKUP_DATABASE_URL=(.+)$/m);
if(!match) throw new Error('Backup connection is missing.');
let value=match[1].trim();
if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))) value=value.slice(1,-1);
const parts=value.match(/^postgres(?:ql)?:\/\/([^:]+):(.+)@([^/]+)\/([^?]+)(?:\?.*)?$/);
if(!parts) throw new Error('Invalid backup connection format.');
const host=new URL('https://'+parts[3]);
if(!/^(db\.wrqscqhclepwxxkazbnc\.supabase\.co|[a-z0-9-]+\.pooler\.supabase\.com)$/.test(host.hostname)) throw new Error('Unexpected backup host.');
const raw=parts[2];
const password=/[#/?\s]/.test(raw)?raw:decodeURIComponent(raw);
const env={...process.env,PGHOST:host.hostname,PGPORT:host.port||'5432',PGUSER:decodeURIComponent(parts[1]),PGPASSWORD:password,PGDATABASE:parts[4],PGSSLMODE:'require',PGCONNECT_TIMEOUT:'15'};
return env;
}
if(process.argv[1]?.endsWith('backup-probe.mjs')){
const env=backupEnvironment();
try {
  const output=execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-A','-t','-v','ON_ERROR_STOP=1','-c',"select json_build_object('database',current_database(),'server',current_setting('server_version'),'workouts',(select count(*) from public.workouts),'sets',(select count(*) from public.workout_sets));"],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  console.log(output.trim());
}catch(error){
  const diagnostic=String(error.stderr||'');
  console.error(diagnostic.includes('password authentication failed')?'Backup authentication failed.':diagnostic.includes('could not translate host')?'Backup host DNS resolution failed.':diagnostic.includes('timeout')?'Backup connection timed out.':'Backup connection failed; check local PostgreSQL connection settings.');
  process.exitCode=1;
}
}
