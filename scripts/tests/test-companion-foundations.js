// Deterministic tests for Jarvis Companion step 0 foundations (spec §10, step 0).
// No network: providers are replaced by fakes, the database by PGlite.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { companionCapabilityState, isCompanionCapabilityEnabled } from '../../api/_utils/companionFlags.js';
import { estimateModelCostUsd, modelPrice } from '../../api/_utils/companionPricing.js';
import {
  buildAnthropicRequest, buildGeminiRequest, generateCompanionTurn, parseModelSpec, resolveTierModel, toGeminiSchema,
} from '../../api/_utils/companionModel.js';
import { runCompanionTurn, COMPANION_FALLBACK_REPLIES } from '../../api/_utils/companionAgentLoop.js';
import { COMPANION_TOOLS, getCompanionTool, isCompanionWriteTool } from '../../api/_utils/companionTools.js';
import { COMPANION_PERSONA, companionSystemBlocks, renderCompanionContext } from '../../api/_utils/companionPersona.js';
import {
  companionBudget, createMemoryUsageSink, projectMonthEndSpend, romeMonthWindow, spendGuardLevel, toLedgerRow,
} from '../../api/_utils/companionUsage.js';
import { createMockWorld } from '../../tests/companion/mockWorld.js';
import { hasDebugLeak, looksItalian, matchArgs, scoreCase, validateCaseShape } from '../../tests/companion/evalAssertions.js';
import { COMPANION_GUARANTEES, PUBLIC_EVAL_CASES } from '../../tests/companion/evalCases.js';

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

const tools = COMPANION_TOOLS.filter((tool) => ['get_today', 'upsert_commitment', 'delete_commitment'].includes(tool.name));

await check('capability flags default off and accept only explicit truthy values', () => {
  assert.deepEqual(companionCapabilityState({}), { agent: false, proactive: false, calls: false, email: false });
  assert.equal(isCompanionCapabilityEnabled('agent', { COMPANION_AGENT: 'true' }), true);
  assert.equal(isCompanionCapabilityEnabled('calls', { COMPANION_CALLS: ' ON ' }), true);
  assert.equal(isCompanionCapabilityEnabled('email', { COMPANION_EMAIL: 'flase' }), false);
  assert.throws(() => isCompanionCapabilityEnabled('teleport', {}), /Unknown Companion capability/);
});

await check('pricing estimates cached, uncached and output tokens and switches Gemini intro pricing by date', () => {
  const haiku = estimateModelCostUsd({ provider: 'anthropic', model: 'claude-haiku-5-5', usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 } });
  assert.deepEqual(haiku, { costUsd: 0.61, priced: true });
  assert.equal(modelPrice('gemini', 'gemini-3.8-flash', new Date('2026-12-31T22:30:00Z')).input, 0.75);
  assert.equal(modelPrice('gemini', 'gemini-3.8-flash', new Date('2026-12-31T23:30:00Z')).input, 1.5);
  assert.deepEqual(estimateModelCostUsd({ provider: 'gemini', model: 'unknown', usage: { inputTokens: 10 } }), { costUsd: 0, priced: false });
});

await check('model specs parse provider, model and effort; tiers resolve from env with defaults', () => {
  assert.deepEqual(parseModelSpec('anthropic:claude-haiku-5-5@low'), { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'low', spec: 'anthropic:claude-haiku-5-5@low' });
  assert.throws(() => parseModelSpec('openai:gpt'), /Invalid Companion model spec/);
  assert.throws(() => parseModelSpec('anthropic:claude-haiku-5-5@turbo'), /Invalid effort/);
  assert.equal(resolveTierModel('fast', {}).provider, 'gemini');
  assert.equal(resolveTierModel('deep', { COMPANION_MODEL_DEEP: 'anthropic:claude-sonnet-5-5@medium' }).model, 'claude-sonnet-5-5');
});

