import { generateGeminiJson, generateGeminiText } from '../_utils/gemini.js';
import {
  HttpError,
  createRequestContext,
  getBearerToken,
  handleApiError,
  handleOptions,
  matchesSecret,
  readJsonBody,
  requirePost,
  sendSuccess,
} from '../_utils/http.js';
import { getActionUserId, requireConfiguredUserAccess } from '../_utils/supabaseAdmin.js';
import {
  addDays,
  createAiActionLog,
  createCalendarEvent,
  createCalendarPlanEvents,
  createExpense,
  getRangeWindow,
  localDate,
  normalizePlannerPlan,
  readLifeOSContext,
  resolveDate,
  updateHealthLog,
} from '../_utils/lifeosTools.js';
import { normalizeTimeRange } from '../_utils/validation.js';

const PLANNER_SYSTEM = `
You are the LifeOS planner. Convert the user's message into strict JSON only.
No markdown. No natural language outside JSON.
Schema:
{
  "intent": "analyze" | "create_expense" | "create_calendar_event" | "update_health_log" | "analyze_and_plan" | "clarify" | "unsupported" | "blocked_destructive",
  "needsRead": boolean,
  "needsWrite": boolean,
  "range": "today" | "tomorrow" | "7d" | "30d" | "3m" | "6m" | "12m" | "all" | null,
  "tables": ["expenses", "health_logs", "workouts", "workout_sets", "calendar_events", "daily_reviews"],
  "args": {},
  "clarifyingQuestion": string | null,
  "riskLevel": "low" | "medium" | "high",
  "reason": string
}
Rules:
- Extract dates as YYYY-MM-DD when possible. Today is provided in the prompt.
- If the user gives DD/MM/YY or DD/MM/YYYY, copy that date into args; the backend can normalize it.
- Natural "tomorrow" may be represented as "tomorrow" or the provided date.
- Extract times as 24-hour HH:MM. If natural AM/PM text is preserved, the backend can normalize common formats such as 2:15pm or 9am.
- For multi-event planning, each event must use separate start_time and end_time fields. Do not put full phrases or ranges inside start_time.
- For simple expense creation, extract vendor, amount, category, spent_on/date, notes. Amount may include currency words or symbols.
- Prefer expense categories from this list with canonical casing: Food, Groceries, Transport, Car, Shopping, Health, Entertainment, Bills, Subscriptions, Education, Travel, Personal Care, Other.
- For calendar creation, extract title, event_date/date, start_time, end_time, category, location, notes. Prefer calendar categories from this list: Work, Study, School, Health, Workout, Errands, Personal, Social, Entertainment, Sleep.
- Calendar category guidance: use Errands for practical tasks/logistics, Social for plans with family/friends, Personal for solo admin/chores/routines/planning, Health for medical/dentist/recovery, and Workout for gym/boxing/sports training.
- create_calendar_event is only for one event. If the user gives multiple explicit events/times, do not force the whole schedule into one create_calendar_event. Keep calendar_events in tables, set needsWrite true, and avoid needsRead unless the user asks to analyze past data.
- For health logging, extract logged_on/date and provided fields: energy, coffee, adc, sleep_hours, sleep_start, wake_time, notes, and Daily Habits.
- Daily Habits are brush, shower, creatine, skin, and journal. Put them in args.habits or direct args fields such as {"creatine": true}.
- "took creatine" means habit creatine. "showered" means habit shower. "brushed teeth" means habit brush. "skincare" or "did skin" means habit skin. "journaled" or "wrote journal" means habit journal.
- Do not map habit phrases into sleep_hours. Do not output sleep_hours unless the user explicitly gives sleep duration. Avoid putting habit-only statements only into notes when a habit field can be extracted.
- Only extract water when the user explicitly asks to log water because it is kept for backward compatibility.
- For "last week", use range "7d". For "last 30 days" or "last month", use "30d". For "last 3 months", use "3m". For all-time/overall behavior, use "all".
- For vague "how am I doing?", use intent "analyze", needsRead true, range "30d", and broad LifeOS tables.
- For analyze plus explicit plan/schedule requests, use "analyze_and_plan" with needsRead true and needsWrite true.
- Destructive delete/remove/wipe requests must use "blocked_destructive".
- If required details are missing, use "clarify" with one concise clarifyingQuestion.
- Low-risk additive writes are create_expense, create_calendar_event, update_health_log, and small calendar plans.
`;

