// Read-only, restricted logical recovery capture. No private identifiers in output.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
if(process.env.LIFEOS_CAPTURE_COMMUNITY_BACKUP!=='true')throw new Error('Explicit backup opt-in required');
const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
if(new URL(url).hostname!=='wrqscqhclepwxxkazbnc.supabase.co')throw new Error('Wrong project');
const client=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const backup={captured_at:new Date().toISOString(),tables:{}};
for(const table of ['workouts','workout_sets','workout_templates','workout_template_exercises','user_profiles','user_preferences','workout_rest_preferences']) {
  const rows=[];
  for(let offset=0;;offset+=500) {
    const {data,error}=await client.from(table).select('*').order(['user_profiles','user_preferences','workout_rest_preferences'].includes(table)?'user_id':'id').range(offset,offset+499);
    if(error)throw new Error(`Backup ${table}: ${error.code}`);
    rows.push(...data);if(data.length<500)break;
  }
  backup.tables[table]=rows;
}
const root=path.join(os.homedir(),'.codex','backups','lifeos-community');fs.mkdirSync(root,{recursive:true});
if(process.platform==='win32')execFileSync('icacls',[root,'/inheritance:r','/grant:r',`${os.userInfo().username}:(OI)(CI)F`],{stdio:'ignore'});
const file=path.join(root,`${Date.now()}-before.json`),bytes=JSON.stringify(backup);
fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
const hash=v=>createHash('sha256').update(v).digest('hex');
if(hash(fs.readFileSync(file))!==hash(bytes))throw new Error('Backup checksum failed');
console.log(JSON.stringify({file,sha256:hash(bytes),counts:Object.fromEntries(Object.entries(backup.tables).map(([k,v])=>[k,v.length]))}));
