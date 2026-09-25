import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createReliabilityDatabase, fixtureUser } from '../tests/brain/reliabilityDatabase.js';

const { db } = await createReliabilityDatabase();
try {
  const release = readFileSync(new URL('../supabase/releases/reliability.sql', import.meta.url), 'utf8').trim();
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  assert.ok(schema.includes(release), 'fresh schema must include the exact release DDL');
  await db.exec('alter table brain_outbox_messages alter column source_id type uuid using source_id::uuid;');
  const oldId = '00000000-0000-4000-8000-000000000099';
  await db.query(`insert into brain_outbox_messages(recipient,body,rule_key,source_type,source_id,idempotency_key,scheduled_for,metadata)
    values ('fixture','fixture','timed_memo_due','memo',$1,'legacy-memo',now(),$2)`, [oldId, { exact_due_reminder: true }]);
  await db.exec(release);
  assert.equal((await db.query('select source_id from brain_outbox_messages')).rows[0].source_id, oldId);
  await db.exec('delete from brain_outbox_messages;');
  console.log('PASS legacy UUID migration preserves values and release SQL matches fresh schema');
  const insert = (key, profile = {}) => db.query(`insert into brain_outbox_messages
    (recipient,body,rule_key,source_type,source_id,idempotency_key,scheduled_for,metadata)
    values ('fixture','check','accountability_habit_missing','accountability',$1,$1,now(),$2) returning id`,
  [key, { attention_profile: { max_per_day: 20, min_gap_minutes: 20, ...profile } }]);
  const first = (await insert('habit:shower:2026-07-07')).rows[0];
  await assert.rejects(insert('habit:creatine:2026-07-07'), /attention_deferred/);
  await assert.rejects(insert('habit:shower:2026-07-07'), /duplicate key/);
  console.log('PASS actual schema accepts semantic source IDs and enforces admission/uniqueness');
  await db.query(`update brain_outbox_messages set created_at=now()-interval '1 hour' where id=$1`, [first.id]);
  const second = (await insert('habit:skin:2026-07-07')).rows[0];
  await db.query(`update brain_outbox_messages set status='claimed',claimed_at=now(),attempts=1 where id=$1`, [first.id]);
  const blocked = await db.query(`update brain_outbox_messages set status='claimed',claimed_at=now(),attempts=1 where id=$1 returning id`, [second.id]);
  assert.equal(blocked.rows.length, 0);
  console.log('PASS database prevents backlog delivery bursts');
  const project = (await db.query(`insert into projects(name,goal_type,current_value,target_value) values ('fixture','units',5,10) returning id`)).rows[0];
  const session = (await db.query(`insert into project_sessions(project_id,started_at,progress_delta) values ($1,now(),2) returning id`, [project.id])).rows[0];
  const progress = async () => Number((await db.query('select current_value from projects where id=$1', [project.id])).rows[0].current_value);
  assert.equal(await progress(), 5);
  await db.query('update project_sessions set ended_at=now() where id=$1', [session.id]);
  assert.equal(await progress(), 7);
  await db.query('update project_sessions set progress_delta=4 where id=$1', [session.id]);
  assert.equal(await progress(), 9);
  await db.query('update project_sessions set ended_at=null where id=$1', [session.id]);
  assert.equal(await progress(), 5);
  await db.query('update project_sessions set ended_at=now() where id=$1', [session.id]);
  await db.query('delete from project_sessions where id=$1', [session.id]);
  assert.equal(await progress(), 5);
  console.log('PASS project completion/edit/reopen/delete reconcile in the database transaction');
  const hours = (await db.query(`insert into projects(name,goal_type,current_value,target_value) values ('hours','hours',0,10) returning id`)).rows[0];
  await db.query('insert into project_sessions(project_id,started_at,ended_at,progress_delta) values ($1,now(),now(),3)', [hours.id]);
  assert.equal(Number((await db.query('select current_value from projects where id=$1', [hours.id])).rows[0].current_value), 0);
  await db.query(`insert into health_logs(user_id,logged_on,hygiene) values ($1,'2026-07-07',$2)`, [fixtureUser, { shower: { count: 1, times: ['18:30'] } }]);
  await assert.rejects(db.query(`insert into health_logs(user_id,logged_on) values ($1,'2026-07-07')`, [fixtureUser]), /duplicate key/);
  console.log('PASS health JSON/day uniqueness and non-hour project authority contracts');
} catch (error) { console.error(`FAIL schema contracts: ${error.message}`); process.exitCode = 1; }
finally { await db.close(); }

