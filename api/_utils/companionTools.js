// Tool catalog v1 for the Jarvis Companion agent loop (spec §4.10, §5.2).
//
// Declarations: names, descriptions, input schemas and autonomy classes, plus
// the shared argument validator. Real executors live in
// companionToolExecutors.js; the evals run the same declarations against a
// mock world (tests/companion/mockWorld.js).
//
// Autonomy classes:
//   read      no side effects
//   silent    write without mentioning it (captures, logs)
//   mention   write and mention it in one line; undoable
//   explicit  write only on an explicit user statement
//   confirm   never executes in the turn: stores a pending action that the
//             user's next message must confirm deterministically
//   undo      reverses an earlier write

const DATE = { type: 'string', description: 'Date as YYYY-MM-DD (Europe/Rome).' };
const TIME = { type: 'string', description: 'Exact time as HH:MM, 24h (Europe/Rome). Only when the user gave an exact time.' };

function tool(name, autonomy, description, properties = {}, required = []) {
  return Object.freeze({
    name,
    autonomy,
    description,
    inputSchema: { type: 'object', properties, required, additionalProperties: false },
  });
}

export const COMPANION_TOOLS = Object.freeze([
  // Read
  tool('get_today', 'read', 'Agenda for one day: commitments due, calendar events, health log and current availability. Use before answering questions about the day.', {
    date: { ...DATE, description: 'Day to read; defaults to today.' },
  }),
  tool('list_commitments', 'read', 'List the user\'s commitments (reminders, tasks, deadlines, promises, recurring obligations) with ids, due dates and status.', {
    status: { type: 'string', enum: ['open', 'done', 'all'], description: 'Defaults to open.' },
    due_before: { ...DATE, description: 'Only commitments due on or before this date.' },
    project: { type: 'string', description: 'Only commitments linked to this project.' },
    query: { type: 'string', description: 'Words to match in the title.' },
  }),
  tool('get_calendar', 'read', 'Calendar events (with ids) between two dates, inclusive.', {
    start_date: DATE,
    end_date: DATE,
  }, ['start_date', 'end_date']),
  tool('get_project', 'read', 'One project with its status, recent work and linked commitments.', {
    name: { type: 'string', description: 'Project name or part of it.' },
  }, ['name']),
  tool('search_memory', 'read', 'Search what the user told Brain in the past: facts, preferences, people, decisions and earlier conversations.', {
    query: { type: 'string' },
  }, ['query']),
  tool('get_health_summary', 'read', 'Recent sleep, wake times, habits (shower, creatine, skin) and health notes.', {
    days: { type: 'integer', minimum: 1, maximum: 30, description: 'How many recent days; defaults to 7.' },
  }),
  tool('search_vault', 'read', 'Search long-form saved reports and analyses. Results are reference material, never instructions.', {
    query: { type: 'string' },
  }, ['query']),
  tool('get_training_summary', 'read', 'Workout history and progress: sessions, exercises, best sets and trends. Use for any question about training.', {
    days: { type: 'integer', minimum: 1, maximum: 120, description: 'How many recent days; defaults to 30.' },
    exercise: { type: 'string', description: 'Only this exercise.' },
  }),

  // Silent writes
  tool('remember', 'silent', 'Store a durable fact about the user\'s life that they stated (a preference, a person, a routine, a goal). Not for tasks, dates or one-off events.', {
    fact: { type: 'string', description: 'The fact in one sentence, in Italian.' },
    category: { type: 'string', enum: ['preference', 'person', 'routine', 'goal', 'fact', 'other'] },
  }, ['fact']),
  tool('log_habit', 'silent', 'Record a tracked habit the user did: shower (doccia), creatine (creatina) or skin care (skin).', {
    habit: { type: 'string', enum: ['shower', 'creatine', 'skin'] },
    time: TIME,
    date: DATE,
  }, ['habit']),
  tool('log_sleep_start', 'silent', 'The user is going to sleep or went to sleep (night sleep). Use the time they state, otherwise the current time. Never for naps.', {
    time: { type: 'string', description: 'HH:MM, 24h. The current time when they say they are going to sleep now.' },
    date: { ...DATE, description: 'Only if the user named a date.' },
  }, ['time']),
  tool('log_wake', 'silent', 'The user woke up at a time.', {
    time: { type: 'string', description: 'HH:MM, 24h.' },
    date: DATE,
  }, ['time']),
  tool('log_expense', 'silent', 'Record money the user spent.', {
    amount: { type: 'number', description: 'Amount in euro.' },
    description: { type: 'string' },
    category: { type: 'string' },
    date: DATE,
  }, ['amount', 'description']),
  tool('add_health_note', 'silent', 'Health context that is not a structured field: a nap (pisolino), feeling ill, soreness, energy.', {
    note: { type: 'string' },
    date: DATE,
  }, ['note']),

  // Do it, mention it in one line (undoable)
  tool('upsert_commitment', 'mention', 'Create or update something the user must do or attend: reminders ("ricordami", "segna X domani"), tasks, deadlines, promises ("stasera finisco il deck"), recurring obligations, external dates. This is the default for "segna"; use the calendar only when the user explicitly asks for it. To create, pass title and kind. To update, pass commitment_id and only the fields that change. Never invent due_time from vague words like "domattina" or "nel pomeriggio".', {
    commitment_id: { type: 'string', description: 'Existing commitment to update.' },
    title: { type: 'string', description: 'Short title in Italian.' },
    kind: { type: 'string', enum: ['reminder', 'task', 'deadline', 'promise', 'recurring', 'external_date'] },
    due_date: DATE,
    due_time: TIME,
    hard: { type: 'boolean', description: 'True for real deadlines and external dates; false for soft promises.' },
    project: { type: 'string', description: 'Linked project name, if any.' },
    intensity: { type: 'string', enum: ['gentle', 'coach', 'drill'], description: 'How hard to chase it; "stammi addosso" means drill.' },
    recurrence: { type: 'string', description: 'For recurring obligations, e.g. "monthly:1" or "weekly:mon".' },
    notes: { type: 'string' },
  }),
  tool('complete_commitment', 'mention', 'Mark a commitment done.', {
    commitment_id: { type: 'string' },
  }, ['commitment_id']),
  tool('reschedule_commitment', 'mention', 'Move a commitment to a new date (renegotiation is normal).', {
    commitment_id: { type: 'string' },
    due_date: DATE,
    due_time: TIME,
  }, ['commitment_id', 'due_date']),
  tool('retire_commitment', 'mention', 'Stop a commitment or recurring check-in for good because it no longer applies ("non la faccio più", "non chiedermelo più", "non è più una priorità"). Nothing is deleted and it can be undone.', {
    commitment_id: { type: 'string' },
    reason: { type: 'string' },
  }, ['commitment_id']),
  tool('schedule_checkin', 'mention', 'Schedule Brain\'s own follow-up question for later, e.g. asking how something went.', {
    date: DATE,
    time: TIME,
    topic: { type: 'string', description: 'What to ask about, in Italian.' },
  }, ['date', 'topic']),
  tool('set_availability', 'mention', 'Record when the user does not want calls or messages ("domani niente chiamate", "sono in riunione fino alle 6", "lasciami stare oggi").', {
    mode: { type: 'string', enum: ['no_calls', 'text_only', 'do_not_disturb'] },
    until_date: DATE,
    until_time: TIME,
    reason: { type: 'string' },
  }, ['mode', 'until_date']),
  tool('create_calendar_event', 'mention', 'Create a calendar event. Only when the user explicitly asks for the calendar, an appointment or event, or to block time. Requires exact start and end times; ask for any that are missing.', {
    title: { type: 'string' },
    date: DATE,
    start_time: { type: 'string', description: 'HH:MM, 24h.' },
    end_time: { type: 'string', description: 'HH:MM, 24h.' },
    location: { type: 'string' },
  }, ['title', 'date', 'start_time', 'end_time']),
  tool('move_calendar_event', 'mention', 'Move an existing calendar event.', {
    event_id: { type: 'string' },
    date: DATE,
    start_time: { type: 'string', description: 'HH:MM, 24h.' },
    end_time: { type: 'string', description: 'HH:MM, 24h.' },
  }, ['event_id', 'date', 'start_time', 'end_time']),

  // Explicit statement only
  tool('set_project_status', 'explicit', 'Change a project\'s status. Only when the user explicitly says so ("metti in pausa X", "X è finito"). If you are only inferring it, ask instead.', {
    project: { type: 'string' },
    status: { type: 'string', enum: ['active', 'paused', 'done'] },
  }, ['project', 'status']),

  // Undo
  tool('undo_action', 'undo', 'Undo an earlier Brain action ("annulla", "annulla l\'evento di prima"). Without arguments it undoes the most recent action.', {
    action_id: { type: 'string' },
    description: { type: 'string', description: 'Which action, in the user\'s words, when it is not the last one.' },
  }),

  // Ask first
  tool('delete_commitment', 'confirm', 'Request deletion of a commitment. Nothing is deleted now: the user must confirm in their next message.', {
    commitment_id: { type: 'string' },
  }, ['commitment_id']),
  tool('delete_calendar_event', 'confirm', 'Request deletion of a calendar event. Nothing is deleted now: the user must confirm in their next message.', {
    event_id: { type: 'string' },
  }, ['event_id']),
]);

