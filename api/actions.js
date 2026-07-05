import {
  HttpError,
  createRequestContext,
  handleApiError,
  handleOptions,
  readJsonBody,
  requireActionAuth,
  requirePost,
  sendSuccess,
} from './_utils/http.js';
import { localDate, localTime } from './_utils/date.js';
import { applyHabitUpdate, normalizeHabitId } from './_utils/habits.js';
import { recalculateSleepAfterHealthChange, recalculateSleepHoursForDate } from './_utils/health.js';
import { logSleepStart, readSleepStartLoggedOn, readSleepStartTime, resolveSleepStartLoggedOn } from './_utils/healthActions.js';
import { getActionUserId, getSupabaseAdmin } from './_utils/supabaseAdmin.js';
import {
  assertTimeOrder,
  compactPayload,
  normalizeExpenseCategory,
  normalizeTimeRange,
  optionalDate,
  optionalInteger,
  optionalNullableInteger,
  optionalNullableNumber,
  optionalNullableTime,
  optionalText,
  optionalTime,
  requiredNumber,
  requiredText,
  today,
} from './_utils/validation.js';

const HEALTH_LOG_SELECT = `
  id,
  user_id,
  logged_on,
  sleep_hours,
  sleep_start,
  wake_time,
  sleep_quality,
  energy,
  coffee,
  water,
  adc,
  mood,
  social_time_minutes,
  main_time_waster,
  notes,
  hygiene,
  created_at,
  updated_at
`;

const VALID_CALENDAR_STATUSES = new Set(['planned', 'done', 'skipped', 'cancelled']);
const ACTION_ALIASES = new Map([
  ['expense', 'expense'],
  ['expenses', 'expense'],
  ['health', 'health'],
  ['wake', 'wake'],
  ['wake-time', 'wake'],
  ['wake_time', 'wake'],
  ['sleep-start', 'sleep-start'],
  ['sleep_start', 'sleep-start'],
  ['sleepstart', 'sleep-start'],
  ['habit', 'habit'],
  ['habits', 'habit'],
  ['calendar', 'calendar'],
  ['event', 'calendar'],
]);

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    requireActionAuth(req);

    const queryAction = getQueryAction(req);
    const body = await readJsonBody(req);
    const action = resolveActionName(queryAction || body.action);
    if (!action) {
      throw new HttpError(400, 'action must be one of expense, health, wake, sleep-start, habit, or calendar.');
    }

    const result = await ACTION_HANDLERS[action](body);
    sendSuccess(res, result.status, result.data, context);
  } catch (error) {
    handleApiError(res, error, context);
  }
}

export function resolveActionName(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return ACTION_ALIASES.get(key) ?? null;
}

async function createExpense(body) {
  const userId = getActionUserId();
  const payload = compactPayload({
    user_id: userId,
    vendor: requiredText(body, 'vendor', { max: 120 }),
    category: requiredText({ category: normalizeExpenseCategory(body.category) }, 'category', { max: 80 }),
    amount: requiredNumber(body, 'amount', { minExclusive: 0, max: 100000 }),
    spent_on: optionalDate(body, 'spent_on', today()),
    notes: optionalText(body.notes, 'notes', { max: 1000 }),
  });

  const { data, error } = await getSupabaseAdmin()
    .from('expenses')
    .insert(payload)
    .select('id, user_id, vendor, category, amount, spent_on, notes, created_at, updated_at')
    .single();

  if (error) throw error;
  return { status: 201, data };
}

async function updateHealth(body) {
  const userId = getActionUserId();
  const client = getSupabaseAdmin();
  const payload = compactPayload({
    user_id: userId,
    logged_on: optionalDate(body, 'logged_on', today()),
    sleep_hours: optionalNullableNumber(body, 'sleep_hours', { min: 0, max: 24 }),
    sleep_start: optionalNullableTime(body, 'sleep_start'),
    wake_time: optionalNullableTime(body, 'wake_time'),
    energy: optionalNullableInteger(body, 'energy', { min: 1, max: 10 }),
    water: optionalInteger(body, 'water', { min: 0, max: 100 }),
    coffee: optionalInteger(body, 'coffee', { min: 0, max: 100 }),
    adc: optionalInteger(body, 'adc', { min: 0, max: 100 }),
    notes: optionalText(body.notes, 'notes', { max: 2000 }),
  });

  const changedFields = Object.keys(payload).filter((key) => !['user_id', 'logged_on'].includes(key));
  const { data, error } = await client
    .from('health_logs')
    .upsert(payload, { onConflict: 'user_id,logged_on' })
    .select(HEALTH_LOG_SELECT)
    .single();

  if (error) throw error;
  await recalculateSleepAfterHealthChange(client, userId, payload.logged_on, changedFields);
  const { data: refreshed, error: refreshError } = await client
    .from('health_logs')
    .select(HEALTH_LOG_SELECT)
    .eq('id', data.id)
    .single();
  if (refreshError) throw refreshError;
  return { status: 200, data: refreshed };
}

