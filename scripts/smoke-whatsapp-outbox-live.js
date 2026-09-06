#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
loadEnvLocal();

if (String(process.env.LIFEOS_RUN_LIVE_OUTBOX_SMOKE ?? '').toLowerCase() !== 'true') {
  console.log('WhatsApp outbox smoke skipped. Set LIFEOS_RUN_LIVE_OUTBOX_SMOKE=true to run against a live backend.');
  process.exit(0);
}

const baseUrl = String(process.env.LIFEOS_BASE_URL ?? 'https://lifeos-ruby-gamma.vercel.app').replace(/\/+$/, '');
const secret = String(process.env.LIFEOS_WHATSAPP_BRIDGE_SECRET ?? '').trim();
const recipient = String(process.env.LIFEOS_WHATSAPP_TEST_RECIPIENT ?? '').trim();
const endpoint = `${baseUrl}/api/integrations/whatsapp/outbox`;

if (!secret || !recipient) {
  console.error('Missing LIFEOS_WHATSAPP_BRIDGE_SECRET or LIFEOS_WHATSAPP_TEST_RECIPIENT for live outbox smoke.');
  process.exit(1);
}

const checks = [];
const mutate = process.env.LIFEOS_SMOKE_MUTATE === '1';

await step('evaluate', async () => {
  const result = await postOutbox({ action: mutate ? 'evaluate' : 'preview', recipient, bridge_id: 'codex-smoke' });
  assert(result.ok === true, 'evaluate did not return ok true');
  assert(typeof result.queued === 'number', 'evaluate missing queued count');
  assert(typeof result.skipped === 'number', 'evaluate missing skipped count');
});

if (mutate) await step('poll shape (claims real rows)', async () => {
  const result = await postOutbox({ action: 'poll', recipient, bridge_id: 'codex-smoke', limit: 1 });
  assert(result.ok === true, 'poll did not return ok true');
  assert(Array.isArray(result.messages), 'poll missing messages array');
  for (const message of result.messages) {
    assert(message.id && message.to && typeof message.body === 'string', 'poll message shape invalid');
  }
});

if (mutate && String(process.env.LIFEOS_WHATSAPP_OUTBOX_SMOKE_ACK_ID ?? '').trim()) {
  await step('ack explicit message', async () => {
    const result = await postOutbox({
      action: 'ack',
      recipient,
      bridge_id: 'codex-smoke',
      message_id: process.env.LIFEOS_WHATSAPP_OUTBOX_SMOKE_ACK_ID,
      status: process.env.LIFEOS_WHATSAPP_OUTBOX_SMOKE_ACK_STATUS || 'failed',
      error: 'codex smoke test ack',
    });
    assert(result.ok === true, 'ack did not return ok true');
  });
}

for (const check of checks) console.log(check);
console.log('WhatsApp outbox live smoke completed.');

async function step(name, fn) {
  try {
    await fn();
    checks.push(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error('Backend check failed; inspect sanitized server diagnostics.');
    process.exit(1);
  }
}

async function postOutbox(body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-lifeos-whatsapp-secret': secret,
      'x-lifeos-debug': 'true',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data?.error || data?.message || 'request failed'}`);
  }
  return data;
}

function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    if (process.env[key]) continue;
    process.env[key] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
