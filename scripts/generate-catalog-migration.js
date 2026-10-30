import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { catalog } from './generate-exercise-catalog.js';
import { ownerExerciseMappings } from '../src/data/exerciseCatalogRevision.js';

const applied=JSON.parse(fs.readFileSync('supabase/catalog-migrations.json','utf8'));
for(const migration of applied) {
  if(createHash('sha256').update(fs.readFileSync(`supabase/migrations/${migration.file}`,'utf8').replaceAll('\r\n','\n')).digest('hex')!==migration.sha256)throw new Error('Applied catalog migration changed');
}
const revisions=fs.readdirSync('supabase/migrations').filter(name=>/^\d+_exercise_catalog_revision.sql$/.test(name)).sort();
const pending=revisions.filter(name=>!applied.some(m=>m.file===name));
if(pending.length>1)throw new Error('Multiple pending catalog revisions: select an explicit rollout');
const filename=pending[0] || revisions.at(-1);
if(!filename)throw new Error('Create the forward migration with Supabase CLI first');
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const fields=['id','slug','name_en','name_it','category','primary_muscle_group','equipment','load_type','uses_external_load','is_unilateral','leaderboard_eligible','active'];
const rows=catalog.map((e,i)=>'('+fields.map(k=>typeof e[k]==='boolean'?String(e[k]):quote(e[k])).join(',')+`,${i})`);
const aliasRows=[...new Set(catalog.flatMap(e=>[e.name_en,e.name_it,...e.aliases].map(a=>`(${quote(normalize(a))},${quote(e.id)})`)))];
const sql=`-- Forward-only catalog revision; original UUIDs and applied migration stay immutable.
insert into public.exercise_catalog(${fields.join(',')},display_order) values
${rows.join(',\n')}
on conflict(id) do update set ${fields.filter(k=>!['id','slug'].includes(k)).map(k=>`${k}=excluded.${k}`).join(',')},display_order=excluded.display_order,updated_at=now()
where exercise_catalog.slug=excluded.slug;
insert into public.exercise_aliases(alias,exercise_id) values
${aliasRows.join(',\n')}
on conflict do nothing;
-- Exact active canonical names win; otherwise ALL aliases must identify one UUID.
create or replace function public.resolve_exercise_id(value text) returns uuid language sql stable security invoker set search_path='' as $$
  with exact as (select id from public.exercise_catalog where active and (public.normalize_exercise_alias(name_en)=public.normalize_exercise_alias(value) or public.normalize_exercise_alias(name_it)=public.normalize_exercise_alias(value))),
  aliases as (select distinct exercise_id id from public.exercise_aliases where alias=public.normalize_exercise_alias(value))
  select case when (select count(*) from exact)=1 then (select id from exact limit 1)
    when (select count(*) from aliases)=1 then (select id from aliases limit 1) else null end;
$$;
create or replace function public.exercise_revision_owner_targets_v2() returns table(original_name text,target_slug text)
language sql immutable security invoker set search_path='' as $$ values
${Object.entries(ownerExerciseMappings).map(([name,slug])=>`(${quote(name)},${quote(slug)})`).join(',\n')};
$$;
revoke all on function public.exercise_revision_owner_targets_v2() from public,anon,authenticated,service_role;
${fs.readFileSync('supabase/operations/apply_owner_exercise_revision_v2.sql','utf8')}`.replaceAll('\r\n','\n').trimEnd()+'\n';
const target=`supabase/migrations/${filename}`;
if(process.argv.includes('--check') || applied.some(m=>m.file===filename)) {if(fs.readFileSync(target,'utf8').replaceAll('\r\n','\n')!==sql)throw new Error('Catalog migration drift; applied files are immutable, create a new forward revision');}
else fs.writeFileSync(target,sql);
