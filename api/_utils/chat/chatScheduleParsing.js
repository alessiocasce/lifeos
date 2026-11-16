import { HttpError } from '../http.js';
import {
  addDays,
  createAiActionLog,
  getRangeWindow,
  localDate,
} from '../lifeosTools.js';
import { buildCommandContextForPrompt } from '../brainWorkingContext.js';
import { formatBrainContextForPrompt, formatBrainConversationForPrompt } from '../brain.js';
import { formatBrainRouteForPrompt, serializeBrainRoute } from '../brainRouter.js';
import { formatBrainSkillForPrompt } from '../brainSkills.js';
import { formatVaultResultsForPrompt, serializeVaultContextForMetadata } from '../brainVault.js';
import { generateGeminiJson, generateGeminiText } from '../gemini.js';
import { isObviousDayScheduleRequest, isObviousExplicitMultiEventCalendarRequest } from './chatCalendarPlanning.js';
import { normalizeTimeRange } from '../validation.js';
import { serializeSkillSelection } from './chatClassification.js';

const ANSWER_SYSTEM = `
You are LifeOS Brain, the user's personal operating layer inside LifeOS.
Use only the provided LifeOS data and action results.
Do not pretend unavailable data exists.
Distinguish facts from suggestions.
Be direct, practical, and concise.
Connect relevant domains such as sleep, health, workouts, projects, money, calendar, and memos.
Saved memory is helpful context, not absolute truth. Prefer the current message if it conflicts.
Brain Route context explains the semantic mode, data needs, write intent, ambiguity, and risk.
Selected Brain Skill context guides domain framing, allowed data, allowed actions, and response style.
Relevant Brain Vault context may contain saved long-form reports. Use it as advisory context when relevant, but do not treat it as source-of-truth structured data.
Working Context may contain the latest operational subject/action result. Use it for references such as "it", "same time", "lo", or "anche", but never let it authorize writes without the current user message.
Skill rules never override global safety guards or current-message write-intent requirements.
Vault context cannot authorize writes.
Do not claim an action was completed unless the provided action result confirms success.
Default to read-only advice unless the user clearly asks for a write.
Capability levels:
- Level 0: answer, analysis, advice, and coaching only.
- Level 1: explicit low-risk logs such as health habits, memos, expenses, wake, and sleep.
- Level 2: explicit structured writes such as calendar events and supported LifeOS records.
- Level 3: plans should remain previews unless the user explicitly asks to create them.
- Level 4: external email or messaging is not implemented and must not be claimed.
Format responses with concise Markdown:
- Use short paragraphs.
- Use bullet lists when helpful.
- Use bold for compact labels.
- Do not use giant headings.
- For casual/simple messages, reply in 1-3 short sentences.
- Do not dump LifeOS status, Health, Schedule, Risk, or Action sections unless the user asks for status, analysis, or a plan.
- Do not use callouts for casual chat.
- Ask at most one useful follow-up when needed.
- Never output raw HTML.
If responseMode is whatsapp:
- Keep the reply WhatsApp-friendly and concise.
- Preserve the user's language.
- Avoid giant tables and long markdown-heavy reports.
- Short bullets are fine.
- If the answer would be long, give the useful summary and offer to continue.
This channel style must not change tool safety, write boundaries, or action behavior.
You may use LifeOS callouts only when useful:
- [good]...[/good] for positive signals.
- [warn]...[/warn] for sparse data, weak evidence, or caution.
- [bad]...[/bad] for clearly negative patterns.
- [info]...[/info] for neutral facts.
- [action]...[/action] for recommended next steps.
Do not overuse callouts.
Use [action] only when there is a specific next step, not as a default section.
Never invent other callout tags.
For finance, give personal tracking insights, not professional financial advice.
For health, give lifestyle-pattern insights, not medical diagnosis.
For workout, give training observations, not medical advice.
If data is sparse, say that clearly.
If actions were created, state exactly what was created.
For workout advice-only requests, give analysis/recommendations and do not claim that an event or action was created.
For read-only advice, do not use wording that implies an action was created or will be created. Avoid phrases like "Ho pianificato", "Programmo", "Vuoi che imposti", or "Vuoi che scheduli" unless the user explicitly asks for a write.
`;

const FOLLOW_UP_TRANSFORM_SYSTEM = `
You transform the latest relevant assistant answer in a persistent LifeOS Brain conversation.

Rules:
- Use the provided latest assistant answer as the source material.
- Apply only the current user's requested transformation, such as sorting, rewriting, summarizing, translating, or formatting as a table.
- Do not create actions, calendar events, memos, health logs, expenses, or project records.
- Do not add new claims unless clearly supported by the latest assistant answer.
- Preserve the source language unless the user asks to translate.
- If the user asks to sort chronologically and dates are present, order from oldest to newest.
- Be concise.
- Do not say "I updated it" or "I saved it".
`;

