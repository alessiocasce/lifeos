// Jarvis Companion step 1: deterministic tests for the agent Brain on WhatsApp.
// No network: the model is a scripted fake, the database is PGlite with the
// real schema slices and migrations.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createReliabilityDatabase, fixtureUser } from '../../tests/brain/reliabilityDatabase.js';
import { COMPANION_TOOLS, isCompanionWriteTool } from '../../api/_utils/companionTools.js';
import { createCompanionToolExecutor, executeConfirmedCompanionPending, nextOccurrence } from '../../api/_utils/companionToolExecutors.js';
import { createRefRegistry, selectActionToUndo, undoCompanionAction } from '../../api/_utils/companionActionLedger.js';
import { buildHistory, loadCompanionContext } from '../../api/_utils/companionContext.js';
import { cleanReply, COMPANION_REPLIES, handleCompanionChatMessage, latestCompanionPending } from '../../api/_utils/companionTurn.js';
import { renderCompanionContext } from '../../api/_utils/companionPersona.js';
import { buildMemoProactiveCandidates } from '../../api/_utils/brainProactiveRules.js';
import { selectWhatsappBrainHandler } from '../../api/integrations/whatsapp/inbound.js';

const NOW = new Date('2026-11-20T17:30:00.000Z'); // Friday 18:30 in Rome
const SENDER = '111780936298528@lid';
const STEP1_MIGRATION = readFileSync(new URL('../../supabase/migrations/20261123120000_companion_step1_commitments.sql', import.meta.url), 'utf8');

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error.stack ?? error.message}`);
  }
}

async function createDatabase() {
  const { db, client } = await createReliabilityDatabase();
  const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
  const start = schema.indexOf('create table if not exists public.workout_sets (');
  await db.exec(schema.slice(start, schema.indexOf('\n);', start) + 3));
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261122150000_companion_usage_ledger.sql', import.meta.url), 'utf8'));
  await db.exec(STEP1_MIGRATION);
  return { db, client };
}

// A scripted model: each entry is { text, calls } or a function of the request.
function scriptedModel(script) {
  const requests = [];
  let index = 0;
  const generate = async (request) => {
    requests.push(request);
    const entry = script[index];
    index += 1;
    if (!entry) throw new Error('Unexpected model call.');
    const step = typeof entry === 'function' ? entry(request) : entry;
    const calls = (step.calls ?? []).map((call, position) => ({ id: `call-${index}-${position}`, name: call.name, input: call.input ?? {} }));
    return {
      provider: 'gemini', model: 'fake', text: step.text ?? '', toolCalls: calls, stopReason: calls.length ? 'tool_use' : 'end',
      usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0.0001, latencyMs: 3, raw: null,
    };
  };
  return { generate, requests, get calls() { return index; } };
}

function refFor(request, title) {
  const text = request.system.map((block) => block.text).join('\n');
  const match = text.match(new RegExp(`([ce]\\d+) · [^\\n]*${title}`));
  if (!match) throw new Error(`No ref for ${title} in context.`);
  return match[1];
}

function turnDeps(client, model, extra = {}) {
  return {
    client,
    userId: fixtureUser,
    now: () => NOW,
    generate: model.generate,
    prepareInteraction: async () => ({ path: 'normal', intent: 'other' }),
    resolveProactiveReply: async () => null,
    usageSink: async () => {},
    model: { provider: 'gemini', model: 'fake', spec: 'gemini:fake' },
    lockWaitMs: 50,
    lockPollMs: 10,
    ...extra,
  };
}

let messageSeq = 0;
function whatsappTurn(client, model, message, extra = {}) {
  messageSeq += 1;
  return handleCompanionChatMessage({
    message,
    source: 'whatsapp',
    requestId: `00000000-0000-4000-8000-${String(messageSeq).padStart(12, '0')}`,
    clientRequestId: `whatsapp:${SENDER}:m${messageSeq}`,
    channelMetadata: { source: 'whatsapp', channel: 'whatsapp', whatsapp_sender: SENDER, whatsapp_message_id: `m${messageSeq}` },
    deps: turnDeps(client, model, extra),
  });
}

async function count(db, sql, params = []) {
  return Number((await db.query(`select count(*)::int as n from (${sql}) q`, params)).rows[0].n);
}

// ---------------------------------------------------------------------------

await check('COMPANION_AGENT selects the agent only when explicitly on; off restores the legacy pipeline', () => {
  assert.equal(selectWhatsappBrainHandler({}).engine, 'legacy_pipeline');
  assert.equal(selectWhatsappBrainHandler({ COMPANION_AGENT: 'false' }).engine, 'legacy_pipeline');
  assert.equal(selectWhatsappBrainHandler({ COMPANION_AGENT: 'treu' }).engine, 'legacy_pipeline');
  assert.equal(selectWhatsappBrainHandler({ COMPANION_AGENT: 'true' }).engine, 'companion_agent');
  assert.equal(selectWhatsappBrainHandler({ COMPANION_AGENT: 'true' }).handler, handleCompanionChatMessage);
});

await check('step 1 migration evolves memos in place without data loss and keeps legacy memo writes working', async () => {
  const db = new PGlite();
  try {
    const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
    await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select '${fixtureUser}'::uuid $$;
      insert into auth.users values ('${fixtureUser}');`);
    for (const table of ['memos', 'projects']) {
      const start = schema.indexOf(`create table if not exists public.${table} (`);
      await db.exec(schema.slice(start, schema.indexOf('\n);', start) + 3));
    }
    await db.exec(`insert into memos(title, memo_date, memo_time, notes, status) values
      ('Pagare bolletta', '2026-11-21', '10:00', 'gas', 'open'), ('Vecchio', null, null, null, 'done')`);
    const before = (await db.query('select id, title, memo_date, memo_time, notes, status from memos order by title')).rows;
    await db.exec(STEP1_MIGRATION);
    await db.exec(STEP1_MIGRATION); // idempotent
    const after = (await db.query('select id, title, memo_date, memo_time, notes, status, kind, hard, chase_intensity, chase_state, source from memos order by title')).rows;
    assert.deepEqual(after.map(({ id, title, memo_date: d, memo_time: t, notes, status }) => ({ id, title, memo_date: d, memo_time: t, notes, status })), before);
    assert.ok(after.every((row) => row.kind === 'reminder' && row.hard === false && row.chase_intensity === 'coach' && row.chase_state === 'idle'));
    await db.exec(`insert into memos(title, memo_date, status) values ('Memo dal tab', '2026-11-22', 'open')`);
    await assert.rejects(db.query(`insert into memos(title, kind) values ('x', 'bogus')`), /check constraint/);
    await assert.rejects(db.query(`insert into memos(title, recurrence) values ('x', 'every tuesday')`), /check constraint/);
    await db.query(`insert into memos(title, kind, recurrence) values ('Affitto', 'recurring', 'monthly:1')`);
    const project = (await db.query(`insert into projects(name, goal_type, target_value) values ('Tesi', 'hours', 10) returning id`)).rows[0];
    const memo = (await db.query(`insert into memos(title, project_id) values ('Capitolo 2', $1) returning id`, [project.id])).rows[0];
    await db.query('delete from projects where id = $1', [project.id]);
    const orphan = (await db.query('select project_id, user_id from memos where id = $1', [memo.id])).rows[0];
    assert.equal(orphan.project_id, null);
    assert.equal(orphan.user_id, fixtureUser);
    const security = (await db.query(`select
      (select relrowsecurity from pg_class where oid='public.brain_action_ledger'::regclass) as ledger_rls,
      (select relrowsecurity from pg_class where oid='public.brain_turn_locks'::regclass) as lock_rls,
      has_table_privilege('authenticated', 'public.brain_action_ledger', 'SELECT') as owner_read,
      has_table_privilege('authenticated', 'public.brain_action_ledger', 'INSERT') as owner_insert,
      has_table_privilege('anon', 'public.brain_action_ledger', 'SELECT') as anon_read,
      has_table_privilege('authenticated', 'public.brain_turn_locks', 'SELECT') as lock_read,
      has_function_privilege('authenticated', 'public.companion_try_turn_lock(uuid,text,integer)', 'EXECUTE') as lock_rpc_user,
      has_function_privilege('service_role', 'public.companion_try_turn_lock(uuid,text,integer)', 'EXECUTE') as lock_rpc_service`)).rows[0];
    assert.deepEqual(security, {
      ledger_rls: true, lock_rls: true, owner_read: true, owner_insert: false, anon_read: false, lock_read: false, lock_rpc_user: false, lock_rpc_service: true,
    });
  } finally {
    await db.close();
  }
});

