import { HttpError } from '../http.js';
import {
  addDays,
  createCalendarEvent,
  createCalendarPlanEvents,
  createExpense,
  createMemo,
  localDate,
  localTime,
  normalizePlannerPlan,
  resolveDate,
  updateHealthLog,
} from '../lifeosTools.js';
import {
  addMinutesToTime,
  addMonthsLocal,
  buildRecurrenceDateReference,
  cleanDayScheduleTitle,
  cleanLocalEventTitle,
  cleanText,
  compareDates,
  countDayScheduleItems,
  countExplicitTimeRanges,
  dayName,
  dayScheduleClarification,
  daysBetween,
  defaultDayScheduleDuration,
  describeValueShape,
  extractDaySchedulePoint,
  extractDayScheduleRange,
  extractParentheticalNotes,
  findNamedMonthRange,
  formatCalendarEventsSuccess,
  formatCalendarSuccess,
  formatDayScheduleSuccess,
  formatExpenseSuccess,
  formatHealthSuccess,
  formatMemoSuccess,
  formatRecurrenceSuccess,
  formatSleepStartSuccess,
  inferCalendarCategoryFromText,
  inferExplicitRange,
  looksLikeAnalysisRequest,
  looksLikeExpenseOrHealthRequest,
  looksLikeMultiItemScheduleMessage,
  minutesToTime,
  normalizeDayScheduleTime,
  parseDuration,
  parseEveryNDaysInterval,
  proposeCalendarPlan,
  sanitizeValue,
  splitDayScheduleSegments,
  splitExplicitScheduleSegments,
  timeToMinutes,
} from './chatScheduleParsing.js';
import { buildCommandContextForPrompt } from '../brainWorkingContext.js';
import { formatBrainContextForPrompt, formatBrainConversationForPrompt } from '../brain.js';
import { formatBrainRouteForPrompt } from '../brainRouter.js';
import { formatBrainSkillForPrompt } from '../brainSkills.js';
import { formatVaultResultsForPrompt } from '../brainVault.js';
import { generateGeminiJson } from '../gemini.js';
import { logSleepStart } from '../healthActions.js';
import { normalizeTimeRange } from '../validation.js';

