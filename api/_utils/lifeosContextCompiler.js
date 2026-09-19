import { addDays, localDate, localRangeToUtcWindow, TIME_ZONE } from './date.js';
import { safePreview } from './brainTrace.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { serializeBeliefForContext } from './brainBeliefs.js';

const SECRET_KEY_PATTERN = /(authorization|bearer|token|secret|password|service[_-]?role|api[_-]?key|gemini|supabase)/i;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const PROJECT_STALE_DAYS = 7;
const PROJECT_SESSION_LOOKBACK_DAYS = 45;
const OUTBOX_CLAIM_STALE_MINUTES = 10;

const SEVERITY_RANK = {
  high: 300,
  medium: 200,
  low: 100,
};

const TYPE_RANK = {
  failed_action: 80,
  whatsapp_outbox_issue: 75,
  overdue_memo: 70,
  brain_pending_action: 65,
  active_project_session: 60,
  due_today_memo: 55,
  project_session_carryover: 50,
  stale_project: 45,
  calendar_prep: 40,
  unscheduled_memo: 30,
  recovery_gap: 25,
  workout_gap: 15,
};

export async function compileLifeOSContext({ userId, days = DEFAULT_DAYS, limit = DEFAULT_LIMIT, now = new Date(), client = getSupabaseAdmin() } = {}) {
  if (!userId) throw new Error('userId is required to compile LifeOS context.');
  const normalizedDays = clampCompilerDays(days);
  const maxRows = clampCompilerLimit(limit, DEFAULT_LIMIT, MAX_LIMIT);
  const rows = await loadLifeOSContextRows({ client, userId, days: normalizedDays, now, limit: maxRows });
  return buildLifeOSContext({ rows, days: normalizedDays, limit: maxRows, now });
}

export async function loadLifeOSContextRows({ client = getSupabaseAdmin(), userId, days = DEFAULT_DAYS, now = new Date(), limit = DEFAULT_LIMIT } = {}) {
  const { today, future } = buildContextWindow({ now, days });
  const recentStart = addDays(today, -Math.max(days, PROJECT_SESSION_LOOKBACK_DAYS));
  const recentWindow = localRangeToUtcWindow({ startDate: recentStart, endDate: future });
  const maxRows = clampCompilerLimit(limit, DEFAULT_LIMIT, MAX_LIMIT);

  const [
    memos,
    calendarEvents,
    projects,
    projectSessions,
    healthLogs,
    workouts,
    actionLogs,
    outboxMessages,
    brainMessages,
    beliefs,
  ] = await Promise.all([
    selectMany(client.from('memos').select(memoSelect()).eq('user_id', userId).eq('status', 'open').order('memo_date', { ascending: true, nullsFirst: false }).order('memo_time', { ascending: true, nullsFirst: false }).limit(Math.max(maxRows, 80))),
    selectMany(client.from('calendar_events').select(calendarSelect()).eq('user_id', userId).gte('event_date', today).lte('event_date', future).neq('status', 'cancelled').order('event_date', { ascending: true }).order('start_time', { ascending: true }).limit(Math.max(maxRows, 80))),
    selectMany(client.from('projects').select(projectSelect()).eq('user_id', userId).in('status', ['active', 'paused']).order('updated_at', { ascending: false }).limit(60)),
    selectMany(client.from('project_sessions').select(projectSessionSelect()).eq('user_id', userId).gte('started_at', recentWindow.start).lte('started_at', recentWindow.end).order('started_at', { ascending: false }).limit(160)),
    selectMany(client.from('health_logs').select(healthSelect()).eq('user_id', userId).gte('logged_on', addDays(today, -(days - 1))).lte('logged_on', today).order('logged_on', { ascending: false }).limit(days + 2)),
    selectMany(client.from('workouts').select(workoutSelect()).eq('user_id', userId).gte('performed_on', addDays(today, -30)).lte('performed_on', today).order('performed_on', { ascending: false }).order('started_at', { ascending: false }).limit(20)),
    selectMany(client.from('ai_action_logs').select(actionLogSelect()).eq('user_id', userId).order('created_at', { ascending: false }).limit(50)),
    selectMany(client.from('brain_outbox_messages').select(outboxSelect()).eq('user_id', userId).eq('channel', 'whatsapp').order('created_at', { ascending: false }).limit(80)),
    selectMany(client.from('ai_chat_messages').select(brainMessageSelect()).eq('user_id', userId).eq('role', 'assistant').order('created_at', { ascending: false }).limit(40)),
    selectMany(client.from('brain_beliefs').select(beliefSelect()).eq('user_id', userId).eq('record_status', 'current').order('effective_from', { ascending: false }).limit(100)),
  ]);

  return { memos, calendarEvents, projects, projectSessions, healthLogs, workouts, actionLogs, outboxMessages, brainMessages, beliefs };
}