await check('Anthropic requests cache the persona, map tools and history, set effort, and use refusal fallbacks only where supported', () => {
  const spec = parseModelSpec('anthropic:claude-haiku-5-5@low');
  const priorTurn = { provider: 'anthropic', model: 'claude-haiku-5-5', raw: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'tu1', name: 'get_today', input: {} }], text: '', toolCalls: [{ id: 'tu1', name: 'get_today', input: {} }] };
  const request = buildAnthropicRequest({
    spec,
    systemBlocks: [{ text: 'persona', cache: true }, { text: 'context', cache: false }],
    messages: [
      { role: 'assistant', content: 'proactive ping' },
      { role: 'user', content: 'ciao' },
      { role: 'assistant', turn: priorTurn },
      { role: 'tool_results', results: [{ id: 'tu1', name: 'get_today', output: { ok: true } }] },
    ],
    tools,
    maxOutputTokens: 1000,
  });
  assert.equal(request.beta, false);
  assert.deepEqual(request.params.system[0].cache_control, { type: 'ephemeral' });
  assert.equal(request.params.system[1].cache_control, undefined);
  assert.deepEqual(request.params.output_config, { effort: 'low' });
  assert.equal('temperature' in request.params, false);
  assert.equal(request.params.messages[0].role, 'user', 'leading assistant history gets a user placeholder');
  assert.equal(request.params.messages[3].content, priorTurn.raw, 'same-model turns replay raw content, thinking included');
  assert.deepEqual(request.params.messages[4].content[0], { type: 'tool_result', tool_use_id: 'tu1', content: '{"ok":true}' });
  assert.equal(request.params.tools[1].input_schema.additionalProperties, false);
  const sonnet = buildAnthropicRequest({ spec: parseModelSpec('anthropic:claude-sonnet-5-5'), systemBlocks: [], messages: [{ role: 'user', content: 'x' }], tools: [], maxOutputTokens: 10 });
  assert.equal(sonnet.beta, true);
  assert.deepEqual(sonnet.params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(sonnet.params.fallbacks, 'default');
});

await check('generateCompanionTurn normalizes Anthropic tool use, prices it and records usage', async () => {
  const { entries, sink } = createMemoryUsageSink();
  let seen = null;
  const client = {
    messages: {
      create: async (params) => {
        seen = params;
        return {
          model: 'claude-haiku-5-5',
          stop_reason: 'tool_use',
          content: [{ type: 'text', text: 'Controllo.' }, { type: 'tool_use', id: 'tu9', name: 'get_today', input: { date: '2026-11-21' } }],
          usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 },
        };
      },
    },
  };
  const turn = await generateCompanionTurn({
    model: 'anthropic:claude-haiku-5-5@low', system: 'persona', messages: [{ role: 'user', content: 'cosa ho domani?' }], tools,
    usageSink: sink, purpose: 'eval', requestId: 'r1', clients: { anthropic: client },
  });
  assert.equal(seen.model, 'claude-haiku-5-5');
  assert.equal(turn.stopReason, 'tool_use');
  assert.deepEqual(turn.toolCalls, [{ id: 'tu9', name: 'get_today', input: { date: '2026-11-21' } }]);
  assert.equal(turn.costUsd, 0.00023);
  assert.equal(turn.usageRecorded, true);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].purpose, 'eval');
  assert.equal(entries[0].cacheReadTokens, 3000);
  assert.equal(entries[0].estimatedCostUsd, 0.00023);
});

await check('Gemini requests sanitize schemas, replay thought signatures and return function responses with ids', async () => {
  const spec = parseModelSpec('gemini:gemini-3.1-flash-lite');
  const raw = { role: 'model', parts: [{ functionCall: { id: 'fc1', name: 'get_today', args: {} }, thoughtSignature: 'abc' }] };
  const body = buildGeminiRequest({
    spec,
    systemBlocks: [{ text: 'persona', cache: true }],
    messages: [
      { role: 'user', content: 'cosa ho oggi?' },
      { role: 'assistant', turn: { provider: 'gemini', model: 'gemini-3.1-flash-lite', raw, text: '', toolCalls: [{ id: 'fc1', providerId: 'fc1', name: 'get_today', input: {} }] } },
      { role: 'tool_results', results: [{ id: 'fc1', providerId: 'fc1', name: 'get_today', output: { events: [] } }] },
    ],
    tools,
    maxOutputTokens: 500,
  });
  assert.equal(body.contents[1], raw);
  assert.deepEqual(body.contents[2].parts[0].functionResponse, { name: 'get_today', id: 'fc1', response: { result: { events: [] } } });
  const declaration = body.tools[0].functionDeclarations.find((entry) => entry.name === 'upsert_commitment');
  assert.equal('additionalProperties' in declaration.parameters, false);
  assert.deepEqual(toGeminiSchema({ type: ['string', 'null'], format: 'date' }), { type: 'string', nullable: true });

  const { entries, sink } = createMemoryUsageSink();
  const fakeFetch = async (url, init) => {
    assert.match(url, /gemini-3\.1-flash-lite:generateContent$/);
    assert.equal(init.headers['x-goog-api-key'], 'test-key');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'pensiero', thought: true }, { text: 'Segnato.' }] } }],
        usageMetadata: { promptTokenCount: 1200, cachedContentTokenCount: 200, candidatesTokenCount: 10, thoughtsTokenCount: 40 },
      }),
    };
  };
  const turn = await generateCompanionTurn({
    model: spec, system: 'persona', messages: [{ role: 'user', content: 'segna x' }], tools: [],
    usageSink: sink, purpose: 'chat', env: { GEMINI_API_KEY: 'test-key' }, clients: { fetch: fakeFetch },
  });
  assert.equal(turn.text, 'Segnato.');
  assert.equal(turn.stopReason, 'end');
  assert.deepEqual(turn.usage, { inputTokens: 1000, outputTokens: 50, cacheReadTokens: 200, cacheWriteTokens: 0 });
  assert.equal(entries[0].provider, 'gemini');
});