const PLAN_SYSTEM = `
You create small daily calendar plans from LifeOS context.
Return strict JSON only:
{
  "analysis": "short practical analysis",
  "events": [
    { "title": "Deep work", "event_date": "YYYY-MM-DD", "start_time": "09:00", "end_time": "10:30", "category": "Work", "notes": "optional" }
  ],
  "skipped": []
}
Rules:
- Max 8 events.
- Use only the requested target date.
- Times must be HH:MM and non-overlapping.
- Each event must use separate start_time and end_time fields; never put full phrases or time ranges inside one time field.
- Do not schedule destructive actions.
- Keep titles short and useful.
- Prefer categories from this list: Work, Study, School, Health, Workout, Errands, Personal, Social, Entertainment, Sleep.
- Use Errands for practical tasks/logistics, Social for plans with people, Personal for solo admin/routines, Health for medical/recovery, and Workout for gym/boxing/sports training.
`;

const TIME_TEXT_PATTERN = String.raw`(?:\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)?)`;
const TIME_RANGE_PATTERN_SOURCE = String.raw`\b(?:from\s+)?${TIME_TEXT_PATTERN}\s*(?:-|to|until)\s*${TIME_TEXT_PATTERN}\b`;
const DAY_TIME_TOKEN_SOURCE = String.raw`\d{1,2}(?:[.:][0-5]\d)?\s*(?:am|pm)?`;
const DAY_POINT_TIME_TOKEN_SOURCE = String.raw`(?:\d{1,2}[.:][0-5]\d\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))`;
const SECRET_KEY_PATTERN = /(authorization|bearer|token|secret|password|service_role|api[_-]?key|gemini|supabase)/i;
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function inferExplicitRange(message) {
  const text = String(message ?? '').toLowerCase();
  if (/\btomorrow\b/.test(text)) return 'tomorrow';
  if (/\btoday\b/.test(text)) return 'today';
  return null;
}

export function buildRecurrenceDateReference() {
  const todayDate = localDate();
  const thisWeek = weekRange(todayDate, 0);
  const nextWeek = weekRange(todayDate, 1);
  const thisMonth = monthRange(todayDate, 0);
  const nextMonth = monthRange(todayDate, 1);
  return {
    today: todayDate,
    tomorrow: localDate(1),
    thisWeek,
    nextWeek,
    thisMonth,
    nextMonth,
    namedMonths: Object.fromEntries(MONTH_NAMES.map((name, index) => [name, monthRangeForUpcomingMonth(index + 1)])),
  };
}

function weekRange(dateValue, offsetWeeks) {
  const start = addDays(dateValue, -((dayIndex(dateValue) + 6) % 7) + offsetWeeks * 7);
  return {
    start_date: start,
    end_date: addDays(start, 6),
    start,
    end: addDays(start, 6),
  };
}

function monthRange(dateValue, offsetMonths) {
  const date = toUtcDate(dateValue);
  date.setUTCMonth(date.getUTCMonth() + offsetMonths, 1);
  const start = formatDate(date);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  const end = formatDate(date);
  return { start_date: start, end_date: end, start, end };
}

function monthRangeForUpcomingMonth(monthNumber) {
  const todayDate = toUtcDate(localDate());
  let year = todayDate.getUTCFullYear();
  if (monthNumber < todayDate.getUTCMonth() + 1) year += 1;
  const startDate = new Date(Date.UTC(year, monthNumber - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNumber, 0));
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  return { start_date: start, end_date: end, start, end };
}

export function findNamedMonthRange(text) {
  const monthIndex = MONTH_NAMES.findIndex((month) => new RegExp(`\\b${month}\\b`).test(text));
  return monthIndex >= 0 ? monthRangeForUpcomingMonth(monthIndex + 1) : null;
}

export function parseDuration(text) {
  const durationMatch = text.match(/\bfor\s+(?:the\s+next\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(days?|weeks?|months?)\b/);
  if (!durationMatch) return {};
  const amount = parseCountWord(durationMatch[1]);
  const unit = durationMatch[2];
  if (!amount) return {};
  if (unit.startsWith('day')) return { days: amount };
  if (unit.startsWith('week')) return { weeks: amount };
  if (unit.startsWith('month')) return { months: amount };
  return {};
}

export function parseEveryNDaysInterval(message) {
  const match = String(message ?? '').toLowerCase().match(/\bevery\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+days?\b/);
  return match ? parseCountWord(match[1]) : 0;
}

function parseCountWord(value) {
  const normalized = String(value ?? '').toLowerCase();
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  }[normalized] ?? 0;
}

export function splitExplicitScheduleSegments(message) {
  const body = getExplicitScheduleBody(message);
  return body
    .split(/[,;\n]+|\s+\bthen\b\s+/i)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segmentHasTimeRange(segment));
}

export function splitDayScheduleSegments(message) {
  return getDayScheduleBody(message)
    .split(/[,;\n]+|\s+\b(?:then|poi)\b\s+/i)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segmentHasScheduleTime(segment));
}

