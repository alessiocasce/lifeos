// Action ledger and undo for the Jarvis Companion (spec §4.10, §5.5).
//
// Every write tool records one ledger row with a human summary and an
// `inverse`: a list of database operations that reverse it. Undo applies the
// inverse in reverse order and marks the row undone. Only the tables below
// can be touched by an inverse, and every operation is scoped to the user.

import { recalculateSleepHoursForDate } from './health.js';
import { applyBeliefTransition } from './brainBeliefs.js';

const LEDGER_TABLE = 'brain_action_ledger';
const INVERSE_TABLES = new Set(['memos', 'calendar_events', 'expenses', 'health_logs', 'ai_memories', 'projects', 'brain_beliefs']);
const LEDGER_SELECT = 'id, user_id, request_id, thread_id, channel, tool, autonomy, args, result_ref, inverse, summary, undone_at, undone_by, created_at';
// Undo must work for at least the last 24h (spec §4.10); allow a margin.
export const UNDO_WINDOW_HOURS = 48;
const CHANNELS = new Set(['whatsapp', 'app', 'call', 'proactive', 'mcp']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(String(value ?? ''));
}

// Short per-turn aliases (c1, e2, a3) for database ids, so the model never
// has to copy UUIDs. Raw UUIDs are still accepted.
export function createRefRegistry() {
  const byKey = new Map();
  const byRef = new Map();
  const counters = {};
  return {
    ref(kind, id) {
      if (!id) return null;
      const key = `${kind}:${id}`;
      if (byKey.has(key)) return byKey.get(key);
      counters[kind] = (counters[kind] ?? 0) + 1;
      const ref = `${kind}${counters[kind]}`;
      byKey.set(key, ref);
      byRef.set(ref, { kind, id: String(id) });
      return ref;
    },
    resolve(kind, value) {
      const text = String(value ?? '').trim();
      const hit = byRef.get(text);
      if (hit) return hit.kind === kind ? hit.id : null;
      return isUuid(text) ? text : null;
    },
  };
}

export async function recordCompanionAction({ client, userId, turn = {}, tool, autonomy, args = {}, resultRef = {}, inverse = [], summary }) {
  const row = {
    user_id: userId,
    request_id: turn.requestId ? String(turn.requestId).slice(0, 160) : null,
    thread_id: isUuid(turn.threadId) ? turn.threadId : null,
    source_message_id: isUuid(turn.userMessageId) ? turn.userMessageId : null,
    channel: CHANNELS.has(turn.channel) ? turn.channel : 'whatsapp',
    tool: String(tool).slice(0, 80),
    autonomy,
    args: plainObject(args),
    result_ref: plainObject(resultRef),
    inverse: Array.isArray(inverse) ? inverse : [],
    summary: String(summary || tool).replace(/\s+/g, ' ').trim().slice(0, 300),
  };
  const { data, error } = await client.from(LEDGER_TABLE).insert(row).select(LEDGER_SELECT).single();
  if (error) throw new Error(`action ledger insert failed: ${error.message}`);
  return data;
}

export async function listRecentCompanionActions({ client, userId, now = new Date(), hours = UNDO_WINDOW_HOURS, limit = 10, includeUndone = false }) {
  const since = new Date(new Date(now).getTime() - hours * 3600_000).toISOString();
  let query = client.from(LEDGER_TABLE).select(LEDGER_SELECT)
    .eq('user_id', userId)
    .gte('created_at', since);
  if (!includeUndone) query = query.is('undone_at', null);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`action ledger read failed: ${error.message}`);
  return data ?? [];
}

