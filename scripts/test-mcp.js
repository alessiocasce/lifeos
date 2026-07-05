#!/usr/bin/env node
import crypto from 'node:crypto';
import {
  createMcpHealthPayload,
  handleMcpJsonRpcRequest,
  listMcpPrompts,
  listMcpResources,
  listMcpTools,
  validateMcpAuth,
} from '../api/mcp.js';
import { clampMcpDays, clampMcpLimit, sanitizeMcpOutput } from '../api/_utils/mcpLifeosData.js';
import {
  buildAuthorizationServerMetadata,
  buildWwwAuthenticateHeader,
  getMcpOAuthRequestKind,
  signAccessTokenForTest,
  verifyOAuthAccessTokenForTest,
  verifyPkceForTest,
} from '../api/_utils/mcpOAuth.js';
import { resolveActionName } from '../api/actions.js';

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
  const firstTool = listMcpTools()[0];
  assert(firstTool.annotations.readOnlyHint, 'tool missing read-only annotation');
  assertEqual(firstTool.securitySchemes[0].type, 'oauth2');
  assert(firstTool.securitySchemes[0].scopes.includes('lifeos.read'), 'tool missing lifeos.read scope');
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
  assert(validateMcpAuth({ headers: {} }, env).wwwAuthenticate.includes('/api/mcp?mcp_oauth=protected-resource'), 'missing direct WWW-Authenticate metadata');
});

test('auth accepts signed OAuth access tokens without accepting wrong tokens', () => {
  const env = {
    LIFEOS_MCP_TOKEN: 'static-token',
    LIFEOS_MCP_OAUTH_SIGNING_SECRET: 'oauth-signing-secret',
  };
  const req = { headers: { host: 'lifeos-ruby-gamma.vercel.app', 'x-forwarded-proto': 'https' } };
  const token = signAccessTokenForTest({
    iss: 'https://lifeos-ruby-gamma.vercel.app',
    aud: 'https://lifeos-ruby-gamma.vercel.app/api/mcp',
    sub: 'test-user',
    scope: 'lifeos.read',
    client_id: 'test-client',
  }, env);
  assertEqual(verifyOAuthAccessTokenForTest(token, req, env), true);
  assertEqual(validateMcpAuth({ headers: { ...req.headers, authorization: `Bearer ${token}` } }, env).ok, true);
  assertEqual(validateMcpAuth({ headers: { ...req.headers, authorization: 'Bearer wrong' } }, env).status, 401);
});

test('PKCE verifier matches S256 challenge', async () => {
  const verifier = 'test-code-verifier';
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  assertEqual(verifyPkceForTest(verifier, challenge), true);
});

test('OAuth route detection supports rewrite query and original paths', () => {
  assertEqual(getMcpOAuthRequestKind({ query: { mcp_oauth: 'token' }, headers: {}, url: '/api/mcp' }), 'token');
  assertEqual(getMcpOAuthRequestKind({ headers: { host: 'example.com' }, url: '/.well-known/oauth-protected-resource' }), 'protected-resource');
  assertEqual(getMcpOAuthRequestKind({ headers: { host: 'example.com' }, url: '/oauth/authorize' }), 'authorize');
});

test('OAuth metadata advertises direct API authorize and token URLs', () => {
  const req = { headers: { host: 'lifeos-ruby-gamma.vercel.app', 'x-forwarded-proto': 'https' }, url: '/api/mcp' };
  const metadata = buildAuthorizationServerMetadata(req, {});
  assertEqual(metadata.authorization_endpoint, 'https://lifeos-ruby-gamma.vercel.app/api/mcp?mcp_oauth=authorize');
  assertEqual(metadata.token_endpoint, 'https://lifeos-ruby-gamma.vercel.app/api/mcp?mcp_oauth=token');
  assert(buildWwwAuthenticateHeader(req, {}).includes('/api/mcp?mcp_oauth=protected-resource'), 'WWW-Authenticate should use direct API metadata URL');
});

test('consolidated Action API resolves supported action names only', () => {
  assertEqual(resolveActionName('expense'), 'expense');
  assertEqual(resolveActionName('sleep_start'), 'sleep-start');
  assertEqual(resolveActionName('wake-time'), 'wake');
  assertEqual(resolveActionName('calendar'), 'calendar');
  assertEqual(resolveActionName('delete-everything'), null);
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