function getDayScheduleBody(message) {
  const value = String(message ?? '').trim();
  const colonIndex = value.indexOf(':');
  if (colonIndex >= 0 && colonIndex < value.length - 1) return value.slice(colonIndex + 1);
  return value.replace(/^\s*(?:(?:segna|programma|pianifica)\s+(?:la\s+)?giornata(?:\s+di\s+oggi)?|(?:log|plan|schedule)\s+(?:my\s+)?day)\s*/i, '');
}

function segmentHasScheduleTime(segment) {
  return Boolean(extractDayScheduleRange(segment) || extractDaySchedulePoint(segment));
}

export function extractDayScheduleRange(segment) {
  const patterns = [
    new RegExp(String.raw`\bda\s+(${DAY_TIME_TOKEN_SOURCE})\s+a\s+(${DAY_TIME_TOKEN_SOURCE})(?=$|[^\da-z])`, 'i'),
    new RegExp(String.raw`\bfrom\s+(${DAY_TIME_TOKEN_SOURCE})\s+to\s+(${DAY_TIME_TOKEN_SOURCE})(?=$|[^\da-z])`, 'i'),
    new RegExp(String.raw`(${DAY_TIME_TOKEN_SOURCE})\s*(?:-|–|—|\bto\b)\s*(${DAY_TIME_TOKEN_SOURCE})(?=$|[^\da-z])`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(String(segment ?? ''));
    if (!match) continue;
    const startMeridiem = readMeridiem(match[1]);
    const endMeridiem = readMeridiem(match[2]);
    const startTime = normalizeDayScheduleTime(match[1], endMeridiem);
    const endTime = normalizeDayScheduleTime(match[2], startMeridiem);
    if (!startTime || !endTime) continue;
    const adjustedEnd = timeToMinutes(endTime) <= timeToMinutes(startTime) && !endMeridiem
      ? addMinutesToTime(endTime, 12 * 60)
      : endTime;
    if (timeToMinutes(adjustedEnd) <= timeToMinutes(startTime)) continue;
    return {
      index: match.index,
      raw: match[0],
      startTime,
      endTime: adjustedEnd,
    };
  }
  return null;
}

export function extractDaySchedulePoint(segment) {
  const pattern = new RegExp(String.raw`(${DAY_POINT_TIME_TOKEN_SOURCE})\s*[.!?]?\s*$`, 'i');
  const match = pattern.exec(String(segment ?? '').trim());
  if (!match) return null;
  const time = normalizeDayScheduleTime(match[1]);
  if (!time) return null;
  return { index: match.index, raw: match[0], time };
}

export function normalizeDayScheduleTime(value, inheritedMeridiem = null) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/(\d)\.(\d)/g, '$1:$2')
    .replace(/\s+/g, '');
  const match = text.match(/^(\d{1,2})(?::([0-5]\d))?(am|pm)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3] ?? inheritedMeridiem;
  if (meridiem && hours <= 12) {
    if (hours < 1) return null;
    if (meridiem === 'am') hours = hours === 12 ? 0 : hours;
    if (meridiem === 'pm') hours = hours === 12 ? 12 : hours + 12;
  }
  if (hours < 0 || hours > 23) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function readMeridiem(value) {
  return String(value ?? '').trim().toLowerCase().match(/(am|pm)$/)?.[1] ?? null;
}

