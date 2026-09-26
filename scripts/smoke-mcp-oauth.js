#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://lifeos-ruby-gamma.vercel.app';
const BASE_URL = String(process.env.LIFEOS_MCP_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const LINK_SECRET = process.env.LIFEOS_MCP_LINK_SECRET
  || readEnvLocalValue('LIFEOS_MCP_LINK_SECRET')
  || process.env.LIFEOS_MCP_TOKEN
  || readEnvLocalValue('LIFEOS_MCP_TOKEN');

if (!LINK_SECRET) {
  console.error('FAIL LIFEOS_MCP_LINK_SECRET or LIFEOS_MCP_TOKEN was not found in env or .env.local.');
  process.exit(1);
}

const checks = [];
const oauth = {};
const issuedCodes = [];
const issuedTokens = [];

test('direct protected resource metadata is available', async () => {
  const response = await fetchJson(`${BASE_URL}/api/mcp?mcp_oauth=protected-resource`);
  assertEqual(response.status, 200);
  assertEqual(response.body.resource, `${BASE_URL}/api/mcp`);
  assert(response.body.authorization_servers?.includes(BASE_URL), 'missing authorization server');
  assert(response.body.scopes_supported?.includes('lifeos.read'), 'missing lifeos.read scope');
});

test('direct authorization server metadata is available', async () => {
  const response = await fetchJson(`${BASE_URL}/api/mcp?mcp_oauth=authorization-server`);
  assertEqual(response.status, 200);
  assertEqual(response.body.issuer, BASE_URL);
  assertEqual(response.body.authorization_endpoint, `${BASE_URL}/api/mcp?mcp_oauth=authorize`);
  assertEqual(response.body.token_endpoint, `${BASE_URL}/api/mcp?mcp_oauth=token`);
  assert(response.body.grant_types_supported?.includes('authorization_code'), 'missing authorization_code grant');
  assert(response.body.code_challenge_methods_supported?.includes('S256'), 'missing S256 PKCE support');
  oauth.authorizationEndpoint = response.body.authorization_endpoint;
  oauth.tokenEndpoint = response.body.token_endpoint;
});

test('direct authorize page renders without private data', async () => {
  Object.assign(oauth, buildPkce());
  oauth.clientId = 'codex-smoke-client';
  oauth.redirectUri = 'https://chatgpt.com/connector/oauth/codex-smoke';
  oauth.state = crypto.randomUUID();
  const url = new URL(oauth.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', oauth.clientId);
  url.searchParams.set('redirect_uri', oauth.redirectUri);
  url.searchParams.set('state', oauth.state);
  url.searchParams.set('code_challenge', oauth.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('resource', `${BASE_URL}/api/mcp`);
  url.searchParams.set('scope', 'lifeos.read');
  const response = await fetchText(url.toString());
  assertEqual(response.status, 200);
  assert(response.text.includes('Link LifeOS MCP to ChatGPT'), 'authorize page title missing');
  assert(response.text.includes('/api/mcp?mcp_oauth=authorize'), 'authorize form does not post to direct API endpoint');
  assert(!response.text.includes(LINK_SECRET), 'authorize page leaked link secret');
});

test('direct authorize post returns signed code redirect', async () => {
  const form = new URLSearchParams({
    response_type: 'code',
    client_id: oauth.clientId,
    redirect_uri: oauth.redirectUri,
    state: oauth.state,
    code_challenge: oauth.codeChallenge,
    code_challenge_method: 'S256',
    resource: `${BASE_URL}/api/mcp`,
    scope: 'lifeos.read',
    link_secret: LINK_SECRET,
  });
  const response = await fetch(oauth.authorizationEndpoint, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  assertEqual(response.status, 302);
  const location = response.headers.get('location');
  assert(location, 'missing redirect location');
  const redirect = new URL(location);
  assertEqual(redirect.origin + redirect.pathname, oauth.redirectUri);
  assertEqual(redirect.searchParams.get('state'), oauth.state);
  oauth.code = redirect.searchParams.get('code');
  assert(oauth.code, 'missing authorization code');
  issuedCodes.push(oauth.code);
});

test('direct token endpoint exchanges code for bearer token', async () => {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: oauth.code,
    client_id: oauth.clientId,
    redirect_uri: oauth.redirectUri,
    code_verifier: oauth.codeVerifier,
  });
  const response = await fetchJson(oauth.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  assertEqual(response.status, 200);
  assertEqual(response.body.token_type, 'Bearer');
  assertEqual(response.body.scope, 'lifeos.read');
  assert(Number(response.body.expires_in) > 0, 'missing expires_in');
  oauth.accessToken = response.body.access_token;
  assert(oauth.accessToken, 'missing access token');
  issuedTokens.push(oauth.accessToken);
});

test('redeemed authorization code cannot be replayed', async () => {
  const response = await exchangeCode(oauth.code, oauth.codeVerifier);
  assertEqual(response.status, 400);
  assertEqual(response.body?.error, 'invalid_grant');
});

test('concurrent redemption of one code succeeds exactly once', async () => {
  const pkce = buildPkce();
  const code = await authorizeCode(pkce);
  const responses = await Promise.all([
    exchangeCode(code, pkce.codeVerifier),
    exchangeCode(code, pkce.codeVerifier),
  ]);
  assertEqual(responses.filter((response) => response.status === 200).length, 1);
  assertEqual(responses.filter((response) => response.status === 400 && response.body?.error === 'invalid_grant').length, 1);
  const token = responses.find((response) => response.status === 200)?.body?.access_token;
  if (token) issuedTokens.push(token);
});

test('wrong PKCE verifier does not consume a valid code', async () => {
  const pkce = buildPkce();
  const code = await authorizeCode(pkce);
  const wrong = await exchangeCode(code, buildPkce().codeVerifier);
  assertEqual(wrong.status, 400);
  assertEqual(wrong.body?.error, 'invalid_grant');
  const valid = await exchangeCode(code, pkce.codeVerifier);
  assertEqual(valid.status, 200);
  if (valid.body?.access_token) issuedTokens.push(valid.body.access_token);
});

test('OAuth access token can call MCP tools/list', async () => {
  const response = await fetchJson(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${oauth.accessToken}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  assertEqual(response.status, 200);
  const toolNames = response.body.result?.tools?.map((tool) => tool.name) ?? [];
  assert(toolNames.includes('get_lifeos_snapshot'), 'OAuth tools/list missing LifeOS tools');
});

test('read-only OAuth token cannot call sync_context', async () => {
  const response = await fetchJson(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${oauth.accessToken}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'sync_context', arguments: {} } }),
  });
  assertEqual(response.status, 200);
  assertEqual(response.body?.error?.code, -32003);
});

