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
- Extract times as 24-hour HH:MM.
- For simple expense creation, extract vendor, amount, category, spent_on/date, notes. Amount may include currency words or symbols.
- For calendar creation, extract title, event_date/date, start_time, end_time, category, location, notes. Prefer calendar categories from this list: Work, Study, School, Health, Workout, Entertainment, Sleep.
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
- Do not schedule destructive actions.
- Keep titles short and useful.
- Prefer categories from this list: Work, Study, School, Health, Workout, Entertainment, Sleep.
`;

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
      const writeResult = await executeWriteIntent(plan, message, lifeosContext);
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
    const result = await createCalendarPlanEvents(proposal.events, targetDate);
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
