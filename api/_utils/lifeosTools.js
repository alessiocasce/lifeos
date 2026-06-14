import { HttpError } from './http.js';
import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import { addDays, localDate, localDateTime, localTime } from './date.js';
import { recalculateSleepAfterHealthChange } from './health.js';
import {
  assertTimeOrder,
  compactPayload,
  optionalDate,
  optionalInteger,
  optionalNullableInteger,
  optionalNullableNumber,
  optionalNullableTime,
  optionalTime,
  optionalText,
  normalizeTimeRange,
  normalizeExpenseCategory,
  requiredDate,
  requiredNumber,
  requiredText,
} from './validation.js';

const VALID_TABLES = new Set(['expenses', 'health_logs', 'workouts', 'workout_sets', 'calendar_events', 'daily_reviews', 'memos']);
const VALID_EVENT_STATUSES = new Set(['planned', 'done', 'skipped', 'cancelled']);
const VALID_AI_LOG_SOURCES = new Set(['app', 'shortcut', 'api']);
const VALID_AI_LOG_STATUSES = new Set(['success', 'error']);
const PREFERRED_CALENDAR_CATEGORIES = ['Work', 'Study', 'School', 'Health', 'Workout', 'Errands', 'Personal', 'Social', 'Entertainment', 'Sleep'];
const CALENDAR_CATEGORY_ALIASES = new Map([
  ['errand', 'Errands'],
  ['errands', 'Errands'],
  ['logistics', 'Errands'],
  ['shopping task', 'Errands'],
  ['shopping tasks', 'Errands'],
  ['chores', 'Personal'],
  ['chore', 'Personal'],
  ['personal admin', 'Personal'],
  ['admin', 'Personal'],
  ['routine', 'Personal'],
  ['routines', 'Personal'],
  ['journaling', 'Personal'],
  ['journal', 'Personal'],
  ['family', 'Social'],
  ['friends', 'Social'],
  ['friend', 'Social'],
  ['girlfriend', 'Social'],
  ['social', 'Social'],
  ['gym', 'Workout'],
  ['boxing', 'Workout'],
  ['cardio', 'Workout'],
  ['sport', 'Workout'],
  ['sports', 'Workout'],
  ['sports training', 'Workout'],
  ['doctor', 'Health'],
  ['dentist', 'Health'],
  ['medical', 'Health'],
  ['recovery', 'Health'],
  ['hygiene', 'Health'],
  ['nap', 'Sleep'],
  ['naps', 'Sleep'],
  ['bedtime', 'Sleep'],
  ['sleeping', 'Sleep'],
]);
const HEALTH_HABITS = [
  { id: 'shower', label: 'Shower', type: 'count' },
  { id: 'creatine', label: 'Creatine', type: 'count' },
  { id: 'skin', label: 'Skin', type: 'count' },
  { id: 'journal', label: 'Journal', type: 'boolean' },
];
const HEALTH_HABIT_IDS = new Set(HEALTH_HABITS.map((habit) => habit.id));

export { addDays, localDate, localDateTime, localTime };

export function resolveDate(value, fallback = localDate()) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim().toLowerCase();
  if (text === 'today') return localDate();
  if (text === 'tomorrow') return localDate(1);
  return optionalDate({ value }, 'value', fallback);
}

export function getRangeWindow(range) {
  const end = addDays(localDate(), 1);
  if (range === 'today') return { start: localDate(), end, label: 'today' };
  if (range === 'tomorrow') return { start: localDate(1), end: addDays(localDate(1), 1), label: 'tomorrow' };
  if (range === '7d') return { start: addDays(localDate(), -6), end, label: 'last 7 days' };
  if (range === '3m') return { start: addMonths(localDate(), -3), end, label: 'last 3 months' };
  if (range === '6m') return { start: addMonths(localDate(), -6), end, label: 'last 6 months' };
  if (range === '12m') return { start: addMonths(localDate(), -12), end, label: 'last 12 months' };
  if (range === 'all') return { start: null, end: null, label: 'all available data' };
  return { start: addDays(localDate(), -29), end, label: 'last 30 days' };
}

