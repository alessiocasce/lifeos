import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
try {
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;
    create function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;`);
  const schema=fs.readFileSync('supabase/schema.sql','utf8');
  for(const table of ['workout_templates','workouts','workout_sets','workout_template_exercises','brain_outbox_messages']) {
    const start=schema.indexOf(`create table if not exists public.${table} (`);
    await db.exec(schema.slice(start,schema.indexOf('\n);',start)+3));
    if(table!=='brain_outbox_messages') {
      await db.exec(`alter table public.${table} enable row level security;grant select,insert,update,delete on public.${table} to authenticated;`);
      const p=schema.indexOf(`create policy "${table} are user scoped"`);await db.exec(schema.slice(p,schema.indexOf(';',p)+1));
    }
  }
  for(const suffix of ['workout_rest_timer','social_training_identity','social_training_catalog','exercise_catalog_revision','community_workout_shares']) {
    const file=fs.readdirSync('supabase/migrations').find(n=>n.endsWith(`_${suffix}.sql`));
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
  }
  console.log((await db.exec(fs.readFileSync('supabase/operations/verify_community.sql','utf8'))).at(-1).rows[0].result);
} finally {await db.close();}
