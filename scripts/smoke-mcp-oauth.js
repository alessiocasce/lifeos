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

test('protected resource metadata is available', async () => {
  const response = await fetchJson(`${BASE_URL}/.well-known/oauth-protected-resource`);
  assertEqual(response.status, 200);
  assertEqual(response.body.resource, `${BASE_URL}/api/mcp`);
  assert(response.body.authorization_servers?.includes(BASE_URL), 'missing authorization server');
  assert(response.body.scopes_supported?.includes('lifeos.read'), 'missing lifeos.read scope');
});

test('authorization server metadata is available', async () => {
  const response = await fetchJson(`${BASE_URL}/.well-known/oauth-authorization-server`);
  assertEqual(response.status, 200);
  assertEqual(response.body.issuer, BASE_URL);
  assertEqual(response.body.authorization_endpoint, `${BASE_URL}/oauth/authorize`);
  assertEqual(response.body.token_endpoint, `${BASE_URL}/oauth/token`);
  assert(response.body.grant_types_supported?.includes('authorization_code'), 'missing authorization_code grant');
  assert(response.body.code_challenge_methods_supported?.includes('S256'), 'missing S256 PKCE support');
});

test('authorize page renders without private data', async () => {
  Object.assign(oauth, buildPkce());
  oauth.clientId = 'codex-smoke-client';
  oauth.redirectUri = 'https://chatgpt.com/connector/oauth/codex-smoke';
  oauth.state = crypto.randomUUID();
  const url = new URL(`${BASE_URL}/oauth/authorize`);
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
  assert(!response.text.includes(LINK_SECRET), 'authorize page leaked link secret');
});

test('authorize post returns signed code redirect', async () => {
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
  const response = await fetch(`${BASE_URL}/oauth/authorize`, {
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
});

test('token endpoint exchanges code for bearer token', async () => {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: oauth.code,
    client_id: oauth.clientId,
    redirect_uri: oauth.redirectUri,
    code_verifier: oauth.codeVerifier,
  });
  const response = await fetchJson(`${BASE_URL}/oauth/token`, {
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

function test(name, fn) {
  checks.push({ name, fn });
}

function buildPkce() {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
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
  return message
    .replace(LINK_SECRET, '[redacted]')
    .replace(oauth.code || 'no-code', '[redacted-code]')
    .replace(oauth.accessToken || 'no-token', '[redacted-token]')
    .slice(0, 500);
}
