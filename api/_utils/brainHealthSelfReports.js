import { ensureAccountabilityHealth } from './brainProactiveDelivery.js';
import { TIME_ZONE } from './date.js';
import { normalizeTurnText } from './brainTurnArbitration.js';

const HABIT_PATTERNS = {
  shower: /\b(?:doccia|shower)\b/,
  creatine: /\b(?:creatina|creatine)\b/,
  skin: /\b(?:skincare|skin care|skin)\b/,
};

const POSITIVE_PATTERNS = {
  shower: /\b(?:(?:ho\s+)?fatto\s+(?:la\s+)?doccia|doccia\s+fatta|shower\s+done|i\s+showered)\b/,
  creatine: /\b(?:(?:ho\s+)?preso\s+(?:la\s+)?creatina|creatina\s+presa|creatine\s+(?:taken|done)|i\s+took\s+creatine)\b/,
  skin: /\b(?:(?:ho\s+)?fatto\s+(?:la\s+)?skincare|skincare\s+fatta|skin\s+care\s+done|did\s+(?:my\s+)?skincare)\b/,
};

const NEGATIVE_PATTERN = /\b(?:non\s+(?:ho\s+)?(?:fatto|presa|preso)|non\s+ancora|not\s+yet|did\s+not|didn't|haven't|have\s+not|non\s+fatta|non\s+pres[ao])\b/;
const HYPOTHETICAL_PATTERN = /\b(?:se|if|forse|maybe|potrei|might|dovrei|should|devo|need to)\b/;

export function parseExplicitHealthSelfReport(message, { now = new Date() } = {}) {
  const text = normalizeTurnText(message);
  if (!text || HYPOTHETICAL_PATTERN.test(text) || /\?$/.test(text)) return null;
  const mentionedHabit = Object.keys(HABIT_PATTERNS).find((id) => HABIT_PATTERNS[id].test(text));
  if (mentionedHabit && NEGATIVE_PATTERN.test(text)) {
    return {
      kind: 'habit_not_done',
      habit_id: mentionedHabit,
      logged_on: localParts(now).date,
      source_of_write_intent: 'none',
      language: inferLanguage(text),
    };
  }
  const habitId = Object.keys(POSITIVE_PATTERNS).find((id) => POSITIVE_PATTERNS[id].test(text));
  if (!habitId) return null;
  return {
    kind: 'habit_done',
    habit_id: habitId,
    logged_on: localParts(now).date,
    habit_time: parseHealthReplyTime(text) || localParts(now).time,
    target_count: 1,
    source_of_write_intent: 'current_message',
    language: inferLanguage(text),
  };
}

export function parseBareHealthHabit(message) {
  const text = normalizeTurnText(message);
  if (!text) return null;
  const matches = Object.entries(HABIT_PATTERNS).filter(([, pattern]) => pattern.test(text));
  if (matches.length !== 1) return null;
  const remaining = text.replace(matches[0][1], '').replace(/[^a-z0-9]+/g, ' ').trim();
  return remaining ? null : matches[0][0];
}

export function repairBareHabitArgs(args = {}, message = '') {
  const habitId = parseBareHealthHabit(message);
  if (!habitId) return args;
  const repaired = { ...args };
  if (normalizeTurnText(repaired.health_note_append) === normalizeTurnText(message)) delete repaired.health_note_append;
  if (hasStructuredHealthField(repaired)) return repaired;
  repaired[habitId] = true;
  if (!repaired.logged_on && !repaired.date) repaired.logged_on = localParts(new Date()).date;
  return repaired;
}

export function hasStructuredHealthField(args = {}) {
  if (!args || typeof args !== 'object') return false;
  const directFields = ['health_note_append', 'notes', 'wake_time', 'sleep_start', 'sleepStart', 'sleep_hours', 'energy', 'water', 'coffee', 'adc', 'mood', 'social_time_minutes', 'main_time_waster'];
  if (directFields.some((field) => Object.prototype.hasOwnProperty.call(args, field) && args[field] !== undefined && args[field] !== null && args[field] !== '')) return true;
  return Object.keys(HABIT_PATTERNS).some((id) => args[id] === true || Number(args[id]) > 0)
    || (args.hygiene && typeof args.hygiene === 'object' && Object.keys(args.hygiene).some((key) => HABIT_PATTERNS[key]));
}