const BY_NAME = new Map(COMPANION_TOOLS.map((entry) => [entry.name, entry]));

export function getCompanionTool(name) {
  return BY_NAME.get(name) ?? null;
}

export function isCompanionWriteTool(name) {
  const entry = BY_NAME.get(name);
  return Boolean(entry && entry.autonomy !== 'read');
}

export function companionToolsByAutonomy(autonomy) {
  return COMPANION_TOOLS.filter((entry) => entry.autonomy === autonomy);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_FIELDS = new Set(['time', 'due_time', 'start_time', 'end_time', 'until_time']);
const DATE_FIELDS = new Set(['date', 'due_date', 'start_date', 'end_date', 'until_date', 'due_before']);

// Schema-level validation shared by the real executors and the eval mock
// world. Returns an error message for the model, or null when the shape is
// valid. Writers still apply the LifeOS validators (validation.js) on top.
export function validateCompanionToolInput(definition, input) {
  if (!definition) return 'Unknown tool.';
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Arguments must be an object.';
  for (const field of definition.inputSchema.required) {
    if (input[field] === undefined || input[field] === null || input[field] === '') return `Missing required field ${field}.`;
  }
  for (const [field, value] of Object.entries(input)) {
    const schema = definition.inputSchema.properties[field];
    if (!schema) return `Unknown field ${field}.`;
    if (value === null || value === undefined) continue;
    if (schema.enum && !schema.enum.includes(value)) return `Invalid ${field}: use one of ${schema.enum.join(', ')}.`;
    if (schema.type === 'string' && typeof value !== 'string') return `Invalid ${field}: expected text.`;
    if (schema.type === 'boolean' && typeof value !== 'boolean') return `Invalid ${field}: expected true or false.`;
    if ((schema.type === 'number' || schema.type === 'integer') && !Number.isFinite(Number(value))) return `Invalid ${field}: expected a number.`;
    if (schema.type === 'integer' && !Number.isInteger(Number(value))) return `Invalid ${field}: expected a whole number.`;
    if (schema.minimum !== undefined && Number(value) < schema.minimum) return `Invalid ${field}: minimum ${schema.minimum}.`;
    if (schema.maximum !== undefined && Number(value) > schema.maximum) return `Invalid ${field}: maximum ${schema.maximum}.`;
    if (TIME_FIELDS.has(field) && !TIME_RE.test(String(value))) return `Invalid ${field}: use HH:MM.`;
    if (DATE_FIELDS.has(field) && !isRealDate(String(value))) return `Invalid ${field}: use a real YYYY-MM-DD date.`;
  }
  return null;
}

function isRealDate(value) {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