await check('per-user turn lock: one holder at a time, re-entrant, expiring and releasable', async () => {
  const { db, client } = await createDatabase();
  try {
    const take = async (holder) => {
      const { data } = await client.rpc('companion_try_turn_lock', { p_user_id: fixtureUser, p_holder: holder, p_ttl_seconds: 60 });
      assert.equal(typeof data[0], 'object', 'the lock RPC returns row objects');
      return data[0].acquired;
    };
    assert.equal(await take('turn-a'), true);
    assert.equal(await take('turn-b'), false);
    assert.equal(await take('turn-a'), true);
    assert.equal((await client.rpc('companion_release_turn_lock', { p_user_id: fixtureUser, p_holder: 'turn-b' })).data[0].released, false);
    assert.equal((await client.rpc('companion_release_turn_lock', { p_user_id: fixtureUser, p_holder: 'turn-a' })).data[0].released, true);
    assert.equal(await take('turn-b'), true);
    await db.query(`update brain_turn_locks set expires_at = now() - interval '1 second'`);
    assert.equal(await take('turn-c'), true);
  } finally {
    await db.close();
  }
});

await check('every write tool records an undo entry and undo restores the previous state', async () => {
  const { db, client } = await createDatabase();
  try {
    const project = (await db.query(`insert into projects(name, goal_type, target_value) values ('Tesi', 'hours', 10) returning id`)).rows[0];
    const memo = (await db.query(`insert into memos(title, memo_date, memo_time) values ('Chiamare il commercialista', '2026-11-20', '11:00') returning id`)).rows[0];
    const rent = (await db.query(`insert into memos(title, memo_date, kind, hard, recurrence) values ('Pagare l''affitto', '2026-11-01', 'recurring', true, 'monthly:1') returning id`)).rows[0];
    const event = (await db.query(`insert into calendar_events(title, event_date, start_time, end_time) values ('Dentista', '2026-11-24', '10:00', '11:00') returning id`)).rows[0];
    await db.query(`insert into health_logs(logged_on, wake_time, notes, hygiene) values ('2026-11-20', '08:10', 'ok', '[]')`);

    const snapshot = async () => ({
      memos: (await db.query(`select id, title, memo_date, memo_time, notes, status, kind, hard, project_id, chase_intensity, chase_state, recurrence, snoozed_until from memos order by id`)).rows,
      events: (await db.query('select id, title, event_date, start_time, end_time, status from calendar_events order by id')).rows,
      expenses: (await db.query('select id, vendor, amount from expenses order by id')).rows,
      health: (await db.query(`select logged_on, sleep_start, wake_time, notes, hygiene from health_logs
        where sleep_start is not null or wake_time is not null or notes is not null or hygiene::text not in ('[]', '{}') order by logged_on`)).rows,
      memories: (await db.query(`select id from ai_memories where status = 'active' order by id`)).rows,
      projects: (await db.query('select id, status from projects order by id')).rows,
      availability: (await db.query(`select value from brain_beliefs where subject_type = 'availability' and record_status = 'current'
        and (effective_until is null or effective_until > $1)`, [NOW.toISOString()])).rows,
    });

    const cases = [
      ['remember', { fact: 'È allergico ai crostacei.', category: 'fact' }],
      ['log_habit', { habit: 'creatine', time: '09:00', date: '2026-11-20' }],
      ['log_sleep_start', { time: '23:40', date: '2026-11-20' }],
      ['log_wake', { time: '07:45', date: '2026-11-20' }],
      ['log_expense', { amount: 23.5, description: 'Pranzo', category: 'cibo' }],
      ['add_health_note', { note: 'pisolino di 20 minuti' }],
      ['upsert_commitment', { title: 'Consegnare la relazione', kind: 'deadline', due_date: '2026-11-26', project: 'Tesi' }],
      ['upsert_commitment', { commitment_id: memo.id, intensity: 'drill' }],
      ['complete_commitment', { commitment_id: rent.id }],
      ['reschedule_commitment', { commitment_id: memo.id, due_date: '2026-11-23' }],
      ['retire_commitment', { commitment_id: memo.id, reason: 'non serve più' }],
      ['schedule_checkin', { date: '2026-11-21', topic: 'Com\'è andata la cena con Marco?' }],
      ['set_availability', { mode: 'no_calls', until_date: '2026-11-21' }],
      ['create_calendar_event', { title: 'Call con Luca', date: '2026-11-23', start_time: '15:00', end_time: '16:00' }],
      ['move_calendar_event', { event_id: event.id, date: '2026-11-25', start_time: '09:00', end_time: '10:00' }],
      ['set_project_status', { project: 'tesi', status: 'paused' }],
    ];
    const covered = new Set(cases.map(([name]) => name));
    const writeTools = COMPANION_TOOLS.filter((tool) => isCompanionWriteTool(tool.name) && !['confirm', 'undo'].includes(tool.autonomy)).map((tool) => tool.name);
    assert.deepEqual(writeTools.filter((name) => !covered.has(name)), [], 'every write tool needs an undo case');

    for (const [name, input] of cases) {
      const before = await snapshot();
      const executor = createCompanionToolExecutor({ client, userId: fixtureUser, now: NOW, turn: { requestId: `undo-${name}`, channel: 'whatsapp' } });
      const output = await executor.executeTool({ name, input });
      assert.equal(output.ok, true, `${name}: ${JSON.stringify(output)}`);
      assert.equal(output.undoable, true, `${name} must record a ledger row`);
      assert.match(output.action_id, /^a\d+$/);
      assert.notDeepEqual(await snapshot(), before, `${name} must change something`);
      const undo = await undoCompanionAction({ client, userId: fixtureUser, now: NOW });
      assert.equal(undo.ok, true, `${name} undo`);
      assert.equal(undo.undone.tool, name);
      assert.deepEqual(await snapshot(), before, `${name} undo must restore the previous state`);
    }
    const recurring = (await db.query(`select count(*)::int as n from memos where title = 'Pagare l''affitto'`)).rows[0].n;
    assert.equal(recurring, 1, 'undoing a recurring completion removes its next occurrence');
    assert.equal(await count(db, `select 1 from brain_action_ledger where undone_at is not null`), cases.length);
    assert.equal(await count(db, `select 1 from brain_action_ledger where tool = 'undo_action'`), cases.length);
    void project;
  } finally {
    await db.close();
  }
});