export function normalizePlannerPlan(plan) {
  const allowedIntents = new Set(['analyze', 'create_expense', 'create_calendar_event', 'create_memo', 'update_health_log', 'analyze_and_plan', 'clarify', 'unsupported', 'blocked_destructive']);
  const allowedRanges = new Set(['today', 'tomorrow', '7d', '30d', '3m', '6m', '12m', 'all']);
  const intent = allowedIntents.has(plan?.intent) ? plan.intent : 'unsupported';
  const writeIntents = new Set(['create_expense', 'create_calendar_event', 'create_memo', 'update_health_log', 'analyze_and_plan']);
  const readIntents = new Set(['analyze', 'analyze_and_plan', 'blocked_destructive']);
  const tables = Array.isArray(plan?.tables)
    ? plan.tables.filter((table) => VALID_TABLES.has(table))
    : [];
  return {
    intent,
    needsRead: Boolean(plan?.needsRead) || readIntents.has(intent),
    needsWrite: Boolean(plan?.needsWrite) || writeIntents.has(intent),
    range: allowedRanges.has(plan?.range) ? plan.range : null,
    tables,
    args: plan?.args && typeof plan.args === 'object' ? plan.args : {},
    clarifyingQuestion: plan?.clarifyingQuestion ? String(plan.clarifyingQuestion).trim() : null,
    riskLevel: ['low', 'medium', 'high'].includes(plan?.riskLevel) ? plan.riskLevel : 'medium',
    reason: plan?.reason ? String(plan.reason).trim() : '',
  };
}

export async function readLifeOSContext(plan) {
  const userId = getActionUserId();
  const client = getSupabaseAdmin();
  const window = getRangeWindow(plan.range);
  const tables = plan.tables.length ? plan.tables : ['expenses', 'health_logs', 'workouts', 'calendar_events', 'daily_reviews'];
  const context = {
    range: window,
    coverage: {},
    summaries: {},
    examples: {},
  };

  if (tables.includes('expenses')) {
    const rows = await queryDateRange(client.from('expenses').select('vendor, category, amount, spent_on, notes').eq('user_id', userId), 'spent_on', window)
      .order('spent_on', { ascending: false })
      .limit(limitForRange(plan.range, 500));
    if (rows.error) throw rows.error;
    const expenses = rows.data ?? [];
    context.coverage.expenses = expenses.length;
    context.summaries.expenses = summarizeExpenses(expenses);
    context.examples.expenses = expenses.slice(0, exampleLimit(plan.range));
  }

  if (tables.includes('health_logs')) {
    const rows = await queryDateRange(client.from('health_logs').select('logged_on, sleep_hours, sleep_start, wake_time, energy, coffee, adc, notes, hygiene').eq('user_id', userId), 'logged_on', window)
      .order('logged_on', { ascending: false })
      .limit(limitForRange(plan.range, 365));
    if (rows.error) throw rows.error;
    const logs = rows.data ?? [];
    context.coverage.health_logs = logs.length;
    context.summaries.health_logs = summarizeHealth(logs);
    context.examples.health_logs = logs.slice(0, exampleLimit(plan.range)).map(formatHealthExample);
  }

  if (tables.includes('workouts') || tables.includes('workout_sets')) {
    const rows = await queryDateRange(client.from('workouts').select(`
      id,
      name,
      performed_on,
      started_at,
      ended_at,
      notes,
      workout_sets (
        exercise,
        set_number,
        is_warmup,
        weight,
        reps,
        rpe,
        performed_at,
        notes
      )
    `).eq('user_id', userId), 'performed_on', window)
      .order('performed_on', { ascending: false })
      .limit(limitForRange(plan.range, 120));
    if (rows.error) throw rows.error;
    const workouts = rows.data ?? [];
    context.coverage.workouts = workouts.length;
    context.summaries.workouts = summarizeWorkouts(workouts);
    context.examples.workouts = workouts.slice(0, exampleLimit(plan.range)).map((workout) => ({
      ...workout,
      workout_sets: (workout.workout_sets ?? []).slice(0, 16),
    }));
  }

  if (tables.includes('calendar_events')) {
    const rows = await queryDateRange(client.from('calendar_events').select('title, event_date, start_time, end_time, category, status, notes').eq('user_id', userId), 'event_date', window)
      .order('event_date', { ascending: false })
      .order('start_time', { ascending: true })
      .limit(limitForRange(plan.range, 500));
    if (rows.error) throw rows.error;
    const events = rows.data ?? [];
    context.coverage.calendar_events = events.length;
    context.summaries.calendar_events = summarizeCalendar(events);
    context.examples.calendar_events = events.slice(0, exampleLimit(plan.range));
  }

  if (tables.includes('daily_reviews')) {
    const rows = await queryDateRange(client.from('daily_reviews').select('review_on, wins, risks, next_actions, score').eq('user_id', userId), 'review_on', window)
      .order('review_on', { ascending: false })
      .limit(limitForRange(plan.range, 180));
    if (rows.error) throw rows.error;
    const reviews = rows.data ?? [];
    context.coverage.daily_reviews = reviews.length;
    context.summaries.daily_reviews = summarizeReviews(reviews);
    context.examples.daily_reviews = reviews.slice(0, exampleLimit(plan.range));
  }

  return context;
}