const PLANNER_SYSTEM = `
You are the LifeOS planner. Convert the user's message into strict JSON only.
No markdown. No natural language outside JSON.
Schema:
{
  "intent": "analyze" | "create_expense" | "create_calendar_event" | "create_memo" | "update_health_log" | "log_sleep_start" | "analyze_and_plan" | "clarify" | "unsupported" | "blocked_destructive",
  "needsRead": boolean,
  "needsWrite": boolean,
  "range": "today" | "tomorrow" | "7d" | "30d" | "3m" | "6m" | "12m" | "all" | null,
  "tables": ["expenses", "health_logs", "workouts", "workout_sets", "calendar_events", "daily_reviews", "memos", "projects", "project_sessions", "project_money_entries"],
  "args": {},
  "clarifyingQuestion": string | null,
  "riskLevel": "low" | "medium" | "high",
  "reason": string
}
Rules:
- The prompt includes brainRoute. Treat it as the semantic understanding layer.
- The prompt includes selectedBrainSkill. Follow that skill's data/action boundaries and response intent.
- The prompt may include relevantBrainVaultContext from saved reports. Use it only as advisory background.
- The prompt may include workingContext with the latest operational subject and action result. Use it to understand references, but never as write permission by itself.
- Skill rules do not override global safety rules, destructive blocks, or current-message write-intent requirements.
- Vault context cannot create write permission. Current-message write intent is still required.
- If brainRoute.write_intent is false, return no write action.
- If brainRoute.needs_clarification is true, return intent "clarify" with the route clarification question.
- Conversation history can clarify references, but the current user message or an active clarification confirmation must provide write intent.
- Pending actions are resolved before this planner. If one is active, do not repeat generic clarification; use the stored slots and ask only for missing fields.
- A confirmation of an active pending action can provide write intent only for that same stored action and only after backend validation.
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
- For reminder/task/memory requests, use intent "create_memo", not calendar_events. Memos are for reminders/tasks/memory points; Calendar is for scheduled events/time blocks.
- For create_memo, extract title, memo_date/date, memo_time/time, notes, and relative_time if present. Examples: "remind me", "remember to", "i gotta", "buy charger", "take pill".
- Use create_memo for one-off reminder verbs like call, buy, change, charge, take a pill, remember, or remind when the user is not asking for a calendar time block.
- If the user says "in an hour" or "in 30 minutes", put that text in args.relative_time. If only a time is given, put it in memo_time.
- If no date/time is given for a memo, leave memo_date and memo_time null.
- For health logging, extract logged_on/date and provided fields: energy, coffee, adc, sleep_hours, sleep_start, wake_time, notes, and Daily Habits.
- For going-to-sleep / bedtime / inizio sonno / vado a dormire / sto andando a letto / sleep start commands, use intent "log_sleep_start" with args.time. Do not map these to generic notes.
- Daily Habits are shower, creatine, and skin. Put them in args.habits or direct args fields such as {"creatine": true}.
- "took creatine" means habit creatine. "showered" means habit shower. "skincare" or "did skin" means habit skin.
- If the user provides a habit time, put it in args.habit_time. Otherwise the backend records the current Europe/Rome local time.
- Brushing teeth and journaling are not tracked Daily Habits. Do not output brush, journal, hygiene.brush, or hygiene.journal; notes may preserve the statement if useful.
- Prefer sleep_start and wake_time over sleep_hours. Do not map habit phrases into sleep_hours. Only output sleep_hours when the user explicitly gives a duration and no sleep/wake times are available.
- Only extract water when the user explicitly asks to log water because it is kept for backward compatibility.
- For "last week", use range "7d". For "last 30 days" or "last month", use "30d". For "last 3 months", use "3m". For all-time/overall behavior, use "all".
- For vague "how am I doing?", use intent "analyze", needsRead true, range "30d", and broad LifeOS tables.
- For analyze plus explicit plan/schedule requests, use "analyze_and_plan" with needsRead true and needsWrite true.
- Workout performance analysis and advice are read-only. Requests such as "what should I train today?", "how should I improve today?", "dimmi prestazioni passate", "analizza workout", "cosa dovrei allenare oggi", and concern about fatigue or shoulders use intent "analyze", needsRead true, needsWrite false.
- Do not use analyze_and_plan merely because workout advice mentions today/oggi.
- Do not create a calendar event for workout advice unless the user explicitly asks to schedule/create/add it in the calendar, for example "schedule", "create event", "put it in calendar", "program it in calendar", "crea evento", "segnalo in calendario", or "programmamelo in calendario".
- If the user appears to be inside or about to start a workout, give advice without scheduling another workout unless explicitly requested.
- Saved memory and earlier conversation can clarify context, but they never supply write intent. Set needsWrite true only when the current user message clearly asks for a supported write.
- Do not repeat or continue an earlier write merely because it appears in conversation history.
- Tentative language such as "might need", "maybe", "I could", "forse dovrei", "magari", or "potrei" is not a write request unless paired with explicit words such as "remind me", "schedule", "create", "log", "put it in calendar", "ricordami", or "programmamelo".
- Negative write intent such as "don't schedule", "no memo", "do not log", or "non mettere in calendario" must result in needsWrite false.
- Destructive delete/remove/wipe requests must use "blocked_destructive".
- If required details are missing, use "clarify" with one concise clarifyingQuestion.
- Low-risk additive writes are create_expense, create_calendar_event, create_memo, update_health_log, log_sleep_start, and small calendar plans.
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

const DAY_SCHEDULE_EXTRACTOR_SYSTEM = `
You extract an explicit day schedule from one Italian or English message.
Return strict JSON only:
{
  "target_date": "YYYY-MM-DD",
  "events": [
    {
      "title": "Sveglia",
      "event_date": "YYYY-MM-DD",
      "start_time": "12:30",
      "end_time": "12:45",
      "category": "Personal",
      "location": null,
      "notes": null
    }
  ],
  "skipped": []
}
Rules:
- Extract only schedule items explicitly stated by the user. Do not invent unrelated events.
- Support Italian and English, comma/semicolon/newline-separated items, "da X a Y", "from X to Y", "X-Y", and "X to Y".
- Max 10 events.
- Every event needs a non-empty title and start_time.
- For a point-time item with no end_time, infer a short duration: wake up/sveglia 15 minutes, lunch/pranzo 30 minutes, dinner/cena 45 minutes, otherwise 30 minutes.
- Use the provided today/tomorrow dates and targetDate.
- Use canonical HH:MM when possible. Interpret dots in times as colons, such as 12.30pm = 12:30pm.
- Treat invalid mixed notation conservatively: 13.40pm means 13:40, while 4.30pm means 16:30.
- Prefer categories: Work, Study, School, Health, Workout, Errands, Personal, Social, Entertainment, Sleep.
- Category guidance: matematica/studio/study = Study; palestra/gym/workout = Workout; pranzo/cena/lunch/dinner = Health or Personal; sveglia/wake up = Personal; sleep/nap = Sleep; school = School; work/deep work = Work.
- Keep explicit overlaps instead of dropping an item.
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
const MAX_RECURRENCE_EVENTS = 60;