const migrationDb = new PGlite();
try {
  const migration = readFileSync(new URL('../supabase/migrations/20260908231937_whatsapp_interaction_reliability.sql', import.meta.url), 'utf8');
  await migrationDb.exec(`
    create schema auth;
    create role anon;
    create role authenticated;
    create table auth.users(id uuid primary key);
    create table ai_chat_threads(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), unique(id,user_id));
    create table ai_chat_messages(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), thread_id uuid not null, role text not null, content text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now(), foreign key(thread_id,user_id) references ai_chat_threads(id,user_id));
    create table brain_outbox_messages(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id));
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
  `);
  await migrationDb.exec(migration);
  const tables = (await migrationDb.query(`select table_name from information_schema.tables where table_schema='public' and (table_name like 'brain_whatsapp%' or table_name='brain_interaction_state')`)).rows.map((row) => row.table_name);
  assert.deepEqual(tables.sort(), ['brain_interaction_state', 'brain_whatsapp_inbound_receipts', 'brain_whatsapp_message_deliveries']);
  const user = '22222222-2222-4222-8222-222222222222';
  await migrationDb.query('insert into auth.users values ($1)', [user]);
  const thread = (await migrationDb.query('insert into ai_chat_threads(user_id) values ($1) returning id', [user])).rows[0];
  const outbox = (await migrationDb.query('insert into brain_outbox_messages(user_id) values ($1) returning id', [user])).rows[0];
  const assistant = (await migrationDb.query(`insert into ai_chat_messages(user_id,thread_id,role,content,metadata) values ($1,$2,'assistant','fixture',$3) returning id`, [user, thread.id, { outbox_message_id: outbox.id }])).rows[0];
  await assert.rejects(migrationDb.query(`insert into ai_chat_messages(user_id,thread_id,role,content,metadata) values ($1,$2,'assistant','duplicate',$3)`, [user, thread.id, { outbox_message_id: outbox.id }]), /duplicate key/);
  await assert.rejects(migrationDb.query(`insert into brain_whatsapp_inbound_receipts(user_id,canonical_recipient,provider_message_id,thread_id,assistant_message_id) values ($1,'fixture','[object Object]',$2,$3)`, [user, thread.id, assistant.id]), /check constraint/);
  const rls = await migrationDb.query(`select relname, relrowsecurity from pg_class where relname in ('brain_whatsapp_inbound_receipts','brain_whatsapp_message_deliveries','brain_interaction_state')`);
  assert.equal(rls.rows.every((row) => row.relrowsecurity === true), true);
  console.log('PASS additive WhatsApp reliability migration applies with ownership, RLS and uniqueness boundaries');
} catch (error) { console.error(`FAIL WhatsApp reliability migration: ${error.message}`); process.exitCode = 1; }
finally { await migrationDb.close(); }

const companionMigrationDb = new PGlite();
try {
  const migration = readFileSync(new URL('../supabase/migrations/20260919120000_companion_beliefs.sql', import.meta.url), 'utf8');
  const syncMigration = readFileSync(new URL('../supabase/migrations/20260925120000_companion_external_sync.sql', import.meta.url), 'utf8');
  const oauthMigration = readFileSync(new URL('../supabase/migrations/20260925130000_mcp_oauth_code_redemptions.sql', import.meta.url), 'utf8');
  const user = '33333333-3333-4333-8333-333333333333';
  await companionMigrationDb.exec(`
    create schema auth;
    create role authenticated;
    create role anon;
    create role service_role;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
    insert into auth.users values ('${user}');
  `);
  await companionMigrationDb.exec(migration);
  await companionMigrationDb.exec(syncMigration);
  await companionMigrationDb.exec(oauthMigration);
  const rls = await companionMigrationDb.query(`select relrowsecurity from pg_class where relname='brain_beliefs'`);
  assert.equal(rls.rows[0].relrowsecurity, true);
  const transitionArgs = [
    user, 'routine', 'health.habit.skin', 'status', { state: 'inactive', routine_id: 'skin' }, 0.95,
    'user_explicit', { message_id: 'fixture-1' }, { evidence: 'stopped' }, '2026-09-19T10:00:00Z', null, 0, null,
    'schema:companion:skin:inactive',
  ];
  const transitionSql = `select * from public.apply_brain_belief_transition(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
  )`;
  const first = (await companionMigrationDb.query(transitionSql, transitionArgs)).rows[0];
  const replay = (await companionMigrationDb.query(transitionSql, transitionArgs)).rows[0];
  assert.equal(first.id, replay.id);
  assert.equal((await companionMigrationDb.query(`select count(*)::int as count from brain_beliefs where record_status='current'`)).rows[0].count, 1);
  const security = (await companionMigrationDb.query(`select
    (select relrowsecurity from pg_class where oid='public.brain_external_sync_requests'::regclass) as audit_rls,
    has_function_privilege('authenticated', 'public.apply_brain_belief_transition(uuid,text,text,text,jsonb,numeric,text,jsonb,jsonb,timestamptz,timestamptz,integer,timestamptz,text)', 'EXECUTE') as authenticated_rpc,
    has_function_privilege('anon', 'public.apply_brain_belief_transition(uuid,text,text,text,jsonb,numeric,text,jsonb,jsonb,timestamptz,timestamptz,integer,timestamptz,text)', 'EXECUTE') as anon_rpc,
    has_function_privilege('service_role', 'public.apply_brain_belief_transition(uuid,text,text,text,jsonb,numeric,text,jsonb,jsonb,timestamptz,timestamptz,integer,timestamptz,text)', 'EXECUTE') as service_rpc,
    has_table_privilege('authenticated', 'public.brain_external_sync_requests', 'INSERT') as authenticated_audit_insert`)).rows[0];
  assert.equal(security.audit_rls, true);
  assert.equal(security.authenticated_rpc, false);
  assert.equal(security.anon_rpc, false);
  assert.equal(security.service_rpc, true);
  assert.equal(security.authenticated_audit_insert, false);
  const oauthSecurity = (await companionMigrationDb.query(`select
    (select relrowsecurity from pg_class where oid='public.brain_mcp_oauth_code_redemptions'::regclass) as rls,
    has_table_privilege('anon', 'public.brain_mcp_oauth_code_redemptions', 'INSERT') as anon_insert,
    has_table_privilege('authenticated', 'public.brain_mcp_oauth_code_redemptions', 'SELECT') as authenticated_select,
    has_table_privilege('service_role', 'public.brain_mcp_oauth_code_redemptions', 'INSERT') as service_insert`)).rows[0];
  assert.deepEqual(oauthSecurity, { rls: true, anon_insert: false, authenticated_select: false, service_insert: true });
  const hash = 'a'.repeat(64);
  await companionMigrationDb.query('insert into brain_mcp_oauth_code_redemptions(code_jti_hash,expires_at) values ($1,now()+interval \'5 minutes\')', [hash]);
  await assert.rejects(companionMigrationDb.query('insert into brain_mcp_oauth_code_redemptions(code_jti_hash,expires_at) values ($1,now()+interval \'5 minutes\')', [hash]), /duplicate key/);
  await assert.rejects(companionMigrationDb.query('insert into brain_mcp_oauth_code_redemptions(code_jti_hash,expires_at) values ($1,now()+interval \'5 minutes\')', ['raw-code']), /check constraint/);
  console.log('PASS additive Companion migrations enforce audit RLS, service-only RPC, and idempotent belief transitions');
} catch (error) { console.error(`FAIL Companion belief migration: ${error.message}`); process.exitCode = 1; }
finally { await companionMigrationDb.close(); }