export async function createExpense(args) {
  const userId = getActionUserId();
  const body = {
    vendor: args.vendor ?? args.merchant ?? args.name,
    category: normalizeExpenseCategory(args.category),
    amount: args.amount,
    spent_on: resolveDate(args.spent_on ?? args.date, localDate()),
    notes: args.notes,
  };
  const payload = compactPayload({
    user_id: userId,
    vendor: requiredText(body, 'vendor', { max: 120 }),
    category: requiredText(body, 'category', { max: 80 }),
    amount: requiredNumber(body, 'amount', { minExclusive: 0, max: 100000 }),
    spent_on: optionalDate(body, 'spent_on', localDate()),
    notes: optionalText(body.notes, 'notes', { max: 1000 }),
  });
  const { data, error } = await getSupabaseAdmin()
    .from('expenses')
    .insert(payload)
    .select('id, vendor, category, amount, spent_on, notes, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function createMemo(args, userMessage = '') {
  const due = resolveMemoDue(args, userMessage);
  const body = {
    title: args.title ?? args.memo ?? args.reminder ?? args.task,
    memo_date: due.memo_date,
    memo_time: due.memo_time,
    notes: args.notes,
    status: args.status ?? 'open',
  };
  const status = String(body.status ?? 'open').trim();
  if (!['open', 'done', 'dismissed'].includes(status)) {
    throw new HttpError(400, 'status must be open, done, or dismissed.');
  }

  const payload = compactPayload({
    user_id: getActionUserId(),
    title: requiredText(body, 'title', { max: 220 }),
    memo_date: optionalDate(body, 'memo_date', undefined) ?? null,
    memo_time: optionalTime(body, 'memo_time') ?? null,
    notes: optionalText(body.notes, 'notes', { max: 2000 }),
    status,
  });
  const { data, error } = await getSupabaseAdmin()
    .from('memos')
    .insert(payload)
    .select('id, title, memo_date, memo_time, notes, status, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function updateHealthLog(args) {
  const userId = getActionUserId();
  const client = getSupabaseAdmin();
  const loggedOn = resolveDate(args.logged_on ?? args.date, localDate());
  const habitUpdate = extractHealthHabitUpdates(args);
  const hasHabitUpdate = habitUpdate.updatedIds.length > 0;
  const existingLog = hasHabitUpdate ? await readHealthLogForDate(userId, loggedOn) : null;
  const body = {
    logged_on: loggedOn,
    sleep_hours: args.sleep_hours,
    sleep_start: args.sleep_start,
    wake_time: args.wake_time,
    energy: args.energy,
    water: args.water,
    coffee: args.coffee,
    adc: args.adc,
    notes: args.notes,
  };
  const hygiene = hasHabitUpdate ? mergeHealthHabitUpdates(existingLog?.hygiene, habitUpdate.updates) : undefined;
  const payload = compactPayload({
    user_id: userId,
    logged_on: optionalDate(body, 'logged_on', localDate()),
    sleep_hours: optionalNullableNumber(body, 'sleep_hours', { min: 0, max: 24 }),
    sleep_start: optionalNullableTime(body, 'sleep_start'),
    wake_time: optionalNullableTime(body, 'wake_time'),
    energy: optionalNullableInteger(body, 'energy', { min: 1, max: 10 }),
    water: optionalInteger(body, 'water', { min: 0, max: 100 }),
    coffee: optionalInteger(body, 'coffee', { min: 0, max: 100 }),
    adc: optionalInteger(body, 'adc', { min: 0, max: 100 }),
    notes: optionalText(body.notes, 'notes', { max: 2000 }),
    hygiene,
  });
  if (Object.keys(payload).filter((key) => !['user_id', 'logged_on'].includes(key)).length === 0) {
    throw new HttpError(400, 'At least one health field is required.');
  }
  const changedFields = Object.keys(payload).filter((key) => !['user_id', 'logged_on', 'hygiene'].includes(key));
  const { data, error } = await client
    .from('health_logs')
    .upsert(payload, { onConflict: 'user_id,logged_on' })
    .select('id, logged_on, sleep_hours, sleep_start, wake_time, energy, water, coffee, adc, notes, hygiene, updated_at')
    .single();
  if (error) throw error;
  await recalculateSleepAfterHealthChange(client, userId, loggedOn, changedFields);
  const { data: refreshed, error: refreshError } = await client
    .from('health_logs')
    .select('id, logged_on, sleep_hours, sleep_start, wake_time, energy, water, coffee, adc, notes, hygiene, updated_at')
    .eq('id', data.id)
    .single();
  if (refreshError) throw refreshError;
  return {
    ...refreshed,
    _updatedHabits: habitUpdate.updatedIds,
    _changedHealthFields: changedFields,
  };
}

export async function createAiActionLog(payload) {
  const userId = getActionUserId();
  const source = VALID_AI_LOG_SOURCES.has(payload.source) ? payload.source : 'api';
  const status = VALID_AI_LOG_STATUSES.has(payload.status) ? payload.status : 'success';
  const actionCount = Math.max(0, Math.trunc(Number(payload.action_count ?? payload.actionCount ?? 0)) || 0);
  const row = compactPayload({
    user_id: userId,
    request_id: optionalText(payload.request_id ?? payload.requestId, 'request_id', { max: 120 }),
    source,
    user_message: optionalText(payload.user_message ?? payload.userMessage, 'user_message', { max: 4000 }),
    answer: optionalText(payload.answer, 'answer', { max: 8000 }),
    status,
    action_type: optionalText(payload.action_type ?? payload.actionType, 'action_type', { max: 120 }),
    action_count: actionCount,
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    record_refs: Array.isArray(payload.record_refs ?? payload.recordRefs) ? (payload.record_refs ?? payload.recordRefs) : [],
    error_message: optionalText(payload.error_message ?? payload.errorMessage, 'error_message', { max: 2000 }),
  });
  const { data, error } = await getSupabaseAdmin()
    .from('ai_action_logs')
    .insert(row)
    .select('id, request_id, source, user_message, answer, status, action_type, action_count, actions, record_refs, error_message, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function listAiActionLogs({ limit = 10 } = {}) {
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(Number(limit)) || 10));
  const { data, error } = await getSupabaseAdmin()
    .from('ai_action_logs')
    .select('id, request_id, source, user_message, answer, status, action_type, action_count, actions, record_refs, error_message, created_at')
    .eq('user_id', getActionUserId())
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return data ?? [];
}

export async function createCalendarEvent(args) {
  const status = args.status ? String(args.status).trim() : 'planned';
  if (!VALID_EVENT_STATUSES.has(status)) {
    throw new HttpError(400, 'status must be planned, done, skipped, or cancelled.');
  }
  const body = {
    title: args.title ?? args.name,
    event_date: resolveDate(args.event_date ?? args.date, args.range === 'tomorrow' ? localDate(1) : localDate()),
    start_time: args.start_time,
    end_time: args.end_time,
    category: normalizeCalendarCategory(args.category),
    location: args.location,
    notes: args.notes,
  };
  const { startTime, endTime } = normalizeTimeRange(body, 'start_time', 'end_time');
  assertTimeOrder(startTime, endTime);
  const payload = compactPayload({
    user_id: getActionUserId(),
    title: requiredText(body, 'title', { max: 160 }),
    event_date: requiredDate(body, 'event_date'),
    start_time: startTime,
    end_time: endTime,
    category: optionalText(body.category, 'category', { max: 80 }),
    location: optionalText(body.location, 'location', { max: 200 }),
    notes: optionalText(body.notes, 'notes', { max: 2000 }),
    status,
  });
  const { data, error } = await getSupabaseAdmin()
    .from('calendar_events')
    .insert(payload)
    .select('id, title, event_date, start_time, end_time, category, location, notes, status, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function createCalendarPlanEvents(events, targetDate, options = {}) {
  const maxEvents = options.maxEvents ?? 8;
  const enforceTargetDate = options.enforceTargetDate ?? Boolean(targetDate);
  const allowOverlaps = options.allowOverlaps ?? false;
  const valid = [];
  const skipped = [];
  for (const event of (Array.isArray(events) ? events : []).slice(0, maxEvents)) {
    try {
      const eventDate = resolveDate(event.event_date ?? event.date, targetDate);
      if (enforceTargetDate && targetDate && eventDate !== targetDate) throw new HttpError(400, 'Plan event date did not match requested date.');
      const candidate = {
        ...event,
        event_date: eventDate,
        status: event.status ?? 'planned',
      };
      const { startTime, endTime } = normalizeTimeRange(candidate, 'start_time', 'end_time');
      const normalizedCandidate = {
        ...candidate,
        start_time: startTime,
        end_time: endTime,
      };
      if (!allowOverlaps) validatePlanEventDoesNotOverlap(normalizedCandidate, valid);
      valid.push(normalizedCandidate);
    } catch (error) {
      skipped.push({ title: event?.title ?? 'Untitled', reason: error.message || 'Invalid event.' });
    }
  }

  const created = [];
  for (const event of valid) {
    created.push(await createCalendarEvent(event));
  }
  return { created, skipped };
}

function normalizeCalendarCategory(value) {
  if (value === undefined || value === null || value === '') return value;
  const text = String(value).trim();
  const normalized = text.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const category = PREFERRED_CALENDAR_CATEGORIES.find((item) => item.toLowerCase() === normalized);
  if (category) return category;
  if (CALENDAR_CATEGORY_ALIASES.has(normalized)) return CALENDAR_CATEGORY_ALIASES.get(normalized);
  if (/\b(doctor|dentist|medical|recovery|hygiene)\b/.test(normalized)) return 'Health';
  if (/\b(gym|boxing|cardio|sport|sports|training)\b/.test(normalized)) return 'Workout';
  if (/\b(family|friend|friends|girlfriend)\b/.test(normalized)) return 'Social';
  if (/\b(errand|errands|logistics|appointment|shopping)\b/.test(normalized)) return 'Errands';
  if (/\b(journal|journaling|admin|chore|chores|routine|planning)\b/.test(normalized)) return 'Personal';
  if (/\b(nap|naps|bedtime|sleep)\b/.test(normalized)) return 'Sleep';
  return text;
}

function resolveMemoDue(args = {}, userMessage = '') {
  const relative = parseRelativeMemoOffset(args.relative_time ?? args.relativeTime ?? userMessage);
  if (relative !== null) {
    const resolved = localDateTime(relative);
    return { memo_date: resolved.date, memo_time: resolved.time };
  }

  const rawDate = args.memo_date ?? args.date ?? args.due_date;
  const rawTime = args.memo_time ?? args.time ?? args.due_time;
  const memoTime = rawTime === undefined || rawTime === null || rawTime === ''
    ? null
    : optionalTime({ memo_time: rawTime }, 'memo_time');

  if (rawDate !== undefined && rawDate !== null && rawDate !== '') {
    return {
      memo_date: resolveDate(rawDate, localDate()),
      memo_time: memoTime,
    };
  }

  if (memoTime) {
    const todayDate = localDate();
    const memoDate = timeToMinutes(memoTime) >= timeToMinutes(localTime()) ? todayDate : addDays(todayDate, 1);
    return { memo_date: memoDate, memo_time: memoTime };
  }

  if (/\btomorrow\b/i.test(userMessage)) return { memo_date: localDate(1), memo_time: null };
  if (/\btoday\b/i.test(userMessage)) return { memo_date: localDate(), memo_time: null };

  return { memo_date: null, memo_time: null };
}

function parseRelativeMemoOffset(value) {
  const text = String(value ?? '').toLowerCase();
  const match = text.match(/\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(minutes?|mins?|hours?|hrs?)\b/);
  if (!match) return null;
  const amount = parseCountWord(match[1]);
  if (!amount) return null;
  return match[2].startsWith('hour') || match[2].startsWith('hr') ? amount * 60 : amount;
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

function queryDateRange(query, column, window) {
  let nextQuery = query;
  if (window.start) nextQuery = nextQuery.gte(column, window.start);
  if (window.end) nextQuery = nextQuery.lt(column, window.end);
  return nextQuery;
}

function summarizeExpenses(expenses) {
  const total = sum(expenses, 'amount');
  return {
    totalSpend: round(total),
    count: expenses.length,
    byCategory: topEntries(groupSum(expenses, 'category', 'amount'), 8),
    byVendor: topEntries(groupSum(expenses, 'vendor', 'amount'), 8),
    largest: expenses.slice().sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 8),
    recent: expenses.slice(0, 8),
  };
}

function summarizeHealth(logs) {
  const habitStats = summarizeHealthHabits(logs);
  return {
    count: logs.length,
    averageSleep: average(logs, 'sleep_hours'),
    averageEnergy: average(logs, 'energy'),
    totalCoffee: sum(logs, 'coffee'),
    totalAdc: sum(logs, 'adc'),
    habits: habitStats,
    notesExamples: logs.map((log) => log.notes).filter(Boolean).slice(0, 6),
  };
}

function formatHealthExample(log) {
  return {
    logged_on: log.logged_on,
    sleep_hours: log.sleep_hours,
    sleep_start: log.sleep_start,
    wake_time: log.wake_time,
    energy: log.energy,
    coffee: log.coffee,
    adc: log.adc,
    habits: normalizeHealthHabits(log.hygiene),
    notes: log.notes,
  };
}

function summarizeHealthHabits(logs) {
  const normalizedLogs = logs.map((log) => normalizeHealthHabits(log.hygiene));
  return {
    showerTotal: sumHabit(normalizedLogs, 'shower'),
    creatineTotal: sumHabit(normalizedLogs, 'creatine'),
    skinTotal: sumHabit(normalizedLogs, 'skin'),
    journalDays: normalizedLogs.filter((habits) => habits.journal).length,
    journalCoverage: `${normalizedLogs.filter((habits) => habits.journal).length}/${logs.length}`,
    recent: normalizedLogs.slice(0, 10),
  };
}

async function readHealthLogForDate(userId, loggedOn) {
  const { data, error } = await getSupabaseAdmin()
    .from('health_logs')
    .select('id, hygiene')
    .eq('user_id', userId)
    .eq('logged_on', loggedOn)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function extractHealthHabitUpdates(args = {}) {
  const updates = {};
  collectHabitUpdates(updates, args.habits, 'explicit');
  collectHabitUpdates(updates, args.hygiene, 'explicit');

  for (const habit of HEALTH_HABITS) {
    if (Object.prototype.hasOwnProperty.call(args, habit.id)) {
      setHabitUpdate(updates, habit.id, args[habit.id], 'explicit');
    }
  }

  collectHabitUpdatesFromNotes(updates, args.notes);

  return {
    updates,
    updatedIds: Object.keys(updates),
  };
}

function collectHabitUpdates(updates, value, source) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const id = normalizeHabitId(item.id ?? item.name ?? item.label);
      if (!id) continue;
      const rawValue = item.type === 'boolean' ? item.done ?? item.count : item.count ?? item.done ?? item.value;
      setHabitUpdate(updates, id, rawValue, source);
    }
    return;
  }
  if (typeof value === 'object') {
    for (const [key, rawValue] of Object.entries(value)) {
      const id = normalizeHabitId(key);
      if (id) setHabitUpdate(updates, id, rawValue, source);
    }
  }
}