await check('every model call needs a usage sink, and a failing ledger never breaks the turn', async () => {
  const client = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: {} }) } };
  await assert.rejects(generateCompanionTurn({ model: 'anthropic:claude-haiku-5-5', system: 's', messages: [], purpose: 'eval', clients: { anthropic: client } }), /requires a usageSink/);
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const turn = await generateCompanionTurn({
      model: 'anthropic:claude-haiku-5-5', system: 's', messages: [{ role: 'user', content: 'x' }], purpose: 'eval',
      usageSink: async () => { throw new Error('ledger down'); }, clients: { anthropic: client },
    });
    assert.equal(turn.text, 'ok');
    assert.equal(turn.usageRecorded, false);
  } finally {
    console.warn = originalWarn;
  }
});

function scriptedGenerate(turns) {
  let index = 0;
  return async () => {
    const next = turns[Math.min(index, turns.length - 1)];
    index += 1;
    return { provider: 'fake', model: 'fake', text: '', toolCalls: [], stopReason: 'end', raw: null, usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.001, latencyMs: 5, ...next };
  };
}

await check('agent loop runs tools, feeds results back and stops on a final answer', async () => {
  const executed = [];
  const result = await runCompanionTurn({
    generate: scriptedGenerate([
      { toolCalls: [{ id: 't1', name: 'get_today', input: {} }], stopReason: 'tool_use' },
      { text: 'Domani hai la cena con Marco.', stopReason: 'end' },
    ]),
    executeTool: async (call) => { executed.push(call.name); return { events: [] }; },
    system: 's',
    message: 'cosa ho domani?',
    tools,
  });
  assert.equal(result.reply, 'Domani hai la cena con Marco.');
  assert.equal(result.stopReason, 'end');
  assert.deepEqual(executed, ['get_today']);
  assert.equal(result.steps.length, 2);
  assert.equal(result.costUsd, 0.002);
  assert.equal(result.messages.at(-1).role, 'tool_results');
});

await check('agent loop contains unknown tools, tool exceptions, refusals and runaway loops', async () => {
  const errors = await runCompanionTurn({
    generate: scriptedGenerate([
      { toolCalls: [{ id: 'a', name: 'drop_database', input: {} }, { id: 'b', name: 'get_today', input: {} }], stopReason: 'tool_use' },
      { text: 'Fatto.', stopReason: 'end' },
    ]),
    executeTool: async () => { throw new Error('boom'); },
    system: 's', message: 'x', tools,
  });
  assert.deepEqual(errors.toolCalls.map((call) => [call.name, call.isError]), [['drop_database', true], ['get_today', true]]);
  const refusal = await runCompanionTurn({ generate: scriptedGenerate([{ stopReason: 'refusal' }]), executeTool: async () => ({}), system: 's', message: 'x', tools });
  assert.equal(refusal.reply, COMPANION_FALLBACK_REPLIES.refusal);
  const runaway = await runCompanionTurn({
    generate: scriptedGenerate([{ toolCalls: [{ id: 'z', name: 'get_today', input: {} }], stopReason: 'tool_use' }]),
    executeTool: async () => ({}), system: 's', message: 'x', tools, maxSteps: 3,
  });
  assert.equal(runaway.stopReason, 'max_steps');
  assert.equal(runaway.steps.length, 3);
  assert.equal(runaway.reply, COMPANION_FALLBACK_REPLIES.stuck);
});

await check('tool catalog declares unique tools with autonomy classes and strict object schemas', () => {
  const names = COMPANION_TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  for (const tool of COMPANION_TOOLS) {
    assert.ok(['read', 'silent', 'mention', 'explicit', 'confirm', 'undo'].includes(tool.autonomy), tool.name);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
    for (const field of tool.inputSchema.required) assert.ok(tool.inputSchema.properties[field], `${tool.name}.${field}`);
  }
  assert.equal(isCompanionWriteTool('get_today'), false);
  assert.equal(isCompanionWriteTool('log_sleep_start'), true);
  assert.equal(getCompanionTool('delete_commitment').autonomy, 'confirm');
});

