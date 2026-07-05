#!/usr/bin/env node
import {
  createMcpHealthPayload,
  handleMcpJsonRpcRequest,
  listMcpPrompts,
  listMcpResources,
  listMcpTools,
  validateMcpAuth,
} from '../api/mcp.js';
import { clampMcpDays, clampMcpLimit, sanitizeMcpOutput } from '../api/_utils/mcpLifeosData.js';

const checks = [];

test('health payload is read-only and advertises MCP capabilities', () => {
  const health = createMcpHealthPayload();
  assertEqual(health.ok, true);
  assertEqual(health.read_only, true);
  assertEqual(health.endpoint, '/api/mcp');
  assert(health.capabilities.tools >= 10, 'expected at least 10 tools');
});

test('initialize returns MCP server info', async () => {
  const response = await handleMcpJsonRpcRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {},
  }, { userId: 'test-user' });
  assertEqual(response.result.serverInfo.name, 'lifeos-mcp');
});

test('tools/list includes expected tools', () => {
  const tools = listMcpTools().map((tool) => tool.name);
  for (const name of [
    'get_lifeos_snapshot',
    'get_recent_workouts',
    'get_health_summary',
    'get_open_memos',
    'get_brain_debug_context',
    'search_lifeos_vault',
  ]) {
    assert(tools.includes(name), `missing tool ${name}`);
  }
});

test('resources/list includes expected resources', () => {
  const resources = listMcpResources().map((resource) => resource.uri);
  for (const uri of [
    'lifeos://snapshot',
    'lifeos://today',
    'lifeos://brain/debug',
    'lifeos://whatsapp/outbox/recent',
    'lifeos://vault/recent',
  ]) {
    assert(resources.includes(uri), `missing resource ${uri}`);
  }
});

test('prompts/list includes expected prompts', () => {
  const prompts = listMcpPrompts().map((prompt) => prompt.name);
  for (const name of [
    'lifeos_morning_brief',
    'lifeos_evening_review',
    'lifeos_weekly_review',
    'lifeos_brain_bug_analysis',
  ]) {
    assert(prompts.includes(name), `missing prompt ${name}`);
  }
});

test('unknown method returns JSON-RPC method error', async () => {
  const response = await handleMcpJsonRpcRequest({
    jsonrpc: '2.0',
    id: 2,
    method: 'unknown/method',
  }, { userId: 'test-user' });
  assertEqual(response.error.code, -32601);
});

test('unknown tool returns JSON-RPC params error', async () => {
  const response = await handleMcpJsonRpcRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'write_everything', arguments: {} },
  }, { userId: 'test-user' });
  assertEqual(response.error.code, -32602);
});

test('auth accepts bearer and fallback header only with matching token', () => {
  const env = { LIFEOS_MCP_TOKEN: 'test-token' };
  assertEqual(validateMcpAuth({ headers: { authorization: 'Bearer test-token' } }, env).ok, true);
  assertEqual(validateMcpAuth({ headers: { 'x-lifeos-mcp-token': 'test-token' } }, env).ok, true);
  assertEqual(validateMcpAuth({ headers: { authorization: 'Bearer wrong' } }, env).status, 401);
  assertEqual(validateMcpAuth({ headers: {} }, env).status, 401);
  assertEqual(validateMcpAuth({ headers: {} }, {}).status, 500);
});

test('MCP data clamps excessive limits and day windows', () => {
  assertEqual(clampMcpLimit(999, 30, 50), 50);
  assertEqual(clampMcpLimit(-3, 30, 50), 1);
  assertEqual(clampMcpDays(999), 30);
  assertEqual(clampMcpDays(-3), 1);
});

test('MCP sanitizer removes secret-like fields', () => {
  const sanitized = sanitizeMcpOutput({
    ok: true,
    api_key: 'secret',
    nested: {
      authorization: 'Bearer secret',
      value: 'visible',
    },
  });
  assertEqual(sanitized.ok, true);
  assertEqual(sanitized.api_key, undefined);
  assertEqual(sanitized.nested.authorization, undefined);
  assertEqual(sanitized.nested.value, 'visible');
});

for (const check of checks) {
  try {
    await check.fn();
    console.log(`PASS ${check.name}`);
  } catch (error) {
    console.error(`FAIL ${check.name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (!process.exitCode) console.log('All MCP checks passed.');

function test(name, fn) {
  checks.push({ name, fn });
}

function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected) {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
