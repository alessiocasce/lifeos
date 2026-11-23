#!/usr/bin/env node
// Exports recent real Brain conversations as *candidate* private eval cases.
//
// Output: evals/private/candidates.json (gitignored). Each candidate carries
// the message, up to 6 earlier messages from the same thread, what the old
// Brain did, and a proposed expectation derived from the old action log.
// Proposals are weak labels: review every candidate, fix its `expect`, set
// `review` to "approved" or "rejected", then copy approved ones into
// evals/private/cases.json. Nothing here is ever committed (public repo).
//
//   npm run eval:companion:export -- --days 120 --limit 300

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'evals', 'private', 'candidates.json');
const HISTORY = 6;

try { process.loadEnvFile(path.join(ROOT, '.env.local')); } catch { /* env may come from the shell */ }

const args = Object.fromEntries(process.argv.slice(2).flatMap((token, index, all) => (
  token.startsWith('--') ? [[token.slice(2), all[index + 1]]] : []
)));
const days = Math.max(1, Number(args.days ?? 120));
const limit = Math.max(1, Math.min(2000, Number(args.limit ?? 300)));
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, LIFEOS_ACTION_USER_ID: userId } = process.env;
if (!url || !key || !userId) {
  console.error('FAIL SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and LIFEOS_ACTION_USER_ID are required (.env.local).');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

const userMessages = await select(supabase.from('ai_chat_messages')
  .select('id, thread_id, role, content, metadata, created_at')
  .eq('user_id', userId).eq('role', 'user').gte('created_at', since)
  .order('created_at', { ascending: false }).limit(limit));

const threadIds = [...new Set(userMessages.map((row) => row.thread_id))];
const threadMessages = [];
for (let index = 0; index < threadIds.length; index += 50) {
  threadMessages.push(...await select(supabase.from('ai_chat_messages')
    .select('id, thread_id, role, content, metadata, created_at')
    .eq('user_id', userId).in('thread_id', threadIds.slice(index, index + 50))
    .gte('created_at', new Date(Date.parse(since) - 2 * 24 * 3600 * 1000).toISOString())
    .order('created_at', { ascending: true })));
}
const actionLogs = await select(supabase.from('ai_action_logs')
  .select('user_message, action_type, actions, status, created_at')
  .eq('user_id', userId).gte('created_at', since));

const byThread = new Map();
for (const row of threadMessages) {
  if (!byThread.has(row.thread_id)) byThread.set(row.thread_id, []);
  byThread.get(row.thread_id).push(row);
}

const candidates = [];
for (const message of userMessages) {
  const text = String(message.content ?? '').trim();
  if (text.length < 3 || text.length > 1000) continue;
  const thread = byThread.get(message.thread_id) ?? [];
  const position = thread.findIndex((row) => row.id === message.id);
  const history = thread.slice(Math.max(0, position - HISTORY), Math.max(0, position))
    .map((row) => ({ role: row.role === 'user' ? 'user' : 'assistant', content: String(row.content ?? '').slice(0, 600) }));
  const reply = thread.slice(position + 1).find((row) => row.role === 'assistant');
  const log = findActionLog(text, message.created_at);
  const oldActions = actionTypes(log);
  candidates.push({
    id: `real-${message.created_at.slice(0, 10)}-${message.id.slice(0, 8)}`,
    review: 'pending',
    channel: message.metadata?.source ?? 'app',
    now: message.created_at,
    history,
    message: text,
    old_brain: {
      actions: oldActions,
      status: log?.status ?? null,
      reply_preview: String(reply?.content ?? '').slice(0, 300),
    },
    tags: ['real'],
    expect: proposeExpectation(oldActions, log?.status),
    notes: '',
  });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(candidates, null, 2)}\n`);
const counts = candidates.reduce((acc, candidate) => {
  const key = candidate.expect.noWrites ? 'no-write' : candidate.expect.calls?.map((call) => call.name).join('+') || 'unlabelled';
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});
console.log(`Wrote ${candidates.length} candidates to ${path.relative(ROOT, OUT)}.`);
console.log('Proposed expectations:', counts);

function findActionLog(text, createdAt) {
  const at = Date.parse(createdAt);
  const normalized = text.toLowerCase();
  return actionLogs.find((log) => String(log.user_message ?? '').trim().toLowerCase() === normalized
    && Math.abs(Date.parse(log.created_at) - at) < 5 * 60 * 1000) ?? null;
}

function actionTypes(log) {
  if (!log) return [];
  const fromActions = Array.isArray(log.actions) ? log.actions.map((action) => action?.type ?? action?.action_type).filter(Boolean) : [];
  return fromActions.length ? fromActions : (log.action_type ? [log.action_type] : []);
}

function proposeExpectation(types, status) {
  if (status === 'error') return { calls: [], notes: 'old Brain failed: label by hand' };
  const map = {
    create_memo: 'upsert_commitment',
    create_calendar_event: 'create_calendar_event',
    create_calendar_events: 'create_calendar_event',
    log_sleep_start: 'log_sleep_start',
    create_expense: 'log_expense',
    update_memo_status: 'complete_commitment',
    dismiss_memo: 'complete_commitment',
    snooze_memo: 'reschedule_commitment',
  };
  if (!types.length) return { noWrites: true };
  const calls = types.map((type) => map[type]).filter(Boolean).map((name) => ({ name }));
  return calls.length ? { calls } : { calls: [], notes: `old actions ${types.join(', ')}: label by hand` };
}

async function select(query) {
  const { data, error } = await query;
  if (error) {
    console.error(`FAIL Supabase read: ${error.message}`);
    process.exit(1);
  }
  return data ?? [];
}