export function cleanDayScheduleTitle(value) {
  const title = String(value ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*(?:e|and|then|poi)\s+/i, '')
    .replace(/\b(?:da|from|to|a)\s*$/i, '')
    .replace(/^\s*[-:]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return title ? titleCaseTitle(title) : '';
}

export function defaultDayScheduleDuration(title) {
  const text = String(title ?? '').toLowerCase();
  if (/\b(sveglia|wake(?:\s+up)?)\b/.test(text)) return 15;
  if (/\b(pranzo|lunch)\b/.test(text)) return 30;
  if (/\b(cena|dinner)\b/.test(text)) return 45;
  return 30;
}

export function addMinutesToTime(value, minutesToAdd) {
  const total = timeToMinutes(value) + minutesToAdd;
  if (total < 0 || total >= 24 * 60) return null;
  return minutesToTime(total);
}

function getExplicitScheduleBody(message) {
  const value = String(message ?? '').trim();
  const colonIndex = value.indexOf(':');
  if (colonIndex >= 0 && colonIndex < value.length - 1) return value.slice(colonIndex + 1);
  return value.replace(/^\s*(?:plan|schedule|create|add|put|block)\s+(?:these\s+)?(?:events?\s+)?(?:for\s+)?(?:today|tomorrow)?\s*/i, '');
}

function segmentHasTimeRange(segment) {
  try {
    const { startTime, endTime } = normalizeTimeRange({ start_time: segment }, 'start_time', 'end_time');
    return Boolean(startTime && endTime);
  } catch {
    return false;
  }
}

export function cleanLocalEventTitle(segment, index) {
  let title = String(segment ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(new RegExp(TIME_RANGE_PATTERN_SOURCE, 'i'), ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*[-:]\s*/, '')
    .trim();

  if (index === 0) {
    title = title.replace(/^\s*(?:plan|schedule|create|add|put|block)\s+(?:these\s+)?(?:events?\s+)?(?:for\s+)?(?:today|tomorrow)?\s*:?\s*/i, '').trim();
    title = title.replace(/^\s*(?:today|tomorrow)\s+(?:i\s+)?want to\s+/i, '').trim();
  }

  title = title
    .replace(/\bfrom\s*$/i, '')
    .replace(/\bto\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return title ? titleCaseTitle(title) : '';
}

export function extractParentheticalNotes(value) {
  const matches = [...String(value ?? '').matchAll(/\(([^)]{1,300})\)/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  return matches.length ? matches.join(' ') : null;
}

export function inferCalendarCategoryFromText(value) {
  const text = String(value ?? '').toLowerCase();
  if (/\b(science|study|studying|lesson|learning|exam|homework|matematica|studio|studiare)\b/.test(text)) return 'Study';
  if (/\b(doctor|dentist|medical|hospital|health|recovery|lunch|meal|eat|eating|pranzo|cena|dinner)\b/.test(text)) return 'Health';
  if (/\b(gym|workout|boxing|cardio|training|sport|sports|palestra|allenamento)\b/.test(text)) return 'Workout';
  if (/\b(work|coding|business|content|client|money)\b/.test(text)) return 'Work';
  if (/\b(errand|errands|appointment|shopping|take .+ somewhere|logistics)\b/.test(text)) return 'Errands';
  if (/\b(mom|mother|dad|father|family|friend|friends|girlfriend|dinner with)\b/.test(text)) return 'Social';
  if (/\b(movie|game|games|leisure|fun|entertainment)\b/.test(text)) return 'Entertainment';
  if (/\b(journal|journaling|admin|routine|planning|chores?|sveglia|wake up)\b/.test(text)) return 'Personal';
  if (/\b(sleep|nap|bedtime)\b/.test(text)) return 'Sleep';
  return 'Personal';
}

export function countExplicitTimeRanges(message) {
  const text = String(message ?? '');
  const regexMatches = [...text.matchAll(new RegExp(TIME_RANGE_PATTERN_SOURCE, 'gi'))].length;
  const segmentMatches = splitExplicitScheduleSegments(text).length;
  return Math.max(regexMatches, segmentMatches);
}

export function countDayScheduleItems(message) {
  return splitDayScheduleSegments(message).length;
}

function hasDayScheduleLanguage(message) {
  const text = String(message ?? '').trim().toLowerCase();
  return /(?:^|\b)(?:segna|programma|pianifica)\s+(?:la\s+)?giornata/.test(text)
    || /\b(?:log|plan|schedule)\s+(?:my\s+)?day\b/.test(text)
    || /^(?:plan|schedule|log)\s+(?:today|oggi)\s*:/.test(text)
    || /^(?:today|oggi)\s*:/.test(text);
}

function hasMixedPointAndRangeItems(message) {
  const text = String(message ?? '').toLowerCase();
  if (/\b(remind me|remember to|ricordami|memo|expense|spesa|euro|euros|eur)\b/.test(text)) return false;
  const segments = splitDayScheduleSegments(message);
  const hasRange = segments.some((segment) => Boolean(extractDayScheduleRange(segment)));
  const hasPoint = segments.some((segment) => !extractDayScheduleRange(segment) && Boolean(extractDaySchedulePoint(segment)));
  return hasRange && hasPoint;
}

export function looksLikeMultiItemScheduleMessage(message) {
  const text = String(message ?? '').toLowerCase();
  if (countDayScheduleItems(message) < 2) return false;
  if (/\b(remind me|remember to|ricordami|memo|expense|spesa|euro|euros|eur)\b/.test(text)) return false;
  const hasScheduleAction = /\b(plan|schedule|add|create|log|programma|pianifica|segna)\b/.test(text);
  const hasDayReference = /\b(today|tomorrow|oggi|domani|day|giornata)\b/.test(text);
  return hasMixedPointAndRangeItems(message) || hasScheduleAction || hasDayReference;
}

export function looksLikeAnalysisRequest(text) {
  return /\b(analy[sz]e|review|summari[sz]e|insights?|how (?:have|am|is|are)|last week|last month|last 30 days|more productive)\b/.test(text);
}

export function looksLikeExpenseOrHealthRequest(text) {
  return /\b(expense|euro|euros|eur|dollar|dollars|usd|€|\$|water|energy|coffee|adc|sleep|wake|brush|shower|creatine|skin|journal)\b/.test(text);
}

export function formatExpenseSuccess(expense) {
  return `Added expense: ${expense.vendor} - EUR ${formatMoney(expense.amount)} - ${expense.category} - ${expense.spent_on}.`;
}

export function formatCalendarSuccess(event) {
  const timeRange = event.start_time && event.end_time
    ? ` - ${formatTime(event.start_time)}-${formatTime(event.end_time)}`
    : event.start_time
      ? ` - ${formatTime(event.start_time)}`
      : '';
  return `Added calendar event: ${event.title} - ${event.event_date}${timeRange}.`;
}

export function formatMemoSuccess(memo) {
  const due = memo.memo_date
    ? ` - ${memo.memo_date}${memo.memo_time ? ` ${formatTime(memo.memo_time)}` : ''}`
    : '';
  return `Created memo: ${memo.title}${due}.`;
}

export function formatCalendarEventsSuccess(targetDate, result) {
  const lines = [
    `Created ${result.created.length} calendar events for ${targetDate}:`,
    ...result.created.map((event) => `- ${event.title} - ${formatCalendarEventTimeRange(event)} - ${event.category || 'Uncategorized'}`),
  ];

  if (result.skipped.length) {
    lines.push('', `Skipped ${result.skipped.length} event${result.skipped.length === 1 ? '' : 's'}:`);
    lines.push(...result.skipped.map((event) => `- ${event.title || 'Untitled'} - ${event.reason || 'Invalid event'}`));
  }

  return lines.join('\n');
}

export function formatDayScheduleSuccess(targetDate, result, message) {
  const names = result.created.map((event) => event.title).join(', ');
  const skipped = result.skipped.length ? ` ${result.skipped.length} item${result.skipped.length === 1 ? '' : 's'} could not be created.` : '';
  if (/\b(?:segna|giornata|oggi|pranzo|cena|palestra|sveglia)\b/i.test(message)) {
    return `Ho creato ${result.created.length} eventi per ${targetDate}: ${names}.${skipped}`;
  }
  return `Created ${result.created.length} calendar events for ${targetDate}: ${names}.${skipped}`;
}

export function dayScheduleClarification(message) {
  if (/\b(?:segna|giornata|oggi|pranzo|cena|palestra|sveglia)\b/i.test(message)) {
    return 'Ho capito che vuoi segnare la giornata, ma non sono riuscito a ricavare bene alcuni orari. Scrivila tipo: pranzo 13:30, studio 14:00-16:00.';
  }
  return 'I understood that you want to schedule your day, but I could not read some times. Try: lunch 13:30, study 14:00-16:00.';
}

export function friendlyDayScheduleError(error) {
  const message = error instanceof Error ? error.message : '';
  if (/title is required|start_time is required|end_time must be (?:after|later)|no calendar events|could not extract/i.test(message)) {
    return new HttpError(400, 'I understood that you want to schedule your day, but I could not read some times. Try: lunch 13:30, study 14:00-16:00.');
  }
  return error;
}

export function appendWorkoutReadOnlyConfirmation(answer, message) {
  const text = String(answer ?? '').trim();
  const isItalian = /\b(analizza|dimmi|allenamento|allenare|petto|schiena|gambe|spalle|panca|oggi|prestazioni)\b/i.test(message);
  const confirmation = isItalian ? 'Non ho creato eventi o attività.' : 'No calendar events or activities were created.';
  if (text.toLowerCase().includes(confirmation.toLowerCase())) return text;
  return `${text}\n\n${confirmation}`;
}

export function formatHealthSuccess(updated) {
  const habits = Array.isArray(updated._updatedHabits) ? updated._updatedHabits : [];
  const fields = Array.isArray(updated._changedHealthFields) ? updated._changedHealthFields : [];
  const parts = [];
  if (fields.length) parts.push(fields.join(', '));
  if (habits.length) parts.push(`habits: ${habits.join(', ')}`);
  if (habits.length && (!fields.length || fields.every((field) => field === 'notes'))) {
    return `Updated health habits for ${updated.logged_on}: ${habits.join(', ')}.`;
  }
  if (parts.length) return `Updated health log for ${updated.logged_on}: ${parts.join('; ')}.`;
  return `Updated health log for ${updated.logged_on}.`;
}

export function formatSleepStartSuccess(result) {
  return `Saved: sleep start at ${result.sleep_start}.`;
}

export function formatRecurrenceSuccess(result) {
  const created = result.created ?? [];
  const dates = created.map((event) => event.event_date).sort();
  const start = dates[0] ?? 'unknown date';
  const end = dates[dates.length - 1] ?? start;
  const lines = [`Created ${created.length} calendar events from ${start} to ${end}:`];
  const shown = created.length > 10
    ? [...created.slice(0, 5), ...created.slice(-2)]
    : created;

  lines.push(...shown.map((event) => `- ${event.title} - ${event.event_date} - ${formatCalendarEventTimeRange(event)} - ${event.category || 'Uncategorized'}`));

  if (created.length > shown.length) {
    lines.splice(6, 0, `- ... ${created.length - shown.length} more events ...`);
  }
  if (result.skipped?.length) {
    lines.push('', `Skipped ${result.skipped.length} event${result.skipped.length === 1 ? '' : 's'}:`);
    lines.push(...result.skipped.map((event) => `- ${event.title || 'Untitled'} - ${event.reason || 'Invalid event'}`));
  }

  return lines.join('\n');
}

function formatCalendarEventTimeRange(event) {
  if (event.start_time && event.end_time) return `${formatTime(event.start_time)}-${formatTime(event.end_time)}`;
  if (event.start_time) return formatTime(event.start_time);
  return 'No time';
}

function formatTime(value) {
  return String(value ?? '').slice(0, 5);
}

function formatMoney(value) {
  return Number(value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function proposeCalendarPlan(message, plan, lifeosContext, targetDate, brainContext, brainChat, brainSkill, brainRoute) {
  const prompt = JSON.stringify({
    userMessage: message,
    targetDate,
    range: getRangeWindow(plan.range),
    plan,
    lifeosContext,
    brainRoute: formatBrainRouteForPrompt(brainRoute),
    userMemoryContext: formatBrainContextForPrompt(brainContext),
    recentConversation: formatBrainConversationForPrompt(brainChat),
    workingContext: buildCommandContextForPrompt(brainChat?.workingContext),
    selectedBrainSkill: formatBrainSkillForPrompt(brainSkill?.skill ?? brainSkill),
  });
  const proposal = await generateGeminiJson({ system: PLAN_SYSTEM, prompt, temperature: 0.25 });
  return {
    analysis: String(proposal.analysis ?? '').trim(),
    events: Array.isArray(proposal.events) ? proposal.events : [],
    skipped: Array.isArray(proposal.skipped) ? proposal.skipped : [],
  };
}

export async function answerWithGemini(message, plan, lifeosContext, actions, brainContext, brainChat, brainSkill, brainRoute, brainVault) {
  const prompt = JSON.stringify({
    userMessage: message,
    responseMode: brainChat?.responseMode ?? null,
    channelMetadata: sanitizeValue(brainChat?.channelMetadata ?? null),
    plan,
    lifeosContext,
    actions,
    brainRoute: formatBrainRouteForPrompt(brainRoute),
    userMemoryContext: formatBrainContextForPrompt(brainContext),
    recentConversation: formatBrainConversationForPrompt(brainChat),
    selectedBrainSkill: formatBrainSkillForPrompt(brainSkill?.skill ?? brainSkill),
    relevantBrainVaultContext: brainVault?.formatted ?? formatVaultResultsForPrompt([]),
  });
  return generateGeminiText({ system: ANSWER_SYSTEM, prompt, temperature: 0.25 });
}

export async function answerFollowUpTransform(message, brainChat) {
  const latestAssistant = getLatestAssistantMessage(brainChat);
  if (!latestAssistant) return 'Send me the text you want me to transform, then tell me how to change it.';
  const latestUser = getLatestUserMessageBefore(brainChat, latestAssistant.created_at);
  const prompt = JSON.stringify({
    userMessage: message,
    latestUserMessage: latestUser?.content ?? null,
    latestAssistantAnswer: latestAssistant.content,
    recentConversation: formatBrainConversationForPrompt(brainChat),
  });
  return generateGeminiText({ system: FOLLOW_UP_TRANSFORM_SYSTEM, prompt, temperature: 0.15 });
}

export function getLatestAssistantMessage(brainChat) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === 'assistant' && String(message.content ?? '').trim()) return message;
  }
  return null;
}

function getLatestUserMessageBefore(brainChat, beforeCreatedAt) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  const beforeTime = beforeCreatedAt ? new Date(beforeCreatedAt).getTime() : Number.POSITIVE_INFINITY;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const createdAt = message?.created_at ? new Date(message.created_at).getTime() : 0;
    if (message?.role === 'user' && createdAt <= beforeTime && String(message.content ?? '').trim()) return message;
  }
  return null;
}

export function documentTypesForSkill(skill) {
  const id = skill?.id;
  if (id === 'workout_coach') return ['workout_report', 'life_review', 'brain_answer'];
  if (id === 'project_ops_coach') return ['project_report', 'product_report', 'life_review', 'brain_answer'];
  if (id === 'finance_analyst') return ['finance_report', 'project_report', 'life_review', 'brain_answer'];
  if (id === 'product_builder') return ['product_report', 'project_report', 'brain_answer'];
  if (id === 'life_review') return ['life_review', 'daily_report', 'weekly_report', 'workout_report', 'project_report', 'finance_report'];
  return null;
}

export function isSaveToVaultRequest(message) {
  const text = String(message ?? '').toLowerCase();
  if (!text) return false;
  return /\b(save|turn|convert)\b.*\b(vault|report|note)\b/.test(text)
    || /\b(save this|save it|save that)\b/.test(text)
    || /\b(create|make)\s+(?:a\s+)?(?:workout|project|finance|product|life)?\s*report\b/.test(text)
    || /\bsalva(?:lo|la|re)?\b.*\b(vault|report|nota)\b/.test(text)
    || /\bmetti(?:lo|la)?\b.*\bnel vault\b/.test(text);
}

export function inferVaultDocumentTypeFromMessage(message, brainSkill) {
  const text = String(message ?? '').toLowerCase();
  if (/\bworkout|allenamento|gym|palestra\b/.test(text)) return 'workout_report';
  if (/\bproject|ops|progetto|deep work|ai ofm\b/.test(text)) return 'project_report';
  if (/\bfinance|money|expense|spese|soldi\b/.test(text)) return 'finance_report';
  if (/\bproduct|saas|roadmap|lifeos\b/.test(text)) return 'product_report';
  if (/\blife review|review|weekly|daily|settimana|giornata\b/.test(text)) return 'life_review';
  const skillId = brainSkill?.skill?.id ?? brainSkill?.id;
  if (skillId === 'workout_coach') return 'workout_report';
  if (skillId === 'project_ops_coach') return 'project_report';
  if (skillId === 'finance_analyst') return 'finance_report';
  if (skillId === 'product_builder') return 'product_report';
  if (skillId === 'life_review') return 'life_review';
  return 'brain_answer';
}

export function inferVaultTagsFromSkill(brainSkill) {
  const skillId = brainSkill?.skill?.id ?? brainSkill?.id;
  if (skillId === 'workout_coach') return ['workout'];
  if (skillId === 'project_ops_coach') return ['projects', 'ops'];
  if (skillId === 'finance_analyst') return ['finance'];
  if (skillId === 'product_builder') return ['product', 'lifeos'];
  if (skillId === 'life_review') return ['life_review'];
  return ['brain'];
}

export function formatVaultSaveAnswer(document) {
  const base = `Saved to Vault as "${document.title}".`;
  const result = document.embedding_result;
  if (result?.configured === false && Number(result.skipped ?? 0) > 0) {
    return `${base} Semantic embedding was skipped because GEMINI_API_KEY is missing.`;
  }
  if (Number(result?.failed ?? 0) > 0) {
    return `${base} Embeddings failed for ${result.failed} chunk${Number(result.failed) === 1 ? '' : 's'}; use Re-embed later.`;
  }
  return base;
}

export async function safeLogAiSuccess({ context, message, source, answer, actions, selectedSkill, brainRoute, vaultContext }) {
  if (!Array.isArray(actions) || actions.length === 0) return;
  try {
    await createAiActionLog({
      requestId: context?.requestId,
      source,
      userMessage: message,
      answer,
      status: 'success',
      actionType: inferActionLogType(actions),
      actionCount: countLoggedActions(actions),
      actions: actions.map((action) => ({
        ...sanitizeActionForLog(action),
        ...(selectedSkill ? { selected_skill: selectedSkill } : {}),
        ...(brainRoute ? { brain_route: brainRoute } : {}),
        ...(vaultContext?.retrieved_count ? { vault_context: vaultContext } : {}),
      })),
      recordRefs: extractRecordRefs(actions),
    });
  } catch (error) {
    console.error('[LifeOS AI action log failure]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'success_log',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
  }
}

export async function safeLogAiError({ context, message, source, plan, writePath, error, diagnostics }) {
  try {
    await createAiActionLog({
      requestId: context?.requestId,
      source,
      userMessage: message,
      status: 'error',
      actionType: writePath || plan?.intent,
      actionCount: 0,
      actions: [{
        type: 'error',
        writePath,
        plannerIntent: plan?.intent,
        plannerArgsShape: describeValueShape(plan?.args),
        selected_skill: serializeSkillSelection(context?.brainSkill),
        brain_route: serializeBrainRoute(context?.brainRoute),
        vault_context: serializeVaultContextForMetadata(context?.brainVault?.results),
        details: sanitizeValue(diagnostics?.details),
      }],
      errorMessage: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    });
  } catch (logError) {
    console.error('[LifeOS AI action error log failure]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'error_log',
      error: logError instanceof Error ? logError.message : String(logError ?? 'Unknown error'),
    }));
  }
}