// Picks the action to undo: an explicit id, a description match, or the most
// recent undoable action. Returns { action } or { error, candidates }.
export function selectActionToUndo(actions, { actionId = null, description = '' } = {}) {
  const undoable = actions.filter((action) => !action.undone_at && action.tool !== 'undo_action');
  if (!undoable.length) return { error: 'nothing_to_undo', candidates: [] };
  if (actionId) {
    const match = undoable.find((action) => action.id === actionId);
    return match ? { action: match } : { error: 'action_not_found', candidates: undoable.slice(0, 5) };
  }
  const words = keyWords(description);
  if (!words.length) return { action: undoable[0] };
  const scored = undoable
    .map((action) => ({ action, score: overlap(words, keyWords(`${action.summary} ${action.tool.replace(/_/g, ' ')} ${toolAliases(action.tool)}`)) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { error: 'no_matching_action', candidates: undoable.slice(0, 5) };
  if (scored.length > 1 && scored[1].score === scored[0].score && scored[0].action.tool !== scored[1].action.tool) {
    return { error: 'ambiguous', candidates: scored.slice(0, 5).map((item) => item.action) };
  }
  return { action: scored[0].action };
}

export async function undoCompanionAction({ client, userId, actionId = null, description = '', now = new Date(), turn = {} }) {
  const actions = await listRecentCompanionActions({ client, userId, now, limit: 25 });
  const selection = selectActionToUndo(actions, { actionId, description });
  if (!selection.action) return { ok: false, error: selection.error, candidates: selection.candidates };
  const target = selection.action;
  await applyCompanionInverse({ client, userId, inverse: target.inverse, ledgerId: target.id });
  const undoRow = await recordCompanionAction({
    client,
    userId,
    turn,
    tool: 'undo_action',
    autonomy: 'undo',
    args: { action_id: target.id },
    resultRef: { undone_action_id: target.id },
    inverse: [],
    summary: `Annullato: ${target.summary}`,
  });
  const { error } = await client.from(LEDGER_TABLE)
    .update({ undone_at: new Date(now).toISOString(), undone_by: undoRow.id })
    .eq('id', target.id)
    .eq('user_id', userId);
  if (error) throw new Error(`action ledger update failed: ${error.message}`);
  return { ok: true, undone: target, undoRow };
}

export async function applyCompanionInverse({ client, userId, inverse = [], ledgerId = null }) {
  const operations = Array.isArray(inverse) ? [...inverse].reverse() : [];
  for (const operation of operations) {
    await applyOperation({ client, userId, operation, ledgerId });
  }
}

async function applyOperation({ client, userId, operation, ledgerId }) {
  const op = operation?.op;
  if (op === 'recalc_sleep') {
    await recalculateSleepHoursForDate(client, userId, operation.date);
    return;
  }
  if (op === 'belief') {
    await applyBeliefTransition({
      client,
      userId,
      subjectType: operation.subject_type,
      subjectKey: operation.subject_key,
      predicate: operation.predicate,
      value: operation.value,
      sourceType: 'user_explicit',
      effectiveUntil: operation.effective_until ?? null,
      idempotencyKey: `companion:undo:${ledgerId ?? Date.now()}:${operation.subject_type}:${operation.subject_key}`,
    });
    return;
  }
  if (!INVERSE_TABLES.has(operation?.table)) throw new Error(`Undo cannot touch table ${operation?.table}.`);
  if (op === 'delete') {
    const { error } = await client.from(operation.table).delete().eq('id', operation.id).eq('user_id', userId);
    if (error) throw new Error(`undo delete failed: ${error.message}`);
  } else if (op === 'update') {
    const { error } = await client.from(operation.table).update(plainObject(operation.fields)).eq('id', operation.id).eq('user_id', userId);
    if (error) throw new Error(`undo update failed: ${error.message}`);
  } else if (op === 'insert') {
    const row = { ...plainObject(operation.row), user_id: userId };
    const { error } = await client.from(operation.table).insert(row);
    if (error) throw new Error(`undo insert failed: ${error.message}`);
  } else {
    throw new Error(`Unknown undo operation ${op}.`);
  }
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function keyWords(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function overlap(words, haystack) {
  const set = new Set(haystack.map((word) => word.slice(0, 5)));
  return words.filter((word) => set.has(word.slice(0, 5))).length;
}

function toolAliases(tool) {
  if (/calendar/.test(tool)) return 'evento calendario appuntamento';
  if (/commitment|checkin/.test(tool)) return 'promemoria impegno scadenza';
  if (/expense/.test(tool)) return 'spesa euro';
  if (/sleep/.test(tool)) return 'sonno dormire letto';
  if (/wake/.test(tool)) return 'sveglia sveglio';
  if (/habit/.test(tool)) return 'doccia creatina skincare abitudine';
  if (tool === 'remember') return 'ricorda memoria';
  if (/availability/.test(tool)) return 'disponibilita chiamate';
  return '';
}

const STOP_WORDS = new Set(['annulla', 'quello', 'quella', 'prima', 'ultimo', 'ultima', 'che', 'hai', 'del', 'della', 'dello', 'the', 'and', 'per', 'con', 'una', 'uno', 'gli', 'le', 'di', 'il', 'lo', 'la']);