export async function planMessage(message, brainContext, brainChat, brainSkill, brainRoute, brainVault) {
  const prompt = JSON.stringify({
    today: localDate(),
    tomorrow: localDate(1),
    localTime: localTime(),
    timeZone: 'Europe/Rome',
    userMessage: message,
    brainRoute: formatBrainRouteForPrompt(brainRoute),
    userMemoryContext: formatBrainContextForPrompt(brainContext),
    recentConversation: formatBrainConversationForPrompt(brainChat),
    workingContext: buildCommandContextForPrompt(brainChat?.workingContext),
    selectedBrainSkill: formatBrainSkillForPrompt(brainSkill?.skill ?? brainSkill),
    relevantBrainVaultContext: brainVault?.formatted ?? formatVaultResultsForPrompt([]),
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

export function hasExplicitCalendarCreationRequest(message) {
  const text = String(message ?? '').toLowerCase();
  const explicitCalendarPhrase = /\b(?:calendar|calendario)\b/.test(text)
    && /\b(?:add|create|put|schedule|plan|log|crea|aggiungi|segna|segnalo|segnala|programma|programmamelo|pianifica)\b/.test(text);
  const explicitEventPhrase = /\b(?:create|add|schedule)\s+(?:an?\s+)?event\b/.test(text)
    || /\bcrea\s+(?:un\s+)?evento\b/.test(text);
  const scheduleWithTime = /\b(?:schedule|block|programma|programmare|pianifica|blocca|fissa)\b/.test(text)
    && /\b(?:today|tomorrow|oggi|domani|at|alle|dalle|from)\b/.test(text)
    && /\d{1,2}(?:(?:[:.]\d{2})|\s*(?:am|pm))?/.test(text);
  return explicitCalendarPhrase || explicitEventPhrase || scheduleWithTime;
}

export function isWorkoutAdviceOnlyRequest(message) {
  const text = String(message ?? '').toLowerCase();
  if (!text || hasExplicitCalendarCreationRequest(text)) return false;
  const hasWorkoutTerms = /\b(workouts?|exercise|training|train|allenament[oi]|allenare|petto|chest|schiena|back|gambe|legs?|spalle|shoulders?|biceps?|triceps?|panca|bench|dumbbell bench press|military|squat|leg press|pull[- ]?ups?|prestazioni|performance|serie|sets?|reps?|rpe)\b/.test(text);
  const hasAdviceTerms = /\b(analy[sz]e|analizza|dimmi|tell me|come migliorare|how (?:can|should) i improve|cosa dovrei|dovrei allenare|what should i train|prestazioni passate|past performance|consigli|advice|recommend|oggi|today|paura|scared|fatigue|cedere)\b/.test(text);
  return hasWorkoutTerms && hasAdviceTerms;
}

export function enforceWorkoutAdviceReadOnly(message, plan = {}) {
  if (!isWorkoutAdviceOnlyRequest(message)) return plan;
  return {
    ...plan,
    intent: 'analyze',
    needsRead: true,
    needsWrite: false,
    range: plan.range ?? '30d',
    tables: ['workouts', 'workout_sets'],
    args: {},
    clarifyingQuestion: null,
    riskLevel: 'low',
    reason: 'Workout analysis/advice request forced to read-only; no explicit calendar creation request.',
  };
}

export function isObviousDayScheduleRequest(message) {
  const text = String(message ?? '').trim().toLowerCase();
  if (!text || looksLikeAnalysisRequest(text)) return false;
  if (/\b(remind me|remember to|ricordami|memo)\b/.test(text)) return false;
  if (/\b(expense|spesa|euro|euros|eur|dollar|dollars|usd|€|\$)\b/.test(text)) return false;

  const hasDayLanguage = /(?:^|\b)(?:segna|programma|pianifica)\s+(?:la\s+)?giornata(?:\s+di\s+oggi)?\b/.test(text)
    || /\b(?:log|plan|schedule)\s+(?:my\s+)?day\b/.test(text)
    || /^(?:plan|schedule|log)\s+(?:today|oggi)\s*:/i.test(text)
    || /^(?:today|oggi)\s*:/i.test(text);

  return hasDayLanguage && countDayScheduleItems(message) >= 2;
}

export function createFiniteRecurringCalendarSyntheticPlan() {
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

export function createDayScheduleSyntheticPlan(message) {
  return {
    intent: 'create_calendar_events',
    needsRead: false,
    needsWrite: true,
    range: inferExplicitRange(message),
    tables: ['calendar_events'],
    args: {},
    clarifyingQuestion: null,
    riskLevel: 'low',
    reason: 'Mixed point-time and ranged day schedule detected before planner.',
  };
}

export function isObviousExplicitMultiEventCalendarRequest(message) {
  const text = String(message ?? '').toLowerCase();
  if (!text || looksLikeAnalysisRequest(text)) return false;
  const hasScheduleAction = /\b(plan|schedule|create|add|put|block)\b/.test(text) || /\b(?:i\s+)?want to\b/.test(text);
  const hasCalendarLanguage = /\b(events?|schedule|calendar|today|tomorrow|from)\b/.test(text);
  return hasScheduleAction && hasCalendarLanguage && countExplicitTimeRanges(message) >= 2;
}

export function createExplicitCalendarSyntheticPlan(message) {
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

export function isDaySchedulePlannerGuard(message, plan) {
  if (plan?.intent !== 'create_calendar_event') return false;
  return isObviousDayScheduleRequest(message)
    || looksLikeMultiItemScheduleMessage(message);
}

export async function executeFiniteRecurringCalendarPlan(message, plan) {
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
          sourcePath: 'recurrence',
          target_date: null,
          created_dates: [...new Set(result.created.map((event) => event.event_date))],
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

export async function executeExplicitCalendarPlan(message, plan) {
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
          sourcePath: 'explicit_multi_event',
          target_date: extracted.target_date,
          created_dates: [...new Set(result.created.map((event) => event.event_date))],
        },
      },
    ],
    answer: formatCalendarEventsSuccess(extracted.target_date, result),
  };
}

export async function executeDaySchedulePlan(message, plan) {
  const extracted = await extractDaySchedulePlan(message, plan);
  if (!extracted.events.length) {
    return {
      actions: [],
      answer: dayScheduleClarification(message),
    };
  }

  const result = await createCalendarPlanEvents(extracted.events, extracted.target_date, {
    maxEvents: 10,
    allowOverlaps: true,
  });
  if (!result.created.length) {
    return {
      actions: [],
      answer: dayScheduleClarification(message),
    };
  }

  return {
    actions: [
      {
        type: 'create_calendar_events',
        data: {
          created: result.created,
          skipped: [...(extracted.skipped ?? []), ...result.skipped],
          source: extracted.source,
          sourcePath: 'day_schedule',
          target_date: extracted.target_date,
          created_dates: [...new Set(result.created.map((event) => event.event_date))],
        },
      },
    ],
    answer: formatDayScheduleSuccess(extracted.target_date, result, message),
  };
}

async function extractDaySchedulePlan(message, plan) {
  const targetDate = inferDayScheduleTargetDate(message, plan, localDate());
  const localPlan = extractDayScheduleEventsLocally(message, targetDate);
  let geminiPlan = { target_date: targetDate, events: [], skipped: [] };

  try {
    const raw = await generateGeminiJson({
      system: DAY_SCHEDULE_EXTRACTOR_SYSTEM,
      prompt: JSON.stringify({
        today: localDate(),
        tomorrow: localDate(1),
        targetDate,
        userMessage: message,
      }),
      temperature: 0,
      invalidMessage: 'Gemini returned an invalid day schedule extraction response.',
      repair: true,
    });
    geminiPlan = normalizeDayScheduleExtraction(raw, targetDate);
  } catch (error) {
    if (localPlan.events.length) {
      return { ...localPlan, source: 'local_day_schedule_fallback' };
    }
    throw error;
  }

  if (localPlan.events.length >= geminiPlan.events.length) {
    return {
      ...localPlan,
      source: geminiPlan.events.length ? 'local_day_schedule_preferred' : 'local_day_schedule_fallback',
    };
  }

  return { ...geminiPlan, source: 'gemini_day_schedule_extractor' };
}

export function extractDayScheduleEventsLocally(message, fallbackDate = localDate()) {
  const targetDate = inferDayScheduleTargetDate(message, null, fallbackDate);
  const segments = splitDayScheduleSegments(message);
  const skipped = [];
  const events = [];

  for (const segment of segments) {
    const event = buildLocalDayScheduleEvent(segment, targetDate);
    if (event) events.push(event);
    else skipped.push({ title: cleanDayScheduleTitle(segment) || 'Untitled', reason: 'Could not extract a title and time.' });
  }

  return {
    target_date: targetDate,
    events: normalizeEventSequence(events).slice(0, 10),
    skipped: skipped.slice(0, 10),
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

export async function executeWriteIntent(plan, message, lifeosContext, brainContext, brainChat, brainSkill, brainRoute) {
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
      actions: [{
        type: 'create_calendar_event',
        data: {
          ...created,
          sourcePath: 'single_event',
          target_date: created.event_date,
          created_dates: [created.event_date],
        },
      }],
      answer: formatCalendarSuccess(created),
    };
  }

  if (plan.intent === 'create_memo') {
    const created = await createMemo(plan.args, message);
    return {
      actions: [{ type: 'create_memo', data: created }],
      answer: formatMemoSuccess(created),
    };
  }

  if (plan.intent === 'update_health_log') {
    const updated = await updateHealthLog(plan.args);
    return {
      actions: [{ type: 'update_health_log', data: updated }],
      answer: formatHealthSuccess(updated),
    };
  }

  if (plan.intent === 'log_sleep_start') {
    const result = await logSleepStart({
      time: plan.args?.time ?? plan.args?.sleep_start ?? plan.args?.sleepStart,
      loggedOn: plan.args?.logged_on || plan.args?.date ? resolveDate(plan.args.logged_on ?? plan.args.date, undefined) : undefined,
      notes: plan.args?.notes,
    });
    return {
      actions: [{ type: 'log_sleep_start', data: result }],
      answer: formatSleepStartSuccess(result),
    };
  }

  if (plan.intent === 'analyze_and_plan') {
    const targetDate = resolveDate(plan.args?.target_date || plan.args?.event_date || plan.args?.date, localDate(1));
    const proposal = await proposeCalendarPlan(message, plan, lifeosContext, targetDate, brainContext, brainChat, brainSkill, brainRoute);
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
            sourcePath: 'analyze_and_plan',
            target_date: targetDate,
            created_dates: [...new Set(result.created.map((event) => event.event_date))],
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

function normalizeDayScheduleExtraction(raw, fallbackDate) {
  const targetDate = resolveDate(raw?.target_date ?? raw?.event_date ?? raw?.date, fallbackDate);
  const skipped = Array.isArray(raw?.skipped) ? raw.skipped.slice(0, 10).map((item) => sanitizeValue(item)) : [];
  const events = (Array.isArray(raw?.events) ? raw.events : []).slice(0, 10).map((event) => {
    const title = cleanText(event?.title ?? event?.name);
    const startTime = normalizeDayScheduleTime(event?.start_time ?? event?.time);
    let endTime = normalizeDayScheduleTime(event?.end_time);
    if (title && startTime && !endTime) endTime = addMinutesToTime(startTime, defaultDayScheduleDuration(title));
    if (!title || !startTime || !endTime) return null;
    return {
      title,
      event_date: resolveDate(event?.event_date ?? event?.date, targetDate),
      start_time: startTime,
      end_time: endTime,
      category: cleanText(event?.category) || inferCalendarCategoryFromText(title),
      location: cleanText(event?.location),
      notes: cleanText(event?.notes),
      status: 'planned',
    };
  }).filter(Boolean);

  return {
    target_date: targetDate,
    events: normalizeEventSequence(events),
    skipped,
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

function buildLocalDayScheduleEvent(segment, targetDate) {
  const range = extractDayScheduleRange(segment);
  if (range) {
    const title = cleanDayScheduleTitle(`${segment.slice(0, range.index)} ${segment.slice(range.index + range.raw.length)}`);
    if (!title) return null;
    return {
      title,
      event_date: targetDate,
      start_time: range.startTime,
      end_time: range.endTime,
      category: inferCalendarCategoryFromText(segment),
      notes: extractParentheticalNotes(segment),
      status: 'planned',
    };
  }

  const point = extractDaySchedulePoint(segment);
  if (!point) return null;
  const title = cleanDayScheduleTitle(`${segment.slice(0, point.index)} ${segment.slice(point.index + point.raw.length)}`);
  if (!title) return null;
  return {
    title,
    event_date: targetDate,
    start_time: point.time,
    end_time: addMinutesToTime(point.time, defaultDayScheduleDuration(title)),
    category: inferCalendarCategoryFromText(segment),
    notes: extractParentheticalNotes(segment),
    status: 'planned',
  };
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

function inferDayScheduleTargetDate(message, plan, fallbackDate) {
  const text = String(message ?? '').toLowerCase();
  if (/\bdomani\b/.test(text)) return localDate(1);
  if (/\boggi\b/.test(text)) return localDate();
  return inferExplicitTargetDate(message, plan, fallbackDate);
}