export function buildLifeOSContext({ rows = {}, days = DEFAULT_DAYS, limit = DEFAULT_LIMIT, now = new Date() } = {}) {
  const normalizedRows = normalizeContextRows(rows);
  const { today, future, now_iso } = buildContextWindow({ now, days });
  const openLoops = buildOpenLoops({ rows: normalizedRows, days, limit, now });
  const health = summarizeHealth(normalizedRows.healthLogs, today);
  const workouts = summarizeWorkouts(normalizedRows.workouts, today);
  const projects = summarizeProjects(normalizedRows.projects, normalizedRows.projectSessions, now);
  const memos = summarizeMemos(normalizedRows.memos, today, future);
  const calendar = summarizeCalendar(normalizedRows.calendarEvents, today, now);
  const brain = summarizeBrain(normalizedRows.actionLogs, normalizedRows.brainMessages, now);
  const whatsapp = summarizeOutbox(normalizedRows.outboxMessages, now);
  const beliefs = summarizeBeliefs(normalizedRows.beliefs);

  return sanitizeContextValue({
    generated_at: new Date(now).toISOString(),
    scope: {
      today,
      future,
      days: clampCompilerDays(days),
      now: now_iso,
      timezone: TIME_ZONE,
    },
    today: {
      date: today,
      open_memos_due: memos.due_today_count + memos.overdue_count,
      calendar_events: calendar.today_count,
      project_minutes: projects.today_minutes,
      health_status: health.status,
      latest_workout: workouts.latest,
    },
    next_days: {
      until: future,
      open_memos: memos.next_days_count,
      calendar_events: calendar.upcoming_count,
    },
    memos,
    calendar,
    projects,
    health,
    workouts,
    brain,
    whatsapp,
    beliefs,
    open_loops: openLoops,
  });
}

export function buildOpenLoops({ rows = {}, days = DEFAULT_DAYS, limit = DEFAULT_LIMIT, now = new Date() } = {}) {
  const normalizedRows = normalizeContextRows(rows);
  const { today, future, now_iso } = buildContextWindow({ now, days });
  const loops = [
    ...buildMemoLoops(normalizedRows.memos, { today, future, now }),
    ...buildCalendarLoops(normalizedRows.calendarEvents, { today, now }),
    ...buildProjectLoops(normalizedRows.projects, normalizedRows.projectSessions, { now }),
    ...buildActionLogLoops(normalizedRows.actionLogs),
    ...buildOutboxLoops(normalizedRows.outboxMessages, { now }),
    ...buildBrainPendingLoops(normalizedRows.brainMessages, now),
    ...buildHealthLoops(normalizedRows.healthLogs, { today }),
    ...buildWorkoutLoops(normalizedRows.workouts, { today }),
  ];
  const ranked = rankOpenLoops(dedupeLoops(loops)).slice(0, clampCompilerLimit(limit, DEFAULT_LIMIT, MAX_LIMIT));
  return sanitizeContextValue({
    generated_at: new Date(now).toISOString(),
    range: { today, future, days: clampCompilerDays(days), now: now_iso, timezone: TIME_ZONE },
    count: ranked.length,
    severity_counts: countBy(ranked, 'severity'),
    loops: ranked.map(({ _rank, ...loop }) => loop),
  });
}

export function rankOpenLoops(loops = []) {
  return [...loops].sort((a, b) => {
    const severity = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (severity) return severity;
    const type = (TYPE_RANK[b.type] ?? 0) - (TYPE_RANK[a.type] ?? 0);
    if (type) return type;
    const date = compareLoopDate(a, b);
    if (date) return date;
    return String(a.title || '').localeCompare(String(b.title || ''));
  }).map((loop, index) => ({ ...loop, _rank: index + 1 }));
}

export function clampCompilerDays(value, defaultValue = DEFAULT_DAYS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_DAYS);
}

export function clampCompilerLimit(value, defaultValue = DEFAULT_LIMIT, maxValue = MAX_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(Math.trunc(parsed), 1), Math.max(1, maxValue));
}