export function inferActionLogType(actions) {
  const first = actions[0];
  if (!first) return null;
  if (first.type === 'create_calendar_events' && first.data?.recurrence) return 'finite_recurring_calendar_events';
  return first.type ?? null;
}

function countLoggedActions(actions) {
  return actions.reduce((count, action) => {
    if (action.type === 'create_calendar_events' || action.type === 'analyze_and_plan') {
      return count + (action.data?.created?.length ?? 0);
    }
    if (action.type?.startsWith('blocked')) return count;
    return count + 1;
  }, 0);
}

function sanitizeActionForLog(action) {
  return sanitizeValue({
    type: action?.type,
    data: action?.data,
    message: action?.message,
  });
}

export function extractRecordRefs(actions) {
  const refs = [];
  for (const action of actions) {
    if (action.type === 'create_expense' && action.data?.id) {
      refs.push({
        table: 'expenses',
        id: action.data.id,
        label: action.data.vendor,
        date: action.data.spent_on,
      });
    }
    if (action.type === 'update_health_log' && action.data?.id) {
      refs.push({
        table: 'health_logs',
        id: action.data.id,
        label: 'Health Log',
        date: action.data.logged_on,
      });
    }
    if (action.type === 'log_sleep_start' && action.data?.health_log?.id) {
      refs.push({
        table: 'health_logs',
        id: action.data.health_log.id,
        label: 'Sleep Start',
        date: action.data.sleep_start_logged_on || action.data.health_log.logged_on,
      });
    }
    if (action.type === 'create_memo' && action.data?.id) {
      refs.push({
        table: 'memos',
        id: action.data.id,
        label: action.data.title,
        date: action.data.memo_date,
      });
    }
    if (['update_memo_status', 'snooze_memo', 'dismiss_memo'].includes(action.type) && action.data?.id) {
      refs.push({
        table: 'memos',
        id: action.data.id,
        label: action.data.title,
        date: action.data.memo_date,
      });
    }
    if (action.type === 'create_calendar_event' && action.data?.id) {
      refs.push(calendarEventRef(action.data));
    }
    if ((action.type === 'create_calendar_events' || action.type === 'analyze_and_plan') && Array.isArray(action.data?.created)) {
      refs.push(...action.data.created.map(calendarEventRef));
    }
    if (action.type === 'create_vault_document' && action.data?.document?.id) {
      refs.push({
        table: 'ai_vault_documents',
        id: action.data.document.id,
        label: action.data.document.title,
        date: action.data.document.created_at,
      });
    }
  }
  return refs.filter((ref) => ref.id).slice(0, 80);
}

