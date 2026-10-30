// Read-only production capture + isolated rehearsal. Never applies production DDL/DML.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PGlite } from '@electric-sql/pglite';
import { exerciseCatalog } from '../src/utils/exerciseCatalog.js';

if(process.env.LIFEOS_CAPTURE_EXERCISE_BACKUP!=='true')throw new Error('Explicit backup capture opt-in required');
const project='wrqscqhclepwxxkazbnc';
const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
if(new URL(url).hostname!==`${project}.supabase.co`)throw new Error('Unexpected production project');
const owner=process.env.LIFEOS_ACTION_USER_ID;
if(!/^[0-9a-f-]{36}$/i.test(owner||''))throw new Error('Configured owner required');
const client=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must=(result,stage)=>{if(result.error)throw new Error(`${stage}: ${result.error.code||'request failed'}`);return result.data;};
const verified=must(await client.auth.admin.getUserById(owner),'verify configured owner');
assert.equal(verified.user.id,owner);
const tables=['workout_templates','workouts','workout_sets','workout_template_exercises','workout_rest_preferences'];
const backup={project,owner,captured_at:new Date().toISOString(),tables:{}};
for(const table of [...tables,'exercise_catalog','exercise_aliases']) {
  const rows=[];
  for(let offset=0;;offset+=500) {
    let query=client.from(table).select('*');
    if(tables.includes(table))query=query.eq('user_id',owner);
    query=query.order(table==='workout_rest_preferences'?'user_id':table==='exercise_aliases'?'alias':'id');
    const page=must(await query.range(offset,offset+499),`capture ${table}`);
    rows.push(...page);if(page.length<500)break;
  }
  backup.tables[table]=rows;
}
assert.equal(backup.tables.exercise_catalog.length,217,'Unexpected production catalog baseline');
const root=path.join(os.homedir(),'.codex','backups','lifeos-exercise-revision');
fs.mkdirSync(root,{recursive:true});
if(process.platform==='win32')execFileSync('icacls',[root,'/inheritance:r','/grant:r',`${os.userInfo().username}:(OI)(CI)F`],{stdio:'ignore'});
const file=path.join(root,`${new Date().toISOString().replaceAll(':','-')}-baseline.json`);
const serialized=JSON.stringify(backup,null,2)+'\n';
fs.writeFileSync(file,serialized,{flag:'wx',mode:0o600});
const checksum=createHash('sha256').update(serialized).digest('hex');
assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),checksum);
const db=new PGlite();
try {
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;`);
  await db.query('insert into auth.users(id) values($1)',[owner]);
  const schema=fs.readFileSync('supabase/schema.sql','utf8');
  for(const table of ['workout_templates','workouts','workout_sets','workout_template_exercises','brain_outbox_messages']) {
    const start=schema.indexOf(`create table if not exists public.${table} (`);
    await db.exec(schema.slice(start,schema.indexOf('\n);',start)+3));
  }
  await db.exec(fs.readFileSync('supabase/migrations/20261004134735_workout_rest_timer.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261029211303_social_training_catalog.sql','utf8'));
  for(const table of tables) {
    await db.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},$1::jsonb)`,[JSON.stringify(backup.tables[table])]);
  }
  for(const table of ['workouts','workout_sets','workout_template_exercises'])await db.exec(`create trigger rehearsal_updated before update on public.${table} for each row execute function public.set_updated_at()`);
  const state=async()=>{
    const result={};for(const table of tables)result[table]=(await db.query(`select to_jsonb(t) row from public.${table} t order by ${table==='workout_rest_preferences'?'user_id':'id'}`)).rows.map(r=>r.row);return result;
  };
  const before=await state();
  const forward=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_exercise_catalog_revision.sql'));
  const sql=fs.readFileSync(`supabase/migrations/${forward}`,'utf8');
  await db.exec('begin');await db.query("select set_config('lifeos.exercise_revision_owner',$1,true)",[owner]);
  await db.exec(sql);await db.exec('commit');
  const after=await state();
  const omitIdentity=row=>Object.fromEntries(Object.entries(row).filter(([k])=>!['exercise','exercise_id'].includes(k)));
  for(const table of tables) {
    assert.equal(after[table].length,before[table].length,`Row count changed: ${table}`);
    if(table==='workouts') {
      for(let i=0;i<before[table].length;i++) {
        const old=before[table][i],next=after[table][i];
        assert.deepEqual({...next,template_snapshot:old.template_snapshot},old);
        if(Array.isArray(old.template_snapshot))assert.deepEqual(next.template_snapshot.map(omitIdentity),old.template_snapshot.map(omitIdentity));
      }
    } else if(['workout_sets','workout_template_exercises'].includes(table)) {
      assert.deepEqual(after[table].map(omitIdentity),before[table].map(omitIdentity));
      for(const row of after[table]) {
        const exercise=exerciseCatalog.find(e=>e.id===row.exercise_id);
        assert.ok(exercise,'Unmapped historical row');assert.equal(row.exercise,exercise.name_en);
      }
    } else assert.deepEqual(after[table],before[table]);
  }
  await db.exec('begin');await db.query("select set_config('lifeos.exercise_revision_owner',$1,true)",[owner]);
  await db.exec(sql);await db.exec('commit');assert.deepEqual(await state(),after,'Second migration changed historical data');
  const counts=Object.fromEntries(tables.map(t=>[t,before[t].length]));
  const expectedChanges=Object.fromEntries(['workout_sets','workout_template_exercises','workouts'].map(t=>[t,before[t].filter((row,i)=>JSON.stringify(row)!==JSON.stringify(after[t][i])).length]));
  const summary={project,backup_file:file,backup_sha256:checksum,backup_verified:true,managed_PITR_status:'not available through connected tooling; verified scoped logical backup instead',
    counts,expected_changes:expectedChanges,mapped_sets:after.workout_sets.filter(r=>r.exercise_id).length,isolated_rehearsal:'passed twice',timestamps_and_nonidentity_fields:'unchanged',
    total_catalog:exerciseCatalog.length,active_catalog:exerciseCatalog.filter(e=>e.active).length};
  fs.mkdirSync('test-results',{recursive:true});
  fs.writeFileSync('test-results/exercise-revision-preflight.json',JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
} catch(error) {
  try{await db.exec('rollback');}catch{}
  console.error(`Rehearsal stopped: ${error.message}. Backup is retained outside Git.`);process.exitCode=1;
} finally {await db.close();}