function buildMemoLoops(memos, { today, future }) {
  const loops = [];
  for (const memo of memos) {
    if (memo.status && memo.status !== 'open') continue;
    const title = safeTitle(memo.title, 'Memo');
    const dueAt = buildLocalDueAt(memo.memo_date, memo.memo_time);
    if (memo.memo_date && memo.memo_date < today) {
      loops.push(createLoop({
        type: 'overdue_memo',
        id: memo.id,
        title: `Overdue memo: ${title}`,
        severity: 'high',
        source_table: 'memos',
        source_type: 'memo',
        due_at: dueAt,
        date: memo.memo_date,
        reason: 'Memo due date is in the past and still open.',
        suggested_next_action: 'Complete, snooze, or dismiss this memo.',
        can_be_proactive: true,
        can_be_shown_on_home: true,
        metadata: { memo_time: memo.memo_time, notes_preview: safePreview(memo.notes, 160) },
      }));
    } else if (memo.memo_date === today) {
      loops.push(createLoop({
        type: 'due_today_memo',
        id: memo.id,
        title: `Memo due today: ${title}`,
        severity: memo.memo_time ? 'medium' : 'low',
        source_table: 'memos',
        source_type: 'memo',
        due_at: dueAt,
        date: memo.memo_date,
        reason: memo.memo_time ? 'Memo has a specific reminder time today.' : 'Memo is dated today but has no exact time.',
        suggested_next_action: memo.memo_time ? 'Do it, snooze it, or mark it done.' : 'Pick a time or complete it today.',
        can_be_proactive: Boolean(memo.memo_time),
        can_be_shown_on_home: true,
        metadata: { memo_time: memo.memo_time, notes_preview: safePreview(memo.notes, 160) },
      }));
    } else if (!memo.memo_date) {
      loops.push(createLoop({
        type: 'unscheduled_memo',
        id: memo.id,
        title: `Unscheduled memo: ${title}`,
        severity: 'low',
        source_table: 'memos',
        source_type: 'memo',
        due_at: null,
        date: null,
        reason: 'Memo is open without a date or reminder time.',
        suggested_next_action: 'Give this memo a date/time or dismiss it if it is no longer relevant.',
        can_be_proactive: false,
        can_be_shown_on_home: false,
        metadata: { notes_preview: safePreview(memo.notes, 160) },
      }));
    } else if (memo.memo_date <= future) {
      loops.push(createLoop({
        type: 'upcoming_memo',
        id: memo.id,
        title: `Upcoming memo: ${title}`,
        severity: 'low',
        source_table: 'memos',
        source_type: 'memo',
        due_at: dueAt,
        date: memo.memo_date,
        reason: 'Memo is scheduled inside the context window.',
        suggested_next_action: 'Keep it in the plan or adjust the reminder.',
        can_be_proactive: Boolean(memo.memo_time),
        can_be_shown_on_home: false,
        metadata: { memo_time: memo.memo_time },
      }));
    }
  }
  return loops;
}

function buildCalendarLoops(events, { today, now }) {
  const nowMinutes = localMinutesFromDate(now);
  return events
    .filter((event) => !['done', 'skipped', 'cancelled'].includes(event.status))
    .filter((event) => event.event_date === today || event.event_date === addDays(today, 1))
    .filter((event) => needsCalendarPrep(event, today, nowMinutes))
    .map((event) => createLoop({
      type: 'calendar_prep',
      id: event.id,
      title: `Prep upcoming event: ${safeTitle(event.title, 'Calendar event')}`,
      severity: event.event_date === today ? 'medium' : 'low',
      source_table: 'calendar_events',
      source_type: 'calendar_event',
      due_at: buildLocalDueAt(event.event_date, event.start_time),
      date: event.event_date,
      reason: 'Upcoming calendar event may need preparation or context.',
      suggested_next_action: 'Review location, notes, and what needs to be ready.',
      can_be_proactive: event.event_date === today,
      can_be_shown_on_home: event.event_date === today,
      metadata: {
        category: event.category,
        location: safePreview(event.location, 120),
        notes_preview: safePreview(event.notes, 160),
      },
    }));
}

