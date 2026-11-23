// Context assembly for one Jarvis Companion turn (spec §5.1).
//
// Loads what Brain should know before answering, within a small token
// budget: availability, commitments due soon, today's calendar, active
// projects, current beliefs, memories relevant to the message, open threads
// (Brain's own check-ins), recent undoable actions and the last ~20 entries
// of the cross-channel timeline. Everything is data, never instructions.
// Database ids are replaced by short per-turn refs (c1, e1, a1).

import { addDays, TIME_ZONE } from './date.js';
import { listRecentCompanionActions } from './companionActionLedger.js';
import { searchAutobiographicalMemory } from './brainAutobiographicalMemory.js';
import { listCurrentBeliefs } from './brainBeliefs.js';

export const TIMELINE_LIMIT = 20;
const HISTORY_ENTRY_MAX_CHARS = 700;
const COMMITMENT_LIMIT = 25;
const RECENT_ACTION_HOURS = 24;

export async function loadCompanionContext({
  client,
  userId,
  now = new Date(),
  refs,
  message = '',
  channel = 'whatsapp',
  currentMessageId = null,
  replyingTo = null,
}) {
  const nowDate = new Date(now);
  const today = romeDate(nowDate);
  const horizon = addDays(today, 7);
  const warnings = [];
  const safe = (label, promise, fallback) => promise.catch((error) => {
    warnings.push({ section: label, error: String(error?.message ?? error).slice(0, 200) });
    return fallback;
  });

  const [dated, undated, events, projects, beliefs, memories, timeline, actions] = await Promise.all([
    safe('commitments', rows(client.from('memos').select('*').eq('user_id', userId).eq('status', 'open')
      .lte('memo_date', horizon).order('memo_date', { ascending: true }).limit(40)), []),
    safe('undated_commitments', rows(client.from('memos').select('*').eq('user_id', userId).eq('status', 'open')
      .is('memo_date', null).order('created_at', { ascending: false }).limit(10)), []),
    safe('calendar', rows(client.from('calendar_events').select('id, title, event_date, start_time, end_time, location, status')
      .eq('user_id', userId).eq('event_date', today).order('start_time', { ascending: true }).limit(20)), []),
    safe('projects', rows(client.from('projects').select('id, name, status, goal_label, updated_at')
      .eq('user_id', userId).limit(60)), []),
    safe('beliefs', listCurrentBeliefs({ client, userId, limit: 30 }), []),
    safe('memories', searchAutobiographicalMemory({ client, userId, query: message, limit: 6 }).then((result) => result.memories ?? []), []),
    safe('timeline', rows(client.from('ai_chat_messages').select('id, role, content, metadata, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(TIMELINE_LIMIT + 2)), []),
    safe('recent_actions', listRecentCompanionActions({ client, userId, now: nowDate, hours: RECENT_ACTION_HOURS, limit: 8 }), []),
  ]);

  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const commitments = [...dated, ...undated].filter((row) => row.kind !== 'checkin');
  const checkins = dated.filter((row) => row.kind === 'checkin');
  const liveBeliefs = beliefs.filter((belief) => !belief.effective_until || new Date(belief.effective_until) > nowDate);
  const availability = liveBeliefs.filter((belief) => belief.subject_type === 'availability');

  const context = {
    now: nowDate.toISOString(),
    channel,
    availability: availability.map((belief) => describeAvailability(belief.value)),
    commitments: commitments.slice(0, COMMITMENT_LIMIT).map((row) => describeCommitment(row, refs, projectNames, today)),
    calendar: events.filter((event) => event.status !== 'cancelled').map((event) => `${refs.ref('e', event.id)} · ${short(event.start_time)}-${short(event.end_time)} ${event.title}${event.location ? ` (${event.location})` : ''}`),
    projects: projects.filter((project) => project.status === 'active').slice(0, 12).map((project) => `${project.name}${project.goal_label ? ` · ${project.goal_label}` : ''}`),
    beliefs: liveBeliefs.filter((belief) => belief.subject_type !== 'availability').slice(0, 10).map(describeBelief),
    memories: memories.map((memory) => clip(`${memory.title}: ${memory.content}`, 240)),
    openThreads: checkins.map((row) => `${refs.ref('c', row.id)} · tua domanda programmata ${row.memo_date}${row.memo_time ? ` ${short(row.memo_time)}` : ''}: ${row.title}`),
    recentActions: actions.map((action) => `${refs.ref('a', action.id)} · ${romeTime(new Date(action.created_at))} · ${action.summary}`),
    ...(replyingTo ? { replyingTo: clip(replyingTo, 600) } : {}),
  };

  const history = buildHistory(timeline.filter((entry) => entry.id !== currentMessageId).slice(0, TIMELINE_LIMIT).reverse(), { channel, nowDate });
  return { context, history, warnings };
}

// Timeline rows (oldest first) -> plain conversation for the model. User
// entries carry a short "[day time · channel]" stamp so Brain can place them
// ("stamattina in app"); consecutive same-role entries are merged.
export function buildHistory(entries, { channel = 'whatsapp', nowDate = new Date() } = {}) {
  const out = [];
  for (const entry of entries) {
    if (!['user', 'assistant'].includes(entry.role)) continue;
    const text = clip(entry.content, HISTORY_ENTRY_MAX_CHARS);
    if (!text) continue;
    const entryChannel = entry.metadata?.channel ?? entry.metadata?.source ?? 'app';
    const content = entry.role === 'user'
      ? `[${stamp(new Date(entry.created_at), nowDate)} · ${entryChannel === channel ? channel : entryChannel}] ${text}`
      : text;
    const last = out.at(-1);
    if (last && last.role === entry.role) last.content = `${last.content}\n${content}`;
    else out.push({ role: entry.role, content });
  }
  return out;
}

export function describeCommitment(row, refs, projectNames = new Map(), today = null) {
  const due = row.memo_date
    ? `scade ${row.memo_date}${row.memo_time ? ` ${short(row.memo_time)}` : ''}${today && row.memo_date < today ? ' (in ritardo)' : ''}`
    : 'senza data';
  const parts = [refs.ref('c', row.id), row.title, due, row.kind ?? 'reminder'];
  if (row.hard) parts.push('hard');
  if (row.project_id && projectNames.has(row.project_id)) parts.push(`progetto ${projectNames.get(row.project_id)}`);
  if (row.chase_intensity && row.chase_intensity !== 'coach') parts.push(`intensità ${row.chase_intensity}`);
  if (row.recurrence) parts.push(`ricorrente ${row.recurrence}`);
  return parts.join(' · ');
}

function describeAvailability(value = {}) {
  const until = value.until ? `${romeDate(new Date(value.until))} ${romeTime(new Date(value.until))}` : 'senza scadenza';
  return `${value.mode ?? 'sconosciuta'} fino a ${until}${value.reason ? ` (${value.reason})` : ''}`;
}

function describeBelief(belief) {
  const value = belief.value && typeof belief.value === 'object' ? belief.value : {};
  const state = value.state ?? value.mode ?? value.value ?? JSON.stringify(value).slice(0, 120);
  return `${belief.subject_type} ${belief.subject_key}: ${state}`;
}

async function rows(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

function stamp(at, nowDate) {
  const day = romeDate(at);
  const today = romeDate(nowDate);
  const label = day === today ? 'oggi' : day === addDays(today, -1) ? 'ieri' : new Intl.DateTimeFormat('it-IT', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(at);
  return `${label} ${romeTime(at)}`;
}

function clip(text, max) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function short(time) {
  return time ? String(time).slice(0, 5) : '';
}

function romeDate(at) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function romeTime(at) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}
