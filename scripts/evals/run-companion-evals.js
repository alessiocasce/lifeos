#!/usr/bin/env node
// Companion eval runner (spec §8, step 0).
//
// Replays eval cases through the real agent loop and model adapter against
// a mock LifeOS world, scores them deterministically and compares models on
// quality, latency and cost. Every model call is recorded in the usage ledger.
//
//   npm run eval:companion -- --models gemini:gemini-3.1-flash-lite,anthropic:claude-haiku-5-5@low
//   npm run eval:companion -- --cases private --filter sleep --repeat 2
//
// Results (including replies) are written to evals/results/, which is
// gitignored: private cases come from real conversations.

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateCompanionTurn, parseModelSpec } from '../../api/_utils/companionModel.js';
import { runCompanionTurn } from '../../api/_utils/companionAgentLoop.js';
import { COMPANION_TOOLS } from '../../api/_utils/companionTools.js';
import { companionSystemBlocks } from '../../api/_utils/companionPersona.js';
import { createSupabaseUsageSink } from '../../api/_utils/companionUsage.js';
import { createMockWorld, DEFAULT_EVAL_NOW } from '../../tests/companion/mockWorld.js';
import { scoreCase, validateCaseShape } from '../../tests/companion/evalAssertions.js';
import { PUBLIC_EVAL_CASES, COMPANION_GUARANTEES } from '../../tests/companion/evalCases.js';

const ROOT = process.cwd();
const PRIVATE_CASES = path.join(ROOT, 'evals', 'private', 'cases.json');
const DEFAULT_MODELS = [
  'gemini:gemini-3.1-flash-lite',
  'gemini:gemini-3.5-flash-lite',
  'anthropic:claude-haiku-5-5@low',
  'gemini:gemini-3.8-flash',
  'anthropic:claude-sonnet-5-5@low',
];
const TURNS_PER_MONTH = 30 * 30; // ~30 messages a day (spec §9)

try { process.loadEnvFile(path.join(ROOT, '.env.local')); } catch { /* env may come from the shell */ }

const args = parseArgs(process.argv.slice(2));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(ROOT, args.out ?? path.join('evals', 'results'));
fs.mkdirSync(outDir, { recursive: true });

const cases = loadCases(args.cases ?? 'all').filter((entry) => matchesFilter(entry, args.filter));
if (!cases.length) fail('No eval cases selected.');
const models = (args.models ? args.models.split(',') : DEFAULT_MODELS).map((spec) => parseModelSpec(spec));
const repeat = Math.max(1, Number(args.repeat ?? 1));
const concurrency = Math.max(1, Number(args.concurrency ?? 3));
const usageSink = await createUsageSink(args.ledger ?? 'auto');

console.log(`Companion evals ${runId}: ${cases.length} cases × ${models.length} models × ${repeat} runs. Ledger: ${usageSink.label}.`);

const results = [];
for (const spec of models) {
  const skip = missingCredentials(spec);
  if (skip) {
    console.log(`SKIP ${spec.spec}: ${skip}`);
    continue;
  }
  const tasks = cases.flatMap((caseDef) => Array.from({ length: repeat }, (_, run) => ({ caseDef, run })));
  const modelResults = await mapLimit(tasks, concurrency, ({ caseDef, run }) => runOne(spec, caseDef, run));
  results.push(...modelResults);
  printModelSummary(spec, modelResults);
}

const summary = summarize(results);
const file = path.join(outDir, `${runId}-companion.json`);
fs.writeFileSync(file, `${JSON.stringify({ runId, models: models.map((model) => model.spec), caseCount: cases.length, repeat, summary, results }, null, 2)}\n`);
console.log(`\nResults: ${path.relative(ROOT, file)}`);
printTable(summary);
printFailures(results);

// ---------------------------------------------------------------------------

async function runOne(spec, caseDef, run) {
  const world = createMockWorld({ world: caseDef.world, now: caseDef.now ?? DEFAULT_EVAL_NOW });
  const generate = (request) => withRetry(() => generateCompanionTurn({
    model: spec,
    ...request,
    usageSink: usageSink.sink,
    purpose: 'eval',
    requestId: `eval:${runId}:${caseDef.id}:${run}`,
  }));
  let result;
  try {
    result = await runCompanionTurn({
      generate,
      executeTool: world.executeTool,
      system: companionSystemBlocks(world.context()),
      history: caseDef.history ?? [],
      message: caseDef.message,
      tools: COMPANION_TOOLS,
    });
  } catch (error) {
    return {
      model: spec.spec, caseId: caseDef.id, source: caseDef.source, tags: caseDef.tags ?? [], run,
      pass: false, p1: true, error: String(error?.message ?? error).slice(0, 300),
      failures: [{ code: 'model_error', severity: 'P1', detail: String(error?.message ?? error).slice(0, 300) }],
      latencyMs: null, costUsd: 0, steps: 0, reply: '', toolCalls: [],
    };
  }
  const score = scoreCase(caseDef, result, world);
  return {
    model: spec.spec,
    caseId: caseDef.id,
    source: caseDef.source,
    tags: caseDef.tags ?? [],
    run,
    pass: score.pass,
    p1: score.p1,
    failures: score.failures,
    latencyMs: result.latencyMs,
    costUsd: result.costUsd,
    steps: result.steps.length,
    usage: result.usage,
    reply: result.reply,
    toolCalls: result.toolCalls.map((call) => ({ name: call.name, input: call.input, isError: call.isError })),
    pending: world.pending.map((entry) => entry.name),
  };
}

async function withRetry(fn) {
  try {
    return await fn();
  } catch (error) {
    if (!error?.retryable) throw error;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return fn();
  }
}