function buildProjectLoops(projects, sessions, { now }) {
  const sessionsByProject = groupBy(sessions, 'project_id');
  const today = localDateFromDate(now);
  const loops = [];
  for (const project of projects) {
    if (!['active', 'paused'].includes(project.status)) continue;
    const projectSessions = sessionsByProject.get(project.id) ?? [];
    const latest = projectSessions[0] ?? null;
    const activeSession = projectSessions.find((session) => !session.ended_at);
    if (activeSession) {
      loops.push(createLoop({
        type: 'active_project_session',
        id: activeSession.id,
        title: `Open project session: ${safeTitle(project.name, 'Project')}`,
        severity: 'high',
        source_table: 'project_sessions',
        source_type: 'project_session',
        source_id: project.id,
        due_at: activeSession.started_at,
        date: localDateFromIso(activeSession.started_at),
        reason: 'Project session has started and has no end time.',
        suggested_next_action: 'Finish or close the active project session.',
        can_be_proactive: true,
        can_be_shown_on_home: true,
        metadata: { project_name: safeTitle(project.name, 'Project'), target_output: safePreview(activeSession.target_output, 180) },
      }));
    }
    const latestLocalDate = latest?.started_at ? localDateFromIso(latest.started_at) : null;
    const staleDays = latestLocalDate ? daysBetweenLocalDates(latestLocalDate, today) : null;
    if (!latest || staleDays >= PROJECT_STALE_DAYS) {
      loops.push(createLoop({
        type: 'stale_project',
        id: project.id,
        title: `Stale project: ${safeTitle(project.name, 'Project')}`,
        severity: project.status === 'paused' ? 'low' : 'medium',
        source_table: 'projects',
        source_type: 'project',
        due_at: latest?.started_at ?? project.updated_at ?? project.created_at,
        date: latestLocalDate ?? project.started_on ?? null,
        reason: latest ? `No project session in ${staleDays} days.` : 'Active project has no recent recorded session.',
        suggested_next_action: 'Schedule or start one focused project block, or pause/archive the project.',
        can_be_proactive: project.status === 'active',
        can_be_shown_on_home: project.status === 'active',
        metadata: {
          status: project.status,
          last_session_at: latest?.started_at ?? null,
          goal_type: project.goal_type,
          progress: summarizeProjectProgress(project),
        },
      }));
    }
    const carryover = projectSessions.find((session) => session.ended_at && session.target_output && !session.proof_of_work);
    if (carryover) {
      loops.push(createLoop({
        type: 'project_session_carryover',
        id: carryover.id,
        title: `Project carryover: ${safeTitle(project.name, 'Project')}`,
        severity: 'medium',
        source_table: 'project_sessions',
        source_type: 'project_session',
        source_id: project.id,
        due_at: carryover.started_at,
        date: localDateFromIso(carryover.started_at),
        reason: 'Recent project session has a target output but no proof of work.',
        suggested_next_action: 'Add proof, define the next output, or carry it into the next planning block.',
        can_be_proactive: false,
        can_be_shown_on_home: true,
        metadata: { target_output: safePreview(carryover.target_output, 180), project_name: safeTitle(project.name, 'Project') },
      }));
    }
  }
  return loops;
}

function buildActionLogLoops(actionLogs) {
  return actionLogs
    .filter((log) => log.status && log.status !== 'success')
    .map((log) => createLoop({
      type: 'failed_action',
      id: log.id,
      title: `Failed Brain action: ${safeTitle(log.action_type, 'unknown action')}`,
      severity: 'high',
      source_table: 'ai_action_logs',
      source_type: 'ai_action_log',
      due_at: log.created_at,
      date: localDateFromIso(log.created_at),
      reason: 'A Brain or automation write failed.',
      suggested_next_action: 'Inspect the action log and retry only after confirming the intended write.',
      can_be_proactive: false,
      can_be_shown_on_home: false,
      metadata: {
        source: log.source,
        request_id: log.request_id,
        error_message: safePreview(log.error_message, 220),
      },
    }));
}

function buildOutboxLoops(messages, { now }) {
  const nowMs = new Date(now).getTime();
  return messages
    .filter((message) => ['failed', 'claimed', 'queued'].includes(message.status))
    .filter((message) => message.status !== 'queued' || !message.scheduled_for || new Date(message.scheduled_for).getTime() <= nowMs)
    .map((message) => {
      const claimedAge = message.claimed_at ? Math.round((nowMs - new Date(message.claimed_at).getTime()) / 60000) : null;
      const staleClaim = message.status === 'claimed' && claimedAge !== null && claimedAge >= OUTBOX_CLAIM_STALE_MINUTES;
      const severity = message.status === 'failed' || staleClaim ? 'high' : 'medium';
      return createLoop({
        type: 'whatsapp_outbox_issue',
        id: message.id,
        title: `WhatsApp outbox ${message.status}: ${safeTitle(message.rule_key, 'message')}`,
        severity,
        source_table: 'brain_outbox_messages',
        source_type: 'whatsapp_outbox',
        source_id: message.source_id ?? null,
        due_at: message.scheduled_for,
        date: localDateFromIso(message.scheduled_for),
        reason: outboxReason(message, staleClaim),
        suggested_next_action: 'Check the Oracle PM2 bridge, delivery ACK, or outbox retry state.',
        can_be_proactive: false,
        can_be_shown_on_home: false,
        metadata: {
          status: message.status,
          attempts: message.attempts,
          rule_key: message.rule_key,
          last_error: safePreview(message.last_error, 220),
          claimed_age_minutes: claimedAge,
        },
      });
    });
}