function calendarEventRef(event) {
  return {
    table: 'calendar_events',
    id: event.id,
    label: event.title,
    date: event.event_date,
  };
}

export function logAiWriteFailure({ context, message, plan, writePath, error }) {
  const diagnostics = {
    requestId: context?.requestId,
    writePath,
    message: truncate(String(message ?? ''), 1000),
    plannerIntent: plan?.intent,
    plannerNeedsRead: Boolean(plan?.needsRead),
    plannerNeedsWrite: Boolean(plan?.needsWrite),
    plannerArgsShape: describeValueShape(plan?.args),
    plannerArgs: sanitizeValue(plan?.args),
    status: error instanceof HttpError ? error.status : undefined,
    error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    details: sanitizeValue(error?.details),
  };

  console.error('[LifeOS AI write failure]', JSON.stringify(diagnostics));
  return diagnostics;
}

export function logAiPlannerFailure({ context, message, error }) {
  const diagnostics = {
    requestId: context?.requestId,
    stage: 'planner',
    message: truncate(String(message ?? ''), 1000),
    explicitMultiEventLikely: isObviousExplicitMultiEventCalendarRequest(message),
    dayScheduleLikely: isObviousDayScheduleRequest(message),
    dayScheduleItemCount: countDayScheduleItems(message),
    timeRangeCount: countExplicitTimeRanges(message),
    status: error instanceof HttpError ? error.status : undefined,
    providerStatus: error?.details?.providerStatus,
    error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    details: sanitizeValue(error?.details),
    debugDetails: sanitizeValue(error?.debugDetails),
  };

  console.error('[LifeOS AI planner failure]', JSON.stringify(diagnostics));
  return diagnostics;
}