if (process.env.LIFEOS_RUN_LIVE_MCP_WRITE_SMOKE === 'true') {
  test('explicit write-scope sync is idempotent and visible to a read token', async () => {
    const pkce = buildPkce();
    const code = await authorizeCode(pkce, 'lifeos.read lifeos.write');
    const exchange = await exchangeCode(code, pkce.codeVerifier);
    assertEqual(exchange.status, 200);
    assertEqual(exchange.body?.scope, 'lifeos.read lifeos.write');
    const writeToken = exchange.body?.access_token;
    assert(writeToken, 'missing write-scoped access token');
    issuedTokens.push(writeToken);

    const auditKey = `codex-oauth-smoke-${crypto.randomUUID()}`;
    const request = {
      idempotency_key: auditKey,
      source: {
        system: 'codex', kind: 'explicit_conversation_sync',
        captured_at: new Date().toISOString(), reference: auditKey,
      },
      summary: 'User-approved reconfirmation of an existing communication preference.',
      updates: [{
        client_update_id: 'communication-style', type: 'preference',
        key: 'communication.style', value: 'clear technical explanations',
        confidence: 0.99,
        evidence_summary: 'User explicitly stated a preference for clear technical explanations in LifeOS.',
      }],
    };
    const call = { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'sync_context', arguments: request } };
    const applied = await callMcp(writeToken, call);
    assertEqual(applied.status, 200);
    assertEqual(applied.body?.result?.structuredContent?.status, 'applied');
    const replay = await callMcp(writeToken, call);
    assertEqual(replay.status, 200);
    assertEqual(replay.body?.result?.structuredContent?.idempotent_replay, true);

    const readback = await callMcp(oauth.accessToken, {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'get_current_beliefs', arguments: { subject_type: 'preference', limit: 100 } },
    });
    assertEqual(readback.status, 200);
    const beliefs = readback.body?.result?.structuredContent?.beliefs;
    assert(Array.isArray(beliefs), 'belief readback missing beliefs array');
    assert(beliefs.some((belief) => belief.subject_key === 'communication.style'
      && belief.value?.value === 'clear technical explanations'), 'reconfirmed preference missing from readback');
  });
}

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
  console.log(`All live MCP OAuth smoke checks passed against ${BASE_URL}.`);
}