export function latestPendingSnapshots(messages, now = new Date()) {
  const latestByKey = new Map();
  for (const message of [...messages].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
    const pending = extractPendingActionFromMessage(message);
    if (!pending) continue;
    const key = pending.id || `${pending.action_type}:${pending.summary || message.id}`;
    if (!latestByKey.has(key)) latestByKey.set(key, { message, pending });
  }
  return [...latestByKey.values()].filter(({ pending }) => isActivePendingAction(pending)
    && (!pending.expires_at || new Date(pending.expires_at) > new Date(now)));
}

function buildBrainPendingLoops(messages, now) {
  return latestPendingSnapshots(messages, now).map(({ message, pending }) => createLoop({
    type: 'brain_pending_action',
    id: pending.id || message.id,
    title: `Brain is waiting: ${safeTitle(pending.summary || pending.action_type, 'pending action')}`,
    severity: pending.status === 'awaiting_confirmation' ? 'medium' : 'low',
    source_table: 'ai_chat_messages',
    source_type: 'brain_pending_action',
    source_id: message.thread_id,
    due_at: message.created_at,
    date: localDateFromIso(message.created_at),
    reason: pending.status === 'awaiting_confirmation'
      ? 'Brain is waiting for confirmation before writing.'
      : 'Brain is waiting for missing fields.',
    suggested_next_action: 'Reply with the missing detail, confirm, cancel, or start a new explicit command.',
    can_be_proactive: false,
    can_be_shown_on_home: false,
    metadata: {
      action_type: pending.action_type,
      status: pending.status,
      missing_fields: pending.missing_fields,
      thread_id: message.thread_id,
    },
  }));
}

function buildHealthLoops(healthLogs, { today }) {
  const latest = healthLogs[0] ?? null;
  if (!latest || latest.logged_on !== today) return [];
  const sleep = latest.sleep_hours == null || latest.sleep_hours === '' ? NaN : Number(latest.sleep_hours);
  if (!Number.isFinite(sleep) || sleep >= 5.5) return [];
  return [createLoop({
    type: 'recovery_gap',
    id: latest.id,
    title: 'Low sleep recovery gap',
    severity: sleep < 4.5 ? 'medium' : 'low',
    source_table: 'health_logs',
    source_type: 'health_log',
    due_at: today,
    date: today,
    reason: `Today's logged sleep is ${sleep}h.`,
    suggested_next_action: 'Keep today realistic and avoid stacking too many demanding loops.',
    can_be_proactive: false,
    can_be_shown_on_home: true,
    metadata: { sleep_hours: sleep, energy: latest.energy ?? null },
  })];
}

function buildWorkoutLoops(workouts, { today }) {
  if (!workouts.length) return [];
  const latest = workouts[0];
  const daysSince = latest.performed_on ? daysBetweenLocalDates(latest.performed_on, today) : null;
  if (daysSince === null || daysSince < 5) return [];
  return [createLoop({
    type: 'workout_gap',
    id: latest.id,
    title: 'Training gap',
    severity: 'low',
    source_table: 'workouts',
    source_type: 'workout',
    due_at: latest.performed_on,
    date: latest.performed_on,
    reason: `Last logged workout was ${daysSince} days ago.`,
    suggested_next_action: 'Decide whether today needs training, recovery, or an intentional rest note.',
    can_be_proactive: false,
    can_be_shown_on_home: false,
    metadata: { workout_name: safeTitle(latest.name, 'Workout'), days_since_latest: daysSince },
  })];
}

function createLoop({
  type,
  id,
  title,
  severity,
  source_table,
  source_type,
  source_id = id,
  due_at = null,
  date = null,
  reason,
  suggested_next_action,
  can_be_proactive = false,
  can_be_shown_on_home = false,
  metadata = {},
}) {
  return {
    type,
    id: id ?? `${type}:${title}`,
    title: safePreview(title, 180),
    severity: ['high', 'medium', 'low'].includes(severity) ? severity : 'low',
    source_table,
    source_type,
    source_id,
    due_at,
    date,
    reason: safePreview(reason, 240),
    suggested_next_action: safePreview(suggested_next_action, 240),
    can_be_proactive: Boolean(can_be_proactive),
    can_be_shown_on_home: Boolean(can_be_shown_on_home),
    metadata: sanitizeContextValue(metadata),
  };
}

function summarizeMemos(memos, today, future) {
  const overdue = memos.filter((memo) => memo.memo_date && memo.memo_date < today);
  const dueToday = memos.filter((memo) => memo.memo_date === today);
  const unscheduled = memos.filter((memo) => !memo.memo_date);
  const nextDays = memos.filter((memo) => memo.memo_date && memo.memo_date >= today && memo.memo_date <= future);
  return {
    open_count: memos.length,
    overdue_count: overdue.length,
    due_today_count: dueToday.length,
    unscheduled_count: unscheduled.length,
    next_days_count: nextDays.length,
    top: [...overdue, ...dueToday, ...unscheduled].slice(0, 8).map(compactMemo),
  };
}