export function attachDebugDiagnostics(error, diagnostics) {
  if (String(process.env.LIFEOS_DEBUG_AI ?? '').toLowerCase() !== 'true') return;
  if (!(error instanceof HttpError)) return;
  const existingDetails = error.details && typeof error.details === 'object' ? error.details : {};
  error.details = {
    ...existingDetails,
    debug: diagnostics,
  };
}

export function sanitizeValue(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncate(value, 800);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeValue(item, depth + 1),
    ]));
  }
  return String(value);
}

export function describeValueShape(value, depth = 0) {
  if (depth > 3) return 'truncated';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [key, describeValueShape(item, depth + 1)]));
  }
  return typeof value;
}

export function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function titleCaseTitle(value) {
  return String(value ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(value) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function compareDates(a, b) {
  return a.localeCompare(b);
}

function toUtcDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function dayIndex(value) {
  return toUtcDate(value).getUTCDay();
}

export function dayName(value) {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayIndex(value)];
}

export function daysBetween(start, end) {
  return Math.round((toUtcDate(end).getTime() - toUtcDate(start).getTime()) / 86400000);
}

export function addMonthsLocal(dateValue, months) {
  const date = toUtcDate(dateValue);
  date.setUTCMonth(date.getUTCMonth() + months);
  return formatDate(date);
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
