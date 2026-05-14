import { HttpError } from './http.js';
import { getActionUserId, getSupabaseAdmin } from './supabaseAdmin.js';
import {
  assertTimeOrder,
  compactPayload,
  optionalDate,
  optionalInteger,
  optionalNullableInteger,
  optionalNullableNumber,
  optionalNullableTime,
  optionalText,
  normalizeExpenseCategory,
  requiredDate,
  requiredNumber,
  requiredText,
} from './validation.js';

const TIME_ZONE = 'Europe/Rome';
const VALID_TABLES = new Set(['expenses', 'health_logs', 'workouts', 'workout_sets', 'calendar_events', 'daily_reviews']);
const VALID_EVENT_STATUSES = new Set(['planned', 'done', 'skipped', 'cancelled']);
const PREFERRED_CALENDAR_CATEGORIES = ['Work', 'Study', 'School', 'Health', 'Workout', 'Entertainment', 'Sleep'];
const HEALTH_HABITS = [
  { id: 'brush', type: 'count' },
  { id: 'shower', type: 'count' },
  { id: 'creatine', type: 'count' },
  { id: 'skin', type: 'count' },
  { id: 'journal', type: 'boolean' },
];

export function localDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}-${parts.find((part) => part.type === 'day').value}`;
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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
  const allowedIntents = new Set(['analyze', 'create_expense', 'create_calendar_event', 'update_health_log', 'analyze_and_plan', 'clarify', 'unsupported', 'blocked_destructive']);
  const allowedRanges = new Set(['today', 'tomorrow', '7d', '30d', '3m', '6m', '12m', 'all']);
  const intent = allowedIntents.has(plan?.intent) ? plan.intent : 'unsupported';
  const writeIntents = new Set(['create_expense', 'create_calendar_event', 'update_health_log', 'analyze_and_plan']);
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

export async function updateHealthLog(args) {
  const userId = getActionUserId();
  const body = {
    logged_on: resolveDate(args.logged_on ?? args.date, localDate()),
    sleep_hours: args.sleep_hours,
    sleep_start: args.sleep_start,
    wake_time: args.wake_time,
    energy: args.energy,
    water: args.water,
    coffee: args.coffee,
    adc: args.adc,
    notes: args.notes,
  };
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
  });
  if (Object.keys(payload).filter((key) => !['user_id', 'logged_on'].includes(key)).length === 0) {
    throw new HttpError(400, 'At least one health field is required.');
  }
  const { data, error } = await getSupabaseAdmin()
    .from('health_logs')
    .upsert(payload, { onConflict: 'user_id,logged_on' })
    .select('id, logged_on, sleep_hours, sleep_start, wake_time, energy, water, coffee, adc, notes, updated_at')
    .single();
  if (error) throw error;
  return data;
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
  const startTime = optionalNullableTime(body, 'start_time');
  const endTime = optionalNullableTime(body, 'end_time');
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

export async function createCalendarPlanEvents(events, targetDate) {
  const valid = [];
  const skipped = [];
  for (const event of (Array.isArray(events) ? events : []).slice(0, 8)) {
    try {
      const eventDate = resolveDate(event.event_date ?? event.date, targetDate);
      if (targetDate && eventDate !== targetDate) throw new HttpError(400, 'Plan event date did not match requested date.');
      const candidate = {
        ...event,
        event_date: eventDate,
        status: event.status ?? 'planned',
      };
      validatePlanEventDoesNotOverlap(candidate, valid);
      valid.push(candidate);
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
  return PREFERRED_CALENDAR_CATEGORIES.find((category) => category.toLowerCase() === text.toLowerCase()) ?? text;
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
    brushTotal: sumHabit(normalizedLogs, 'brush'),
    showerTotal: sumHabit(normalizedLogs, 'shower'),
    creatineTotal: sumHabit(normalizedLogs, 'creatine'),
    skinTotal: sumHabit(normalizedLogs, 'skin'),
    journalDays: normalizedLogs.filter((habits) => habits.journal).length,
    journalCoverage: `${normalizedLogs.filter((habits) => habits.journal).length}/${logs.length}`,
    recent: normalizedLogs.slice(0, 10),
  };
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