function summarizeCalendar(events, today, now) {
  const nowMinutes = localMinutesFromDate(now);
  const todayEvents = events.filter((event) => event.event_date === today);
  return {
    upcoming_count: events.length,
    today_count: todayEvents.length,
    prep_candidates: events.filter((event) => needsCalendarPrep(event, today, nowMinutes)).slice(0, 6).map(compactCalendarEvent),
    next: events.slice(0, 8).map(compactCalendarEvent),
  };
}

function summarizeProjects(projects, sessions, now) {
  const today = localDateFromDate(now);
  const sessionsByProject = groupBy(sessions, 'project_id');
  const activeProjects = projects.filter((project) => project.status === 'active');
  const todayMinutes = sessions
    .filter((session) => session.started_at && localDateFromIso(session.started_at) === today)
    .reduce((sum, session) => sum + (Number(session.duration_minutes) || 0), 0);
  const stale = activeProjects.filter((project) => {
    const latest = sessionsByProject.get(project.id)?.[0] ?? null;
    if (!latest) return true;
    const latestDate = localDateFromIso(latest.started_at);
    return latestDate ? daysBetweenLocalDates(latestDate, today) >= PROJECT_STALE_DAYS : true;
  });
  return {
    active_count: activeProjects.length,
    paused_count: projects.filter((project) => project.status === 'paused').length,
    stale_count: stale.length,
    today_minutes: todayMinutes,
    active_sessions: sessions.filter((session) => !session.ended_at).map(compactProjectSession).slice(0, 5),
    stale: stale.slice(0, 8).map((project) => compactProject(project, sessionsByProject.get(project.id) ?? [])),
  };
}

function summarizeHealth(logs, today) {
  const latest = logs[0] ?? null;
  const todayLog = logs.find((log) => log.logged_on === today) ?? null;
  const sleepValues = logs.filter((log) => log.sleep_hours != null && log.sleep_hours !== '').map((log) => Number(log.sleep_hours)).filter(Number.isFinite);
  const latestSleep = todayLog?.sleep_hours ?? latest?.sleep_hours ?? null;
  return {
    status: todayLog ? 'logged_today' : 'not_logged_today',
    latest_log: latest ? compactHealthLog(latest) : null,
    today: todayLog ? compactHealthLog(todayLog) : null,
    average_sleep_hours: average(sleepValues),
    sleep_status: sleepStatus(latestSleep),
  };
}

function summarizeWorkouts(workouts, today) {
  const latest = workouts[0] ?? null;
  const daysSince = latest?.performed_on ? daysBetweenLocalDates(latest.performed_on, today) : null;
  return {
    recent_count: workouts.length,
    latest: latest ? compactWorkoutSummary(latest) : null,
    days_since_latest: daysSince,
    recovery_hint: daysSince === null
      ? 'No recent workout data available.'
      : daysSince >= 5
        ? 'Training gap is visible; decide whether to train or intentionally recover.'
        : 'Recent workout data exists; use health/sleep to decide intensity.',
  };
}

function summarizeBrain(actionLogs, brainMessages, now) {
  const failed = actionLogs.filter((log) => log.status && log.status !== 'success');
  const pending = latestPendingSnapshots(brainMessages, now).map((entry) => entry.pending);
  return {
    failed_actions_count: failed.length,
    active_pending_actions_count: pending.length,
    failed_actions: failed.slice(0, 6).map(compactActionLog),
    active_pending_actions: pending.slice(0, 6).map(compactPendingAction),
  };
}

function summarizeOutbox(messages, now) {
  const issues = buildOutboxLoops(messages, { now });
  return {
    counts_by_status: countBy(messages, 'status'),
    issue_count: issues.length,
    issues: issues.slice(0, 8).map(({ _rank, ...loop }) => loop),
  };
}

function summarizeBeliefs(beliefs) {
  const current = beliefs.map(serializeBeliefForContext).filter(Boolean);
  return {
    current_count: current.length,
    routines: current.filter((belief) => belief.subject_type === 'routine' && belief.predicate === 'status'),
  };
}

