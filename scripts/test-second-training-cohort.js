import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { exerciseCatalog } from '../src/utils/exerciseCatalog.js';
const db=new PGlite();
try {
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role;
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;`);
  const schema=fs.readFileSync('supabase/schema.sql','utf8');
  for(const table of ['workout_templates','workouts','workout_sets','workout_template_exercises']) {
    const start=schema.indexOf(`create table if not exists public.${table} (`);
    await db.exec(schema.slice(start,schema.indexOf('\n);',start)+3));
  }
  await db.exec('alter table workout_sets add column exercise_id uuid;alter table workout_template_exercises add column exercise_id uuid;create table exercise_catalog(id uuid primary key,name_en text);');
  for(const e of exerciseCatalog)await db.query('insert into exercise_catalog values($1,$2)',[e.id,e.name_en]);
  const backup=process.env.LIFEOS_COHORT_REHEARSAL_FILE?JSON.parse(fs.readFileSync(process.env.LIFEOS_COHORT_REHEARSAL_FILE,'utf8')):null;
  let second;
  if(backup) {
    const groups=Object.groupBy(backup.tables.workout_sets,r=>r.user_id);
    second=Object.keys(groups).find(k=>groups[k].length===16&&groups[k].every(r=>!r.exercise_id));
    assert.ok(second,'Reviewed second cohort absent');
    for(const id of Object.keys(groups))await db.query('insert into auth.users values($1)',[id]);
    for(const table of ['workout_templates','workouts','workout_sets','workout_template_exercises'])await db.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(backup.tables[table])]);
  } else {
    second='22222222-2222-4222-8222-222222222222';await db.query('insert into auth.users values($1)',[second]);
    const w=(await db.query('insert into workouts(user_id,name) values($1,$2) returning id',[second,'Cohort'])).rows[0].id;
    for(const [name,n] of [['Panca Inclinata',3],['Panca Piana',3],['Macchinario pettorali',3],['Pushdown tricipiti',4],['Overhead tricipiti',3]])for(let i=1;i<=n;i++)await db.query('insert into workout_sets(user_id,workout_id,exercise,set_number,weight,reps,rpe,notes) values($1,$2,$3,$4,30,8,8,$5)',[second,w,name,i,'Preserve']);
  }
  await db.exec('create trigger cohort_timestamp before update on workout_sets for each row execute function set_updated_at()');
  const state=async()=>(await db.query('select to_jsonb(s) row from workout_sets s order by id')).rows.map(r=>r.row);
  const before=await state();
  const file=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_second_training_cohort.sql'));
  await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
  assert.equal((await db.query('select map_second_training_cohort($1) n',[second])).rows[0].n,16);
  const after=await state(),omit=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['exercise','exercise_id'].includes(k)));
  assert.deepEqual(after.map(omit),before.map(omit));
  assert.deepEqual(after.filter(r=>r.user_id!==second),before.filter(r=>r.user_id!==second));
  for(const row of after.filter(r=>r.user_id===second))assert.equal(exerciseCatalog.find(e=>e.id===row.exercise_id).name_en,row.exercise);
  assert.equal((await db.query('select map_second_training_cohort($1) n',[second])).rows[0].n,0);
  assert.deepEqual(await state(),after);
  console.log('PASS second cohort: 16 mappings, exact timestamps/nonidentity preservation, other users unchanged, idempotent; '+(backup?'actual backup rehearsal':'synthetic fixture'));
} finally {await db.close();}
