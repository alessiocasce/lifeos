#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { handleMcpOAuthRequest, signOAuthCodeForTest, verifyOAuthAccessTokenForTest } from '../api/_utils/mcpOAuth.js';
import { createReliabilityDatabase } from '../tests/brain/reliabilityDatabase.js';

const keys = ['LIFEOS_MCP_TOKEN', 'LIFEOS_MCP_LINK_SECRET', 'LIFEOS_MCP_OAUTH_SIGNING_SECRET', 'LIFEOS_ACTION_USER_ID'];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
process.env.LIFEOS_MCP_TOKEN = 'read-test-token';
process.env.LIFEOS_MCP_LINK_SECRET = 'separate-link-test-secret';
process.env.LIFEOS_MCP_OAUTH_SIGNING_SECRET = 'signing-test-secret';
process.env.LIFEOS_ACTION_USER_ID = '11111111-1111-4111-8111-111111111111';

const headers = { host: 'lifeos.example', 'x-forwarded-proto': 'https' };
const verifier = 'v'.repeat(48);
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const clientId = 'test-client';
const redirectUri = 'https://chatgpt.com/connector/oauth/test-client';
const resource = 'https://lifeos.example/api/mcp';
const issuer = 'https://lifeos.example';

function response() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(value = '') { this.body = String(value); },
  };
}

function makeCode(scope) {
  return signOAuthCodeForTest({
    iss: issuer, aud: resource, client_id: clientId, redirect_uri: redirectUri,
    code_challenge: challenge, scope,
  });
}

async function exchange(client, code, overrides = {}) {
  const res = response();
  await handleMcpOAuthRequest({
    method: 'POST', headers, url: '/api/mcp?mcp_oauth=token',
    body: {
      grant_type: 'authorization_code', code, client_id: clientId,
      redirect_uri: redirectUri, code_verifier: verifier, ...overrides,
    },
  }, res, { client });
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

const { db, client } = await createReliabilityDatabase();
try {
  for (const scope of ['lifeos.read', 'lifeos.read lifeos.write']) {
    const code = makeCode(scope);
    for (const bad of [
      { code_verifier: 'wrong-verifier' },
      { client_id: 'wrong-client' },
      { redirect_uri: 'https://chatgpt.com/connector/oauth/other' },
      { resource: 'https://other.example/api/mcp' },
    ]) {
      const invalid = await exchange(client, code, bad);
      assert.equal(invalid.status, 400);
      assert.equal(invalid.body.error, 'invalid_grant');
    }
    const before = await db.query('select count(*)::int as count from brain_mcp_oauth_code_redemptions');
    assert.equal(before.rows[0].count, scope === 'lifeos.read' ? 0 : 1);
    const first = await exchange(client, code);
    assert.equal(first.status, 200);
    assert.equal(first.body.scope, scope);
    assert.equal(verifyOAuthAccessTokenForTest(first.body.access_token, { headers }), true);
    const replay = await exchange(client, code);
    assert.equal(replay.status, 400);
    assert.equal(replay.body.error, 'invalid_grant');
  }

  const concurrentCode = makeCode('lifeos.read');
  const [a, b] = await Promise.all([
    exchange({ from: (table) => client.from(table) }, concurrentCode),
    exchange({ from: (table) => client.from(table) }, concurrentCode),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 400]);
  assert.equal([a, b].find((result) => result.status === 400).body.error, 'invalid_grant');

  const rows = (await db.query('select * from brain_mcp_oauth_code_redemptions')).rows;
  assert.equal(rows.length, 3);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['code_jti_hash', 'expires_at', 'redeemed_at']);
  for (const row of rows) assert.match(row.code_jti_hash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(rows).includes(verifier), false);
  assert.equal(JSON.stringify(rows).includes(concurrentCode), false);
  console.log('PASS OAuth codes are atomic single-use across read/write, invalid requests, replay and concurrent exchange');
} finally {
  await db.close();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