function normalizeContextRows(rows) {
  return {
    memos: Array.isArray(rows.memos) ? rows.memos : [],
    calendarEvents: Array.isArray(rows.calendarEvents) ? rows.calendarEvents : [],
    projects: Array.isArray(rows.projects) ? rows.projects : [],
    projectSessions: Array.isArray(rows.projectSessions) ? rows.projectSessions : [],
    healthLogs: Array.isArray(rows.healthLogs) ? rows.healthLogs : [],
    workouts: Array.isArray(rows.workouts) ? rows.workouts : [],
    actionLogs: Array.isArray(rows.actionLogs) ? rows.actionLogs : [],
    outboxMessages: Array.isArray(rows.outboxMessages) ? rows.outboxMessages : [],
    brainMessages: Array.isArray(rows.brainMessages) ? rows.brainMessages : [],
    beliefs: Array.isArray(rows.beliefs) ? rows.beliefs : [],
  };
}

function dedupeLoops(loops) {
  const seen = new Set();
  const output = [];
  for (const loop of loops) {
    const key = [loop.type, loop.source_table, loop.source_id ?? loop.id, loop.date ?? loop.due_at ?? ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(loop);
  }
  return output;
}

function needsCalendarPrep(event, today, nowMinutes) {
  if (!event?.event_date) return false;
  if (event.event_date === today && event.start_time && timeToMinutes(event.start_time) < nowMinutes) return false;
  const category = String(event.category ?? '').toLowerCase();
  const prepCategory = ['work', 'study', 'school', 'health', 'workout', 'errands'].includes(category);
  return prepCategory || Boolean(event.location) || Boolean(event.notes);
}

function extractPendingActionFromMessage(message) {
  const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
  const direct = metadata.pending_action && typeof metadata.pending_action === 'object' ? metadata.pending_action : null;
  const working = metadata.working_context?.active_pending_action && typeof metadata.working_context.active_pending_action === 'object'
    ? metadata.working_context.active_pending_action
    : null;
  return direct ?? working ?? null;
}

function isActivePendingAction(pending) {
  if (!pending || typeof pending !== 'object') return false;
  const status = String(pending.status ?? 'open').toLowerCase();
  return ['open', 'pending', 'awaiting_confirmation', 'awaiting_fields'].includes(status)
    && !pending.completed
    && !pending.cancelled;
}

function compactMemo(row) {
  return {
    id: row.id,
    title: safeTitle(row.title, 'Memo'),
    memo_date: row.memo_date,
    memo_time: row.memo_time,
    status: row.status,
    notes: safePreview(row.notes, 220),
  };
}

function compactCalendarEvent(row) {
  return {
    id: row.id,
    title: safeTitle(row.title, 'Calendar event'),
    event_date: row.event_date,
    start_time: row.start_time,
    end_time: row.end_time,
    category: row.category,
    location: safePreview(row.location, 120),
    status: row.status,
    notes: safePreview(row.notes, 220),
  };
}

function compactProject(project, sessions) {
  return {
    id: project.id,
    name: safeTitle(project.name, 'Project'),
    status: project.status,
    goal_type: project.goal_type,
    progress: summarizeProjectProgress(project),
    last_session_at: sessions[0]?.started_at ?? null,
    recent_session_count: sessions.length,
    notes: safePreview(project.notes, 220),
  };
}

function compactProjectSession(session) {
  return {
    id: session.id,
    project_id: session.project_id,
    started_at: session.started_at,
    ended_at: session.ended_at,
    duration_minutes: session.duration_minutes,
    target_output: safePreview(session.target_output, 180),
    proof_of_work: safePreview(session.proof_of_work, 180),
  };
}

function compactHealthLog(log) {
  return {
    id: log.id,
    logged_on: log.logged_on,
    sleep_hours: log.sleep_hours,
    sleep_start: log.sleep_start,
    wake_time: log.wake_time,
    energy: log.energy,
    coffee: log.coffee,
    mood: log.mood,
    notes: safePreview(log.notes, 180),
  };
}

function compactWorkoutSummary(workout) {
  return {
    id: workout.id,
    name: safeTitle(workout.name, 'Workout'),
    performed_on: workout.performed_on,
    started_at: workout.started_at,
    ended_at: workout.ended_at,
  };
}

function compactActionLog(log) {
  return {
    id: log.id,
    source: log.source,
    action_type: log.action_type,
    status: log.status,
    error_message: safePreview(log.error_message, 220),
    created_at: log.created_at,
  };
}

function compactPendingAction(pending) {
  return {
    id: pending.id ?? null,
    action_type: pending.action_type,
    status: pending.status,
    summary: safePreview(pending.summary, 180),
    missing_fields: Array.isArray(pending.missing_fields) ? pending.missing_fields.slice(0, 8) : [],
  };
}

function buildContextWindow({ now = new Date(), days = DEFAULT_DAYS } = {}) {
  const today = localDateFromDate(now);
  return {
    today,
    future: addDays(today, clampCompilerDays(days)),
    now_iso: new Date(now).toISOString(),
  };
}

function compareLoopDate(a, b) {
  const left = String(a.due_at || a.date || '');
  const right = String(b.due_at || b.date || '');
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

function outboxReason(message, staleClaim) {
  if (message.status === 'failed') return 'WhatsApp outbox message failed delivery.';
  if (staleClaim) return 'WhatsApp outbox message was claimed but not acknowledged within the recovery window.';
  if (message.status === 'claimed') return 'WhatsApp outbox message is currently claimed by the bridge.';
  return 'WhatsApp outbox message is due and still queued.';
}

function sleepStatus(value) {
  const sleep = Number(value);
  if (!Number.isFinite(sleep)) return 'unknown';
  if (sleep < 4.5) return 'very_low';
  if (sleep < 5.5) return 'low';
  if (sleep < 7) return 'ok';
  return 'good';
}

function summarizeProjectProgress(project) {
  const current = Number(project.current_value);
  const target = Number(project.target_value);
  return {
    current_value: Number.isFinite(current) ? current : null,
    target_value: Number.isFinite(target) ? target : null,
    unit_label: project.unit_label || project.goal_label || null,
    percent: Number.isFinite(current) && Number.isFinite(target) && target > 0
      ? Math.round((current / target) * 100)
      : null,
  };
}

function safeTitle(value, fallback) {
  return safePreview(value, 140) || fallback;
}

function buildLocalDueAt(date, time) {
  if (!date) return null;
  return time ? `${date}T${String(time).slice(0, 5)}` : date;
}

function localDateFromDate(date, timeZone = TIME_ZONE) {
  const value = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function localMinutesFromDate(date, timeZone = TIME_ZONE) {
  const value = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(map.hour) * 60 + Number(map.minute);
}

function localDateFromIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? String(value).slice(0, 10) : null;
  return localDateFromDate(parsed);
}

function daysBetweenLocalDates(start, end) {
  const left = new Date(`${start}T00:00:00.000Z`);
  const right = new Date(`${end}T00:00:00.000Z`);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return null;
  return Math.floor((right.getTime() - left.getTime()) / 86400000);
}

function timeToMinutes(value) {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = row?.[key];
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

function average(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + Number(value), 0) / values.length) * 10) / 10;
}

