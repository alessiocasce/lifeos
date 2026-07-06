#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://lifeos-ruby-gamma.vercel.app';
const BASE_URL = String(process.env.LIFEOS_MCP_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const MCP_URL = `${BASE_URL}/api/mcp`;
const TOKEN = process.env.LIFEOS_MCP_TOKEN || readEnvLocalValue('LIFEOS_MCP_TOKEN');

const EXPECTED_TOOLS = [
  'get_lifeos_snapshot',
  'get_recent_workouts',
  'get_health_summary',
  'get_open_memos',
  'get_upcoming_calendar',
  'get_projects_status',
  'get_brain_debug_context',
  'get_whatsapp_outbox_recent',
  'get_whatsapp_proactive_debug',
  'search_lifeos_vault',
  'get_open_loops',
];

const EXPECTED_RESOURCES = [
  'lifeos://snapshot',
  'lifeos://today',
  'lifeos://week/summary',
  'lifeos://health/7d',
  'lifeos://workouts/recent',
  'lifeos://memos/open',
  'lifeos://calendar/upcoming',
  'lifeos://projects/status',
  'lifeos://brain/debug',
  'lifeos://brain/recent-actions',
  'lifeos://whatsapp/outbox/recent',
  'lifeos://whatsapp/proactive-debug',
  'lifeos://vault/recent',
];

const EXPECTED_PROMPTS = [
  'lifeos_morning_brief',
  'lifeos_evening_review',
  'lifeos_weekly_review',
  'lifeos_workout_analysis',
  'lifeos_brain_bug_analysis',
  'lifeos_project_execution_review',
];

if (!TOKEN) {
  console.error('FAIL LIFEOS_MCP_TOKEN was not found in env or .env.local.');
  process.exit(1);
}

const checks = [];
let rpcId = 100;

test('GET /api/mcp public health', async () => {
  const response = await fetchJson(MCP_URL);
  assertEqual(response.status, 200);
  assertEqual(response.body.ok, true);
  assertEqual(response.body.name, 'lifeos-mcp');
  assert(response.body.capabilities?.tools >= EXPECTED_TOOLS.length, 'missing tool capability count');
  assertNoSecretLikeKeys(response.body);
});

test('POST without auth is rejected', async () => {
  const response = await fetchJson(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rpcRequest('tools/list')),
  });
  assertEqual(response.status, 401);
  assertNoSecretLikeKeys(response.body);
});

test('POST with wrong auth is rejected', async () => {
  const response = await fetchJson(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer intentionally-wrong-token',
    },
    body: JSON.stringify(rpcRequest('tools/list')),
  });
  assertEqual(response.status, 401);
  assertNoSecretLikeKeys(response.body);
});

test('initialize returns server capabilities', async () => {
  const body = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'codex-smoke', version: '1.0.0' },
  });
  assert(body.result.protocolVersion, 'missing protocolVersion');
  assertEqual(body.result.serverInfo?.name, 'lifeos-mcp');
  assert(body.result.capabilities?.tools, 'missing tools capability');
  assert(body.result.capabilities?.resources, 'missing resources capability');
  assert(body.result.capabilities?.prompts, 'missing prompts capability');
});

test('tools/list exposes expected read-only tools', async () => {
  const body = await rpc('tools/list');
  const names = body.result.tools.map((tool) => tool.name);
  for (const name of EXPECTED_TOOLS) assert(names.includes(name), `missing tool ${name}`);
  for (const tool of body.result.tools) {
    assert(tool.name, 'tool missing name');
    assert(tool.description, `tool ${tool.name} missing description`);
    assert(tool.inputSchema, `tool ${tool.name} missing inputSchema`);
  }
});

test('resources/list exposes expected JSON resources', async () => {
  const body = await rpc('resources/list');
  const uris = body.result.resources.map((resource) => resource.uri);
  for (const uri of EXPECTED_RESOURCES) assert(uris.includes(uri), `missing resource ${uri}`);
  for (const resource of body.result.resources) {
    assert(resource.name, `resource ${resource.uri} missing name`);
    assert(resource.description, `resource ${resource.uri} missing description`);
    assertEqual(resource.mimeType, 'application/json');
  }
});

test('prompts/list exposes expected prompts', async () => {
  const body = await rpc('prompts/list');
  const names = body.result.prompts.map((prompt) => prompt.name);
  for (const name of EXPECTED_PROMPTS) assert(names.includes(name), `missing prompt ${name}`);
});

test('get_recent_workouts returns MCP text and structured content', async () => {
  const result = await callTool('get_recent_workouts', { days: 7, limit: 20 });
  assertEqual(result.content?.[0]?.type, 'text');
  const parsed = parseToolText(result);
  assert(Array.isArray(parsed.workouts), 'workouts result missing workouts array');
  assert(Object.hasOwn(parsed, 'sets_truncated'), 'workouts result missing sets_truncated flag');
  assert(Object.hasOwn(parsed, 'set_limit'), 'workouts result missing set_limit');
  assert(Object.hasOwn(parsed, 'returned_set_count'), 'workouts result missing returned_set_count');
  const workoutWithSets = parsed.workouts.find((workout) => Array.isArray(workout.sets) && workout.sets.length);
  if (workoutWithSets) {
    const firstSet = workoutWithSets.sets[0];
    for (const key of ['id', 'workout_id', 'exercise', 'set_number', 'is_warmup', 'weight', 'reps', 'rpe', 'performed_at', 'notes']) {
      assert(Object.hasOwn(firstSet, key), `workout set missing ${key}`);
    }
    assert(workoutWithSets.exercises?.some((exercise) => Array.isArray(exercise.sets)), 'exercise-level set details missing');
  }
  assert(result.structuredContent, 'missing structuredContent');
  assertNoSecretLikeKeys(parsed);
});