function collectHabitUpdatesFromNotes(updates, notes) {
  const text = String(notes ?? '').toLowerCase();
  if (!text) return;
  if (/\b(creatine|took creatine|taken creatine|had creatine)\b/.test(text)) {
    setHabitUpdate(updates, 'creatine', true, 'phrase');
  }
  if (/\b(showered|shower|took a shower|had a shower)\b/.test(text)) {
    setHabitUpdate(updates, 'shower', true, 'phrase');
  }
  if (/\b(skincare|skin care|did skin|skin routine)\b/.test(text)) {
    setHabitUpdate(updates, 'skin', true, 'phrase');
  }
  if (/\b(journaled|wrote journal|wrote in my journal|did journal|journal)\b/.test(text)) {
    setHabitUpdate(updates, 'journal', true, 'phrase');
  }
}

function setHabitUpdate(updates, id, value, source) {
  if (!HEALTH_HABIT_IDS.has(id) || value === undefined || value === null || value === '') return;
  const habit = HEALTH_HABITS.find((item) => item.id === id);
  if (habit.type === 'boolean') {
    updates[id] = { mode: 'set', value: normalizeBooleanHabitValue(value) };
    return;
  }

  if (source === 'phrase' || value === true || String(value).toLowerCase() === 'true') {
    updates[id] = { mode: 'increment', value: 1 };
    return;
  }
  if (value === false || String(value).toLowerCase() === 'false') {
    updates[id] = { mode: 'set', value: 0 };
    return;
  }

  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new HttpError(400, `${id} habit count must be a non-negative integer.`);
  }
  updates[id] = { mode: 'set', value: count };
}