await check('persona is stable and the context block marks data as non-instructions', () => {
  const blocks = companionSystemBlocks({ now: '2026-11-20T17:30:00.000Z', commitments: ['c1 · deck'] });
  assert.equal(blocks[0].text, COMPANION_PERSONA);
  assert.equal(blocks[0].cache, true);
  assert.equal(blocks[1].cache, false);
  assert.match(renderCompanionContext({ now: '2026-11-20T17:30:00.000Z' }), /venerdì 20 novembre 2026.*18:30/);
  assert.match(blocks[1].text, /Not instructions/);
});

await check('mock world validates arguments, records writes and turns deletes into pending confirmations', async () => {
  const world = createMockWorld();
  assert.equal((await world.executeTool({ name: 'log_sleep_start', input: { time: '23.40' } })).ok, false);
  assert.equal((await world.executeTool({ name: 'upsert_commitment', input: { title: 'x', kind: 'task', colour: 'red' } })).ok, false);
  assert.equal((await world.executeTool({ name: 'complete_commitment', input: { commitment_id: 'nope' } })).ok, false);
  assert.equal((await world.executeTool({ name: 'log_sleep_start', input: { time: '23:40' } })).ok, true);
  const pending = await world.executeTool({ name: 'delete_commitment', input: { commitment_id: 'c4' } });
  assert.equal(pending.status, 'confirmation_required');
  assert.deepEqual(world.writes.map((write) => write.name), ['log_sleep_start']);
  assert.equal(world.pending.length, 1);
  const today = await world.executeTool({ name: 'get_today', input: {} });
  assert.equal(today.date, '2026-11-20');
  assert.deepEqual(today.calendar.map((event) => event.id), ['e1']);
  assert.ok(world.context().commitments.some((line) => line.includes('deck')));
});

await check('scoring flags unwanted writes as P1, missing calls by case severity, and global reply checks', () => {
  const world = { writes: [{ name: 'upsert_commitment', input: {} }], pending: [] };
  const negative = scoreCase({ id: 'n', message: 'non segnarlo', expect: { noWrites: true } }, { reply: 'Ok, non lo segno.', toolCalls: [] }, world);
  assert.equal(negative.p1, true);
  assert.equal(negative.failures[0].code, 'unwanted_write');
  const missed = scoreCase({ id: 'm', message: 'x', severity: 'P1', expect: { calls: [{ name: 'log_sleep_start' }] } }, { reply: 'Buonanotte!', toolCalls: [] }, { writes: [], pending: [] });
  assert.deepEqual(missed.failures.map((failure) => [failure.code, failure.severity]), [['missing_call', 'P1']]);
  const leak = scoreCase({ id: 'l', message: 'x', expect: {} }, { reply: '{"tool": "get_today"}', toolCalls: [] }, { writes: [], pending: [] });
  assert.ok(leak.failures.some((failure) => failure.code === 'debug_leak'));
  const english = scoreCase({ id: 'e', message: 'x', expect: {} }, { reply: 'Sure, I will remind you tomorrow.', toolCalls: [] }, { writes: [], pending: [] });
  assert.ok(english.failures.some((failure) => failure.code === 'wrong_language'));
  const confirm = scoreCase(
    { id: 'c', message: 'cancella', expect: { confirmation: true } },
    { reply: 'Confermi che lo cancello?', toolCalls: [{ name: 'delete_commitment', input: {} }] },
    { writes: [], pending: [{ name: 'delete_commitment' }] },
  );
  assert.equal(confirm.pass, true);
  assert.equal(matchArgs({ title: { $includes: 'Parrucchiere' }, due_time: { $absent: true } }, { title: 'Andare dal parrucchiere' }), true);
  assert.equal(looksItalian('Segnato: deck entro venerdì.'), true);
  assert.equal(looksItalian('Ok'), true);
  assert.equal(looksItalian('Ricevuto, sparisco. Buon lavoro.'), true);
  assert.equal(looksItalian('Done, I logged it for you.'), false);
  assert.equal(hasDebugLeak('Ho usato upsert_commitment'), true);
});

