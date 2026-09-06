import { addDays, localDate, localRangeToUtcWindow, startOfLocalDayUtcIso } from './date.js';
import { safePreview, sanitizeTraceValue } from './brainTrace.js';
import { searchBrainVault } from './brainVault.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { compileLifeOSContext } from './lifeosContextCompiler.js';
import { buildWorkoutIntelligence } from './workoutIntelligence.js';

const MAX_DAYS = 30;
const DEFAULT_DAYS = 7;
const MAX_LIMIT = 100;
const WORKOUT_SET_QUERY_LIMIT = 600;
const SECRET_KEY_PATTERN = /(authorization|bearer|token|secret|password|service[_-]?role|api[_-]?key|gemini|supabase)/i;

export function clampMcpLimit(value, defaultValue = 20, maxValue = MAX_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(Math.trunc(parsed), 1), Math.max(1, maxValue));
}

export function clampMcpDays(value, defaultValue = DEFAULT_DAYS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_DAYS);
}

export function sanitizeMcpOutput(value, depth = 0) {
  if (depth > 8) return '[truncated]';
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 1600 ? `${value.slice(0, 1600)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 120).map((item) => sanitizeMcpOutput(item, depth + 1));
  if (typeof value !== 'object') return String(value);

  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    output[key] = sanitizeMcpOutput(entry, depth + 1);
  }
  // Counts describe the final serialized payload, including nested workout caps.
  if (Array.isArray(output.sets)) {
    const before = value.sets.length;
    if ('returned_set_count' in value) output.returned_set_count = output.sets.length;
    output.sets_truncated = Boolean(value.sets_truncated || before > output.sets.length);
  }
  if (Array.isArray(output.workouts) && 'returned_set_count' in value) {
    const count = output.workouts.reduce((sum, workout) => sum + (workout.sets?.length || 0), 0);
    output.returned_set_count = count;
    output.sets_truncated = Boolean(value.sets_truncated || count < value.returned_set_count);
  }
  return output;
}

export async function getLifeosSnapshot({ userId, days = DEFAULT_DAYS } = {}) {
  const normalizedDays = clampMcpDays(days);
  const [
    today,
    week,
    workouts,
    health,
    memos,
    calendar,
    projects,
    brain,
    outbox,
  ] = await Promise.all([
    getTodaySummary({ userId }),
    getWeekSummary({ userId, days: normalizedDays }),
    getRecentWorkouts({ userId, days: normalizedDays, limit: 8 }),
    getHealthSummary({ userId, days: normalizedDays }),
    getOpenMemos({ userId, limit: 12 }),
    getUpcomingCalendar({ userId, days: normalizedDays, limit: 12 }),
    getProjectsStatus({ userId, limit: 8 }),
    getBrainDebugContext({ userId, limit: 5 }),
    getWhatsappOutboxRecent({ userId, limit: 5 }),
  ]);

  return sanitizeMcpOutput({
    generated_at: new Date().toISOString(),
    scope: { days: normalizedDays, timezone: 'Europe/Rome' },
    today,
    week,
    workouts,
    health,
    memos,
    calendar,
    projects,
    brain_debug: brain,
    whatsapp_outbox: outbox,
    open_loops: await getOpenLoops({ userId, days: normalizedDays, limit: 20 }),
  });
}

export async function getLifeosContextSnapshot({ userId, days = DEFAULT_DAYS, limit = 30 } = {}) {
  return sanitizeMcpOutput(await compileLifeOSContext({
    userId,
    days: clampMcpDays(days),
    limit: clampMcpLimit(limit, 30, 80),
  }));
}

export async function getTodaySummary({ userId } = {}) {
  const today = localDate();
  const client = getSupabaseAdmin();
  const [health, workouts, memos, events, sessions] = await Promise.all([
    selectMaybeSingle(client.from('health_logs').select(healthSelect()).eq('user_id', userId).eq('logged_on', today)),
    selectMany(client.from('workouts').select(workoutSelect()).eq('user_id', userId).eq('performed_on', today).order('started_at', { ascending: false }).limit(10)),
    selectMany(client.from('memos').select(memoSelect()).eq('user_id', userId).eq('memo_date', today).neq('status', 'done').order('memo_time', { ascending: true }).limit(20)),
    selectMany(client.from('calendar_events').select(calendarSelect()).eq('user_id', userId).eq('event_date', today).neq('status', 'cancelled').order('start_time', { ascending: true }).limit(20)),
    selectMany(client.from('project_sessions').select(projectSessionSelect()).eq('user_id', userId).gte('started_at', startOfLocalDayUtcIso(today)).order('started_at', { ascending: false }).limit(20)),
  ]);

  return sanitizeMcpOutput({
    date: today,
    health,
    workouts: summarizeWorkouts(workouts),
    open_memos: memos.map(compactMemo),
    calendar: events.map(compactCalendarEvent),
    project_minutes: sumNumbers(sessions.map((row) => row.duration_minutes)),
    project_sessions: sessions.map(compactProjectSession),
  });
}

export async function getWeekSummary({ userId, days = DEFAULT_DAYS } = {}) {
  const normalizedDays = clampMcpDays(days);
  const end = localDate();
  const start = addDays(end, -(normalizedDays - 1));
  const sessionWindow = localRangeToUtcWindow({ startDate: start, endDate: end });
  const [health, workouts, sessions, memosDone] = await Promise.all([
    getHealthSummary({ userId, days: normalizedDays }),
    getRecentWorkouts({ userId, days: normalizedDays, limit: 30 }),
    selectMany(getSupabaseAdmin().from('project_sessions').select(projectSessionSelect()).eq('user_id', userId).gte('started_at', sessionWindow.start).lte('started_at', sessionWindow.end).order('started_at', { ascending: false }).limit(100)),
    selectMany(getSupabaseAdmin().from('memos').select(memoSelect()).eq('user_id', userId).eq('status', 'done').gte('memo_date', start).lte('memo_date', end).limit(50)),
  ]);

  return sanitizeMcpOutput({
    range: { start, end, days: normalizedDays },
    health_summary: health.summary,
    workout_count: workouts.workouts.length,
    workout_names: workouts.workouts.map((workout) => workout.name),
    project_minutes: sumNumbers(sessions.map((row) => row.duration_minutes)),
    project_session_count: sessions.length,
    completed_memos: memosDone.length,
  });
}

export async function getRecentWorkouts({ userId, days = DEFAULT_DAYS, limit = 20 } = {}) {
  const normalizedDays = clampMcpDays(days);
  const maxRows = clampMcpLimit(limit, 20, 50);
  const end = localDate();
  const start = addDays(end, -(normalizedDays - 1));
  const client = getSupabaseAdmin();
  const workouts = await selectMany(
    client
      .from('workouts')
      .select(workoutSelect())
      .eq('user_id', userId)
      .gte('performed_on', start)
      .lte('performed_on', end)
      .order('performed_on', { ascending: false })
      .order('started_at', { ascending: false })
      .limit(maxRows),
  );
  const workoutIds = workouts.map((row) => row.id).filter(Boolean);
  const sets = workoutIds.length
    ? await selectMany(client.from('workout_sets').select(workoutSetSelect()).eq('user_id', userId).in('workout_id', workoutIds).order('performed_at', { ascending: true }).limit(WORKOUT_SET_QUERY_LIMIT))
    : [];
  const setsByWorkout = groupBy(sets, 'workout_id');
  const truncation = getWorkoutSetTruncationInfo(sets.length, WORKOUT_SET_QUERY_LIMIT);

  return sanitizeMcpOutput({
    range: { start, end, days: normalizedDays },
    ...truncation,
    workouts: workouts.map((workout) => compactWorkout(workout, setsByWorkout.get(workout.id) ?? [])),
  });
}

export async function getWorkoutIntelligence({ userId, days = 30, limit = 30 } = {}) {
  const normalizedDays = clampMcpDays(days, 30);
  const maxRows = clampMcpLimit(limit, 30, 50);
  const end = localDate();
  const start = addDays(end, -(normalizedDays - 1));
  const client = getSupabaseAdmin();
  const [workouts, healthLogs] = await Promise.all([
    selectMany(
      client
        .from('workouts')
        .select(workoutSelect())
        .eq('user_id', userId)
        .gte('performed_on', start)
        .lte('performed_on', end)
        .order('performed_on', { ascending: false })
        .order('started_at', { ascending: false })
        .limit(maxRows),
    ),
    selectMany(
      client
        .from('health_logs')
        .select(healthSelect())
        .eq('user_id', userId)
        .gte('logged_on', start)
        .lte('logged_on', end)
        .order('logged_on', { ascending: false })
        .limit(normalizedDays + 2),
    ),
  ]);
  const workoutIds = workouts.map((row) => row.id).filter(Boolean);
  const sets = workoutIds.length
    ? await selectMany(client.from('workout_sets').select(workoutSetSelect()).eq('user_id', userId).in('workout_id', workoutIds).order('performed_at', { ascending: true }).limit(WORKOUT_SET_QUERY_LIMIT))
    : [];
  const truncation = getWorkoutSetTruncationInfo(sets.length, WORKOUT_SET_QUERY_LIMIT);

  return sanitizeMcpOutput({
    range: { start, end, days: normalizedDays },
    ...truncation,
    intelligence: buildWorkoutIntelligence({
      workouts,
      sets,
      healthLogs,
      days: normalizedDays,
      maxExercises: 14,
    }),
  });
}

export function getWorkoutSetTruncationInfo(returnedSetCount, setLimit = WORKOUT_SET_QUERY_LIMIT) {
  const returned = Math.max(0, Math.trunc(Number(returnedSetCount)) || 0);
  const limit = Math.max(1, Math.trunc(Number(setLimit)) || WORKOUT_SET_QUERY_LIMIT);
  return {
    sets_truncated: returned >= limit,
    set_limit: limit,
    returned_set_count: returned,
  };
}

export async function getHealthSummary({ userId, days = DEFAULT_DAYS } = {}) {
  const normalizedDays = clampMcpDays(days);
  const end = localDate();
  const start = addDays(end, -(normalizedDays - 1));
  const logs = await selectMany(
    getSupabaseAdmin()
      .from('health_logs')
      .select(healthSelect())
      .eq('user_id', userId)
      .gte('logged_on', start)
      .lte('logged_on', end)
      .order('logged_on', { ascending: false })
      .limit(normalizedDays + 2),
  );
  const sleepValues = logs.filter((row) => row.sleep_hours != null && row.sleep_hours !== '').map((row) => Number(row.sleep_hours)).filter(Number.isFinite);
  const energyValues = logs.filter((row) => row.energy != null && row.energy !== '').map((row) => Number(row.energy)).filter(Number.isFinite);

  return sanitizeMcpOutput({
    range: { start, end, days: normalizedDays },
    summary: {
      logged_days: logs.length,
      average_sleep_hours: average(sleepValues),
      average_energy: average(energyValues),
      latest_sleep_start: logs.find((row) => row.sleep_start)?.sleep_start ?? null,
      latest_wake_time: logs.find((row) => row.wake_time)?.wake_time ?? null,
    },
    logs: logs.map(compactHealthLog),
  });
}

export async function getOpenMemos({ userId, limit = 30 } = {}) {
  const rows = await selectMany(
    getSupabaseAdmin()
      .from('memos')
      .select(memoSelect())
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('memo_date', { ascending: true, nullsFirst: false })
      .order('memo_time', { ascending: true, nullsFirst: false })
      .limit(clampMcpLimit(limit, 30, 80)),
  );
  return sanitizeMcpOutput({ memos: rows.map(compactMemo) });
}

export async function getUpcomingCalendar({ userId, days = DEFAULT_DAYS, limit = 30 } = {}) {
  const normalizedDays = clampMcpDays(days);
  const start = localDate();
  const end = addDays(start, normalizedDays);
  const rows = await selectMany(
    getSupabaseAdmin()
      .from('calendar_events')
      .select(calendarSelect())
      .eq('user_id', userId)
      .gte('event_date', start)
      .lte('event_date', end)
      .neq('status', 'cancelled')
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(clampMcpLimit(limit, 30, 80)),
  );
  return sanitizeMcpOutput({ range: { start, end, days: normalizedDays }, events: rows.map(compactCalendarEvent) });
}

export async function getProjectsStatus({ userId, limit = 20 } = {}) {
  const maxRows = clampMcpLimit(limit, 20, 50);
  const client = getSupabaseAdmin();
  const projects = await selectMany(
    client
      .from('projects')
      .select(projectSelect())
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(maxRows),
  );
  const projectIds = projects.map((row) => row.id).filter(Boolean);
  const sessions = projectIds.length
    ? await selectMany(client.from('project_sessions').select(projectSessionSelect()).eq('user_id', userId).in('project_id', projectIds).order('started_at', { ascending: false }).limit(100))
    : [];
  const sessionsByProject = groupBy(sessions, 'project_id');

  return sanitizeMcpOutput({
    projects: projects.map((project) => compactProject(project, sessionsByProject.get(project.id) ?? [])),
  });
}

export async function getBrainDebugContext({ userId, limit = 10 } = {}) {
  const maxRows = clampMcpLimit(limit, 10, 40);
  const [messages, actions] = await Promise.all([
    selectMany(
      getSupabaseAdmin()
        .from('ai_chat_messages')
        .select('id, thread_id, role, content, request_id, action_type, metadata, created_at')
        .eq('user_id', userId)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(maxRows),
    ),
    getRecentActionLogs({ userId, limit: Math.min(maxRows, 20) }),
  ]);

  return sanitizeMcpOutput({
    traces: messages.map(compactBrainTraceMessage),
    recent_action_logs: actions.logs,
  });
}

export async function getRecentActionLogs({ userId, limit = 20 } = {}) {
  const rows = await selectMany(
    getSupabaseAdmin()
      .from('ai_action_logs')
      .select('id, request_id, source, action_type, action_count, status, record_refs, error_message, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(clampMcpLimit(limit, 20, 80)),
  );
  return sanitizeMcpOutput({ logs: rows.map(compactActionLog) });
}

export async function getWhatsappOutboxRecent({ userId, limit = 20 } = {}) {
  const rows = await selectMany(
    getSupabaseAdmin()
      .from('brain_outbox_messages')
      .select('id, channel, recipient, body, status, priority, rule_key, source_type, source_id, scheduled_for, expires_at, claimed_at, sent_at, failed_at, attempts, last_error, metadata, created_at, updated_at')
      .eq('user_id', userId)
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false })
      .limit(clampMcpLimit(limit, 20, 80)),
  );
  return sanitizeMcpOutput({ messages: rows.map(compactOutboxMessage) });
}

export async function getWhatsappProactiveDebug({ userId, limit = 30 } = {}) {
  const rows = await selectMany(
    getSupabaseAdmin()
      .from('brain_outbox_messages')
      .select('id, channel, recipient, body, status, priority, rule_key, source_type, source_id, scheduled_for, expires_at, claimed_at, sent_at, failed_at, attempts, last_error, ack_metadata, metadata, created_at, updated_at')
      .eq('user_id', userId)
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false })
      .limit(clampMcpLimit(limit, 30, 100)),
  );
  return sanitizeMcpOutput({
    generated_at: new Date().toISOString(),
    counts_by_status: countBy(rows, 'status'),
    messages: rows.map(compactProactiveDebugOutboxMessage),
  });
}

export async function searchVaultForMcp({ userId, query, limit = 5 } = {}) {
  const text = String(query ?? '').trim();
  if (!text) return { query: '', results: [], note: 'A non-empty query is required.' };
  const maxRows = clampMcpLimit(limit, 5, 10);
  const results = await searchBrainVault({ userId, query: text, matchCount: maxRows, matchThreshold: 0.18 });
  if (results.length) {
    return sanitizeMcpOutput({
      query: text,
      results: results.map((row) => ({
        document_id: row.document_id,
        chunk_id: row.chunk_id,
        title: row.title,
        document_type: row.document_type,
        similarity: row.similarity,
        summary: row.summary,
        tags: row.tags,
        excerpt: safePreview(row.content, 500),
        created_at: row.created_at,
      })),
    });
  }
  const recent = await getRecentVaultDocuments({ userId, limit: maxRows });
  return sanitizeMcpOutput({
    query: text,
    results: [],
    fallback_recent_documents: recent.documents,
    note: 'No semantic Vault chunks matched. Gemini embeddings may be unavailable, not configured, or no chunks are ready.',
  });
}

export async function getRecentVaultDocuments({ userId, limit = 10 } = {}) {
  const rows = await selectMany(
    getSupabaseAdmin()
      .from('ai_vault_documents')
      .select('id, title, document_type, source_type, summary, tags, entities, links, status, metadata, created_at, updated_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(clampMcpLimit(limit, 10, 30)),
  );
  return sanitizeMcpOutput({ documents: rows.map(compactVaultDocument) });
}

export async function getOpenLoops({ userId, days = DEFAULT_DAYS, limit = 30 } = {}) {
  const context = await compileLifeOSContext({
    userId,
    days: clampMcpDays(days),
    limit: clampMcpLimit(limit, 30, 80),
  });
  return sanitizeMcpOutput(context.open_loops);
}

function healthSelect() {
  return 'id, logged_on, sleep_hours, sleep_start, wake_time, sleep_quality, energy, coffee, water, mood, notes, hygiene, created_at, updated_at';
}

function workoutSelect() {
  return 'id, name, performed_on, started_at, ended_at, template_id, notes, created_at, updated_at';
}

function workoutSetSelect() {
  return 'id, workout_id, exercise, set_number, is_warmup, weight, reps, rpe, performed_at, notes';
}

function memoSelect() {
  return 'id, title, memo_date, memo_time, notes, status, created_at, updated_at';
}

function calendarSelect() {
  return 'id, title, event_date, start_time, end_time, category, location, notes, status, created_at, updated_at';
}

function projectSelect() {
  return 'id, name, status, goal_type, goal_label, target_value, current_value, unit_label, overall_cost, started_on, notes, created_at, updated_at';
}

function projectSessionSelect() {
  return 'id, project_id, started_at, ended_at, duration_minutes, target_output, proof_of_work, progress_delta, created_at';
}

async function selectMany(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data ?? [];
}

async function selectMaybeSingle(query) {
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return result.data ?? null;
}

function compactHealthLog(row) {
  return {
    id: row.id,
    logged_on: row.logged_on,
    sleep_hours: row.sleep_hours,
    sleep_start: row.sleep_start,
    wake_time: row.wake_time,
    sleep_quality: row.sleep_quality,
    energy: row.energy,
    coffee: row.coffee,
    water: row.water,
    mood: row.mood,
    hygiene: row.hygiene,
    notes: safePreview(row.notes, 400),
  };
}

export function compactWorkout(workout, sets) {
  const orderedSets = [...sets].map(compactWorkoutSet).sort(compareWorkoutSets);
  const exercises = new Map();
  for (const set of orderedSets) {
    const key = set.exercise || 'Unknown';
    const entry = exercises.get(key) ?? {
      exercise: key,
      set_count: 0,
      working_set_count: 0,
      warmup_set_count: 0,
      top_weight: null,
      top_set: null,
      total_reps: 0,
      rep_values: [],
      rpe_values: [],
      sets: [],
    };
    entry.set_count += 1;
    if (set.is_warmup) entry.warmup_set_count += 1;
    else entry.working_set_count += 1;
    if (isFiniteMetric(set.weight) && (entry.top_weight === null || Number(set.weight) > Number(entry.top_weight))) {
      entry.top_weight = Number(set.weight);
      entry.top_set = set;
    }
    if (isFiniteMetric(set.reps)) entry.total_reps += Number(set.reps);
    if (isFiniteMetric(set.reps)) entry.rep_values.push(Number(set.reps));
    if (isFiniteMetric(set.rpe)) entry.rpe_values.push(Number(set.rpe));
    entry.sets.push(set);
    exercises.set(key, entry);
  }
  const duration = calculateDurationMinutes(workout.started_at, workout.ended_at);
  return {
    id: workout.id,
    name: workout.name,
    performed_on: workout.performed_on,
    started_at: workout.started_at,
    ended_at: workout.ended_at,
    duration_minutes: duration.duration_minutes,
    ...(duration.duration_warning ? { duration_warning: duration.duration_warning } : {}),
    notes: safePreview(workout.notes, 300),
    set_count: orderedSets.length,
    exercise_count: exercises.size,
    exercises: [...exercises.values()].map((entry) => ({
      exercise: entry.exercise,
      set_count: entry.set_count,
      working_set_count: entry.working_set_count,
      warmup_set_count: entry.warmup_set_count,
      top_weight: entry.top_weight,
      top_set: entry.top_set,
      total_reps: entry.total_reps,
      average_reps: average(entry.rep_values),
      average_rpe: average(entry.rpe_values),
      sets: entry.sets.sort(compareWorkoutSets),
    })),
    sets: orderedSets,
  };
}

function compactWorkoutSet(set) {
  return {
    id: set.id,
    workout_id: set.workout_id,
    exercise: set.exercise || 'Unknown',
    set_number: set.set_number,
    is_warmup: Boolean(set.is_warmup),
    weight: set.weight,
    reps: set.reps,
    rpe: set.rpe,
    performed_at: set.performed_at,
    notes: safePreview(set.notes, 240),
  };
}

function compareWorkoutSets(a, b) {
  return String(a.exercise || '').localeCompare(String(b.exercise || ''))
    || compareNullableNumber(a.set_number, b.set_number)
    || String(a.performed_at || '').localeCompare(String(b.performed_at || ''))
    || String(a.id || '').localeCompare(String(b.id || ''));
}

function compareNullableNumber(a, b) {
  const left = Number(a);
  const right = Number(b);
  const leftFinite = Number.isFinite(left);
  const rightFinite = Number.isFinite(right);
  if (leftFinite && rightFinite) return left - right;
  if (leftFinite) return -1;
  if (rightFinite) return 1;
  return 0;
}

function isFiniteMetric(value) {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
}

function calculateDurationMinutes(startedAt, endedAt) {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (!startedAt || !endedAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { duration_minutes: null };
  }
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes > 12 * 60) return { duration_minutes: null, duration_warning: 'duration_out_of_range' };
  return { duration_minutes: minutes };
}

function summarizeWorkouts(workouts) {
  return workouts.map((workout) => ({
    id: workout.id,
    name: workout.name,
    performed_on: workout.performed_on,
    started_at: workout.started_at,
  }));
}

function compactMemo(row) {
  return {
    id: row.id,
    title: row.title,
    memo_date: row.memo_date,
    memo_time: row.memo_time,
    status: row.status,
    notes: safePreview(row.notes, 300),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function compactCalendarEvent(row) {
  return {
    id: row.id,
    title: row.title,
    event_date: row.event_date,
    start_time: row.start_time,
    end_time: row.end_time,
    category: row.category,
    location: row.location,
    status: row.status,
    notes: safePreview(row.notes, 300),
  };
}

function compactProject(project, sessions) {
  const minutes = sumNumbers(sessions.map((row) => row.duration_minutes));
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    goal_type: project.goal_type,
    goal_label: project.goal_label,
    target_value: project.target_value,
    current_value: project.current_value,
    unit_label: project.unit_label,
    started_on: project.started_on,
    notes: safePreview(project.notes, 300),
    recent_session_count: sessions.length,
    recent_minutes: minutes,
    last_session_at: sessions[0]?.started_at ?? null,
    recent_sessions: sessions.slice(0, 5).map(compactProjectSession),
  };
}

function compactProjectSession(row) {
  return {
    id: row.id,
    project_id: row.project_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    duration_minutes: row.duration_minutes,
    target_output: safePreview(row.target_output, 300),
    proof_of_work: safePreview(row.proof_of_work, 300),
    progress_delta: row.progress_delta,
  };
}

function compactBrainTraceMessage(row) {
  const trace = row.metadata?.brain_trace ?? {};
  const sanitizedTrace = sanitizeTraceValue(trace);
  return {
    message_id: row.id,
    thread_id: row.thread_id,
    created_at: row.created_at,
    request_id: row.request_id,
    action_type: row.action_type,
    assistant_preview: safePreview(row.content, 300),
    trace_id: sanitizedTrace?.trace_id ?? null,
    source: sanitizedTrace?.source ?? row.metadata?.source ?? null,
    route: sanitizedTrace?.route ?? null,
    selected_skill: sanitizedTrace?.selected_skill ?? row.metadata?.selected_skill ?? null,
    pending_action: sanitizedTrace?.pending_action ?? null,
    pending_reply_intent: sanitizedTrace?.pending_reply_intent ?? null,
    pending_resolution: sanitizedTrace?.pending_resolution ?? null,
    command_draft: sanitizedTrace?.command_draft ?? null,
    working_context: sanitizedTrace?.working_context ?? null,
    vault: sanitizedTrace?.vault ?? null,
    tools: sanitizedTrace?.tools ?? [],
    auto_save: sanitizedTrace?.auto_save ?? null,
    final_response_type: sanitizedTrace?.final_response_type ?? null,
    error_code: sanitizedTrace?.error_code ?? null,
    latency_ms: sanitizedTrace?.latency_ms ?? null,
  };
}

function compactActionLog(row) {
  return {
    id: row.id,
    request_id: row.request_id,
    source: row.source,
    action_type: row.action_type,
    action_count: row.action_count,
    status: row.status,
    record_refs: sanitizeTraceValue(row.record_refs),
    error_message: safePreview(row.error_message, 300),
    created_at: row.created_at,
  };
}

function compactOutboxMessage(row) {
  return {
    id: row.id,
    channel: row.channel,
    recipient: row.recipient,
    body_preview: safePreview(row.body, 300),
    status: row.status,
    priority: row.priority,
    rule_key: row.rule_key,
    source_type: row.source_type,
    source_id: row.source_id,
    scheduled_for: row.scheduled_for,
    expires_at: row.expires_at,
    claimed_at: row.claimed_at,
    sent_at: row.sent_at,
    failed_at: row.failed_at,
    attempts: row.attempts,
    last_error: safePreview(row.last_error, 300),
    metadata: sanitizeTraceValue(row.metadata),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function compactProactiveDebugOutboxMessage(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.id,
    channel: row.channel,
    recipient: row.recipient,
    canonical_recipient: metadata.whatsapp_recipient_canonical || row.recipient,
    raw_recipient: metadata.whatsapp_recipient_raw || null,
    body_preview: safePreview(row.body, 120),
    status: row.status,
    priority: row.priority,
    rule_key: row.rule_key,
    source_type: row.source_type,
    source_id: row.source_id,
    scheduled_for: row.scheduled_for,
    expires_at: row.expires_at,
    claimed_at: row.claimed_at,
    sent_at: row.sent_at,
    failed_at: row.failed_at,
    attempts: row.attempts,
    last_error: safePreview(row.last_error, 240),
    ack_metadata: sanitizeTraceValue(summarizeAckMetadata(row.ack_metadata)),
    proactive_trace: sanitizeTraceValue(metadata.proactive_trace ?? null),
    resolution: metadata.resolution ? {
      type: safePreview(metadata.resolution.type, 40),
      resolved_at: safePreview(metadata.resolution.resolved_at, 40),
      source_closed: metadata.resolution.source_closed === true,
    } : null,
    delivery_revalidation: metadata.delivery_revalidation ? {
      reason: safePreview(metadata.delivery_revalidation.reason, 80),
      cancelled_at: safePreview(metadata.delivery_revalidation.cancelled_at, 40),
    } : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function summarizeAckMetadata(value) {
  const metadata = value && typeof value === 'object' ? value : {};
  return {
    bridge_id: metadata.bridge_id ?? null,
    provider_message_id: metadata.provider_message_id ? '[present]' : null,
    outbox_ack_transition: metadata.outbox_ack_transition ?? null,
    outbox_claim_transition: metadata.outbox_claim_transition ?? null,
    outbox_reclaim_transition: metadata.outbox_reclaim_transition ?? null,
    claimed_at: metadata.claimed_at ?? null,
    acked_at: metadata.acked_at ?? null,
    last_failed_at: metadata.last_failed_at ?? null,
    retry: metadata.retry ?? null,
    retry_after: metadata.retry_after ?? null,
    retry_delay_minutes: metadata.retry_delay_minutes ?? null,
    assistant_message_id: metadata.assistant_message_id ?? null,
  };
}

function compactVaultDocument(row) {
  return {
    id: row.id,
    title: row.title,
    document_type: row.document_type,
    source_type: row.source_type,
    summary: safePreview(row.summary, 500),
    tags: row.tags,
    entities: row.entities,
    links: row.links,
    status: row.status,
    metadata: sanitizeTraceValue(row.metadata),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    const list = map.get(value) ?? [];
    list.push(row);
    map.set(value, list);
  }
  return map;
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row?.[key] || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function sumNumbers(values) {
  return values.reduce((sum, value) => Number.isFinite(Number(value)) ? sum + Number(value) : sum, 0);
}

function average(values) {
  if (!values.length) return null;
  return Math.round((sumNumbers(values) / values.length) * 10) / 10;
}