function mergeHealthHabitUpdates(existingItems, updates) {
  const current = normalizeHealthHabits(existingItems);
  const tracked = HEALTH_HABITS.map((habit) => {
    const update = updates[habit.id];
    if (habit.type === 'boolean') {
      const done = update ? Boolean(update.value) : Boolean(current[habit.id]);
      return {
        id: habit.id,
        label: habit.label,
        type: habit.type,
        done,
      };
    }

    const currentCount = Math.max(0, Math.trunc(Number(current[habit.id] ?? 0) || 0));
    const nextCount = update?.mode === 'increment'
      ? currentCount + 1
      : update
        ? Math.max(0, Math.trunc(Number(update.value) || 0))
        : currentCount;
    return {
      id: habit.id,
      label: habit.label,
      type: habit.type,
      count: nextCount,
    };
  });
  const trackedIds = new Set(HEALTH_HABITS.map((habit) => habit.id));
  const legacyItems = (Array.isArray(existingItems) ? existingItems : [])
    .filter((item) => item?.id && !trackedIds.has(item.id));
  return [...tracked, ...legacyItems];
}

function normalizeHealthHabits(items = []) {
  const safeItems = Array.isArray(items) ? items : [];
  const byId = new Map(safeItems.map((item) => [item.id, item]));
  return HEALTH_HABITS.reduce((acc, habit) => {
    const item = byId.get(habit.id) ?? {};
    if (habit.type === 'boolean') {
      acc[habit.id] = Boolean(item.done) || Number(item.count ?? 0) > 0;
    } else {
      acc[habit.id] = Math.max(0, Math.trunc(Number(item.count ?? (item.done ? 1 : 0)) || 0));
    }
    return acc;
  }, {});
}

