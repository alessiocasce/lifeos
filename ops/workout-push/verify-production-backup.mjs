import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {backupEnvironment} from './backup-probe.mjs';

const bin='C:/Program Files/PostgreSQL/18/bin';
const root=path.join(os.homedir(),'.codex','private','lifeos-recovery-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(root,{recursive:true});
execFileSync('icacls.exe',[root,'/inheritance:r','/grant:r',`${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`],{stdio:'pipe'});
const source={...backupEnvironment(),PGTZ:'UTC'};
const run=(tool,args,env,input)=>execFileSync(path.join(bin,tool+'.exe'),args,{env,input,encoding:'utf8',maxBuffer:128*1024*1024,stdio:['pipe','pipe','pipe']});
const tables=['auth.users','public.exercise_catalog','public.exercise_aliases','public.workout_templates','public.workouts','public.workout_template_exercises','public.workout_sets','public.user_profiles','public.user_preferences','public.community_workout_shares'];
const keys={users:'id',exercise_catalog:'id',exercise_aliases:'alias,exercise_id',workout_templates:'id',workouts:'id',workout_template_exercises:'id',workout_sets:'id',user_profiles:'user_id',user_preferences:'user_id',community_workout_shares:'id'};
const statsSQL=`select jsonb_object_agg(name,stats) from (${tables.map(table=>{const name=table.split('.')[1];return `select '${table}' name,jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(t)::text,'' order by ${keys[name]}),''))) stats from ${table} t`;}).join(' union all ')})s;`;
const query=(sql,env)=>run('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],env).trim();
let holding,started=false,archive,plain,key;
const localPass=crypto.randomBytes(32).toString('base64url');
const local={...process.env,PGHOST:'127.0.0.1',PGPORT:'55439',PGDATABASE:'postgres',PGUSER:'lifeos_restore',PGPASSWORD:localPass,PGSSLMODE:'disable',PGTZ:'UTC'};
try{
  holding=spawn(path.join(bin,'psql.exe'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:source,stdio:['pipe','pipe','pipe']});
  const snapshot=await new Promise((resolve,reject)=>{
    let output='';const timeout=setTimeout(()=>reject(new Error('Snapshot timeout')),20000);
    holding.stdout.on('data',chunk=>{output+=chunk;const id=output.trim();if(/^[0-9A-Fa-f-]+$/.test(id)){clearTimeout(timeout);resolve(id);}});
    holding.on('exit',()=>{clearTimeout(timeout);reject(new Error('Snapshot session ended'));});
    holding.stdin.write('begin isolation level repeatable read read only; select pg_export_snapshot();\n');
  });
  const before=JSON.parse(query(`begin isolation level repeatable read read only;set transaction snapshot '${snapshot}';${statsSQL}commit;`,source));
  archive=execFileSync(path.join(bin,'pg_dump.exe'),['--format=custom','--no-owner','--no-privileges','--snapshot='+snapshot],{env:source,maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']});
  holding.stdin.end('rollback;\n');
  key=crypto.randomBytes(32);const nonce=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
  const encrypted=Buffer.concat([nonce,cipher.update(archive),cipher.final(),cipher.getAuthTag()]);
  fs.writeFileSync(path.join(root,'production.dump.aesgcm'),encrypted);
  const protectedKey=execFileSync('pwsh.exe',['-NoProfile','-Command',"[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Convert]::FromBase64String([Console]::In.ReadToEnd()),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))"],{input:key.toString('base64'),encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  fs.writeFileSync(path.join(root,'recovery-key.dpapi'),protectedKey);
  // Verify recovery from the stored ciphertext/key, not the original memory buffer.
  const recoveredKey=execFileSync('pwsh.exe',['-NoProfile','-Command',"[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([Console]::In.ReadToEnd()),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))"],{input:fs.readFileSync(path.join(root,'recovery-key.dpapi'),'utf8'),encoding:'utf8',stdio:['pipe','pipe','pipe']});
  const bytes=fs.readFileSync(path.join(root,'production.dump.aesgcm'));const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(recoveredKey,'base64'),bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(-16));plain=Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]);
  if(!crypto.timingSafeEqual(crypto.createHash('sha256').update(archive).digest(),crypto.createHash('sha256').update(plain).digest()))throw new Error('Encrypted recovery mismatch');
  const restoreArchive=path.join(root,'restore-archive.tmp');fs.writeFileSync(restoreArchive,plain);
  const toc=run('pg_restore',['--list',restoreArchive],local);
  const indexNames=JSON.parse(query(`select coalesce(json_agg(indexname),'[]') from pg_indexes where schemaname in('public','auth') and (schemaname||'.'||tablename) in(${tables.map(t=>`'${t}'`).join(',')});`,source));
  const names=tables.map(t=>t.split('.')[1]);
  const selected=toc.split('\n').filter(line=>line.startsWith(';')||/ SCHEMA - (auth|extensions|lifeos_private) /.test(line)||/ FUNCTION auth uid\(\) /.test(line)||names.some(name=>new RegExp(` (?:TABLE|TABLE DATA|CONSTRAINT|FK CONSTRAINT) (?:public|auth) ${name} `).test(line))||indexNames.some(name=>line.includes(` INDEX public ${name} `)||line.includes(` INDEX auth ${name} `))).join('\n');
  fs.writeFileSync(path.join(root,'restore.list'),selected);
  const pwfile=path.join(root,'cluster-password.tmp');fs.writeFileSync(pwfile,localPass);
  run('initdb',['-D',path.join(root,'isolated-data'),'-U','lifeos_restore','--auth=scram-sha-256','--pwfile='+pwfile,'--encoding=UTF8','--no-locale'],local);fs.unlinkSync(pwfile);
  // On Windows a background postgres can inherit captured pipe handles. Do not
  // capture pg_ctl's pipes; logs go to the protected recovery directory instead.
  execFileSync(path.join(bin,'pg_ctl.exe'),['-D',path.join(root,'isolated-data'),'-l',path.join(root,'isolated-server.log'),'-o','-h 127.0.0.1 -p 55439','-w','start'],{env:local,stdio:'ignore'});started=true;
  run('pg_restore',['--dbname=postgres','--no-owner','--no-privileges','--exit-on-error','--use-list='+path.join(root,'restore.list'),restoreArchive],local);
  const after=JSON.parse(query(statsSQL,local));
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Restored counts/digests differ');
  const refs=JSON.parse(query(`select json_build_object('orphan_sets',(select count(*) from workout_sets s left join workouts w on w.id=s.workout_id and w.user_id=s.user_id where w.id is null),'orphan_templates',(select count(*) from workout_template_exercises e left join workout_templates t on t.id=e.template_id and t.user_id=e.user_id where t.id is null),'orphan_shares',(select count(*) from community_workout_shares s left join workouts w on w.id=s.source_workout_id and w.user_id=s.author_id where w.id is null));`,local));
  if(Object.values(refs).some(Boolean))throw new Error('Restore reference inconsistency');
  const evidence={at:new Date().toISOString(),encryptedArchiveBytes:encrypted.length,archiveSha256:crypto.createHash('sha256').update(archive).digest('hex'),tables:after,references:refs,restoreScope:'10 affected/auth tables, native table definitions, primary/foreign constraints and indexes; unrelated Supabase extensions/Storage blobs not locally restored',encryption:'AES-256-GCM; key Windows CurrentUser DPAPI; directory ACL current user only; local recovery cluster stopped'};
  fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({verified:true,backupDirectory:root,encryptedArchiveBytes:encrypted.length,counts:Object.fromEntries(Object.entries(after).map(([name,s])=>[name,s.count])),references:refs}));
}catch(error){
  fs.writeFileSync(path.join(root,'failure.txt'),String(error.stderr||error.message));
  console.error('Backup verification failed; protected diagnostics saved outside Git at '+root+'. Production unchanged.');process.exitCode=1;
}finally{
  holding?.stdin?.end();holding?.kill();
  if(started)try{run('pg_ctl',['-D',path.join(root,'isolated-data'),'-m','fast','-w','stop'],local);}catch{console.error('Check isolated recovery server shutdown.');}
  if(fs.existsSync(path.join(root,'restore-archive.tmp')))fs.unlinkSync(path.join(root,'restore-archive.tmp'));
  key?.fill(0);archive?.fill(0);plain?.fill(0);
}