test('get_lifeos_snapshot returns compact sections', async () => {
  const result = await callTool('get_lifeos_snapshot', { days: 7 });
  const parsed = parseToolText(result);
  for (const key of ['today', 'week', 'health', 'workouts', 'memos', 'calendar', 'projects', 'brain_debug', 'open_loops']) {
    assert(Object.hasOwn(parsed, key), `snapshot missing ${key}`);
  }
  assertNoSecretLikeKeys(parsed);
});

test('get_brain_debug_context returns compact trace context', async () => {
  const result = await callTool('get_brain_debug_context', { limit: 10 });
  const parsed = parseToolText(result);
  assert(Array.isArray(parsed.traces), 'brain debug missing traces array');
  assert(Object.hasOwn(parsed, 'recent_action_logs'), 'brain debug missing action logs');
  assertNoSecretLikeKeys(parsed);
});

test('resources/read lifeos://brain/debug returns JSON content', async () => {
  const body = await rpc('resources/read', { uri: 'lifeos://brain/debug' });
  const content = body.result.contents?.[0];
  assertEqual(content?.uri, 'lifeos://brain/debug');
  assertEqual(content?.mimeType, 'application/json');
  JSON.parse(content.text);
  assertNoSecretLikeKeys(JSON.parse(content.text));
});

test('resources/read lifeos://workouts/recent returns JSON content', async () => {
  const body = await rpc('resources/read', { uri: 'lifeos://workouts/recent' });
  const content = body.result.contents?.[0];
  assertEqual(content?.uri, 'lifeos://workouts/recent');
  assertEqual(content?.mimeType, 'application/json');
  JSON.parse(content.text);
});

test('prompts/get lifeos_brain_bug_analysis returns prompt messages', async () => {
  const body = await rpc('prompts/get', { name: 'lifeos_brain_bug_analysis' });
  assertEqual(body.result.name, 'lifeos_brain_bug_analysis');
  assert(Array.isArray(body.result.messages), 'prompt missing messages');
  assert(!JSON.stringify(body.result).includes('SUPABASE_SERVICE_ROLE_KEY'), 'prompt leaked env name as data');
});

test('unknown method returns JSON-RPC method error', async () => {
  const body = await rpc('not/a_method');
  assertEqual(body.error?.code, -32601);
});

test('unknown tool returns JSON-RPC params error', async () => {
  const body = await rpc('tools/call', { name: 'unknown_tool', arguments: {} });
  assertEqual(body.error?.code, -32602);
});

test('excessive days and limit are clamped', async () => {
  const result = await callTool('get_recent_workouts', { days: 999, limit: 9999 });
  const parsed = parseToolText(result);
  assert(parsed.range.days <= 30, 'days were not clamped');
  assert(parsed.workouts.length <= 50, 'workout limit was not clamped');
});

test('batch request returns multiple JSON-RPC responses', async () => {
  const response = await fetchJson(MCP_URL, {
    method: 'POST',
    headers: authedHeaders(),
    body: JSON.stringify([
      { jsonrpc: '2.0', id: 'a', method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 'b', method: 'tools/list', params: {} },
    ]),
  });
  assertEqual(response.status, 200);
  assert(Array.isArray(response.body), 'batch response is not an array');
  assertEqual(response.body.length, 2);
});

for (const check of checks) {
  try {
    await check.fn();
    console.log(`PASS ${check.name}`);
  } catch (error) {
    console.error(`FAIL ${check.name}`);
    console.error(safeError(error));
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  console.log(`All live MCP smoke checks passed against ${BASE_URL}.`);
}

function test(name, fn) {
  checks.push({ name, fn });
}

function rpcRequest(method, params = {}) {
  rpcId += 1;
  return { jsonrpc: '2.0', id: rpcId, method, params };
}

async function rpc(method, params = {}) {
  const response = await fetchJson(MCP_URL, {
    method: 'POST',
    headers: authedHeaders(),
    body: JSON.stringify(rpcRequest(method, params)),
  });
  assertEqual(response.status, 200);
  return response.body;
}

async function callTool(name, args) {
  const body = await rpc('tools/call', { name, arguments: args });
  if (body.error) throw new Error(`tool ${name} returned JSON-RPC error ${body.error.code}: ${body.error.message}`);
  return body.result;
}

function parseToolText(result) {
  const text = result.content?.[0]?.text;
  assert(typeof text === 'string', 'tool text content missing');
  return JSON.parse(text);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { parse_error: true, preview: text.slice(0, 120) };
  }
  return { status: response.status, body };
}

function authedHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TOKEN}`,
  };
}

function readEnvLocalValue(key) {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return '';
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match || match[1].trim() !== key) continue;
    return stripQuotes(match[2].trim());
  }
  return '';
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected) {
  if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertNoSecretLikeKeys(value, pathParts = []) {
  if (value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.slice(0, 100).forEach((item, index) => assertNoSecretLikeKeys(item, [...pathParts, String(index)]));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (/(authorization|bearer|token|secret|password|service[_-]?role|api[_-]?key|gemini[_-]?api|supabase[_-]?service)/i.test(key)) {
      throw new Error(`secret-like key present at ${[...pathParts, key].join('.')}`);
    }
    assertNoSecretLikeKeys(entry, [...pathParts, key]);
  }
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(TOKEN, '[redacted]').slice(0, 500);
}