await check('tool calls are idempotent per turn, validated, and confirm-class tools never delete', async () => {
  const { db, client } = await createDatabase();
  try {
    const executor = createCompanionToolExecutor({ client, userId: fixtureUser, now: NOW, turn: { requestId: 'idem' } });
    const input = { title: 'Comprare il latte', kind: 'reminder', due_date: '2026-11-21' };
    const first = await executor.executeTool({ name: 'upsert_commitment', input });
    const second = await executor.executeTool({ name: 'upsert_commitment', input: { due_date: '2026-11-21', kind: 'reminder', title: 'Comprare il latte' } });
    assert.deepEqual(second, first);
    assert.equal(await count(db, `select 1 from memos where title = 'Comprare il latte'`), 1);
    const otherTurn = createCompanionToolExecutor({ client, userId: fixtureUser, now: NOW, turn: { requestId: 'idem-2' } });
    const replay = await otherTurn.executeTool({ name: 'upsert_commitment', input });
    assert.match(replay.note, /already exists/);
    assert.equal(await count(db, `select 1 from memos where title = 'Comprare il latte'`), 1);

    assert.match((await executor.executeTool({ name: 'log_wake', input: { time: '7.45' } })).error, /HH:MM/);
    assert.match((await executor.executeTool({ name: 'upsert_commitment', input: { title: 'x', kind: 'task', due_date: '2026-02-30' } })).error, /real YYYY-MM-DD/);
    assert.match((await executor.executeTool({ name: 'create_calendar_event', input: { title: 'x', date: '2026-11-23', start_time: '16:00', end_time: '15:00' } })).error, /.+/);
    assert.match((await executor.executeTool({ name: 'complete_commitment', input: { commitment_id: 'c99' } })).error, /Unknown commitment/);
    assert.match((await executor.executeTool({ name: 'log_expense', input: { amount: 5, description: 'x', secret: 1 } })).error, /Unknown field/);

    const ref = first.commitment.id;
    const pending = await executor.executeTool({ name: 'delete_commitment', input: { commitment_id: ref } });
    assert.equal(pending.status, 'confirmation_required');
    assert.equal(await count(db, `select 1 from memos where title = 'Comprare il latte'`), 1);
    assert.equal(executor.state.pending.tool, 'delete_commitment');
    assert.equal(executor.state.pending.summary, 'Comprare il latte');
  } finally {
    await db.close();
  }
});