function normalizeHabitId(value) {
  const text = String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (['shower', 'showered'].includes(text)) return 'shower';
  if (['creatine'].includes(text)) return 'creatine';
  if (['skin', 'skincare', 'skin care'].includes(text)) return 'skin';
  if (['journal', 'journaled', 'journaling'].includes(text)) return 'journal';
  return HEALTH_HABIT_IDS.has(text) ? text : '';
}

function normalizeBooleanHabitValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const text = String(value ?? '').trim().toLowerCase();
  if (['false', 'no', 'not done', '0'].includes(text)) return false;
  return Boolean(text);
}

function sumHabit(logs, id) {
  return logs.reduce((total, habits) => total + Number(habits[id] ?? 0), 0);
}

function summarizeWorkouts(workouts) {
  const sets = workouts.flatMap((workout) => (workout.workout_sets ?? []).map((set) => ({ ...set, workout: workout.name, performed_on: workout.performed_on })));
  const workingSets = sets.filter((set) => !set.is_warmup);
  return {
    sessions: workouts.length,
    workingSets: workingSets.length,
    warmupSets: sets.length - workingSets.length,
    volume: round(workingSets.reduce((total, set) => total + Number(set.weight ?? 0) * Number(set.reps ?? 0), 0)),
    exercises: [...new Set(workingSets.map((set) => set.exercise).filter(Boolean))].slice(0, 20),
    recent: workouts.slice(0, 6).map((workout) => ({
      name: workout.name,
      performed_on: workout.performed_on,
      workingSets: (workout.workout_sets ?? []).filter((set) => !set.is_warmup).length,
    })),
    bestEstimatedOneRm: topEntries(
      workingSets.reduce((acc, set) => {
        const value = Number(set.weight ?? 0) * (1 + Number(set.reps ?? 0) / 30);
        acc[set.exercise] = Math.max(acc[set.exercise] ?? 0, value);
        return acc;
      }, {}),
      8,
    ),
  };
}