const ANSWER_SYSTEM = `
You are the in-app LifeOS assistant.
Use only the provided LifeOS data and action results.
Do not pretend unavailable data exists.
Distinguish facts from suggestions.
Be direct, practical, and concise.
Format responses with concise Markdown:
- Use short paragraphs.
- Use bullet lists when helpful.
- Use bold for compact labels.
- Do not use giant headings.
- Never output raw HTML.
You may use LifeOS callouts only when useful:
- [good]...[/good] for positive signals.
- [warn]...[/warn] for sparse data, weak evidence, or caution.
- [bad]...[/bad] for clearly negative patterns.
- [info]...[/info] for neutral facts.
- [action]...[/action] for recommended next steps.
Do not overuse callouts.
Never invent other callout tags.
For finance, give personal tracking insights, not professional financial advice.
For health, give lifestyle-pattern insights, not medical diagnosis.
For workout, give training observations, not medical advice.
If data is sparse, say that clearly.
If actions were created, state exactly what was created.
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

const EXPLICIT_CALENDAR_EXTRACTOR_SYSTEM = `
You extract explicit user-provided calendar events from one message.
Return strict JSON only:
{
  "target_date": "YYYY-MM-DD",
  "events": [
    {
      "title": "Science Study Session",
      "event_date": "YYYY-MM-DD",
      "start_time": "13:00",
      "end_time": "14:15",
      "category": "Study",
      "location": null,
      "notes": null
    }
  ]
}
Rules:
- Extract only events explicitly stated by the user. Do not invent events.
- Max 8 events.
- Use the provided today/tomorrow dates.
- Every event must have its own start_time and end_time fields.
- Never put a full phrase or range inside start_time or end_time.
- Use canonical HH:MM when possible. If unsure, preserve the user's time text in the correct field.
- Do not skip events unless the title or time range is truly missing.
- Prefer categories from this list: Work, Study, School, Health, Workout, Errands, Personal, Social, Entertainment, Sleep.
- Use Study for studying/learning, Health for doctor/dentist/medical/recovery, Errands for logistics/appointments/shopping tasks, Social for plans with people, Personal for solo admin/routines, Entertainment for leisure, Sleep for sleep/naps, Workout for gym/boxing/sports.
`;

const RECURRENCE_CALENDAR_EXTRACTOR_SYSTEM = `
You extract one finite recurring calendar request from the user's message.
Return strict JSON only:
{
  "title": "Deep Work Session",
  "category": "Work",
  "start_time": "16:00",
  "end_time": "20:00",
  "date_rule": {
    "frequency": "daily",
    "interval": 1,
    "days_of_week": [],
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD"
  },
  "location": null,
  "notes": null,
  "clarifyingQuestion": null
}
Supported frequency values: daily, weekly, every_other_day, every_n_days, weekends, weekdays.
Rules:
- Extract only what the user explicitly asks to log/create/schedule. Do not invent unrelated events.
- Use finite date ranges only.
- Resolve relative dates using the provided dateReference.
- If the user says "starting from 17/05/26" or "starting on 17/05/26", start_date must be 2026-05-17.
- If the user says "for 7 days starting from 17/05/26", end_date must be 2026-05-23.
- If the user says "next week", use dateReference.nextWeek.start through dateReference.nextWeek.end.
- If the user says "next month" or "of next month", use dateReference.nextMonth.start through dateReference.nextMonth.end.
- If the user says a named month such as July, use the most reasonable upcoming month from dateReference.namedMonths.
- If the user says "for the next 3 weeks" or "for the next 3 months", start from today unless wording implies next week/month.
- If the date range is ambiguous, set clarifyingQuestion to one concise question and leave date_rule dates null.
- If the title or time range is missing, set clarifyingQuestion to one concise question.
- Use canonical HH:MM if possible. The backend can normalize natural time text like 2 to 3 pm or 4pm-8pm.
- Prefer categories: Work, Study, School, Health, Workout, Errands, Personal, Social, Entertainment, Sleep.
- Category examples: school appointment = School, deep work = Work, gym/boxing = Workout, family lunch = Social, doctor/dentist = Health, errands/logistics = Errands.
`;

const TIME_TEXT_PATTERN = String.raw`(?:\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)?)`;
const TIME_RANGE_PATTERN_SOURCE = String.raw`\b(?:from\s+)?${TIME_TEXT_PATTERN}\s*(?:-|to|until)\s*${TIME_TEXT_PATTERN}\b`;
const SECRET_KEY_PATTERN = /(authorization|bearer|token|secret|password|service_role|api[_-]?key|gemini|supabase)/i;
const MAX_RECURRENCE_EVENTS = 60;
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    const authInfo = await requireAssistantAuth(req);

    const body = await readJsonBody(req);
    const message = String(body.message ?? '').trim();
    if (!message) throw new HttpError(400, 'message is required.');
    if (message.length > 2000) throw new HttpError(400, 'message must be 2000 characters or fewer.');
    const source = resolveAssistantSource(authInfo, body);

    if (isFiniteRecurringCalendarRequest(message)) {
      const plan = createFiniteRecurringCalendarSyntheticPlan();
      const actions = [];
      let answer = '';
      try {
        const writeResult = await executeFiniteRecurringCalendarPlan(message, plan);
        actions.push(...writeResult.actions);
        answer = writeResult.answer;
        return sendAiSuccess(res, 200, { answer, plan, actions, contextSummary: null }, context, { message, source });
      } catch (error) {
        const diagnostics = logAiWriteFailure({ context, message, plan, writePath: 'finite_recurring_calendar_events', error });
        await safeLogAiError({ context, message, source, plan, writePath: 'finite_recurring_calendar_events', error, diagnostics });
        attachDebugDiagnostics(error, diagnostics);
        throw error;
      }
    }

    if (isObviousExplicitMultiEventCalendarRequest(message)) {
      const plan = createExplicitCalendarSyntheticPlan(message);
      const actions = [];
      let answer = '';
      try {
        const writeResult = await executeExplicitCalendarPlan(message, plan);
        actions.push(...writeResult.actions);
        answer = writeResult.answer;
        return sendAiSuccess(res, 200, { answer, plan, actions, contextSummary: null }, context, { message, source });
      } catch (error) {
        const diagnostics = logAiWriteFailure({ context, message, plan, writePath: 'explicit_calendar_events_preplanner', error });
        await safeLogAiError({ context, message, source, plan, writePath: 'explicit_calendar_events_preplanner', error, diagnostics });
        attachDebugDiagnostics(error, diagnostics);
        throw error;
      }
    }

    let plan;
    try {
      plan = await planMessage(message);
    } catch (error) {
      const diagnostics = logAiPlannerFailure({ context, message, error });
      attachDebugDiagnostics(error, diagnostics);
      throw error;
    }
    const actions = [];
    let lifeosContext = null;
    let answer = '';
    const explicitMultiEventRequest = isExplicitMultiEventCalendarRequest(message, plan);

    if (explicitMultiEventRequest) {
      try {
        const writeResult = await executeExplicitCalendarPlan(message, plan);
        actions.push(...writeResult.actions);
        answer = writeResult.answer;
        return sendAiSuccess(res, 200, { answer, plan, actions, contextSummary: lifeosContext }, context, { message, source });
      } catch (error) {
        const diagnostics = logAiWriteFailure({ context, message, plan, writePath: 'explicit_calendar_events', error });
        await safeLogAiError({ context, message, source, plan, writePath: 'explicit_calendar_events', error, diagnostics });
        attachDebugDiagnostics(error, diagnostics);
        throw error;
      }
    }

    if (plan.intent === 'clarify') {
      answer = plan.clarifyingQuestion || 'What details should I use?';
      return sendAiSuccess(res, 200, { answer, plan, actions }, context, { message, source });
    }

    if (plan.needsRead || ['analyze', 'analyze_and_plan', 'blocked_destructive'].includes(plan.intent)) {
      lifeosContext = await readLifeOSContext(plan);
    }

    if (plan.intent === 'blocked_destructive') {
      answer = await answerWithGemini(message, plan, lifeosContext, [
        { type: 'blocked_destructive', message: 'Deletion and destructive updates are not enabled for the AI assistant yet.' },
      ]);
      return sendAiSuccess(res, 200, { answer, plan, actions: [{ type: 'blocked_destructive' }], contextSummary: lifeosContext }, context, { message, source });
    }

    if (plan.intent === 'unsupported') {
      answer = 'I cannot do that in this version of the LifeOS assistant.';
      return sendAiSuccess(res, 200, { answer, plan, actions, contextSummary: lifeosContext }, context, { message, source });
    }

    if (plan.needsWrite) {
      let writeResult;
      try {
        writeResult = await executeWriteIntent(plan, message, lifeosContext);
      } catch (error) {
        const diagnostics = logAiWriteFailure({ context, message, plan, writePath: plan.intent, error });
        await safeLogAiError({ context, message, source, plan, writePath: plan.intent, error, diagnostics });
        attachDebugDiagnostics(error, diagnostics);
        throw error;
      }
      actions.push(...writeResult.actions);
      if (writeResult.context) lifeosContext = writeResult.context;
      if (writeResult.answer) answer = writeResult.answer;
    }

    if (!answer) {
      answer = await answerWithGemini(message, plan, lifeosContext, actions);
    }

    return sendAiSuccess(res, 200, { answer, plan, actions, contextSummary: lifeosContext }, context, { message, source });
  } catch (error) {
    handleApiError(res, error, context);
  }
}

async function requireAssistantAuth(req) {
  const token = getBearerToken(req);
  if (!token) throw new HttpError(401, 'Unauthorized.');

  if (matchesSecret(token, process.env.LIFEOS_ACTION_TOKEN)) {
    getActionUserId();
    return { type: 'action-token' };
  }

  const user = await requireConfiguredUserAccess(token);
  return { type: 'supabase-session', user };
}

function resolveAssistantSource(authInfo, body = {}) {
  if (authInfo?.type === 'supabase-session') return 'app';
  const requested = String(body.source ?? '').trim().toLowerCase();
  if (['shortcut', 'api'].includes(requested)) return requested;
  return 'shortcut';
}

async function sendAiSuccess(res, status, data, context, logInfo) {
  await safeLogAiSuccess({
    context,
    message: logInfo?.message,
    source: logInfo?.source,
    answer: data?.answer,
    actions: data?.actions ?? [],
  });
  return sendSuccess(res, status, data, context);
}

async function planMessage(message) {
  const prompt = JSON.stringify({
    today: localDate(),
    tomorrow: localDate(1),
    userMessage: message,
  });
  const rawPlan = await generateGeminiJson({
    system: PLANNER_SYSTEM,
    prompt,
    temperature: 0,
    invalidMessage: 'Gemini returned an invalid planner response.',
    repair: true,
  });
  return normalizePlannerPlan(rawPlan);
}

export function isExplicitMultiEventCalendarRequest(message, plan = {}) {
  const text = String(message ?? '').toLowerCase();
  if (!text) return false;
  if (looksLikeAnalysisRequest(text)) return false;

  const hasScheduleAction = /\b(plan|schedule|create|add|put|block)\b/.test(text);
  const hasCalendarLanguage = /\b(events?|schedule|calendar|today|tomorrow|from)\b/.test(text);
  const hasMultipleRanges = countExplicitTimeRanges(message) >= 2;
  const plannerAllowsCalendarWrite = !['blocked_destructive', 'create_expense', 'update_health_log'].includes(plan.intent);

  return hasScheduleAction && hasCalendarLanguage && hasMultipleRanges && plannerAllowsCalendarWrite;
}

export function isFiniteRecurringCalendarRequest(message) {
  const text = String(message ?? '').toLowerCase();
  if (!text || looksLikeAnalysisRequest(text)) return false;
  if (looksLikeExpenseOrHealthRequest(text)) return false;

  const hasCalendarWrite = /\b(log|create|schedule|plan|add|put|block|i have|i need|i want)\b/.test(text);
  const hasTime = countExplicitTimeRanges(message) >= 1;
  const hasRecurrence = /\b(every\s+day|everyday|daily|every\s+weekday|weekdays|every\s+weekend|all\s+weekends|weekends|every\s+other\s+day|every\s+2\s+days|every\s+\d+\s+days|every\s+(?:mon|tues|wednes|thurs|fri|satur|sun)day|all\s+(?:mon|tues|wednes|thurs|fri|satur|sun)days|for\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:days?|weeks?|months?)|for\s+the\s+next\s+\d+\s+(?:weeks?|months?)|next\s+week|next\s+month|of\s+next\s+month|this\s+week|this\s+month|of\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|starting\s+(?:from|on))\b/.test(text);

  return hasCalendarWrite && hasTime && hasRecurrence;
}

function createFiniteRecurringCalendarSyntheticPlan() {
  return {
    intent: 'create_calendar_events',
    needsRead: false,
    needsWrite: true,
    range: null,
    tables: ['calendar_events'],
    args: {},
    clarifyingQuestion: null,
    riskLevel: 'low',
    reason: 'Finite recurring calendar request detected before planner.',
  };
}

export function isObviousExplicitMultiEventCalendarRequest(message) {
  const text = String(message ?? '').toLowerCase();
  if (!text || looksLikeAnalysisRequest(text)) return false;
  const hasScheduleAction = /\b(plan|schedule|create|add|put|block)\b/.test(text) || /\b(?:i\s+)?want to\b/.test(text);
  const hasCalendarLanguage = /\b(events?|schedule|calendar|today|tomorrow|from)\b/.test(text);
  return hasScheduleAction && hasCalendarLanguage && countExplicitTimeRanges(message) >= 2;
}

function createExplicitCalendarSyntheticPlan(message) {
  return {
    intent: 'create_calendar_events',
    needsRead: false,
    needsWrite: true,
    range: inferExplicitRange(message),
    tables: ['calendar_events'],
    args: {},
    clarifyingQuestion: null,
    riskLevel: 'low',
    reason: 'Explicit multi-event calendar request detected before planner.',
  };
}

async function executeFiniteRecurringCalendarPlan(message, plan) {
  const recurrence = await extractFiniteRecurrencePlan(message);
  const clarification = getRecurrenceClarifyingQuestion(recurrence);
  if (clarification) {
    return {
      actions: [],
      answer: clarification,
    };
  }

  const events = expandRecurrenceToEvents(recurrence);
  if (events.length > MAX_RECURRENCE_EVENTS) {
    throw new HttpError(400, `This recurrence would create ${events.length} events. Narrow the range to ${MAX_RECURRENCE_EVENTS} events or fewer.`, {
      eventCount: events.length,
      extractorShape: describeValueShape(recurrence),
    });
  }
  if (!events.length) {
    return {
      actions: [],
      answer: 'What date range should I use for that recurring event?',
    };
  }

  const result = await createCalendarPlanEvents(events, null, {
    maxEvents: MAX_RECURRENCE_EVENTS,
    enforceTargetDate: false,
  });
  if (!result.created.length) {
    throw new HttpError(400, 'No calendar events were created from the recurring request.', {
      skipped: sanitizeValue(result.skipped),
      extractorShape: describeValueShape(recurrence),
    });
  }

  return {
    actions: [
      {
        type: 'create_calendar_events',
        data: {
          created: result.created,
          skipped: result.skipped,
          source: recurrence.source,
          recurrence: {
            frequency: recurrence.date_rule?.frequency,
            start_date: recurrence.date_rule?.start_date,
            end_date: recurrence.date_rule?.end_date,
          },
        },
      },
    ],
    answer: formatRecurrenceSuccess(result),
  };
}

async function extractFiniteRecurrencePlan(message) {
  const raw = await generateGeminiJson({
    system: RECURRENCE_CALENDAR_EXTRACTOR_SYSTEM,
    prompt: JSON.stringify({
      today: localDate(),
      tomorrow: localDate(1),
      dateReference: buildRecurrenceDateReference(),
      userMessage: message,
    }),
    temperature: 0,
    invalidMessage: 'Gemini returned an invalid recurrence extraction response.',
    repair: true,
  });
  return normalizeFiniteRecurrencePlan(raw, message);
}

export function normalizeFiniteRecurrencePlan(raw, message = '') {
  const rule = raw?.date_rule && typeof raw.date_rule === 'object' ? raw.date_rule : {};
  const frequency = normalizeFrequency(rule.frequency, message);
  const interval = Number.isInteger(Number(rule.interval)) && Number(rule.interval) > 0
    ? Number(rule.interval)
    : frequency === 'every_n_days'
      ? parseEveryNDaysInterval(message) || 2
      : 1;
  const normalized = {
    title: cleanText(raw?.title ?? raw?.name),
    category: cleanText(raw?.category),
    start_time: raw?.start_time,
    end_time: raw?.end_time,
    location: cleanText(raw?.location),
    notes: cleanText(raw?.notes),
    clarifyingQuestion: cleanText(raw?.clarifyingQuestion ?? raw?.clarifying_question),
    source: 'gemini_recurrence_extractor',
    date_rule: {
      frequency,
      interval,
      days_of_week: normalizeDaysOfWeek(rule.days_of_week, message),
      start_date: normalizeRuleDate(rule.start_date),
      end_date: normalizeRuleDate(rule.end_date),
    },
  };

  if (!normalized.date_rule.start_date || !normalized.date_rule.end_date) {
    const inferredRange = inferRecurringDateRangeFromMessage(message);
    normalized.date_rule.start_date ||= inferredRange.start_date;
    normalized.date_rule.end_date ||= inferredRange.end_date;
  }

  return normalized;
}

export function getRecurrenceClarifyingQuestion(recurrence) {
  if (recurrence?.clarifyingQuestion) return recurrence.clarifyingQuestion;
  if (!recurrence?.title) return 'What should I call the recurring event?';
  if (!recurrence?.start_time || !recurrence?.end_time) return 'What time should I use for the recurring event?';
  if (!recurrence?.date_rule?.start_date || !recurrence?.date_rule?.end_date) return 'What date range should I use for that recurring event?';
  return '';
}

export function expandRecurrenceToEvents(recurrence) {
  const rule = recurrence?.date_rule ?? {};
  const start = rule.start_date;
  const end = rule.end_date;
  if (!start || !end || compareDates(start, end) > 0) return [];

  const frequency = normalizeFrequency(rule.frequency);
  const interval = Math.max(1, Math.trunc(Number(rule.interval ?? 1)) || 1);
  const daySet = new Set(normalizeDaysOfWeek(rule.days_of_week));
  const dates = [];
  let cursor = start;
  let index = 0;
  while (compareDates(cursor, end) <= 0) {
    if (matchesRecurrenceDate(cursor, start, frequency, interval, daySet, index)) {
      dates.push(cursor);
    }
    cursor = addDays(cursor, 1);
    index += 1;
  }

  return dates.map((date) => ({
    title: recurrence.title,
    event_date: date,
    start_time: recurrence.start_time,
    end_time: recurrence.end_time,
    category: recurrence.category,
    location: recurrence.location,
    notes: recurrence.notes,
    status: 'planned',
  }));
}

function matchesRecurrenceDate(date, startDate, frequency, interval, daySet, index) {
  const day = dayName(date);
  if (frequency === 'weekdays') return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(day);
  if (frequency === 'weekends') return ['saturday', 'sunday'].includes(day);
  if (frequency === 'weekly') return daySet.size ? daySet.has(day) : index % 7 === 0;
  if (frequency === 'every_other_day') return daysBetween(startDate, date) % 2 === 0;
  if (frequency === 'every_n_days') return daysBetween(startDate, date) % interval === 0;
  return daysBetween(startDate, date) % interval === 0;
}

function normalizeFrequency(value, message = '') {
  const text = String(value ?? '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  const source = `${text} ${String(message ?? '').toLowerCase()}`;
  if (/\bweekdays?\b|every weekday/.test(source)) return 'weekdays';
  if (/\bweekends?\b|every weekend|all weekends/.test(source)) return 'weekends';
  if (/every other day/.test(source)) return 'every_other_day';
  if (/every\s+\d+\s+days?/.test(source)) return 'every_n_days';
  if (/(every|all)\s+(mon|tues|wednes|thurs|fri|satur|sun)days?/.test(source)) return 'weekly';
  if (['daily', 'weekly', 'every_other_day', 'every_n_days', 'weekends', 'weekdays'].includes(String(value ?? ''))) return value;
  return 'daily';
}

function normalizeDaysOfWeek(value, message = '') {
  const rawItems = Array.isArray(value) ? value : [];
  const text = `${rawItems.join(' ')} ${String(message ?? '')}`.toLowerCase();
  const days = [
    ['monday', /\b(mon|monday|mondays)\b/],
    ['tuesday', /\b(tue|tues|tuesday|tuesdays)\b/],
    ['wednesday', /\b(wed|wednesday|wednesdays)\b/],
    ['thursday', /\b(thu|thur|thurs|thursday|thursdays)\b/],
    ['friday', /\b(fri|friday|fridays)\b/],
    ['saturday', /\b(sat|saturday|saturdays)\b/],
    ['sunday', /\b(sun|sunday|sundays)\b/],
  ];
  return days.filter(([, pattern]) => pattern.test(text)).map(([day]) => day);
}

function normalizeRuleDate(value) {
  if (value === undefined || value === null || value === '') return null;
  try {
    return resolveDate(value, null);
  } catch {
    return null;
  }
}

function inferRecurringDateRangeFromMessage(message) {
  const text = String(message ?? '').toLowerCase();
  const explicitStart = text.match(/\bstarting\s+(?:from|on)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4}))/);
  const duration = parseDuration(text);
  if (explicitStart && duration.days) {
    const start = resolveDate(explicitStart[1], localDate());
    return { start_date: start, end_date: addDays(start, duration.days - 1) };
  }
  if (explicitStart && duration.weeks) {
    const start = resolveDate(explicitStart[1], localDate());
    return { start_date: start, end_date: addDays(start, duration.weeks * 7 - 1) };
  }
  if (explicitStart && duration.months) {
    const start = resolveDate(explicitStart[1], localDate());
    return { start_date: start, end_date: addDays(addMonthsLocal(start, duration.months), -1) };
  }

  const reference = buildRecurrenceDateReference();
  if (/\bnext week\b/.test(text)) return reference.nextWeek;
  if (/\bthis week\b/.test(text)) return reference.thisWeek;
  if (/\bnext month\b|of next month\b/.test(text)) return reference.nextMonth;
  if (/\bthis month\b/.test(text)) return reference.thisMonth;

  const namedMonth = findNamedMonthRange(text);
  if (namedMonth) return namedMonth;

  if (/for\s+the\s+next\s+/.test(text) || /^for\s+/.test(text)) {
    if (duration.days) return { start_date: localDate(), end_date: addDays(localDate(), duration.days - 1) };
    if (duration.weeks) return { start_date: localDate(), end_date: addDays(localDate(), duration.weeks * 7 - 1) };
    if (duration.months) return { start_date: localDate(), end_date: addDays(addMonthsLocal(localDate(), duration.months), -1) };
  }

  return { start_date: null, end_date: null };
}

async function executeExplicitCalendarPlan(message, plan) {
  const extracted = await extractExplicitCalendarPlan(message, plan);
  if (!extracted.events.length) {
    throw new HttpError(400, 'Could not extract calendar events from that schedule. Include a title and time range for each event.');
  }

  const result = await createCalendarPlanEvents(extracted.events, extracted.target_date);
  if (!result.created.length) {
    throw new HttpError(400, 'No calendar events were created from the provided schedule.', {
      skipped: sanitizeValue(result.skipped),
    });
  }

  return {
    actions: [
      {
        type: 'create_calendar_events',
        data: {
          created: result.created,
          skipped: result.skipped,
          source: extracted.source,
        },
      },
    ],
    answer: formatCalendarEventsSuccess(extracted.target_date, result),
  };
}

async function extractExplicitCalendarPlan(message, plan) {
  const targetDate = inferExplicitTargetDate(message, plan, localDate());
  const localPlan = extractExplicitCalendarEventsLocally(message, targetDate);
  let geminiPlan = { target_date: targetDate, events: [] };

  try {
    const raw = await generateGeminiJson({
      system: EXPLICIT_CALENDAR_EXTRACTOR_SYSTEM,
      prompt: JSON.stringify({
        today: localDate(),
        tomorrow: localDate(1),
        targetDate,
        plannerPlan: plan,
        userMessage: message,
      }),
      temperature: 0,
      invalidMessage: 'Gemini returned an invalid calendar extraction response.',
      repair: true,
    });
    geminiPlan = normalizeExplicitCalendarExtraction(raw, targetDate);
  } catch (error) {
    if (localPlan.events.length) return { ...localPlan, source: 'local_fallback' };
    throw error;
  }

  if (localPlan.events.length >= geminiPlan.events.length) {
    return {
      ...localPlan,
      source: geminiPlan.events.length ? 'local_preferred' : 'local_fallback',
    };
  }

  return { ...geminiPlan, source: 'gemini_extractor' };
}

export function extractExplicitCalendarEventsLocally(message, fallbackDate = localDate()) {
  const targetDate = inferExplicitTargetDate(message, null, fallbackDate);
  const segments = splitExplicitScheduleSegments(message);
  const events = segments
    .map((segment, index) => buildLocalCalendarEvent(segment, targetDate, index))
    .filter(Boolean)
    .slice(0, 8);

  return {
    target_date: targetDate,
    events: normalizeEventSequence(events),
  };
}

async function executeWriteIntent(plan, message, lifeosContext) {
  if (plan.riskLevel === 'high') {
    return { actions: [{ type: 'blocked_high_risk', message: 'High-risk actions are blocked in v1.' }] };
  }

  if (plan.intent === 'create_expense') {
    const created = await createExpense(plan.args);
    return {
      actions: [{ type: 'create_expense', data: created }],
      answer: formatExpenseSuccess(created),
    };
  }

  if (plan.intent === 'create_calendar_event') {
    const created = await createCalendarEvent({ ...plan.args, range: plan.range });
    return {
      actions: [{ type: 'create_calendar_event', data: created }],
      answer: formatCalendarSuccess(created),
    };
  }

  if (plan.intent === 'update_health_log') {
    const updated = await updateHealthLog(plan.args);
    return {
      actions: [{ type: 'update_health_log', data: updated }],
      answer: formatHealthSuccess(updated),
    };
  }

  if (plan.intent === 'analyze_and_plan') {
    const targetDate = resolveDate(plan.args?.target_date || plan.args?.event_date || plan.args?.date, localDate(1));
    const proposal = await proposeCalendarPlan(message, plan, lifeosContext, targetDate);
    if (!proposal.events.length) {
      throw new HttpError(400, 'Gemini did not return any calendar events to create.');
    }
    const result = await createCalendarPlanEvents(proposal.events, targetDate);
    if (!result.created.length) {
      throw new HttpError(400, 'No calendar events were created from the proposed plan.', {
        skipped: sanitizeValue(result.skipped),
      });
    }
    return {
      actions: [
        {
          type: 'analyze_and_plan',
          data: {
            analysis: proposal.analysis,
            created: result.created,
            skipped: [...(proposal.skipped ?? []), ...result.skipped],
          },
        },
      ],
      context: lifeosContext,
    };
  }

  return { actions: [] };
}

function normalizeExplicitCalendarExtraction(raw, fallbackDate) {
  const targetDate = resolveDate(raw?.target_date ?? raw?.event_date ?? raw?.date, fallbackDate);
  const rawEvents = Array.isArray(raw?.events) ? raw.events : [];
  const events = rawEvents.slice(0, 8).map((event) => ({
    title: cleanText(event?.title ?? event?.name),
    event_date: resolveDate(event?.event_date ?? event?.date, targetDate),
    start_time: event?.start_time,
    end_time: event?.end_time,
    category: cleanText(event?.category),
    location: cleanText(event?.location),
    notes: cleanText(event?.notes),
    status: 'planned',
  })).filter((event) => event.title);

  return {
    target_date: targetDate,
    events: normalizeEventSequence(events),
  };
}

function buildLocalCalendarEvent(segment, targetDate, index) {
  try {
    const { startTime, endTime } = normalizeTimeRange({ start_time: segment }, 'start_time', 'end_time');
    if (!startTime || !endTime) return null;

    const notes = extractParentheticalNotes(segment);
    const title = cleanLocalEventTitle(segment, index);
    if (!title) return null;

    return {
      title,
      event_date: targetDate,
      start_time: startTime,
      end_time: endTime,
      category: inferCalendarCategoryFromText(`${segment} ${notes}`),
      notes,
      status: 'planned',
    };
  } catch {
    return null;
  }
}

function normalizeEventSequence(events) {
  let previousEnd = null;
  return events.map((event) => {
    try {
      const { startTime, endTime } = normalizeTimeRange(event, 'start_time', 'end_time');
      if (!startTime || !endTime) {
        return { ...event, start_time: startTime ?? event.start_time, end_time: endTime ?? event.end_time };
      }

      let startMinutes = timeToMinutes(startTime);
      let endMinutes = timeToMinutes(endTime);

      if (previousEnd !== null) {
        while (startMinutes < previousEnd && startMinutes + 12 * 60 < 24 * 60) {
          startMinutes += 12 * 60;
          if (endMinutes < startMinutes) endMinutes += 12 * 60;
        }
      }

      if (endMinutes <= startMinutes && endMinutes + 12 * 60 < 24 * 60) {
        endMinutes += 12 * 60;
      }

      if (startMinutes >= 24 * 60 || endMinutes > 24 * 60 || endMinutes <= startMinutes) {
        return { ...event, start_time: startTime, end_time: endTime };
      }

      previousEnd = endMinutes;
      return {
        ...event,
        start_time: minutesToTime(startMinutes),
        end_time: minutesToTime(endMinutes),
      };
    } catch {
      return event;
    }
  });
}

function inferExplicitTargetDate(message, plan, fallbackDate) {
  const text = String(message ?? '').toLowerCase();
  if (/\btomorrow\b/.test(text)) return localDate(1);
  if (/\btoday\b/.test(text)) return localDate();

  const dateMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\b/);
  if (dateMatch) return resolveDate(dateMatch[0], fallbackDate);

  const args = plan?.args ?? {};
  return resolveDate(args.target_date ?? args.event_date ?? args.date, fallbackDate);
}

function inferExplicitRange(message) {
  const text = String(message ?? '').toLowerCase();
  if (/\btomorrow\b/.test(text)) return 'tomorrow';
  if (/\btoday\b/.test(text)) return 'today';
  return null;
}

function buildRecurrenceDateReference() {
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

function findNamedMonthRange(text) {
  const monthIndex = MONTH_NAMES.findIndex((month) => new RegExp(`\\b${month}\\b`).test(text));
  return monthIndex >= 0 ? monthRangeForUpcomingMonth(monthIndex + 1) : null;
}

function parseDuration(text) {
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

function parseEveryNDaysInterval(message) {
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

function splitExplicitScheduleSegments(message) {
  const body = getExplicitScheduleBody(message);
  return body
    .split(/[,;\n]+|\s+\bthen\b\s+/i)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segmentHasTimeRange(segment));
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

function cleanLocalEventTitle(segment, index) {
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

function extractParentheticalNotes(value) {
  const matches = [...String(value ?? '').matchAll(/\(([^)]{1,300})\)/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  return matches.length ? matches.join(' ') : null;
}

function inferCalendarCategoryFromText(value) {
  const text = String(value ?? '').toLowerCase();
  if (/\b(science|study|studying|lesson|learning|exam|homework)\b/.test(text)) return 'Study';
  if (/\b(doctor|dentist|medical|hospital|health|recovery|lunch|meal|eat|eating)\b/.test(text)) return 'Health';
  if (/\b(gym|workout|boxing|cardio|training|sport|sports)\b/.test(text)) return 'Workout';
  if (/\b(work|coding|business|content|client|money)\b/.test(text)) return 'Work';
  if (/\b(errand|errands|appointment|shopping|take .+ somewhere|logistics)\b/.test(text)) return 'Errands';
  if (/\b(mom|mother|dad|father|family|friend|friends|girlfriend|dinner with)\b/.test(text)) return 'Social';
  if (/\b(movie|game|games|leisure|fun|entertainment)\b/.test(text)) return 'Entertainment';
  if (/\b(journal|journaling|admin|routine|planning|chores?)\b/.test(text)) return 'Personal';
  if (/\b(sleep|nap|bedtime)\b/.test(text)) return 'Sleep';
  return 'Personal';
}

function countExplicitTimeRanges(message) {
  const text = String(message ?? '');
  const regexMatches = [...text.matchAll(new RegExp(TIME_RANGE_PATTERN_SOURCE, 'gi'))].length;
  const segmentMatches = splitExplicitScheduleSegments(text).length;
  return Math.max(regexMatches, segmentMatches);
}

function looksLikeAnalysisRequest(text) {
  return /\b(analy[sz]e|review|summari[sz]e|insights?|how (?:have|am|is|are)|last week|last month|last 30 days|more productive)\b/.test(text);
}

function looksLikeExpenseOrHealthRequest(text) {
  return /\b(expense|euro|euros|eur|dollar|dollars|usd|€|\$|water|energy|coffee|adc|sleep|wake|brush|shower|creatine|skin|journal)\b/.test(text);
}

function formatExpenseSuccess(expense) {
  return `Added expense: ${expense.vendor} - EUR ${formatMoney(expense.amount)} - ${expense.category} - ${expense.spent_on}.`;
}

function formatCalendarSuccess(event) {
  const timeRange = event.start_time && event.end_time
    ? ` - ${formatTime(event.start_time)}-${formatTime(event.end_time)}`
    : event.start_time
      ? ` - ${formatTime(event.start_time)}`
      : '';
  return `Added calendar event: ${event.title} - ${event.event_date}${timeRange}.`;
}

function formatCalendarEventsSuccess(targetDate, result) {
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

function formatHealthSuccess(updated) {
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

function formatRecurrenceSuccess(result) {
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

async function proposeCalendarPlan(message, plan, lifeosContext, targetDate) {
  const prompt = JSON.stringify({
    userMessage: message,
    targetDate,
    range: getRangeWindow(plan.range),
    plan,
    lifeosContext,
  });
  const proposal = await generateGeminiJson({ system: PLAN_SYSTEM, prompt, temperature: 0.25 });
  return {
    analysis: String(proposal.analysis ?? '').trim(),
    events: Array.isArray(proposal.events) ? proposal.events : [],
    skipped: Array.isArray(proposal.skipped) ? proposal.skipped : [],
  };
}

async function answerWithGemini(message, plan, lifeosContext, actions) {
  const prompt = JSON.stringify({
    userMessage: message,
    plan,
    lifeosContext,
    actions,
  });
  return generateGeminiText({ system: ANSWER_SYSTEM, prompt, temperature: 0.25 });
}

async function safeLogAiSuccess({ context, message, source, answer, actions }) {
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
      actions: actions.map(sanitizeActionForLog),
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

async function safeLogAiError({ context, message, source, plan, writePath, error, diagnostics }) {
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

function inferActionLogType(actions) {
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

function extractRecordRefs(actions) {
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
    if (action.type === 'create_calendar_event' && action.data?.id) {
      refs.push(calendarEventRef(action.data));
    }
    if ((action.type === 'create_calendar_events' || action.type === 'analyze_and_plan') && Array.isArray(action.data?.created)) {
      refs.push(...action.data.created.map(calendarEventRef));
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

function logAiWriteFailure({ context, message, plan, writePath, error }) {
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

function logAiPlannerFailure({ context, message, error }) {
  const diagnostics = {
    requestId: context?.requestId,
    stage: 'planner',
    message: truncate(String(message ?? ''), 1000),
    explicitMultiEventLikely: isObviousExplicitMultiEventCalendarRequest(message),
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

function attachDebugDiagnostics(error, diagnostics) {
  if (String(process.env.LIFEOS_DEBUG_AI ?? '').toLowerCase() !== 'true') return;
  if (!(error instanceof HttpError)) return;
  const existingDetails = error.details && typeof error.details === 'object' ? error.details : {};
  error.details = {
    ...existingDetails,
    debug: diagnostics,
  };
}

function sanitizeValue(value, depth = 0) {
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

function describeValueShape(value, depth = 0) {
  if (depth > 3) return 'truncated';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [key, describeValueShape(item, depth + 1)]));
  }
  return typeof value;
}

function cleanText(value) {
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

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function compareDates(a, b) {
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

function dayName(value) {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayIndex(value)];
}

function daysBetween(start, end) {
  return Math.round((toUtcDate(end).getTime() - toUtcDate(start).getTime()) / 86400000);
}

function addMonthsLocal(dateValue, months) {
  const date = toUtcDate(dateValue);
  date.setUTCMonth(date.getUTCMonth() + months);
  return formatDate(date);
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
