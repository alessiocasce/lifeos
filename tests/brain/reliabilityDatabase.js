import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const fixtureUser = '11111111-1111-4111-8111-111111111111';

export async function createReliabilityDatabase() {
  const db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select '${fixtureUser}'::uuid $$;
    insert into auth.users values ('${fixtureUser}');`);
  const schema = fs.readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
  for (const table of ['health_logs', 'memos', 'projects', 'project_sessions', 'brain_outbox_messages', 'ai_chat_threads', 'ai_chat_messages',
    'brain_whatsapp_inbound_receipts', 'brain_whatsapp_message_deliveries', 'brain_interaction_state']) {
    const start = schema.indexOf(`create table if not exists public.${table} (`);
    if (start < 0) throw new Error(`Missing checked-in table ${table}`);
    await db.exec(schema.slice(start, schema.indexOf('\n);', start) + 3));
  }
  const timestampStart = schema.indexOf('create or replace function public.set_updated_at()');
  if (timestampStart >= 0) await db.exec(schema.slice(timestampStart, schema.indexOf('drop trigger if exists set_workouts', timestampStart)));
  await db.exec(`create trigger health_updated before update on health_logs for each row execute function public.set_updated_at();`);
  await db.exec(fs.readFileSync(new URL('../../supabase/releases/reliability.sql', import.meta.url), 'utf8'));
  await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20260919120000_companion_beliefs.sql', import.meta.url), 'utf8'));
  await db.exec(`create unique index ai_chat_messages_user_thread_outbox_unique
    on ai_chat_messages (user_id, thread_id, (metadata->>'outbox_message_id'))
    where role = 'assistant' and coalesce(metadata->>'outbox_message_id', '') <> '';`);
  return {
    db,
    client: {
      from: (table) => new Query(db, table),
      rpc: (name, args = {}) => rpc(db, name, args),
    },
  };
}

// A small PostgREST-shaped adapter over real in-memory PostgreSQL. It does not
// emulate RLS/auth/network behavior; it executes actual constraints and triggers.
class Query {
  constructor(db, table) { this.db = db; this.table = identifier(table); this.filters = []; this.params = []; this.orders = []; this.mode = 'select'; }
  bind(value) { this.params.push(value); return `$${this.params.length}`; }
  select(columns = '*', options = {}) { this.columns = columns; this.options = options; return this; }
  eq(key, value) { this.filters.push(`${identifier(key)} = ${this.bind(value)}`); return this; }
  neq(key, value) { this.filters.push(`${identifier(key)} <> ${this.bind(value)}`); return this; }
  gte(key, value) { this.filters.push(`${identifier(key)} >= ${this.bind(value)}`); return this; }
  lte(key, value) { this.filters.push(`${identifier(key)} <= ${this.bind(value)}`); return this; }
  lt(key, value) { this.filters.push(`${identifier(key)} < ${this.bind(value)}`); return this; }
  not(key, op, value) { if (op !== 'is' || value !== null) throw new Error('Unsupported test filter'); this.filters.push(`${identifier(key)} is not null`); return this; }
  in(key, values) { this.filters.push(`${identifier(key)} in (${values.map((value) => this.bind(value)).join(',')})`); return this; }
  is(key, value) { if (value !== null) throw new Error('Only null is supported'); this.filters.push(`${identifier(key)} is null`); return this; }
  contains(key, value) { this.filters.push(`${identifier(key)} @> ${this.bind(JSON.stringify(value))}::jsonb`); return this; }
  or(value) {
    const parts = value.split(',').map((part) => {
      const [key, op, ...tail] = part.split('.');
      if (op === 'is' && tail.join('.') === 'null') return `${identifier(key)} is null`;
      if (!['gt', 'lte'].includes(op)) throw new Error('Unsupported test filter');
      return `${identifier(key)} ${op === 'gt' ? '>' : '<='} ${this.bind(tail.join('.'))}`;
    });
    this.filters.push(`(${parts.join(' or ')})`); return this;
  }
  order(key, { ascending = true } = {}) { this.orders.push(`${identifier(key)} ${ascending ? 'asc' : 'desc'}`); return this; }
  limit(n) { this.max = Number(n); return this; }
  update(payload) { this.mode = 'update'; this.payload = payload; return this; }
  insert(payload) { this.mode = 'insert'; this.payload = payload; return this; }
  upsert(payload, { onConflict } = {}) { this.mode = 'upsert'; this.payload = payload; this.conflict = onConflict; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; return this; }
  then(resolve, reject) { return this.run().then(resolve, reject); }
  async run() {
    try {
      const where = this.filters.length ? ` where ${this.filters.join(' and ')}` : '';
      let sql;
      if (this.mode === 'insert' || this.mode === 'upsert') {
        const entries = Object.entries(this.payload);
        const conflict = this.mode === 'upsert'
          ? ` on conflict (${String(this.conflict || '').split(',').map(identifier).join(',')}) do update set ${entries.map(([key, value]) => `${identifier(key)}=${this.bind(value)}`).join(',')}`
          : '';
        sql = `insert into ${this.table} (${entries.map(([key]) => identifier(key)).join(',')}) values (${entries.map(([, value]) => this.bind(value)).join(',')})${conflict} returning *`;
      } else if (this.mode === 'update') {
        sql = `update ${this.table} set ${Object.entries(this.payload).map(([key, value]) => `${identifier(key)}=${this.bind(value)}`).join(',')} ${where} returning *`;
      } else {
        sql = `select * from ${this.table}${where}${this.orders.length ? ` order by ${this.orders.join(',')}` : ''}${this.max ? ` limit ${this.max}` : ''}`;
      }
      const result = await this.db.query(`with rows as (${sql}) select to_jsonb(rows) as value from rows`, this.params);
      const rows = result.rows.map((row) => row.value);
      return { data: this.one ? rows[0] || null : rows, error: null, count: rows.length };
    } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
  }
}
function identifier(value) {
  if (!/^[a-z_]+$/.test(value)) throw new Error('Invalid SQL identifier');
  return `"${value}"`;
}

async function rpc(db, name, args) {
  try {
    const params = [];
    const bind = (value) => { params.push(value); return `$${params.length}`; };
    const assignments = Object.entries(args).map(([key, value]) => `${identifier(key)} => ${bind(value)}`);
    const result = await db.query(
      `select to_jsonb(rows) as value from public.${identifier(name)}(${assignments.join(', ')}) as rows`,
      params,
    );
    return { data: result.rows.map((row) => row.value), error: null };
  } catch (error) {
    return { data: null, error: { code: error.code, message: error.message } };
  }
}