function summarizeCalendar(events) {
  return {
    count: events.length,
    byDay: Object.entries(events.reduce((acc, event) => {
      acc[event.event_date] = (acc[event.event_date] ?? 0) + 1;
      return acc;
    }, {})).slice(0, 14),
    byStatus: Object.entries(events.reduce((acc, event) => {
      acc[event.status ?? 'planned'] = (acc[event.status ?? 'planned'] ?? 0) + 1;
      return acc;
    }, {})),
    upcomingOrRecent: events.slice(0, 10),
  };
}

function summarizeReviews(reviews) {
  return {
    count: reviews.length,
    averageScore: average(reviews, 'score'),
    risksExamples: reviews.map((review) => review.risks).filter(Boolean).slice(0, 8),
    winsExamples: reviews.map((review) => review.wins).filter(Boolean).slice(0, 8),
    nextActions: reviews.flatMap((review) => Array.isArray(review.next_actions) ? review.next_actions : []).filter(Boolean).slice(0, 20),
  };
}

function validatePlanEventDoesNotOverlap(event, accepted) {
  const start = event.start_time;
  const end = event.end_time;
  if (!start || !end) return;
  assertTimeOrder(start, end);
  const eventStart = timeToMinutes(start);
  const eventEnd = timeToMinutes(end);
  const overlaps = accepted.some((existing) => {
    if (existing.event_date !== event.event_date || !existing.start_time || !existing.end_time) return false;
    return eventStart < timeToMinutes(existing.end_time) && eventEnd > timeToMinutes(existing.start_time);
  });
  if (overlaps) throw new HttpError(400, 'Plan event overlaps another proposed event.');
}

function limitForRange(range, max) {
  if (range === 'all') return Math.min(max, 500);
  if (['3m', '6m', '12m'].includes(range)) return Math.min(max, 300);
  return Math.min(max, 120);
}

function exampleLimit(range) {
  if (range === 'all') return 8;
  if (['3m', '6m', '12m'].includes(range)) return 10;
  return 20;
}

function groupSum(rows, key, amountKey) {
  return rows.reduce((acc, row) => {
    const label = row[key] || 'Uncategorized';
    acc[label] = (acc[label] ?? 0) + Number(row[amountKey] ?? 0);
    return acc;
  }, {});
}

function topEntries(object, count) {
  return Object.entries(object)
    .map(([label, value]) => ({ label, value: round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count);
}

function sum(rows, key) {
  return round(rows.reduce((total, row) => total + Number(row[key] ?? 0), 0));
}

function average(rows, key) {
  const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
  if (!values.length) return null;
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

function round(value) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function addMonths(dateValue, months) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