await check('agent turn: the model cannot confirm a deletion; only the user\'s next affirmative runs it, and annulla restores it', async () => {
  const { db, client } = await createDatabase();
  try {
    await db.query(`insert into memos(title, memo_date) values ('Comprare il regalo per Giulia', '2026-11-22')`);
    const greedy = scriptedModel([
      (request) => ({ calls: [{ name: 'delete_commitment', input: { commitment_id: refFor(request, 'regalo per Giulia') } }] }),
      // The model "confirms" on its own and claims success: nothing may be deleted.
      (request) => ({ text: 'Sì, confermo.', calls: [{ name: 'delete_commitment', input: { commitment_id: refFor(request, 'regalo per Giulia') } }] }),
      { text: 'Fatto, cancellato.' },
    ]);
    const first = await whatsappTurn(client, greedy, 'cancella il promemoria del regalo');
    assert.equal(await count(db, `select 1 from memos where title like 'Comprare il regalo%'`), 1);
    assert.match(first.answer, /\?/, 'a pending deletion always asks');
    assert.equal(first.persisted_message.metadata.companion_pending.status, 'awaiting_confirmation');

    const noModel = scriptedModel([]);
    const confirmed = await whatsappTurn(client, noModel, 'sì');
    assert.equal(noModel.calls, 0, 'confirmation runs without a model call');
    assert.equal(confirmed.answer, COMPANION_REPLIES.pendingDone('Comprare il regalo per Giulia'));
    assert.equal(await count(db, `select 1 from memos where title like 'Comprare il regalo%'`), 0);
    assert.equal(confirmed.persisted_message.metadata.companion_pending.status, 'completed');

    const again = await whatsappTurn(client, scriptedModel([{ text: 'Ok.' }]), 'sì');
    assert.equal(again.answer, 'Ok.', 'a used confirmation cannot be replayed');

    const undo = await whatsappTurn(client, noModel, 'annulla');
    assert.equal(noModel.calls, 0);
    assert.match(undo.answer, /^Annullato: cancellato: Comprare il regalo per Giulia\.$/);
    assert.equal(await count(db, `select 1 from memos where title like 'Comprare il regalo%'`), 1);
  } finally {
    await db.close();
  }
});