await check('public eval cases are valid, unique and cover every spec §7 guarantee', () => {
  const ids = new Set();
  for (const caseDef of PUBLIC_EVAL_CASES) {
    assert.deepEqual(validateCaseShape(caseDef), [], caseDef.id);
    assert.ok(!ids.has(caseDef.id), `duplicate ${caseDef.id}`);
    ids.add(caseDef.id);
  }
  for (const guarantee of COMPANION_GUARANTEES) {
    assert.ok(PUBLIC_EVAL_CASES.some((caseDef) => caseDef.tags?.includes(guarantee)), `no case for ${guarantee}`);
  }
  assert.ok(PUBLIC_EVAL_CASES.length >= 30);
});

await check('usage ledger rows, Rome month window, projection and spend guard', () => {
  const row = toLedgerRow('11111111-1111-4111-8111-111111111111', { provider: 'gemini', model: 'm', purpose: 'weird', inputTokens: 10.4, estimatedCostUsd: -1 });
  assert.equal(row.purpose, 'other');
  assert.equal(row.input_tokens, 10);
  assert.equal(row.estimated_cost_usd, 0);
  const window = romeMonthWindow(new Date('2026-11-22T12:00:00Z'));
  assert.equal(window.start.toISOString(), '2026-10-31T23:00:00.000Z');
  assert.equal(window.end.toISOString(), '2026-11-30T23:00:00.000Z');
  const projection = projectMonthEndSpend({ variableSpentUsd: 5, now: new Date('2026-11-15T23:00:00Z'), fixedMonthlyUsd: 6 });
  assert.equal(projection.projectedVariableUsd, 10);
  assert.equal(projection.projectedTotalUsd, 16);
  const early = projectMonthEndSpend({ variableSpentUsd: 1, now: new Date('2026-10-31T23:30:00Z'), fixedMonthlyUsd: 0 });
  assert.equal(early.projectedVariableUsd, 30, 'the first day extrapolates from a full day, not a few minutes');
  const budget = companionBudget({});
  assert.deepEqual(budget, { budgetEur: 30, usdPerEur: 1.15, budgetUsd: 34.5, fixedMonthlyUsd: 6 });
  assert.equal(spendGuardLevel({ projectedTotalUsd: 20, budgetUsd: 34.5 }).level, 'normal');
  assert.equal(spendGuardLevel({ projectedTotalUsd: 28, budgetUsd: 34.5 }).level, 'reduced');
  assert.equal(spendGuardLevel({ projectedTotalUsd: 35, budgetUsd: 34.5 }).level, 'essential');
});

await check('usage ledger migration applies with service-only writes, owner reads and value checks', async () => {
  const db = new PGlite();
  try {
    const user = '44444444-4444-4444-8444-444444444444';
    await db.exec(`
      create schema auth; create role anon; create role authenticated; create role service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
      insert into auth.users values ('${user}');
    `);
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261122150000_companion_usage_ledger.sql', import.meta.url), 'utf8'));
    const insert = (overrides = {}) => {
      const values = { provider: 'anthropic', model: 'claude-haiku-5-5', purpose: 'eval', estimated_cost_usd: 0.0002, metadata: {}, ...overrides };
      return db.query('insert into public.brain_usage_ledger(user_id,provider,model,purpose,estimated_cost_usd,metadata) values ($1,$2,$3,$4,$5,$6)',
        [user, values.provider, values.model, values.purpose, values.estimated_cost_usd, JSON.stringify(values.metadata)]);
    };
    await insert();
    await assert.rejects(insert({ purpose: 'mining' }), /check constraint/);
    await assert.rejects(insert({ estimated_cost_usd: -1 }), /check constraint/);
    await assert.rejects(insert({ metadata: [] }), /check constraint/);
    const security = (await db.query(`select
      (select relrowsecurity from pg_class where oid='public.brain_usage_ledger'::regclass) as rls,
      has_table_privilege('authenticated', 'public.brain_usage_ledger', 'SELECT') as owner_read,
      has_table_privilege('authenticated', 'public.brain_usage_ledger', 'INSERT') as owner_insert,
      has_table_privilege('anon', 'public.brain_usage_ledger', 'SELECT') as anon_read,
      has_table_privilege('service_role', 'public.brain_usage_ledger', 'INSERT') as service_insert`)).rows[0];
    assert.deepEqual(security, { rls: true, owner_read: true, owner_insert: false, anon_read: false, service_insert: true });
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261122150000_companion_usage_ledger.sql', import.meta.url), 'utf8'));
  } finally {
    await db.close();
  }
});

if (failures) {
  console.error(`\n${failures} Companion foundation check(s) failed.`);
  process.exitCode = 1;
}