function summarize(all) {
  const byModel = new Map();
  for (const result of all) {
    if (!byModel.has(result.model)) byModel.set(result.model, []);
    byModel.get(result.model).push(result);
  }
  return [...byModel.entries()].map(([model, rows]) => {
    const latencies = rows.map((row) => row.latencyMs).filter((value) => value !== null).sort((a, b) => a - b);
    const guaranteeRows = rows.filter((row) => row.tags.some((tag) => COMPANION_GUARANTEES.includes(tag)));
    const cost = rows.reduce((sum, row) => sum + (row.costUsd || 0), 0);
    return {
      model,
      runs: rows.length,
      passRate: ratio(rows.filter((row) => row.pass).length, rows.length),
      p1Runs: rows.filter((row) => row.p1).length,
      guaranteePassRate: ratio(guaranteeRows.filter((row) => row.pass).length, guaranteeRows.length),
      errors: rows.filter((row) => row.error).length,
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      avgSteps: Math.round((rows.reduce((sum, row) => sum + row.steps, 0) / rows.length) * 10) / 10,
      avgCostUsd: Math.round((cost / rows.length) * 1_000_000) / 1_000_000,
      monthlyUsdAt30PerDay: Math.round((cost / rows.length) * TURNS_PER_MONTH * 100) / 100,
      totalCostUsd: Math.round(cost * 10000) / 10000,
    };
  });
}

function printModelSummary(spec, rows) {
  const passed = rows.filter((row) => row.pass).length;
  console.log(`  ${spec.spec}: ${passed}/${rows.length} passed, ${rows.filter((row) => row.p1).length} with P1`);
}

function printTable(rows) {
  console.log('\nmodel | pass | P1 runs | guarantees | errors | p50 s | p95 s | steps | $/turn | $/month @30/day');
  for (const row of rows) {
    console.log([
      row.model, pct(row.passRate), row.p1Runs, pct(row.guaranteePassRate), row.errors,
      seconds(row.p50Ms), seconds(row.p95Ms), row.avgSteps, row.avgCostUsd.toFixed(5), row.monthlyUsdAt30PerDay.toFixed(2),
    ].join(' | '));
  }
}

function printFailures(rows) {
  const failed = rows.filter((row) => !row.pass);
  if (!failed.length) return;
  console.log('\nFailures (details in the results file):');
  for (const row of failed) {
    const codes = row.failures.map((failure) => `${failure.code}/${failure.severity}`).join(', ');
    console.log(`  ${row.model} · ${row.caseId}#${row.run} · ${codes}`);
  }
}

function loadCases(which) {
  const selected = [];
  if (which === 'public' || which === 'all') selected.push(...PUBLIC_EVAL_CASES.map((entry) => ({ ...entry, source: 'public' })));
  if (which === 'private' || which === 'all') {
    if (fs.existsSync(PRIVATE_CASES)) {
      const privateCases = JSON.parse(fs.readFileSync(PRIVATE_CASES, 'utf8'));
      if (!Array.isArray(privateCases)) fail('evals/private/cases.json must contain an array of cases.');
      selected.push(...privateCases.filter((entry) => entry.review !== 'rejected').map((entry) => ({ ...entry, source: 'private' })));
    } else if (which === 'private') fail('evals/private/cases.json not found. Run npm run eval:companion:export first.');
  }
  const ids = new Set();
  const problems = [];
  for (const entry of selected) {
    problems.push(...validateCaseShape(entry));
    if (ids.has(entry.id)) problems.push(`duplicate case id ${entry.id}`);
    ids.add(entry.id);
  }
  if (problems.length) fail(`Invalid eval cases:\n  ${problems.join('\n  ')}`);
  return selected;
}

function matchesFilter(entry, filter) {
  if (!filter) return true;
  const needle = String(filter).toLowerCase();
  return entry.id.toLowerCase().includes(needle) || (entry.tags ?? []).some((tag) => tag.toLowerCase().includes(needle));
}

async function createUsageSink(mode) {
  const local = () => {
    const file = path.join(outDir, `${runId}-usage.jsonl`);
    return { label: `local file ${path.relative(ROOT, file)}`, sink: async (entry) => fs.appendFileSync(file, `${JSON.stringify(entry)}\n`) };
  };
  if (mode === 'local') return local();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.LIFEOS_ACTION_USER_ID;
  if (!url || !key || !userId) {
    if (mode === 'supabase') fail('Supabase ledger requested but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / LIFEOS_ACTION_USER_ID are missing.');
    return local();
  }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await supabase.from('brain_usage_ledger').select('id').limit(1);
  if (error) {
    if (mode === 'supabase') fail(`Supabase usage ledger unavailable: ${error.message}`);
    console.log('Usage ledger table not available in Supabase yet (migration 20261122150000 not applied); recording locally.');
    return local();
  }
  return { label: 'Supabase brain_usage_ledger', sink: createSupabaseUsageSink({ supabase, userId }) };
}

function missingCredentials(spec) {
  if (spec.provider === 'gemini' && !process.env.GEMINI_API_KEY) return 'GEMINI_API_KEY is not set';
  if (spec.provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) return 'ANTHROPIC_API_KEY is not set (add it to .env.local)';
  return null;
}

async function mapLimit(items, limit, fn) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      output[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [key, inline] = token.slice(2).split('=');
    parsed[key] = inline ?? argv[index + 1];
    if (inline === undefined) index += 1;
  }
  return parsed;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

function ratio(part, total) { return total ? part / total : null; }
function pct(value) { return value === null ? '-' : `${Math.round(value * 100)}%`; }
function seconds(ms) { return ms === null ? '-' : (ms / 1000).toFixed(1); }

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}