await check('agent turn: a pending deletion lapses when the next message is not a confirmation, and "no" cancels it', async () => {
  const { db, client } = await createDatabase();
  try {
    await db.query(`insert into calendar_events(title, event_date, start_time, end_time) values ('Dentista', '2026-11-24', '10:00', '11:00')`);
    const ask = () => scriptedModel([
      (request) => ({ calls: [{ name: 'get_calendar', input: { start_date: '2026-11-24', end_date: '2026-11-24' } }] }),
      (request) => {
        const result = request.messages.at(-1).results[0].output.events[0];
        return { calls: [{ name: 'delete_calendar_event', input: { event_id: result.id } }] };
      },
      { text: 'Confermi che cancello il dentista di martedì?' },
    ]);
    await whatsappTurn(client, ask(), 'togli il dentista');
    const other = scriptedModel([{ text: 'Domani hai la cena con Marco.' }]);
    const reply = await whatsappTurn(client, other, 'cosa ho domani?');
    assert.equal(other.calls, 1);
    assert.equal(reply.answer, 'Domani hai la cena con Marco.');
    assert.equal(await count(db, `select 1 from calendar_events where title = 'Dentista'`), 1);
    const late = await whatsappTurn(client, scriptedModel([{ text: 'Su cosa?' }]), 'sì');
    assert.equal(late.answer, 'Su cosa?', 'confirmation is valid only as the very next message');
    assert.equal(await count(db, `select 1 from calendar_events where title = 'Dentista'`), 1);

    await whatsappTurn(client, ask(), 'togli il dentista');
    const cancel = await whatsappTurn(client, scriptedModel([]), 'no lascia stare');
    assert.equal(cancel.answer, COMPANION_REPLIES.pendingCancelled);
    assert.equal(await count(db, `select 1 from calendar_events where title = 'Dentista'`), 1);
  } finally {
    await db.close();
  }
});