export function parseHealthReplyTime(message) {
  const text = normalizeTurnText(message)
    .replace(/\b(?:alle|at|verso|circa)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  const conjunction = text.match(/(?:^|\s)(\d{1,2})\s+e\s+(\d{1,2})(?:\s+di\s+(?:notte|mattina|pomeriggio|sera))?(?:\s|$)/);
  const clock = conjunction || text.match(/(?:^|\s)(\d{1,2})(?:[:.h](\d{2}))\s*(am|pm)?(?:\s|$)/);
  if (!clock) return null;
  let hour = Number(clock[1]);
  const minute = Number(clock[2]);
  const meridiem = clock[3] || (conjunction && /\b(?:pomeriggio|sera)\b/.test(text) ? 'pm' : null);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (meridiem === 'am') hour = hour === 12 ? 0 : hour;
  if (meridiem === 'pm') hour = hour === 12 ? 12 : hour + 12;
  if (hour > 23) return null;
  const matched = clock[0].trim();
  const remainder = text.replace(matched, ' ')
    .replace(/'/g, ' ')
    .replace(/\b(?:inizio|fine|sveglia|svegliato|risveglio|sleep start|dormire|andato a letto|l ho fatta|l ho preso|fatta|fatto|presa|preso|doccia|shower|creatina|creatine|skincare|skin care|di notte|di mattina|di pomeriggio|di sera)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (remainder) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export async function resolveExplicitHealthSelfReport({ report, actions = null } = {}) {
  if (!report) return null;
  if (report.kind === 'habit_not_done') {
    return {
      answer: report.language === 'en' ? 'Okay, I will not log anything.' : 'Ok, non segno nulla.',
      plan: { intent: 'clarify', needsRead: false, needsWrite: false, riskLevel: 'low', args: {}, reasoning: 'Grounded negative Health self-report.' },
      actions: [], contextSummary: null, skipMemoryExtraction: true,
      health_self_report_trace: { handled: true, habit_id: report.habit_id, source_of_write_intent: 'none', negative: true },
    };
  }
  if (report.kind !== 'habit_done') return null;
  const runner = actions?.ensureHealth || ensureAccountabilityHealth;
  const data = await runner({
    logged_on: report.logged_on,
    [report.habit_id]: true,
    habit_time: report.habit_time,
    target_count: report.target_count,
  });
  const label = report.habit_id === 'shower' ? 'doccia' : report.habit_id === 'creatine' ? 'creatina' : 'skincare';
  const answer = data?.accountability_noop
    ? report.language === 'en' ? `${capitalize(label)} is already logged. I changed nothing.` : `${capitalize(label)} gia segnata. Non modifico nulla.`
    : report.language === 'en' ? `Logged: ${label} completed today.` : `Segnato: ${label} fatta oggi.`;
  return {
    answer,
    plan: {
      intent: 'update_health_log',
      needsRead: false,
      needsWrite: !data?.accountability_noop,
      riskLevel: 'low',
      args: {},
      reasoning: 'Resolved grounded Health self-report from the current message.',
    },
    actions: data?.accountability_noop ? [] : [{
      type: 'update_health_log',
      data: { ...data, sourcePath: 'explicit_health_self_report' },
    }],
    contextSummary: null,
    skipMemoryExtraction: true,
    health_self_report_trace: {
      handled: true,
      habit_id: report.habit_id,
      source_of_write_intent: 'current_message',
      idempotent_noop: Boolean(data?.accountability_noop),
    },
  };
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function inferLanguage(text) {
  return /\b(?:shower|creatine|skin care|done|not yet|did not|didn't|i took|i showered)\b/.test(text) ? 'en' : 'it';
}

function localParts(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(new Date(value)).filter((item) => item.type !== 'literal').map((item) => [item.type, item.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
  };
}
