import fs from 'node:fs';
import { catalog } from './generate-exercise-catalog.js';
const file='supabase/migrations/20261029211303_social_training_catalog.sql';
const marker='-- Catalog seed and cautious backfill are generated below by generate-catalog-migration.js.';
const prefix=fs.readFileSync(file,'utf8').split(marker)[0]+marker+'\n';
const quote = value => `'${String(value).replaceAll("'","''")}'`;
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const fields=['id','slug','name_en','name_it','category','primary_muscle_group','equipment','load_type','uses_external_load','is_unilateral','leaderboard_eligible','active'];
const rows=catalog.map((e,i)=>'('+fields.map(key=>typeof e[key]==='boolean' ? String(e[key]) : quote(e[key])).join(',')+`,${i})`);
const aliasRows=[...new Set(catalog.flatMap(e=>[e.name_en,e.name_it,...e.aliases].map(a=>`(${quote(normalize(a))},${quote(e.id)})`)))];
const backfill=fs.readFileSync('supabase/operations/map_legacy_exercises.sql','utf8');
const rest=fs.readFileSync('supabase/migrations/20261004134735_workout_rest_timer.sql','utf8');
const schedule=rest.slice(rest.indexOf('create or replace function public.schedule_workout_rest_timer'),rest.indexOf('-- Trigger is the durable save boundary'))
  .replace('lower(trim(exercise)) = lower(trim(s.exercise))',"case when s.exercise_id is not null then coalesce(exercise_id,public.resolve_exercise_id(exercise)) = s.exercise_id else public.normalize_exercise_alias(exercise) = public.normalize_exercise_alias(s.exercise) end");
const sql=(prefix+`insert into public.exercise_catalog(${fields.join(',')},display_order) values\n${rows.join(',\n')}\non conflict(id) do nothing;\ninsert into public.exercise_aliases(alias,exercise_id) values\n${aliasRows.join(',\n')}\non conflict do nothing;\n`+backfill+'\n-- Preserve the durable timer; only exercise matching gains canonical identity.\n'+schedule).trimEnd()+'\n';
if(process.argv.includes('--check')) { if(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')!==sql.replaceAll('\r\n','\n')) throw new Error('Catalog migration drift'); }
else fs.writeFileSync(file,sql);