function sanitizeContextValue(value) {
  return sanitizeCompilerValue(value);
}

function sanitizeCompilerValue(value, depth = 0) {
  if (value === undefined) return null;
  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return Number.isFinite(value) || typeof value !== 'number' ? value : null;
  }
  if (typeof value === 'string') return safePreview(value, 1000);
  if (depth > 7) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeCompilerValue(item, depth + 1));
  if (typeof value === 'object') {
    const output = {};
    for (const [key, raw] of Object.entries(value)) {
      if (!key || key.startsWith('_')) continue;
      if (SECRET_KEY_PATTERN.test(key)) continue;
      output[key] = sanitizeCompilerValue(raw, depth + 1);
    }
    return output;
  }
  return safePreview(String(value), 1000);
}

async function selectMany(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data ?? [];
}

function memoSelect() {
  return 'id, title, memo_date, memo_time, notes, status, created_at, updated_at';
}

function calendarSelect() {
  return 'id, title, event_date, start_time, end_time, category, location, notes, status, created_at, updated_at';
}

function projectSelect() {
  return 'id, name, status, goal_type, goal_label, target_value, current_value, unit_label, started_on, notes, created_at, updated_at';
}

function projectSessionSelect() {
  return 'id, project_id, started_at, ended_at, duration_minutes, target_output, proof_of_work, progress_delta, created_at';
}

function healthSelect() {
  return 'id, logged_on, sleep_hours, sleep_start, wake_time, sleep_quality, energy, coffee, mood, notes, hygiene, created_at, updated_at';
}

function workoutSelect() {
  return 'id, name, performed_on, started_at, ended_at, notes, created_at, updated_at';
}

function actionLogSelect() {
  return 'id, request_id, source, action_type, action_count, status, record_refs, error_message, created_at';
}

function outboxSelect() {
  return 'id, channel, recipient, body, status, priority, rule_key, source_type, source_id, scheduled_for, expires_at, claimed_at, sent_at, failed_at, attempts, last_error, ack_metadata, metadata, created_at, updated_at';
}

function brainMessageSelect() {
  return 'id, thread_id, role, content, request_id, action_type, metadata, created_at';
}

function beliefSelect() {
  return 'id, subject_type, subject_key, predicate, value, confidence, source_type, provenance, effective_from, effective_until, negative_feedback_count, last_feedback_at';
}