await check('agent turn: context has commitments, the cross-channel timeline and undoable actions; writes are traced', async () => {
  const { db, client } = await createDatabase();
  try {
    const appThread = (await db.query(`insert into ai_chat_threads(title, metadata) values ('App', '{"source":"app"}') returning id`)).rows[0];
    await db.query(`insert into ai_chat_messages(thread_id, role, content, metadata, created_at) values
      ($1, 'user', 'stamattina ho deciso di finire il capitolo 2 entro mercoledì', '{"source":"app"}', $2)`, [appThread.id, '2026-11-20T08:15:00Z']);
    await db.query(`insert into memos(title, memo_date, kind, hard) values ('Consegnare il deck', '2026-11-23', 'deadline', true)`);
    const model = scriptedModel([
      (request) => {
        const system = request.system.map((block) => block.text).join('\n');
        assert.match(system, /c\d+ · Consegnare il deck · scade 2026-11-23 · deadline · hard/);
        assert.match(request.messages[0].content, /^\[oggi 09:15 · app\] stamattina ho deciso/);
        return { calls: [{ name: 'upsert_commitment', input: { title: 'Finire il capitolo 2', kind: 'promise', due_date: '2026-11-25' } }] };
      },
      { text: 'Segnato: capitolo 2 entro mercoledì.' },
    ]);
    const result = await whatsappTurn(client, model, 'segnami il capitolo 2 per mercoledì', { debugFlags: undefined });
    assert.equal(result.answer, 'Segnato: capitolo 2 entro mercoledì.');
    const trace = result.persisted_message.metadata.brain_trace;
    assert.equal(trace.route, 'companion_agent');
    assert.equal(trace.companion.tool_calls[0].name, 'upsert_commitment');
    assert.equal(trace.companion.actions.length, 1);
    assert.equal(result.persisted_message.action_type, 'companion_agent_write');
    assert.ok(!JSON.stringify(trace).match(/thought|AIza/i), 'no chain-of-thought or secrets in the trace');

    const next = scriptedModel([
      (request) => {
        const system = request.system.map((block) => block.text).join('\n');
        assert.match(system, /Recent Brain actions \(undoable\):\n- a1 · \d\d:\d\d · Segnato: Finire il capitolo 2 \(2026-11-25\)/);
        return { text: 'Ok.' };
      },
    ]);
    await whatsappTurn(client, next, 'grazie');
    assert.equal(next.calls, 1);
  } finally {
    await db.close();
  }
});

