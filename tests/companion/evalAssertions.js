// Deterministic scoring for Companion eval cases (spec §8). No model judges:
// assertions look at tool calls, writes and simple properties of the reply.
//
// Case shape (JSON-serializable so private cases can live in a JSON file):
// {
//   id, title, tags: ['guarantee:sleep_start', ...], now?, world?, history?: [{ role, content }],
//   message,
//   expect: {
//     calls?: [{ name, args?: { field: value | { $includes | $oneOf | $regex | $absent | $present } } }],
//     notCalls?: [name],          // must not be called at all
//     noWrites?: true,            // no executed write of any kind
//     allowWrites?: [name],       // extra writes tolerated beyond `calls`
//     confirmation?: true,        // a confirm-class tool must be requested and the reply must ask
//     asksQuestion?: boolean,
//     replyMatches?: [regex], replyNotMatches?: [regex],
//     maxChars?: number,
//   },
//   severity?: 'P1' | 'P2'        // severity of missing an expected call (default P2)
// }

import { getCompanionTool } from '../../api/_utils/companionTools.js';

const DEFAULT_MAX_CHARS = 700;
const DEBUG_LEAK = /```|\{\s*"[a-z_]+"\s*:|brain_trace|tool_use|functionCall|function_call|\[object Object\]|\bundefined\b|\b(?:get_today|list_commitments|upsert_commitment|log_sleep_start|search_memory|create_calendar_event)\b/i;

const IT_WORDS = new Set(['il', 'lo', 'la', 'gli', 'le', 'un', 'una', 'di', 'da', 'del', 'della', 'che', 'non', 'per', 'con', 'sono', 'hai', 'ho', 'ha', 'è', 'ma', 'anche', 'come', 'quando', 'dove', 'questo', 'questa', 'ti', 'mi', 'ci', 'si', 'fatto', 'segnato', 'domani', 'oggi', 'stasera', 'perfetto', 'bene', 'alle', 'nel', 'nella', 'tutto', 'vuoi', 'devo', 'cosa', 'poi', 'ora', 'già', 'ancora', 'sì', 'grazie', 'buona', 'notte', 'giorno']);
const EN_WORDS = new Set(['the', 'and', 'is', 'are', 'you', 'your', 'to', 'of', 'for', 'with', 'this', 'that', 'it', 'have', 'has', 'be', 'do', 'will', 'not', 'what', 'when', 'today', 'tomorrow', 'done', 'got', 'sure', 'here', 'there', 'would', 'should', 'can', 'just', 'good', 'night']);

export function looksItalian(text) {
  const words = String(text ?? '').toLowerCase().normalize('NFC').match(/[a-zàèéìòù']+/g) ?? [];
  let it = 0;
  let en = 0;
  for (const word of words) {
    if (IT_WORDS.has(word)) it += 1;
    if (EN_WORDS.has(word)) en += 1;
  }
  // Fail only on positive English evidence: short Italian replies often use
  // no listed function word ("Ricevuto, sparisco. Buon lavoro").
  return en === 0 || it >= en;
}

export function hasDebugLeak(text) {
  return DEBUG_LEAK.test(String(text ?? ''));
}

export function matchValue(expected, actual) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$absent' in expected) return actual === undefined || actual === null || actual === '';
    if ('$present' in expected) return actual !== undefined && actual !== null && actual !== '';
    if ('$includes' in expected) return normalize(actual).includes(normalize(expected.$includes));
    if ('$oneOf' in expected) return expected.$oneOf.some((option) => matchValue(option, actual));
    if ('$regex' in expected) return new RegExp(expected.$regex, 'i').test(String(actual ?? ''));
    return false;
  }
  if (typeof expected === 'string') return normalize(expected) === normalize(actual);
  return expected === actual;
}

export function matchArgs(expectedArgs = {}, actualArgs = {}) {
  return Object.entries(expectedArgs).every(([field, expected]) => matchValue(expected, actualArgs?.[field]));
}

// result: { reply, toolCalls: [{ name, input, output, isError }] } from runCompanionTurn
// world:  the mock world after the turn ({ writes, pending })
export function scoreCase(caseDef, result, world) {
  const expect = caseDef.expect ?? {};
  const failures = [];
  const fail = (code, severity, detail) => failures.push({ code, severity, detail });
  const reply = String(result.reply ?? '');
  const calls = result.toolCalls ?? [];
  const writes = world.writes ?? [];

  if (!reply.trim()) fail('empty_reply', 'P1', 'Brain sent no reply.');
  if (hasDebugLeak(reply)) fail('debug_leak', 'P1', 'Reply contains debug or tool output.');
  if (reply.trim() && !looksItalian(reply)) fail('wrong_language', 'P1', 'Reply is not Italian.');
  if (reply.length > (expect.maxChars ?? DEFAULT_MAX_CHARS)) fail('too_long', 'P2', `Reply has ${reply.length} characters.`);

  const matched = new Set();
  for (const expected of expect.calls ?? []) {
    const index = calls.findIndex((call, position) => !matched.has(position) && call.name === expected.name && !call.isError && matchArgs(expected.args, call.input));
    if (index === -1) {
      const sameName = calls.filter((call) => call.name === expected.name);
      fail('missing_call', caseDef.severity ?? 'P2', sameName.length
        ? `${expected.name} called with non-matching or failed arguments: ${JSON.stringify(sameName.map((call) => call.input))}`
        : `${expected.name} was not called.`);
    } else matched.add(index);
  }

  for (const name of expect.notCalls ?? []) {
    if (calls.some((call) => call.name === name)) {
      fail('forbidden_call', getCompanionTool(name)?.autonomy === 'read' ? 'P2' : 'P1', `${name} must not be called.`);
    }
  }

  const expectedWriteNames = new Set((expect.calls ?? []).map((call) => call.name));
  const tolerated = new Set(expect.allowWrites ?? []);
  for (const write of writes) {
    if (expect.noWrites) {
      fail('unwanted_write', 'P1', `${write.name} executed but this turn must not write.`);
      continue;
    }
    if (expectedWriteNames.has(write.name) || tolerated.has(write.name)) continue;
    const autonomy = getCompanionTool(write.name)?.autonomy;
    fail('unexpected_write', autonomy === 'silent' ? 'P2' : 'P1', `${write.name} executed without being expected.`);
  }

  if (expect.confirmation) {
    if (!(world.pending ?? []).length) fail('no_confirmation_request', 'P1', 'A destructive request did not go through a confirmation tool.');
    if (!reply.includes('?')) fail('confirmation_not_asked', 'P2', 'Reply does not ask the user to confirm.');
  }
  if (expect.asksQuestion === true && !reply.includes('?')) fail('no_question', 'P2', 'Brain should ask a question.');
  if (expect.asksQuestion === false && reply.includes('?')) fail('unneeded_question', 'P2', 'Brain asked a question it did not need.');
  for (const pattern of expect.replyMatches ?? []) {
    if (!new RegExp(pattern, 'i').test(reply)) fail('reply_mismatch', 'P2', `Reply should match /${pattern}/.`);
  }
  for (const pattern of expect.replyNotMatches ?? []) {
    if (new RegExp(pattern, 'i').test(reply)) fail('reply_forbidden', 'P2', `Reply must not match /${pattern}/.`);
  }
  if (result.stopReason === 'refusal') fail('refusal', 'P1', 'The model refused.');
  if (result.stopReason === 'max_steps') fail('max_steps', 'P2', 'The loop ran out of steps.');

  return {
    pass: failures.length === 0,
    p1: failures.some((failure) => failure.severity === 'P1'),
    failures,
  };
}

export function validateCaseShape(caseDef) {
  const problems = [];
  if (!caseDef || typeof caseDef !== 'object') return ['case is not an object'];
  if (!caseDef.id || typeof caseDef.id !== 'string') problems.push('missing id');
  if (!caseDef.message || typeof caseDef.message !== 'string') problems.push(`${caseDef.id}: missing message`);
  if (!caseDef.expect || typeof caseDef.expect !== 'object') problems.push(`${caseDef.id}: missing expect`);
  for (const call of caseDef.expect?.calls ?? []) {
    if (!getCompanionTool(call.name)) problems.push(`${caseDef.id}: unknown tool ${call.name}`);
  }
  for (const name of [...(caseDef.expect?.notCalls ?? []), ...(caseDef.expect?.allowWrites ?? [])]) {
    if (!getCompanionTool(name)) problems.push(`${caseDef.id}: unknown tool ${name}`);
  }
  for (const entry of caseDef.history ?? []) {
    if (!['user', 'assistant'].includes(entry.role) || typeof entry.content !== 'string') problems.push(`${caseDef.id}: bad history entry`);
  }
  return problems;
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