async function logWake(body) {
  const userId = getActionUserId();
  const loggedOn = optionalDate(body, 'logged_on', localDate());
  const wakeTime = readWakeTime(body);
  const notes = optionalText(body.notes, 'notes', { max: 1000 });
  const supabase = getSupabaseAdmin();

  const { data: existing, error: readError } = await supabase
    .from('health_logs')
    .select('id, notes')
    .eq('user_id', userId)
    .eq('logged_on', loggedOn)
    .maybeSingle();
  if (readError) throw readError;

  let query;
  if (existing) {
    const payload = { wake_time: wakeTime };
    if (notes && !existing.notes) payload.notes = notes;
    query = supabase
      .from('health_logs')
      .update(payload)
      .eq('id', existing.id)
      .eq('user_id', userId);
  } else {
    query = supabase
      .from('health_logs')
      .insert({
        user_id: userId,
        logged_on: loggedOn,
        wake_time: wakeTime,
        ...(notes ? { notes } : {}),
      });
  }

  const { data, error } = await query
    .select(HEALTH_LOG_SELECT)
    .single();
  if (error) throw error;

  await recalculateSleepHoursForDate(supabase, userId, loggedOn);
  const { data: refreshed, error: refreshError } = await supabase
    .from('health_logs')
    .select(HEALTH_LOG_SELECT)
    .eq('id', data.id)
    .single();
  if (refreshError) throw refreshError;
  return { status: 200, data: refreshed };
}

async function logSleepStartAction(body) {
  const sleepStart = readSleepStartTime(body);
  const loggedOn = readSleepStartLoggedOn(body, sleepStart);
  const notes = optionalText(body.notes, 'notes', { max: 1000 });
  const result = await logSleepStart({ time: sleepStart, loggedOn, notes });
  return { status: 200, data: result };
}

async function logHabit(body) {
  const habit = normalizeHabitId(body.habit);
  if (!habit) throw new HttpError(400, 'habit must be one of shower, creatine, skin.');
  const loggedOn = optionalDate(body, 'logged_on', localDate());
  const time = readHabitTime(body);
  const amount = optionalInteger(body, 'amount', { min: 0, max: 100 }) ?? 1;
  const mode = String(body.mode ?? 'increment').trim().toLowerCase();
  if (!['increment', 'set'].includes(mode)) {
    throw new HttpError(400, 'mode must be increment or set.');
  }

  const userId = getActionUserId();
  const supabase = getSupabaseAdmin();
  const { data: existing, error: readError } = await supabase
    .from('health_logs')
    .select('id, hygiene')
    .eq('user_id', userId)
    .eq('logged_on', loggedOn)
    .maybeSingle();
  if (readError) throw readError;

  const hygiene = applyHabitUpdate(existing?.hygiene, { habit, amount, mode, time });
  const query = existing
    ? supabase.from('health_logs').update({ hygiene }).eq('id', existing.id).eq('user_id', userId)
    : supabase.from('health_logs').insert({ user_id: userId, logged_on: loggedOn, hygiene });
  const { data, error } = await query.select(HEALTH_LOG_SELECT).single();
  if (error) throw error;

  return {
    status: 200,
    data: {
      health_log: data,
      habit,
      logged_on: loggedOn,
      time,
      mode,
      amount,
      entry: hygiene[habit],
    },
  };
}

async function createCalendarEvent(body) {
  const status = body.status === undefined || body.status === null || body.status === ''
    ? 'planned'
    : String(body.status).trim();
  if (!VALID_CALENDAR_STATUSES.has(status)) {
    throw new HttpError(400, 'status must be planned, done, skipped, or cancelled.');
  }

  const userId = getActionUserId();
  const { startTime, endTime } = normalizeTimeRange(body, 'start_time', 'end_time');
  assertTimeOrder(startTime, endTime);

  const payload = compactPayload({
    user_id: userId,
    title: requiredText(body, 'title', { max: 160 }),
    event_date: optionalDate(body, 'event_date', localDate()),
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
    .select('id, user_id, title, event_date, start_time, end_time, category, location, notes, status, created_at, updated_at')
    .single();

  if (error) throw error;
  return { status: 201, data };
}

function getQueryAction(req) {
  if (req.query?.action) return req.query.action;
  const host = req.headers?.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `https://${host}`);
  return url.searchParams.get('action');
}

function readWakeTime(body) {
  const value = body.time ?? body.wake_time ?? body.wakeTime;
  if (value === undefined || value === null || value === '') {
    throw new HttpError(400, 'time is required.');
  }
  try {
    return optionalTime({ wake_time: value }, 'wake_time');
  } catch {
    throw new HttpError(400, 'time must be a valid wake time such as 08:37.');
  }
}

function readHabitTime(body) {
  if (body.time === undefined || body.time === null || body.time === '') return localTime();
  try {
    return optionalTime({ time: body.time }, 'time');
  } catch {
    throw new HttpError(400, 'time must be a valid habit time such as 09:37.');
  }
}

const ACTION_HANDLERS = {
  expense: createExpense,
  health: updateHealth,
  wake: logWake,
  'sleep-start': logSleepStartAction,
  habit: logHabit,
  calendar: createCalendarEvent,
};

export { resolveSleepStartLoggedOn };