await check('agent turn: model failure, debug-looking output and replays stay safe for WhatsApp', async () => {
  const { db, client } = await createDatabase();
  try {
    const broken = { generate: async () => { throw Object.assign(new Error('Gemini request failed (500)'), { retryable: false }); }, calls: 0 };
    const failed = await whatsappTurn(client, broken, 'ciao');
    assert.equal(failed.answer, COMPANION_REPLIES.failure);
    assert.equal(failed.persisted_message.metadata.brain_trace.final_response_type, 'error');

    const partial = scriptedModel([
      { calls: [{ name: 'log_expense', input: { amount: 12, description: 'Cinema' } }] },
    ]);
    const partialReply = await whatsappTurn(client, partial, 'ho speso 12 euro al cinema');
    assert.match(partialReply.answer, /Spesa €12,00 Cinema/, 'a write before a failure is still reported');

    const leaky = scriptedModel([{ text: '{"tool_calls": [], "brain_trace": {}}' }]);
    const clean = await whatsappTurn(client, leaky, 'ok');
    assert.doesNotMatch(clean.answer, /brain_trace|\{/);

    messageSeq += 1;
    const args = {
      message: 'replay', source: 'whatsapp', requestId: 'replay-1', clientRequestId: 'whatsapp:replay:1',
      channelMetadata: { source: 'whatsapp', channel: 'whatsapp', whatsapp_sender: SENDER, whatsapp_message_id: 'replay' },
    };
    const original = await handleCompanionChatMessage({ ...args, deps: turnDeps(client, scriptedModel([{ text: 'Prima risposta.' }])) });
    const replayed = await handleCompanionChatMessage({ ...args, deps: turnDeps(client, scriptedModel([])) });
    assert.equal(replayed.answer, original.answer);
    assert.equal(replayed.idempotent_replay, true);
    assert.equal(await count(db, `select 1 from ai_chat_messages where content = 'replay'`), 1);
  } finally {
    await db.close();
  }
});

await check('agent turn: a held turn lock delays then proceeds, and quoted-message refusals stay deterministic', async () => {
  const { db, client } = await createDatabase();
  try {
    await client.rpc('companion_try_turn_lock', { p_user_id: fixtureUser, p_holder: 'app-turn', p_ttl_seconds: 60 });
    const waited = await whatsappTurn(client, scriptedModel([{ text: 'Eccomi.' }]), 'ci sei?');
    assert.equal(waited.answer, 'Eccomi.');
    assert.equal(waited.persisted_message.metadata.brain_trace.decision_path.find((step) => step.step === 'companion_turn_lock').data.timed_out, true);
    await db.query('delete from brain_turn_locks');

    const quoted = await whatsappTurn(client, scriptedModel([]), 'fatto', {
      prepareInteraction: async () => ({ path: 'clarification', intent: 'quoted_target_expired' }),
    });
    assert.match(quoted.answer, /scaduto/);
    assert.equal(await count(db, 'select 1 from brain_turn_locks'), 0, 'the lock is released after every turn');
  } finally {
    await db.close();
  }
});

await check('context assembly renders refs, the replying-to quote and stamps cross-channel history', async () => {
  const { db, client } = await createDatabase();
  try {
    await db.query(`insert into memos(title, memo_date, memo_time, kind) values ('Com''è andata la cena?', '2026-11-21', '10:00', 'checkin')`);
    await db.query(`insert into memos(title) values ('Comprare il latte')`);
    const { context, history } = await loadCompanionContext({ client, userId: fixtureUser, now: NOW, refs: createRefRegistry(), message: 'latte', replyingTo: 'Hai fatto la doccia?' });
    assert.ok(context.commitments.some((line) => /Comprare il latte · senza data/.test(line)));
    assert.ok(context.openThreads.some((line) => /domanda programmata 2026-11-21 10:00/.test(line)));
    assert.equal(history.length, 0);
    const rendered = renderCompanionContext(context);
    assert.match(rendered, /The user is replying to this earlier message: «Hai fatto la doccia\?»/);
    const merged = buildHistory([
      { role: 'assistant', content: 'Hai fatto la doccia?', created_at: '2026-11-20T07:00:00Z', metadata: { channel: 'whatsapp' } },
      { role: 'assistant', content: 'E la creatina?', created_at: '2026-11-20T07:01:00Z', metadata: { channel: 'whatsapp' } },
      { role: 'user', content: 'sì', created_at: '2026-11-19T07:02:00Z', metadata: { channel: 'whatsapp' } },
    ], { nowDate: NOW });
    assert.deepEqual(merged.map((entry) => entry.role), ['assistant', 'user']);
    assert.match(merged[1].content, /^\[ieri 08:02 · whatsapp\] sì$/);
  } finally {
    await db.close();
  }
});

await check('Brain-scheduled check-ins go out once as the question, never as memo nags', () => {
  const memo = { id: 'k1', title: 'Com\'è andato il colloquio?', memo_date: '2026-11-21', memo_time: '10:00', status: 'open', kind: 'checkin' };
  const due = buildMemoProactiveCandidates({ memo, now: new Date('2026-11-21T09:05:00Z'), recipient: 'fixture' });
  assert.equal(due.length, 1);
  assert.equal(due[0].body, memo.title);
  assert.equal(due[0].rule_key, 'companion_checkin_due');
  assert.equal(due[0].metadata.expected_reply_type, 'companion_checkin');
  assert.deepEqual(buildMemoProactiveCandidates({ memo, now: new Date('2026-11-21T12:30:00Z'), recipient: 'fixture' }).filter((c) => c.rule_key !== 'companion_checkin_due'), []);
  const reminder = buildMemoProactiveCandidates({ memo: { ...memo, kind: undefined, title: 'Pagare bolletta' }, now: new Date('2026-11-21T09:05:00Z'), recipient: 'fixture' });
  assert.equal(reminder[0].rule_key, 'timed_memo_due');
});

await check('pure helpers: recurrence, undo selection, pending ownership and reply cleaning', () => {
  assert.equal(nextOccurrence('monthly:31', '2026-01-31'), '2026-02-28');
  assert.equal(nextOccurrence('weekly:mon', '2026-11-23'), '2026-11-30');
  assert.equal(nextOccurrence('weekly:fri', '2026-11-23'), '2026-11-27');
  assert.equal(nextOccurrence('yearly:02-29', '2026-02-28'), '2027-02-28');
  assert.equal(nextOccurrence('daily', '2026-12-31'), '2027-01-01');

  const actions = [
    { id: '3', tool: 'create_calendar_event', summary: 'Evento: Call con Luca 2026-11-23 15:00-16:00' },
    { id: '2', tool: 'log_expense', summary: 'Spesa €12,00 Cinema (2026-11-20)' },
    { id: '1', tool: 'undo_action', summary: 'Annullato: x' },
  ];
  assert.equal(selectActionToUndo(actions).action.id, '3');
  assert.equal(selectActionToUndo(actions, { description: 'annulla la spesa del cinema' }).action.id, '2');
  assert.equal(selectActionToUndo(actions, { description: 'annulla l\'evento di prima' }).action.id, '3');
  assert.equal(selectActionToUndo(actions, { description: 'la palestra' }).error, 'no_matching_action');
  assert.equal(selectActionToUndo([]).error, 'nothing_to_undo');

  const pending = { status: 'awaiting_confirmation', expires_at: '2026-11-20T18:00:00Z', summary: 'X' };
  assert.equal(latestCompanionPending([{ role: 'assistant', id: 'm1', metadata: { companion_pending: pending } }], NOW).message_id, 'm1');
  assert.equal(latestCompanionPending([{ role: 'assistant', id: 'm1', metadata: { companion_pending: pending } }, { role: 'assistant', id: 'm2', metadata: {} }], NOW), null);
  assert.equal(latestCompanionPending([{ role: 'assistant', id: 'm1', metadata: { companion_pending: pending } }], new Date('2026-11-20T18:01:00Z')), null);

  assert.equal(cleanReply('', { actions: [{ summary: 'Segnato: deck' }] }), 'Segnato: deck.');
  assert.equal(cleanReply('```json\n{}\n```'), 'Mi sono incartato, puoi ripetermelo in un altro modo?');
  assert.match(cleanReply('Ok, lo cancello.', { pending: { summary: 'Dentista' } }), /Confermi che cancello «Dentista»\?$/);
});

if (failures) {
  console.error(`\n${failures} Companion agent test(s) failed.`);
  process.exitCode = 1;
}
