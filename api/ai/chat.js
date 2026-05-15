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
- For health logging, extract logged_on/date and provided fields: energy, coffee, adc, sleep_hours, sleep_start, wake_time, notes. Only extract water when the user explicitly asks to log water because it is kept for backward compatibility.
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

const TIME_TEXT_PATTERN = String.raw`(?:\d{1,2}:[0-5]\d\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))`;
const TIME_RANGE_PATTERN_SOURCE = String.raw`\b(?:from\s+)?${TIME_TEXT_PATTERN}\s*(?:-|to|until)\s*${TIME_TEXT_PATTERN}\b`;
const SECRET_KEY_PATTERN = /(authorization|bearer|token|secret|password|service_role|api[_-]?key|gemini|supabase)/i;

export default async function handler(req, res) {
  const context = createRequestContext(req, res);
  try {
    if (handleOptions(req, res)) return;
    requirePost(req);
    await requireAssistantAuth(req);

    const body = await readJsonBody(req);
    const message = String(body.message ?? '').trim();
    if (!message) throw new HttpError(400, 'message is required.');
    if (message.length > 2000) throw new HttpError(400, 'message must be 2000 characters or fewer.');

    const plan = await planMessage(message);
    const actions = [];
    let lifeosContext = null;
    let answer = '';
    const explicitMultiEventRequest = isExplicitMultiEventCalendarRequest(message, plan);

    if (explicitMultiEventRequest) {
      try {
        const writeResult = await executeExplicitCalendarPlan(message, plan);
        actions.push(...writeResult.actions);
        answer = writeResult.answer;
        return sendSuccess(res, 200, { answer, plan, actions, contextSummary: lifeosContext }, context);
      } catch (error) {
        const diagnostics = logAiWriteFailure({ context, message, plan, writePath: 'explicit_calendar_events', error });
        attachDebugDiagnostics(error, diagnostics);
        throw error;
      }
    }

    if (plan.intent === 'clarify') {
      answer = plan.clarifyingQuestion || 'What details should I use?';
      return sendSuccess(res, 200, { answer, plan, actions }, context);
    }

    if (plan.needsRead || ['analyze', 'analyze_and_plan', 'blocked_destructive'].includes(plan.intent)) {
      lifeosContext = await readLifeOSContext(plan);
    }

    if (plan.intent === 'blocked_destructive') {
      answer = await answerWithGemini(message, plan, lifeosContext, [
        { type: 'blocked_destructive', message: 'Deletion and destructive updates are not enabled for the AI assistant yet.' },
      ]);
      return sendSuccess(res, 200, { answer, plan, actions: [{ type: 'blocked_destructive' }], contextSummary: lifeosContext }, context);
    }

    if (plan.intent === 'unsupported') {
      answer = 'I cannot do that in this version of the LifeOS assistant.';
      return sendSuccess(res, 200, { answer, plan, actions, contextSummary: lifeosContext }, context);
    }

    if (plan.needsWrite) {
      let writeResult;
      try {
        writeResult = await executeWriteIntent(plan, message, lifeosContext);
      } catch (error) {
        const diagnostics = logAiWriteFailure({ context, message, plan, writePath: plan.intent, error });
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

    sendSuccess(res, 200, { answer, plan, actions, contextSummary: lifeosContext }, context);
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
      answer: `Updated health log for ${updated.logged_on}.`,
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

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