await runRootCompatibilityChecks();

function test(name, fn) {
  checks.push({ name, fn });
}

function buildPkce() {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

async function authorizeCode(pkce, scope = 'lifeos.read') {
  const form = new URLSearchParams({
    response_type: 'code', client_id: oauth.clientId, redirect_uri: oauth.redirectUri,
    state: crypto.randomUUID(), code_challenge: pkce.codeChallenge,
    code_challenge_method: 'S256', resource: `${BASE_URL}/api/mcp`, scope,
    link_secret: LINK_SECRET,
  });
  const response = await fetch(oauth.authorizationEndpoint, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(),
  });
  assertEqual(response.status, 302);
  const code = new URL(response.headers.get('location')).searchParams.get('code');
  assert(code, 'missing authorization code');
  issuedCodes.push(code);
  return code;
}

async function exchangeCode(code, codeVerifier) {
  return fetchJson(oauth.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, client_id: oauth.clientId,
      redirect_uri: oauth.redirectUri, code_verifier: codeVerifier,
    }).toString(),
  });
}

async function callMcp(token, body) {
  return fetchJson(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
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

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  return { status: response.status, text: await response.text() };
}

async function runRootCompatibilityChecks() {
  const checks = [
    async () => {
      const response = await fetchJson(`${BASE_URL}/.well-known/oauth-protected-resource`);
      return response.status === 200 && response.body?.resource === `${BASE_URL}/api/mcp`;
    },
    async () => {
      const response = await fetchJson(`${BASE_URL}/.well-known/oauth-authorization-server`);
      return response.status === 200 && response.body?.authorization_endpoint;
    },
    async () => {
      const response = await fetchText(`${BASE_URL}/oauth/authorize`);
      return response.text.includes('Authorization error') || response.text.includes('Link LifeOS MCP to ChatGPT');
    },
  ];
  const labels = [
    'root protected resource compatibility',
    'root authorization server compatibility',
    'root authorize compatibility',
  ];

  for (let index = 0; index < checks.length; index += 1) {
    try {
      const ok = await checks[index]();
      if (ok) {
        console.log(`PASS ${labels[index]}`);
      } else {
        console.warn(`WARN ${labels[index]} did not return MCP OAuth content; direct API OAuth remains authoritative.`);
      }
    } catch {
      console.warn(`WARN ${labels[index]} failed; direct API OAuth remains authoritative.`);
    }
  }
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

function base64url(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected) {
  if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  let safe = message.replaceAll(LINK_SECRET, '[redacted]');
  for (const code of issuedCodes) safe = safe.replaceAll(code, '[redacted-code]');
  for (const token of issuedTokens) safe = safe.replaceAll(token, '[redacted-token]');
  return safe.slice(0, 500);
}