const memoryMigrationDb = new PGlite();
try {
  const migration = readFileSync(new URL('../supabase/migrations/20260925215527_companion_autobiographical_memory.sql', import.meta.url), 'utf8');
  assert.ok(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8').includes('create or replace function public.curate_autobiographical_memory('));
  await memoryMigrationDb.exec(`
    create schema auth; create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key);
    create table projects(id uuid primary key default gen_random_uuid(), user_id uuid not null, name text, unique(id,user_id));
    create table ai_memories(
      id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
      category text not null, title text not null, content text not null,
      source text not null default 'assistant_inferred', confidence numeric(3,2) not null default 0.8,
      importance integer not null default 3, status text not null default 'active',
      last_seen_at timestamptz, metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
  `);
  await memoryMigrationDb.query('insert into auth.users values ($1)', [fixtureUser]);
  const legacy = (await memoryMigrationDb.query(`insert into ai_memories(user_id,category,title,content)
    values ($1,'preference','Legacy preference','I prefer concise answers.') returning id`, [fixtureUser])).rows[0];
  await memoryMigrationDb.exec(migration);
  const row = (await memoryMigrationDb.query('select memory_kind, status, content from ai_memories where id=$1', [legacy.id])).rows[0];
  assert.deepEqual(row, { memory_kind: 'semantic_fact', status: 'active', content: 'I prefer concise answers.' });
  const security = (await memoryMigrationDb.query(`select
    (select relrowsecurity from pg_class where oid='public.ai_memories'::regclass) as rls,
    has_function_privilege('anon', 'public.curate_autobiographical_memory(uuid,text,text,text,text,text,numeric,integer,text,uuid,timestamptz,date,timestamptz,jsonb,text)', 'EXECUTE') as anon_exec,
    has_function_privilege('authenticated', 'public.curate_autobiographical_memory(uuid,text,text,text,text,text,numeric,integer,text,uuid,timestamptz,date,timestamptz,jsonb,text)', 'EXECUTE') as authenticated_exec,
    has_function_privilege('service_role', 'public.curate_autobiographical_memory(uuid,text,text,text,text,text,numeric,integer,text,uuid,timestamptz,date,timestamptz,jsonb,text)', 'EXECUTE') as service_exec`)).rows[0];
  assert.deepEqual(security, { rls: true, anon_exec: false, authenticated_exec: false, service_exec: true });
  await assert.rejects(memoryMigrationDb.query(`insert into ai_memories(user_id,category,title,content,memory_kind)
    values ($1,'other','Bad','Bad','unknown')`, [fixtureUser]), /check constraint/);
  console.log('PASS additive autobiographical migration preserves legacy memories and restricts curation RPC');
} catch (error) { console.error(`FAIL autobiographical migration: ${error.message}`); process.exitCode = 1; }
finally { await memoryMigrationDb.close(); }
