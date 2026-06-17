import { generateGeminiJson, generateGeminiText } from '../_utils/gemini.js';
import {
  archiveMatchingBrainMemory,
  beginBrainChat,
  extractAndPersistBrainKnowledge,
  extractExplicitMemoryCommand,
  formatBrainConversationForPrompt,
  formatBrainContextForPrompt,
  loadBrainContext,
  persistBrainAssistantMessage,
  persistBrainErrorMessage,
  persistExplicitBrainMemory,
} from '../_utils/brain.js';
import {
  buildPendingActionFromCandidate,
  extractLatestPendingAction,
  extractPendingActionCandidateWithAI,
  formatPendingActionCompletedAnswer,
  formatPendingActionQuestion,
  markPendingActionCompleted,
  resolvePendingActionTurn,
  validatePendingActionCandidate,
} from '../_utils/brainPendingActions.js';
import {
  buildBrainWorkingContext,
  buildCommandContextForPrompt,
  buildSubjectFromActionResult,
  buildSubjectFromPendingAction,
  serializeWorkingContextForMetadata,
} from '../_utils/brainWorkingContext.js';
import {
  commandDraftToPendingAction,
  commandDraftToPlannerPlan,
  extractBrainCommandDraftWithAI,
  formatCommandDraftClarification,
  shouldUseCommandDraft,
  validateBrainCommandDraft,
} from '../_utils/brainCommandDraft.js';
import {
  formatBrainSkillForPrompt,
  getBrainSkill,
  selectBrainSkill,
} from '../_utils/brainSkills.js';
import {
  canExecuteBrainAction,
  fallbackBrainRoute,
  formatBrainRouteForPrompt,
  routeBrainMessageWithAI,
  serializeBrainRoute,
  looksLikeVagueCalendarBlockRequest,
  specificCalendarClarification,
} from '../_utils/brainRouter.js';
import {
  createVaultDocument,
  createVaultDocumentFromMessage,
  formatVaultResultsForPrompt,
  searchBrainVault,
  serializeVaultContextForMetadata,
} from '../_utils/brainVault.js';
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
import { getActionUserId, getSupabaseAdmin, requireConfiguredUserAccess } from '../_utils/supabaseAdmin.js';
import {
  addDays,
  createAiActionLog,
  createCalendarEvent,
  createCalendarPlanEvents,
  createExpense,
  createMemo,
  getRangeWindow,
  localDate,
  localTime,
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
  "intent": "analyze" | "create_expense" | "create_calendar_event" | "create_memo" | "update_health_log" | "analyze_and_plan" | "clarify" | "unsupported" | "blocked_destructive",
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
- Low-risk additive writes are create_expense, create_calendar_event, create_memo, update_health_log, and small calendar plans.
`;

const ANSWER_SYSTEM = `
You are LifeOS Brain, the user's personal operating layer inside LifeOS.
Use only the provided LifeOS data and action results.
Do not pretend unavailable data exists.
Distinguish facts from suggestions.
Be direct, practical, and concise.
Connect relevant domains such as sleep, health, workouts, projects, money, calendar, and memos.
Saved memory is helpful context, not absolute truth. Prefer the current message if it conflicts.
Brain Route context explains the semantic mode, data needs, write intent, ambiguity, and risk.
Selected Brain Skill context guides domain framing, allowed data, allowed actions, and response style.
Relevant Brain Vault context may contain saved long-form reports. Use it as advisory context when relevant, but do not treat it as source-of-truth structured data.
Working Context may contain the latest operational subject/action result. Use it for references such as "it", "same time", "lo", or "anche", but never let it authorize writes without the current user message.
Skill rules never override global safety guards or current-message write-intent requirements.
Vault context cannot authorize writes.
Do not claim an action was completed unless the provided action result confirms success.
Default to read-only advice unless the user clearly asks for a write.
Capability levels:
- Level 0: answer, analysis, advice, and coaching only.
- Level 1: explicit low-risk logs such as health habits, memos, expenses, wake, and sleep.
- Level 2: explicit structured writes such as calendar events and supported LifeOS records.
- Level 3: plans should remain previews unless the user explicitly asks to create them.
- Level 4: external email or messaging is not implemented and must not be claimed.
Format responses with concise Markdown:
- Use short paragraphs.
- Use bullet lists when helpful.
- Use bold for compact labels.
- Do not use giant headings.
- For casual/simple messages, reply in 1-3 short sentences.
- Do not dump LifeOS status, Health, Schedule, Risk, or Action sections unless the user asks for status, analysis, or a plan.
- Do not use callouts for casual chat.
- Ask at most one useful follow-up when needed.
- Never output raw HTML.
You may use LifeOS callouts only when useful:
- [good]...[/good] for positive signals.
- [warn]...[/warn] for sparse data, weak evidence, or caution.
- [bad]...[/bad] for clearly negative patterns.
- [info]...[/info] for neutral facts.
- [action]...[/action] for recommended next steps.
Do not overuse callouts.
Use [action] only when there is a specific next step, not as a default section.
Never invent other callout tags.
For finance, give personal tracking insights, not professional financial advice.
For health, give lifestyle-pattern insights, not medical diagnosis.
For workout, give training observations, not medical advice.
If data is sparse, say that clearly.
If actions were created, state exactly what was created.
For workout advice-only requests, give analysis/recommendations and do not claim that an event or action was created.
For read-only advice, do not use wording that implies an action was created or will be created. Avoid phrases like "Ho pianificato", "Programmo", "Vuoi che imposti", or "Vuoi che scheduli" unless the user explicitly asks for a write.
`;

const FOLLOW_UP_TRANSFORM_SYSTEM = `
You transform the latest relevant assistant answer in a persistent LifeOS Brain conversation.

Rules:
- Use the provided latest assistant answer as the source material.
- Apply only the current user's requested transformation, such as sorting, rewriting, summarizing, translating, or formatting as a table.
- Do not create actions, calendar events, memos, health logs, expenses, or project records.
- Do not add new claims unless clearly supported by the latest assistant answer.
- Preserve the source language unless the user asks to translate.
- If the user asks to sort chronologically and dates are present, order from oldest to newest.
- Be concise.
- Do not say "I updated it" or "I saved it".
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

const TIME_TEXT_PATTERN = String.raw`(?:\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)?)`;
const TIME_RANGE_PATTERN_SOURCE = String.raw`\b(?:from\s+)?${TIME_TEXT_PATTERN}\s*(?:-|to|until)\s*${TIME_TEXT_PATTERN}\b`;
const DAY_TIME_TOKEN_SOURCE = String.raw`\d{1,2}(?:[.:][0-5]\d)?\s*(?:am|pm)?`;
const DAY_POINT_TIME_TOKEN_SOURCE = String.raw`(?:\d{1,2}[.:][0-5]\d\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))`;
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
    const clientRequestId = normalizeClientRequestId(body.client_request_id ?? body.clientRequestId);
    context.clientRequestId = clientRequestId;
    const source = resolveAssistantSource(authInfo, body);
    context.brainChat = await safeBeginBrainChat({
      threadId: body.thread_id,
      source,
      message,
      requestId: context.requestId,
      clientRequestId,
    });
    context.brainContext = await safeLoadBrainContext(context);
    context.workingContext = buildBrainWorkingContext({
      brainChat: context.brainChat,
      currentMessage: message,
      lifeosContext: null,
    });
    if (context.brainChat) context.brainChat.workingContext = context.workingContext;
    const activePendingAction = extractLatestPendingAction(context.brainChat);
    if (activePendingAction) {
      const pendingResolution = await resolvePendingActionTurn({ message, pendingAction: activePendingAction, context });
      if (pendingResolution.handled) {
        const result = await handlePendingActionResolution({
          resolution: pendingResolution,
          context,
          message,
          source,
        });
        return sendAiSuccess(res, 200, result, context, { message, source });
      }
    }

    const classification = classifyBrainMessage(message, context.brainChat);
    context.brainClassification = classification;
    context.brainRoute = await safeRouteBrainMessage({
      message,
      source,
      brainChat: context.brainChat,
      brainContext: context.brainContext,
      classification,
      context,
    });
    context.brainSkill = selectBrainSkillFromRoute(context.brainRoute, {
      message,
      classification,
      brainContext: context.brainContext,
      brainChat: context.brainChat,
    });
    const negativeWriteIntent = hasNegativeWriteIntent(message);
    context.brainVault = await safeLoadBrainVaultContext({
      message,
      brainRoute: context.brainRoute,
      brainSkill: context.brainSkill,
      context,
    });

    const commandDraftResult = await maybeHandleCommandDraft({ message, context, classification, source });
    if (commandDraftResult) {
      return sendAiSuccess(res, 200, commandDraftResult, context, { message, source });
    }

    const pendingCandidateResult = await maybeCreatePendingActionCandidate({ message, context, classification });
    if (pendingCandidateResult) {
      return sendAiSuccess(res, 200, pendingCandidateResult, context, { message, source });
    }

    if (context.brainRoute.mode === 'memory_write') {
      const command = routeMemoryCommand(context.brainRoute) ?? extractExplicitMemoryCommand(message);
      const plan = createReadOnlyBrainPlan('Remember an explicit durable user memory.');
      if (!command) {
        const answer = 'Tell me exactly what to remember, like: "remember my name is Ale."';
        return sendAiSuccess(res, 200, { answer, plan, actions: [], contextSummary: null, selected_skill: serializeSkillSelection(context.brainSkill), brain_route: serializeBrainRoute(context.brainRoute), skipMemoryExtraction: true }, context, { message, source });
      }
      const savedMemory = await persistExplicitBrainMemory({
        memory: command.memory,
        existingMemories: context.brainContext?.memories ?? [],
      });
      const answer = command.response || "Got it - I'll remember that.";
      return sendAiSuccess(res, 200, {
        answer,
        plan,
        actions: [],
        contextSummary: null,
        memory: savedMemory,
        selected_skill: serializeSkillSelection(context.brainSkill),
        brain_route: serializeBrainRoute(context.brainRoute),
        skipMemoryExtraction: true,
      }, context, { message, source });
    }

    if (context.brainRoute.mode === 'memory_recall') {
      const plan = createReadOnlyBrainPlan('Summarize active long-term memory.');
      const answer = formatMemoryRecallAnswer(context.brainContext);
      return sendAiSuccess(res, 200, { answer, plan, actions: [], contextSummary: null, selected_skill: serializeSkillSelection(context.brainSkill), brain_route: serializeBrainRoute(context.brainRoute), skipMemoryExtraction: true }, context, { message, source });
    }

    if (context.brainRoute.mode === 'memory_forget') {
      const plan = createReadOnlyBrainPlan('Direct the user to the explicit memory controls.');
      const result = await archiveMatchingBrainMemory({
        target: context.brainRoute.user_intent_summary || message,
        existingMemories: context.brainContext?.memories ?? [],
      });
      const answer = formatMemoryForgetAnswer(result);
      return sendAiSuccess(res, 200, { answer, plan, actions: [], contextSummary: null, selected_skill: serializeSkillSelection(context.brainSkill), brain_route: serializeBrainRoute(context.brainRoute), skipMemoryExtraction: true }, context, { message, source });
    }

    if (isSaveToVaultRequest(message)) {
      const plan = createReadOnlyBrainPlan('Save the latest assistant answer into Brain Vault.');
      const latestAssistant = getLatestAssistantMessage(context.brainChat);
      if (!latestAssistant) {
        const answer = 'There is no previous Brain answer to save yet.';
        return sendAiSuccess(res, 200, { answer, plan, actions: [], contextSummary: null, skipMemoryExtraction: true }, context, { message, source });
      }
      const document = await createVaultDocumentFromMessage({
        sourceMessageId: latestAssistant.id,
        contentMd: latestAssistant.content,
        documentType: inferVaultDocumentTypeFromMessage(message, context.brainSkill),
        tags: inferVaultTagsFromSkill(context.brainSkill),
        metadata: {
          created_by: 'brain_save_follow_up',
          selected_skill: serializeSkillSelection(context.brainSkill),
          brain_route: serializeBrainRoute(context.brainRoute),
        },
      });
      const answer = formatVaultSaveAnswer(document);
      return sendAiSuccess(res, 200, {
        answer,
        plan,
        actions: [{
          type: 'create_vault_document',
          data: {
            document: {
              id: document.id,
              title: document.title,
              document_type: document.document_type,
              created_at: document.created_at,
            },
          },
        }],
        contextSummary: null,
        skipMemoryExtraction: true,
      }, context, { message, source });
    }

    if (context.brainRoute.mode === 'follow_up_transform') {
      const plan = createReadOnlyBrainPlan(context.brainRoute.reason || classification.reason);
      const answer = await answerFollowUpTransform(message, context.brainChat);
      return sendAiSuccess(res, 200, { answer, plan, actions: [], contextSummary: null, selected_skill: serializeSkillSelection(context.brainSkill), brain_route: serializeBrainRoute(context.brainRoute), skipMemoryExtraction: true }, context, { message, source });
    }

    if (context.brainRoute.mode === 'clarification' || context.brainRoute.needs_clarification) {
      const plan = createClarificationBrainPlan(context.brainRoute);
      const answer = getSafeClarificationQuestion({ message, plan, brainRoute: context.brainRoute, brainSkill: context.brainSkill, negative: negativeWriteIntent });
      return sendAiSuccess(res, 200, {
        answer,
        plan: { ...plan, clarifyingQuestion: answer },
        actions: [],
        contextSummary: null,
        selected_skill: serializeSkillSelection(context.brainSkill),
        brain_route: serializeBrainRoute(context.brainRoute),
        skipMemoryExtraction: true,
      }, context, { message, source });
    }

    if (context.brainRoute.mode === 'casual_chat') {
      const plan = createReadOnlyBrainPlan(context.brainRoute.reason || classification.reason);
      const answer = await answerWithGemini(message, plan, null, [], context.brainContext, context.brainChat, context.brainSkill, context.brainRoute, context.brainVault);
      return sendAiSuccess(res, 200, { answer, plan, actions: [], contextSummary: null, selected_skill: serializeSkillSelection(context.brainSkill), brain_route: serializeBrainRoute(context.brainRoute), skipMemoryExtraction: true }, context, { message, source });
    }

    if (!negativeWriteIntent && context.brainRoute.mode === 'explicit_action' && context.brainRoute.write_intent && isFiniteRecurringCalendarRequest(message)) {
      const plan = createFiniteRecurringCalendarSyntheticPlan();
      if (!isBrainActionAllowedForPlan(message, plan, context)) {
        const answer = getSafeClarificationQuestion({ message, plan, brainRoute: context.brainRoute, brainSkill: context.brainSkill, negative: negativeWriteIntent });
        return sendAiSuccess(res, 200, { answer, plan: createClarificationBrainPlan({ ...context.brainRoute, clarification_question: answer }), actions: [], contextSummary: null }, context, { message, source });
      }
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

    if (!negativeWriteIntent && context.brainRoute.mode === 'explicit_action' && context.brainRoute.write_intent && isObviousDayScheduleRequest(message)) {
      const plan = createDayScheduleSyntheticPlan(message);
      if (!isBrainActionAllowedForPlan(message, plan, context)) {
        const answer = getSafeClarificationQuestion({ message, plan, brainRoute: context.brainRoute, brainSkill: context.brainSkill, negative: negativeWriteIntent });
        return sendAiSuccess(res, 200, { answer, plan: createClarificationBrainPlan({ ...context.brainRoute, clarification_question: answer }), actions: [], contextSummary: null }, context, { message, source });
      }
      try {
        const writeResult = await executeDaySchedulePlan(message, plan);
        return sendAiSuccess(res, 200, {
          answer: writeResult.answer,
          plan,
          actions: writeResult.actions,
          contextSummary: null,
        }, context, { message, source });
      } catch (error) {
        const diagnostics = logAiWriteFailure({ context, message, plan, writePath: 'day_schedule_events_preplanner', error });
        await safeLogAiError({ context, message, source, plan, writePath: 'day_schedule_events_preplanner', error, diagnostics });
        const friendlyError = friendlyDayScheduleError(error);
        attachDebugDiagnostics(friendlyError, diagnostics);
        throw friendlyError;
      }
    }

    if (!negativeWriteIntent && context.brainRoute.mode === 'explicit_action' && context.brainRoute.write_intent && isObviousExplicitMultiEventCalendarRequest(message)) {
      const plan = createExplicitCalendarSyntheticPlan(message);
      if (!isBrainActionAllowedForPlan(message, plan, context)) {
        const answer = getSafeClarificationQuestion({ message, plan, brainRoute: context.brainRoute, brainSkill: context.brainSkill, negative: negativeWriteIntent });
        return sendAiSuccess(res, 200, { answer, plan: createClarificationBrainPlan({ ...context.brainRoute, clarification_question: answer }), actions: [], contextSummary: null }, context, { message, source });
      }
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
      plan = await planMessage(message, context.brainContext, context.brainChat, context.brainSkill, context.brainRoute, context.brainVault);
    } catch (error) {
      const diagnostics = logAiPlannerFailure({ context, message, error });
      attachDebugDiagnostics(error, diagnostics);
      throw error;
    }
    plan = enforceWorkoutAdviceReadOnly(message, plan);
    plan = enforceBrainWriteRestraint(message, plan, classification, context.brainRoute, context.brainSkill);
    plan = mergeBrainRouteIntoPlan(plan, context.brainRoute, context.brainSkill);
    context.brainSkill = selectBrainSkillFromRoute(context.brainRoute, {
      message,
      classification,
      plan,
      brainContext: context.brainContext,
      brainChat: context.brainChat,
    });
    plan = enforceBrainSkillWritePermission(message, plan, context.brainSkill, context.brainRoute);
    const actions = [];
    let lifeosContext = null;
    let answer = '';
    const workoutAdviceOnly = isWorkoutAdviceOnlyRequest(message);
    const dayScheduleRequest = !negativeWriteIntent && !workoutAdviceOnly && context.brainRoute.mode === 'explicit_action' && context.brainRoute.write_intent && isDaySchedulePlannerGuard(message, plan);
    const explicitMultiEventRequest = !negativeWriteIntent && !workoutAdviceOnly && context.brainRoute.mode === 'explicit_action' && context.brainRoute.write_intent && isExplicitMultiEventCalendarRequest(message, plan);

    if (plan.intent === 'clarify') {
      answer = getSafeClarificationQuestion({ message, plan, brainRoute: context.brainRoute, brainSkill: context.brainSkill, negative: negativeWriteIntent });
      return sendAiSuccess(res, 200, { answer, plan, actions }, context, { message, source });
    }

    if (dayScheduleRequest) {
      try {
        const writeResult = await executeDaySchedulePlan(message, plan);
        actions.push(...writeResult.actions);
        answer = writeResult.answer;
        return sendAiSuccess(res, 200, { answer, plan, actions, contextSummary: lifeosContext }, context, { message, source });
      } catch (error) {
        const diagnostics = logAiWriteFailure({ context, message, plan, writePath: 'day_schedule_events', error });
        await safeLogAiError({ context, message, source, plan, writePath: 'day_schedule_events', error, diagnostics });
        const friendlyError = friendlyDayScheduleError(error);
        attachDebugDiagnostics(friendlyError, diagnostics);
        throw friendlyError;
      }
    }

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

    if (plan.needsRead || ['analyze', 'analyze_and_plan', 'blocked_destructive'].includes(plan.intent)) {
      lifeosContext = await readLifeOSContext(plan);
    }

    if (plan.intent === 'blocked_destructive') {
      answer = await answerWithGemini(message, plan, lifeosContext, [
        { type: 'blocked_destructive', message: 'Deletion and destructive updates are not enabled for the AI assistant yet.' },
      ], context.brainContext, context.brainChat, context.brainSkill, context.brainRoute, context.brainVault);
      return sendAiSuccess(res, 200, { answer, plan, actions: [{ type: 'blocked_destructive' }], contextSummary: lifeosContext }, context, { message, source });
    }

    if (plan.intent === 'unsupported') {
      answer = 'I cannot do that in this version of the LifeOS assistant.';
      return sendAiSuccess(res, 200, { answer, plan, actions, contextSummary: lifeosContext }, context, { message, source });
    }

    if (plan.needsWrite) {
      let writeResult;
      try {
        writeResult = await executeWriteIntent(plan, message, lifeosContext, context.brainContext, context.brainChat, context.brainSkill, context.brainRoute);
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
      answer = await answerWithGemini(message, plan, lifeosContext, actions, context.brainContext, context.brainChat, context.brainSkill, context.brainRoute, context.brainVault);
    }
    if (workoutAdviceOnly) {
      answer = appendWorkoutReadOnlyConfirmation(answer, message);
    }

    return sendAiSuccess(res, 200, { answer, plan, actions, contextSummary: lifeosContext }, context, { message, source });
  } catch (error) {
    await safePersistBrainError(context, error);
    handleApiError(res, error, context);
  }
}

async function handlePendingActionResolution({ resolution, context, message, source }) {
  const pendingAction = resolution.pending_action;
  if (resolution.type === 'cancelled') {
    context.pendingActionForResponse = pendingAction;
    return {
      answer: resolution.answer,
      plan: createPendingActionPlan(pendingAction, { clarify: true, reason: 'Pending action cancelled by user.' }),
      actions: [],
      contextSummary: null,
      pending_action: pendingAction,
      skipMemoryExtraction: true,
    };
  }

  if (resolution.type === 'ask') {
    context.pendingActionForResponse = pendingAction;
    return {
      answer: resolution.answer || formatPendingActionQuestion(pendingAction),
      plan: createPendingActionPlan(pendingAction, { clarify: true, reason: 'Pending action needs confirmation or missing fields.' }),
      actions: [],
      contextSummary: null,
      pending_action: pendingAction,
      skipMemoryExtraction: true,
    };
  }

  if (resolution.type === 'execute') {
    const writeResult = await executePendingAction(pendingAction, { message, context, source });
    const completed = markPendingActionCompleted(pendingAction);
    context.pendingActionForResponse = completed;
    return {
      answer: writeResult.answer || formatPendingActionCompletedAnswer(writeResult.actions?.[0], pendingAction),
      plan: createPendingActionPlan(pendingAction, { reason: 'Confirmed pending action executed.' }),
      actions: writeResult.actions ?? [],
      contextSummary: null,
      pending_action: completed,
      skipMemoryExtraction: true,
    };
  }

  return {
    answer: 'What exact details should I use?',
    plan: createPendingActionPlan(pendingAction, { clarify: true, reason: 'Pending action could not be resolved.' }),
    actions: [],
    contextSummary: null,
    skipMemoryExtraction: true,
  };
}

async function maybeCreatePendingActionCandidate({ message, context, classification }) {
  if (!shouldAttemptPendingActionCandidate({ message, context, classification })) return null;
  let validation;
  try {
    validation = await extractPendingActionCandidateWithAI({
      message,
      context,
      brainSkill: context.brainSkill,
      brainRoute: context.brainRoute,
    });
  } catch (error) {
    console.error('[LifeOS Brain pending action warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'pending_action_extraction',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return null;
  }
  if (!validation?.ok || !validation.candidate) return null;
  const candidate = validation.candidate;
  if (validation.executable && !candidate.confirmation_required) return null;
  const pendingAction = buildPendingActionFromCandidate({
    candidate,
    message,
    context,
  });
  if (!pendingAction) return null;
  context.pendingActionForResponse = pendingAction;
  return {
    answer: formatPendingActionQuestion(pendingAction),
    plan: createPendingActionPlan(pendingAction, { clarify: true, reason: 'Stored pending action candidate.' }),
    actions: [],
    contextSummary: null,
    pending_action: pendingAction,
    skipMemoryExtraction: true,
  };
}

async function maybeHandleCommandDraft({ message, context, classification, source }) {
  if (!shouldUseCommandDraft({
    message,
    brainRoute: context.brainRoute,
    brainSkill: context.brainSkill,
    workingContext: context.workingContext,
  })) return null;

  let commandDraft;
  try {
    commandDraft = await extractBrainCommandDraftWithAI({
      message,
      brainRoute: context.brainRoute,
      brainSkill: context.brainSkill,
      workingContext: context.workingContext,
      lifeosContext: null,
    });
  } catch (error) {
    console.error('[LifeOS Brain command draft warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'command_draft_extraction',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return null;
  }

  const validation = validateBrainCommandDraft(commandDraft, {
    workingContext: context.workingContext,
    brainRoute: context.brainRoute,
    brainSkill: context.brainSkill,
  });
  if (!validation?.ok || !validation.draft) return null;
  const draft = validation.draft;
  context.commandDraft = draft;

  if (validation.cancelled) {
    const answer = draft.language === 'it' ? 'Ricevuto. Non ho creato nulla.' : 'Got it. I did not create anything.';
    return {
      answer,
      plan: createReadOnlyBrainPlan('Command draft cancelled by current user message.'),
      actions: [],
      contextSummary: null,
      skipMemoryExtraction: true,
    };
  }

  if (draft.mode === 'unsupported') {
    const answer = draft.language === 'it'
      ? 'Non posso farlo direttamente in questa versione. Posso creare un nuovo evento o promemoria collegato, se vuoi.'
      : 'I cannot do that directly in this version. I can create a related event or reminder if you want.';
    return {
      answer,
      plan: createReadOnlyBrainPlan(draft.reason || 'Command draft unsupported.'),
      actions: [],
      contextSummary: null,
      skipMemoryExtraction: true,
    };
  }

  if (draft.mode === 'clarify' || !validation.executable || draft.action?.confirmation_required) {
    const pendingAction = commandDraftToPendingAction(draft, {
      ...context,
      message,
      workingContext: context.workingContext,
    });
    if (pendingAction && draft.action?.type && draft.mode !== 'unsupported') {
      context.pendingActionForResponse = pendingAction;
    }
    return {
      answer: formatCommandDraftClarification(draft, context.workingContext),
      plan: createClarificationBrainPlan({
        ...context.brainRoute,
        clarification_question: formatCommandDraftClarification(draft, context.workingContext),
        reason: draft.reason || 'Command draft needs clarification.',
      }),
      actions: [],
      contextSummary: null,
      ...(pendingAction ? { pending_action: pendingAction } : {}),
      skipMemoryExtraction: true,
    };
  }

  if (draft.mode !== 'action') return null;

  const plan = commandDraftToPlannerPlan(draft);
  const skill = getBrainSkill(skillIdForPendingAction(plan.intent));
  const route = {
    mode: 'explicit_action',
    primary_skill: skill.id,
    write_intent: true,
    proposed_action_types: [plan.intent],
    risk_level: plan.riskLevel || 'low',
  };
  const permission = canExecuteBrainAction({ route, skill, plan, message });
  if (!permission.allowed) {
    const answer = getSafeClarificationQuestion({ message, plan, brainRoute: route, brainSkill: { skill } });
    return {
      answer,
      plan: createClarificationBrainPlan({ ...route, clarification_question: answer }),
      actions: [],
      contextSummary: null,
      skipMemoryExtraction: true,
    };
  }

  const writeResult = await executeCommandDraftAction({ draft, plan, route, skill, message, context, source });
  return {
    answer: writeResult.answer,
    plan,
    actions: writeResult.actions ?? [],
    contextSummary: null,
    skipMemoryExtraction: true,
  };
}

async function executeCommandDraftAction({ draft, plan, route, skill, message, context }) {
  if (plan.intent === 'update_health_log' && plan.args?.health_note_append) {
    const pendingShape = {
      id: context?.requestId,
      action_type: 'update_health_log',
      language: draft.language,
      summary: draft.intent_summary,
      args: plan.args,
    };
    const updated = await executePendingHealthUpdate(pendingShape);
    return {
      actions: [{
        type: 'update_health_log',
        data: {
          ...updated,
          command_draft_id: context?.requestId,
          sourcePath: 'command_draft',
        },
      }],
      answer: formatCommandDraftSuccess({ draft, action: { type: 'update_health_log', data: updated } }),
    };
  }
  const writeResult = await executeWriteIntent(plan, message, null, context.brainContext, context.brainChat, { skill }, route);
  const mappedActions = (writeResult.actions ?? []).map((item) => ({
    ...item,
    data: {
      ...(item.data && typeof item.data === 'object' ? item.data : {}),
      command_draft_id: context?.requestId,
      sourcePath: item.data?.sourcePath || 'command_draft',
    },
  }));
  return {
    ...writeResult,
    actions: mappedActions,
    answer: formatCommandDraftSuccess({ draft, action: mappedActions[0] }),
  };
}

function formatCommandDraftSuccess({ draft, action }) {
  const language = draft?.language === 'it' ? 'it' : 'en';
  const data = action?.data ?? {};
  if (draft?.action?.type === 'create_calendar_event') {
    const title = data.title || draft.action.args?.title || draft.intent_summary;
    const date = data.event_date || draft.action.args?.event_date;
    const start = data.start_time || draft.action.args?.start_time;
    const end = data.end_time || draft.action.args?.end_time;
    return language === 'it'
      ? `Aggiunto al calendario: ${title}${date ? `, ${date}` : ''}${start ? ` ${start}${end ? `-${end}` : ''}` : ''}.`
      : `Added to calendar: ${title}${date ? `, ${date}` : ''}${start ? ` ${start}${end ? `-${end}` : ''}` : ''}.`;
  }
  if (draft?.action?.type === 'create_memo') {
    const title = data.title || draft.action.args?.title || draft.intent_summary;
    return language === 'it' ? `Creato promemoria: ${title}.` : `Created reminder: ${title}.`;
  }
  if (draft?.action?.type === 'update_health_log') {
    const detail = draft.action.args?.health_note_append || draft.intent_summary;
    return language === 'it' ? `Salvato nella salute: ${detail}.` : `Saved to Health: ${detail}.`;
  }
  return language === 'it' ? 'Fatto.' : 'Done.';
}

function shouldAttemptPendingActionCandidate({ message, context, classification }) {
  if (!message || hasNegativeWriteIntent(message)) return false;
  if (classification?.kind && ['memory_write', 'memory_recall', 'memory_forget', 'follow_up_transform', 'read_only_analysis'].includes(classification.kind)) return false;
  const mode = context?.brainRoute?.mode;
  if (['memory_write', 'memory_recall', 'memory_forget', 'follow_up_transform', 'read_only_analysis'].includes(mode)) return false;
  const skillId = context?.brainSkill?.skill?.id || context?.brainRoute?.primary_skill;
  if (['health_coach', 'calendar_planner', 'memo_assistant', 'finance_analyst', 'project_ops_coach'].includes(skillId)) return true;
  return mode === 'clarification' || mode === 'explicit_action';
}

async function executePendingAction(pendingAction, { message, context }) {
  const validation = validatePendingActionCandidate(pendingAction, context);
  if (!validation?.ok || !validation.executable) {
    throw new HttpError(400, validation?.question || 'Pending action is missing required details.');
  }
  const action = validation.candidate;
  const plan = createPendingActionPlan(action);
  const skill = getBrainSkill(action.skill || skillIdForPendingAction(action.action_type));
  const route = {
    mode: 'explicit_action',
    primary_skill: skill.id,
    write_intent: true,
    proposed_action_types: [action.action_type],
    risk_level: action.risk_level || 'low',
  };
  const permission = canExecuteBrainAction({ route, skill, plan, message });
  if (!permission.allowed) {
    throw new HttpError(400, permission.reason || 'Pending action was not allowed.');
  }

  if (action.action_type === 'update_health_log') {
    const updated = await executePendingHealthUpdate(action);
    return {
      actions: [{
        type: 'update_health_log',
        data: {
          ...updated,
          pending_action_id: action.id,
          sourcePath: 'pending_action',
        },
      }],
      answer: formatPendingActionCompletedAnswer({ data: updated }, action),
    };
  }

  const writeResult = await executeWriteIntent(plan, message, null, context.brainContext, context.brainChat, { skill }, route);
  return {
    ...writeResult,
    actions: (writeResult.actions ?? []).map((item) => ({
      ...item,
      data: {
        ...(item.data && typeof item.data === 'object' ? item.data : {}),
        pending_action_id: action.id,
        sourcePath: item.data?.sourcePath || 'pending_action',
      },
    })),
    answer: writeResult.answer || formatPendingActionCompletedAnswer(writeResult.actions?.[0], action),
  };
}

async function executePendingHealthUpdate(pendingAction) {
  const args = pendingAction.args ?? {};
  if (!args.health_note_append) return updateHealthLog(args);
  const loggedOn = resolveDate(args.logged_on ?? args.date, localDate());
  const existing = await readHealthLogForPendingDate(loggedOn);
  const existingNotes = String(existing?.notes ?? '').trim();
  const note = String(args.health_note_append ?? '').trim();
  const notes = existingNotes.includes(note)
    ? existingNotes
    : [existingNotes, note].filter(Boolean).join('\n');
  return updateHealthLog({
    logged_on: loggedOn,
    notes,
  });
}

async function readHealthLogForPendingDate(loggedOn) {
  const result = await getSupabaseAdmin()
    .from('health_logs')
    .select('id, notes')
    .eq('user_id', getActionUserId())
    .eq('logged_on', loggedOn)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ?? null;
}

function createPendingActionPlan(pendingAction, { clarify = false, reason = '' } = {}) {
  const intent = pendingAction?.action_type || 'clarify';
  return {
    intent: clarify ? 'clarify' : intent,
    needsRead: false,
    needsWrite: !clarify,
    range: null,
    tables: tableForPendingAction(intent),
    args: pendingAction?.args ?? {},
    clarifyingQuestion: clarify ? formatPendingActionQuestion(pendingAction) : null,
    riskLevel: pendingAction?.risk_level || 'low',
    reason: reason || 'Pending action resolution.',
  };
}

function tableForPendingAction(actionType) {
  if (actionType === 'update_health_log') return ['health_logs'];
  if (actionType === 'create_calendar_event') return ['calendar_events'];
  if (actionType === 'create_memo') return ['memos'];
  if (actionType === 'create_expense') return ['expenses'];
  return [];
}

function skillIdForPendingAction(actionType) {
  if (actionType === 'update_health_log') return 'health_coach';
  if (actionType === 'create_calendar_event') return 'calendar_planner';
  if (actionType === 'create_memo') return 'memo_assistant';
  if (actionType === 'create_expense') return 'finance_analyst';
  return 'general_chat';
}

async function safeBeginBrainChat(options) {
  try {
    return await beginBrainChat(options);
  } catch (error) {
    console.error('[LifeOS Brain chat persistence warning]', JSON.stringify({
      requestId: options?.requestId,
      stage: 'begin_chat',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return null;
  }
}

function normalizeClientRequestId(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.replace(/[^\w:.-]/g, '').slice(0, 120) || null;
}

async function safeLoadBrainContext(context) {
  try {
    return await loadBrainContext();
  } catch (error) {
    console.error('[LifeOS Brain memory warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'load_context',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return { memories: [], insights: [] };
  }
}

async function safeRouteBrainMessage({ message, source, brainChat, brainContext, classification, context }) {
  try {
    return await routeBrainMessageWithAI({
      message,
      source,
      brainChat,
      brainContext,
      classification,
    });
  } catch (error) {
    console.error('[LifeOS Brain router warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'semantic_router',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return fallbackBrainRoute({
      message,
      classification,
      brainChat,
      reason: 'AI semantic router failed; deterministic fallback route used.',
    });
  }
}

async function safeLoadBrainVaultContext({ message, brainRoute, brainSkill, context }) {
  try {
    if (!shouldRetrieveBrainVault({ brainRoute, brainSkill })) {
      return { results: [], formatted: 'No relevant Brain Vault reports were retrieved.' };
    }
    const skill = brainSkill?.skill ?? brainSkill;
    const query = [
      message,
      brainRoute?.user_intent_summary,
      skill?.label,
      Array.isArray(brainRoute?.needs_data) ? brainRoute.needs_data.join(' ') : '',
    ].filter(Boolean).join('\n');
    const results = await searchBrainVault({
      query,
      documentTypes: documentTypesForSkill(skill),
      matchCount: 8,
      matchThreshold: 0.18,
    });
    return {
      results,
      formatted: formatVaultResultsForPrompt(results),
    };
  } catch (error) {
    console.error('[LifeOS Brain Vault retrieval warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'vault_retrieval',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return { results: [], formatted: 'No relevant Brain Vault reports were retrieved.' };
  }
}

async function safePersistBrainSuccess({ context, answer, plan, actions, actionType, recordRefs, selectedSkill, brainRoute, vaultContext, workingContext }) {
  try {
    return await persistBrainAssistantMessage({
      chat: context?.brainChat,
      answer,
      requestId: context?.requestId,
      clientRequestId: context?.clientRequestId,
      actionType,
      actions,
      plan,
      recordRefs,
      selectedSkill,
      brainRoute,
      vaultContext,
      pendingAction: context?.pendingActionForResponse ?? null,
      workingContext,
    });
  } catch (error) {
    console.error('[LifeOS Brain chat persistence warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'assistant_message',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return null;
  }
}

async function safePersistBrainError(context, error) {
  try {
    await persistBrainErrorMessage({
      chat: context?.brainChat,
      error,
      requestId: context?.requestId,
      clientRequestId: context?.clientRequestId,
      selectedSkill: serializeSkillSelection(context?.brainSkill),
      brainRoute: serializeBrainRoute(context?.brainRoute),
      vaultContext: serializeVaultContextForMetadata(context?.brainVault?.results),
      pendingAction: context?.pendingActionForResponse ?? null,
      workingContext: serializeWorkingContextForMetadata(context?.workingContext),
    });
  } catch (persistenceError) {
    console.error('[LifeOS Brain chat persistence warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'assistant_error_message',
      error: persistenceError instanceof Error ? persistenceError.message : String(persistenceError ?? 'Unknown error'),
    }));
  }
}

async function safeExtractBrainKnowledge({ context, message, answer, actionType }) {
  if (!context?.brainChat) return;
  try {
    await extractAndPersistBrainKnowledge({
      userMessage: message,
      assistantAnswer: answer,
      actionType,
      existingMemories: context?.brainContext?.memories ?? [],
    });
  } catch (error) {
    console.error('[LifeOS Brain memory extraction warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'memory_extraction',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
  }
}

async function safeAutoSaveBrainReport({ context, assistantMessage, answer, actions, selectedSkill, brainRoute, workingContext, userMessage }) {
  try {
    if (!shouldAutoSaveBrainReport({ assistantMessage, answer, actions, selectedSkill, brainRoute })) return null;
    const userId = getActionUserId();
    const duplicate = await getSupabaseAdmin()
      .from('ai_vault_documents')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .contains('metadata', { source_message_id: assistantMessage.id })
      .maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data?.id) return null;

    const skillId = selectedSkill?.id || selectedSkill?.skill?.id || brainRoute?.primary_skill || 'brain';
    const documentType = autoVaultDocumentType(skillId);
    const title = autoVaultTitle({ skillId, userMessage, answer });
    const document = await createVaultDocument({
      userId,
      title,
      documentType,
      sourceType: 'brain',
      sourceRef: {
        thread_id: context?.brainChat?.thread?.id ?? null,
        message_id: assistantMessage.id,
      },
      contentMd: String(answer ?? '').trim(),
      tags: autoVaultTags({ skillId, documentType, brainRoute, userMessage, answer }),
      metadata: {
        created_by: 'brain_auto_save',
        auto_saved: true,
        source_thread_id: context?.brainChat?.thread?.id ?? null,
        source_message_id: assistantMessage.id,
        client_request_id: context?.clientRequestId ?? null,
        selected_skill: selectedSkill ?? null,
        brain_route: brainRoute ?? null,
        working_context: compactAutoSaveWorkingContext(workingContext),
      },
    });
    console.info('[LifeOS Brain Vault auto-save]', JSON.stringify({
      requestId: context?.requestId,
      documentId: document?.id,
      documentType,
      skillId,
    }));
    return document;
  } catch (error) {
    console.error('[LifeOS Brain Vault auto-save warning]', JSON.stringify({
      requestId: context?.requestId,
      stage: 'vault_auto_save',
      error: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    }));
    return null;
  }
}

function shouldAutoSaveBrainReport({ assistantMessage, answer, actions, selectedSkill, brainRoute }) {
  if (!assistantMessage?.id) return false;
  const content = String(answer ?? '').trim();
  if (content.length < 600) return false;
  if (Array.isArray(actions) && actions.some((action) => action?.type && !String(action.type).startsWith('blocked'))) return false;
  const skillId = selectedSkill?.id || selectedSkill?.skill?.id || brainRoute?.primary_skill || '';
  if (!AUTO_SAVE_SKILLS.has(skillId)) return false;
  const mode = brainRoute?.mode || '';
  if (['casual_chat', 'clarification', 'memory_write', 'memory_recall', 'memory_forget', 'follow_up_transform'].includes(mode)) return false;
  if (mode && !['read_only_analysis'].includes(mode)) return false;
  if (looksLikeShortOperationalReply(content)) return false;
  return true;
}

const AUTO_SAVE_SKILLS = new Set([
  'workout_coach',
  'health_coach',
  'project_ops_coach',
  'finance_analyst',
  'life_review',
  'product_builder',
]);

function autoVaultDocumentType(skillId) {
  if (skillId === 'workout_coach') return 'workout_report';
  if (skillId === 'project_ops_coach') return 'project_report';
  if (skillId === 'finance_analyst') return 'finance_report';
  if (skillId === 'product_builder') return 'product_report';
  if (skillId === 'life_review') return 'life_review';
  if (skillId === 'health_coach') return 'daily_report';
  return 'brain_answer';
}

function autoVaultTitle({ skillId, userMessage, answer }) {
  const date = localDate();
  const text = `${userMessage || ''} ${answer || ''}`.toLowerCase();
  if (skillId === 'workout_coach') {
    if (/\b(back|schiena|pull|pulley|row)\b/.test(text)) return `Back Day Review - ${date}`;
    if (/\b(chest|petto|push|bench|panca)\b/.test(text)) return `Push Workout Review - ${date}`;
    if (/\b(legs?|gambe|squat|leg press)\b/.test(text)) return `Leg Day Review - ${date}`;
    return `Workout Analysis - ${date}`;
  }
  if (skillId === 'health_coach') {
    if (/\b(sleep|sonno|recovery|recupero)\b/.test(text)) return `Sleep & Recovery Review - ${date}`;
    return `Health Review - ${date}`;
  }
  if (skillId === 'project_ops_coach') {
    if (/\b(ai ofm|ofm)\b/.test(text)) return `AI OFM Project Review - ${date}`;
    return `Ops Review - ${date}`;
  }
  if (skillId === 'finance_analyst') return `Finance Review - ${date}`;
  if (skillId === 'product_builder') return `LifeOS Product Strategy - ${date}`;
  if (skillId === 'life_review') return `Life Review - ${date}`;
  return `Brain Report - ${date}`;
}

function autoVaultTags({ skillId, documentType, brainRoute, userMessage, answer }) {
  const tags = new Set([documentType, skillId, brainRoute?.mode].filter(Boolean));
  const text = `${userMessage || ''} ${answer || ''}`.toLowerCase();
  const pairs = [
    ['workout', /\b(workout|allenamento|training|palestra)\b/],
    ['back', /\b(back|schiena|pulley|row)\b/],
    ['chest', /\b(chest|petto|bench|panca)\b/],
    ['sleep', /\b(sleep|sonno|wake|sveglia)\b/],
    ['recovery', /\b(recovery|recupero|fatigue|fatica)\b/],
    ['lifeos', /\b(lifeos|brain|vault)\b/],
    ['product', /\b(product|saas|roadmap|ux|ui)\b/],
    ['ai-ofm', /\b(ai ofm|ofm)\b/],
    ['ops', /\b(ops|project|progetto|deep work)\b/],
    ['finance', /\b(finance|expense|spese|soldi|money)\b/],
  ];
  pairs.forEach(([tag, pattern]) => {
    if (pattern.test(text)) tags.add(tag);
  });
  return Array.from(tags).slice(0, 12);
}

function compactAutoSaveWorkingContext(workingContext) {
  if (!workingContext || typeof workingContext !== 'object') return null;
  return {
    language: workingContext.language || null,
    last_subject: workingContext.last_subject
      ? {
          type: workingContext.last_subject.type,
          label: workingContext.last_subject.label,
          date: workingContext.last_subject.date,
          start_time: workingContext.last_subject.start_time,
          end_time: workingContext.last_subject.end_time,
        }
      : null,
    last_action_result: workingContext.last_action_result
      ? {
          action_type: workingContext.last_action_result.action_type,
          status: workingContext.last_action_result.status,
        }
      : null,
  };
}

function looksLikeShortOperationalReply(content) {
  const text = String(content ?? '').trim().toLowerCase();
  return /^(saved|created|added|updated|done|got it|ok|salvato|creato|aggiunto|fatto|ricevuto)\b/.test(text)
    || /\b(what time|che orario|mi manca|i need|ho bisogno)\b/.test(text.slice(0, 220));
}

export function classifyBrainMessage(message, brainChat = null) {
  const text = String(message ?? '').trim();
  const normalized = normalizeBrainText(text);
  if (!normalized) return { kind: 'clarify', reason: 'Empty message.' };
  if (extractExplicitMemoryCommand(text)) return { kind: 'memory_write', reason: 'Explicit durable memory command.' };
  if (isMemoryRecallRequest(text)) return { kind: 'memory_recall', reason: 'Memory recall request.' };
  if (isMemoryForgetRequest(text)) return { kind: 'memory_forget', reason: 'Memory forget request.' };
  if (isFollowUpTransformRequest(text)) {
    if (getLatestAssistantMessage(brainChat)) return { kind: 'follow_up_transform', reason: 'Transform the previous assistant answer.' };
    return { kind: 'clarify', reason: 'Follow-up transform requested without previous assistant answer.' };
  }
  if (hasExplicitActionRequest(text)) return { kind: 'explicit_action', reason: 'Current message contains explicit supported write/action language.' };
  if (isReadOnlyAnalysisRequest(text)) return { kind: 'read_only_analysis', reason: 'Current message asks for analysis/advice/status without explicit write intent.' };
  if (hasTentativeWriteLanguage(text)) return { kind: 'casual', reason: 'Tentative language without explicit write intent.' };
  if (isCasualBrainMessage(text)) return { kind: 'casual', reason: 'Casual conversation without explicit read/write request.' };
  return { kind: 'casual', reason: 'Default chat-first behavior; no explicit read/write request.' };
}

export function hasNegativeWriteIntent(message) {
  const text = normalizeBrainText(message);
  return /\b(?:don'?t|do\s+not|dont)\s+(?:schedule|create|log|add|make|put|set)\b/.test(text)
    || /\bno\s+(?:memo|event|calendar|reminder)\b/.test(text)
    || /\bdon'?t\s+(?:make|schedule|create)\s+a\s+memo\b/.test(text)
    || /\bdon'?t\s+put\s+(?:this|it)?\s*(?:in|on)\s+(?:the\s+)?calendar\b/.test(text)
    || /\bdon'?t\s+add\s+(?:this|it)\b/.test(text)
    || /\bnon\s+(?:farlo|programmare|segnare|segnarlo|salvare|salvarlo|creare|crearlo|loggare|bloccare|bloccarlo|fare\s+(?:un\s+)?memo|mettere\s+(?:in|nel)\s+calendario)\b/.test(text);
}

function enforceBrainWriteRestraint(message, plan = {}, classification, brainRoute = null, brainSkill = null) {
  const negative = hasNegativeWriteIntent(message);
  const routeWriteIntent = Boolean(brainRoute?.write_intent && brainRoute?.mode === 'explicit_action');
  const tentative = hasTentativeWriteLanguage(message) && !hasExplicitActionRequest(message) && !routeWriteIntent;
  const casualWrite = (classification.kind === 'casual' || brainRoute?.mode === 'casual_chat') && plan.needsWrite;
  if (negative || tentative || casualWrite) {
    const readOnly = classification.kind === 'read_only_analysis' || brainRoute?.mode === 'read_only_analysis' || plan.needsRead || plan.intent === 'analyze';
    return {
      ...plan,
      intent: readOnly ? 'analyze' : 'clarify',
      needsRead: Boolean(readOnly),
      needsWrite: false,
      args: {},
      clarifyingQuestion: getSafeClarificationQuestion({ message, plan, brainRoute, brainSkill, negative }),
      riskLevel: 'low',
      reason: negative
        ? 'Negative write intent in current message blocked all writes.'
        : 'Tentative/casual language without explicit current write request blocked planner write.',
    };
  }

  if (plan.needsWrite && plan.intent === 'create_memo' && memoNeedsTimeClarification(message, plan.args)) {
    return {
      ...plan,
      intent: 'clarify',
      needsRead: false,
      needsWrite: false,
      args: {},
      clarifyingQuestion: 'What time should I remind you? For example 15:00 or 3pm.',
      riskLevel: 'low',
      reason: 'Memo request used a vague part-of-day time, so Brain asked for clarification instead of attempting a write.',
    };
  }

  if (plan.needsWrite && !hasExplicitActionRequest(message) && !routeWriteIntent) {
    return {
      ...plan,
      intent: 'clarify',
      needsRead: false,
      needsWrite: false,
      args: {},
      clarifyingQuestion: getSafeClarificationQuestion({ message, plan, brainRoute, brainSkill }),
      riskLevel: 'low',
      reason: 'Planner requested a write without explicit current-message action language.',
    };
  }

  return plan;
}

function enforceBrainSkillWritePermission(message, plan = {}, skillSelection, brainRoute = null) {
  const permission = canExecuteBrainAction({
    route: brainRoute,
    skill: skillSelection?.skill,
    plan,
    message,
  });
  if (permission.allowed) return plan;
  const readOnly = plan.needsRead || plan.intent === 'analyze_and_plan';
  return {
    ...plan,
    intent: readOnly ? 'analyze' : 'clarify',
    needsRead: Boolean(readOnly),
    needsWrite: false,
    args: {},
    clarifyingQuestion: readOnly
      ? null
      : getSafeClarificationQuestion({ message, plan, brainRoute, brainSkill: skillSelection }),
    riskLevel: 'low',
    reason: `${plan.reason || 'Planner requested a write.'} Skill guard blocked the write: ${permission.reason}`,
  };
}

function getSafeClarificationQuestion({ message, plan = {}, brainRoute = null, brainSkill = null, negative = false } = {}) {
  if (negative || hasNegativeWriteIntent(message)) {
    return "Understood - I won't create anything. We can just talk it through.";
  }

  const skillId = brainSkill?.skill?.id || brainSkill?.id || brainRoute?.primary_skill || '';
  const routeQuestion = String(brainRoute?.clarification_question || plan?.clarifyingQuestion || '').trim();
  const genericRouteQuestion = /advice|create something|talk it through|what details should i use/i.test(routeQuestion);
  if (routeQuestion && !(genericRouteQuestion && (skillId === 'calendar_planner' || looksLikeVagueCalendarBlockRequest(message)))) {
    return routeQuestion;
  }

  if (skillId === 'calendar_planner' || looksLikeVagueCalendarBlockRequest(message) || plan.intent === 'create_calendar_event') {
    if (looksLikeVagueCalendarBlockRequest(message)) return specificCalendarClarification(message);
    return 'What exact start time, end time, and date should I use for the calendar event?';
  }
  if (skillId === 'memo_assistant' || plan.intent === 'create_memo') {
    return 'What reminder title, date, and exact time should I use?';
  }
  if (skillId === 'health_coach' || plan.intent === 'update_health_log') {
    return 'Do you want me to log this in Health? If yes, what date and time should I use?';
  }
  if (skillId === 'finance_analyst' || plan.intent === 'create_expense') {
    return 'What amount, vendor, category, and date should I use for the expense?';
  }
  return routeQuestion || 'What exact details should I use?';
}

function isBrainActionAllowedForPlan(message, plan, context) {
  return canExecuteBrainAction({
    route: context?.brainRoute,
    skill: context?.brainSkill?.skill,
    plan,
    message,
  }).allowed;
}

function mergeBrainRouteIntoPlan(plan = {}, brainRoute, skillSelection) {
  if (!brainRoute) return plan;
  const routeTables = routeDataToPlanTables(brainRoute.needs_data);
  const skillTables = routeDataToPlanTables(skillSelection?.skill?.dataTables ?? []);
  const mergedTables = Array.from(new Set([
    ...(Array.isArray(plan.tables) ? plan.tables : []),
    ...routeTables,
    ...(brainRoute.mode === 'read_only_analysis' ? skillTables : []),
  ]));
  const needsRouteRead = brainRoute.mode === 'read_only_analysis' || routeTables.length > 0;
  const routeBlocksWrite = !brainRoute.write_intent && plan.needsWrite;
  return {
    ...plan,
    needsRead: Boolean(plan.needsRead || needsRouteRead),
    needsWrite: routeBlocksWrite ? false : plan.needsWrite,
    intent: routeBlocksWrite ? (needsRouteRead ? 'analyze' : 'clarify') : plan.intent,
    tables: mergedTables,
    clarifyingQuestion: brainRoute.needs_clarification
      ? (brainRoute.clarification_question || plan.clarifyingQuestion)
      : plan.clarifyingQuestion,
    reason: [plan.reason, brainRoute.reason ? `Brain route: ${brainRoute.reason}` : null].filter(Boolean).join(' '),
  };
}

function routeDataToPlanTables(items = []) {
  const supported = new Set(['expenses', 'health_logs', 'workouts', 'workout_sets', 'calendar_events', 'daily_reviews', 'memos', 'projects', 'project_sessions', 'project_money_entries']);
  return (Array.isArray(items) ? items : []).filter((item) => supported.has(item));
}

function serializeSkillSelection(selection) {
  if (!selection?.skill?.id) return null;
  return {
    id: selection.skill.id,
    label: selection.skill.label,
    badge: selection.skill.badge,
    confidence: Number(selection.confidence ?? 0),
    reason: selection.reason || '',
    matchedSignals: Array.isArray(selection.matchedSignals) ? selection.matchedSignals.slice(0, 12) : [],
  };
}

function selectBrainSkillFromRoute(brainRoute, fallbackInput) {
  if (brainRoute?.primary_skill) {
    const skill = getBrainSkill(brainRoute.primary_skill);
    if (skill?.id === brainRoute.primary_skill) {
      return {
        skill,
        confidence: Number(brainRoute.confidence ?? 0),
        reason: brainRoute.reason || 'AI semantic router selected this skill.',
        matchedSignals: [brainRoute.mode, ...(Array.isArray(brainRoute.proposed_action_types) ? brainRoute.proposed_action_types : [])].filter(Boolean),
      };
    }
  }
  return selectBrainSkill(fallbackInput);
}

function routeMemoryCommand(brainRoute) {
  const candidate = brainRoute?.memory_candidate;
  if (!candidate) return null;
  return {
    memory: {
      category: candidate.category,
      title: candidate.title,
      content: candidate.content,
      source: candidate.source ?? 'user_explicit',
      confidence: candidate.confidence,
      importance: candidate.importance,
    },
    response: `Got it - I'll remember: ${candidate.content}`,
  };
}

function createClarificationBrainPlan(brainRoute) {
  return {
    intent: 'clarify',
    needsRead: false,
    needsWrite: false,
    range: null,
    tables: [],
    args: {},
    clarifyingQuestion: brainRoute?.clarification_question || 'What details should I use?',
    riskLevel: 'low',
    reason: brainRoute?.reason || 'Brain route requested clarification.',
  };
}

function createReadOnlyBrainPlan(reason) {
  return {
    intent: 'analyze',
    needsRead: false,
    needsWrite: false,
    range: null,
    tables: [],
    args: {},
    clarifyingQuestion: null,
    riskLevel: 'low',
    reason,
  };
}

function formatMemoryForgetAnswer(result) {
  if (result?.status === 'archived' && result.memory) {
    return `Forgot this memory: ${result.memory.content}`;
  }
  if (result?.status === 'multiple' && Array.isArray(result.matches) && result.matches.length) {
    const options = result.matches.map((memory) => `- ${memory.title}: ${memory.content}`).join('\n');
    return `I found multiple possible memories. Which one should I forget?\n\n${options}`;
  }
  return 'I could not find a matching active memory. You can remove the exact item in **What LifeOS Knows**.';
}

function isExplicitRememberRequest(message) {
  return /^\s*(?:please\s+)?(?:remember that|remember this|ricorda che)\b/i.test(String(message ?? ''));
}

function isMemoryRecallRequest(message) {
  return /\b(?:what do you remember about me|what do you know about me|what does lifeos know about me|what'?s in memory|show memory|cosa ricordi di me|cosa sai di me)\b/i.test(String(message ?? ''));
}

function isMemoryForgetRequest(message) {
  return /^\s*(?:please\s+)?(?:forget that|forget what|dimentica che|dimentica quello)\b/i.test(String(message ?? ''));
}

function formatMemoryRecallAnswer(brainContext) {
  const memories = Array.isArray(brainContext?.memories) ? brainContext.memories : [];
  if (!memories.length) {
    return 'Memory is still empty. You can say things like: "remember my name is Ale" or "remember that I prefer direct answers."';
  }
  const groups = memories.slice(0, 12).reduce((map, memory) => {
    const key = String(memory.category || 'other').replaceAll('_', ' ');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(memory);
    return map;
  }, new Map());
  const lines = ["Here's what I remember:"];
  for (const [category, items] of groups) {
    lines.push('', `**${titleCase(category)}**`);
    lines.push(...items.map((memory) => `- ${memory.content}`));
  }
  if (memories.length > 12) lines.push('', `There are ${memories.length - 12} more active memories in **What LifeOS Knows**.`);
  lines.push('', 'You can edit or forget memories in **What LifeOS Knows**.');
  return lines.join('\n');
}

function formatCasualBrainAnswer(message, brainContext, { negativeWriteIntent = false, classification = null } = {}) {
  const text = String(message ?? '').trim();
  const normalized = normalizeBrainText(text);
  const name = preferredNameFromMemory(brainContext);
  const greetingName = name ? ` ${name}` : '';
  if (classification?.reason === 'Follow-up transform requested without previous assistant answer.') {
    return 'Send me the text you want me to transform, then tell me how to change it.';
  }
  if (negativeWriteIntent) {
    return "Understood - I won't create anything. We can just talk it through.";
  }
  if (/^(?:hello|hi|hey|yo|ciao|buongiorno|buonasera|what'?s up)\b[!. ]*$/i.test(text)) {
    return `Hey${greetingName}. What do you want to work on?`;
  }
  if (/^(?:thanks|thank you|ty|grazie)\b/i.test(normalized)) return 'No problem.';
  if (/^(?:ok|okay|lol|yes|no|nah|yep|nope|sure|alright)\b[!. ]*$/i.test(normalized)) return 'Got it.';
  if (/\b(?:nah|nope|no),?\s+just\s+logging\s+context\b|\bsolo\s+contesto\b|\bsolo\s+per\s+contesto\b/.test(normalized)) {
    return "Got it - I'll keep it as context.";
  }
  if (/\bnot sure though\b|\bnot sure\b|\bnon\s+sono\s+sicuro\b/.test(normalized)) {
    return 'Fair. We can keep it open.';
  }
  if (/\bactually,?\s+nevermind\b|\bnever\s+mind\b|\blascia\s+stare\b/.test(normalized)) {
    return 'Got it.';
  }
  if (/\bi haven'?t trained today\b|\bnon mi sono allenato oggi\b/.test(normalized)) {
    return 'Got it. Are you trying to decide whether to train today, or just logging context?';
  }
  if (/\bi'?m tired\b|\bi am tired\b|\bsono stanco\b/.test(normalized)) {
    return 'Got it. Do you want help deciding what to do next, or are you just noting context?';
  }
  if (hasTentativeWriteLanguage(text)) {
    return "Got it. I won't create anything from that unless you explicitly ask me to.";
  }
  return [
    'Got it.',
    'Do you want advice, analysis, or should I just keep this as conversation context?',
  ].join(' ');
}

function isFollowUpTransformRequest(message) {
  const text = normalizeBrainText(message);
  if (!text || text.length > 180) return false;
  if (hasNegativeWriteIntent(text) || hasExplicitActionRequest(text) || extractExplicitMemoryCommand(message)) return false;

  const transformLanguage = /\b(?:metti(?:le|li|lo)?\s+in\s+ordine\s+cronologico|ordina(?:le|li|lo)?\s+cronologicamente|cronologico|fammi\s+una\s+tabella|metti(?:lo|li|le)?\s+in\s+tabella|tabella|riscrivilo|riscrivi(?:lo|la|li|le)?|piu\s+breve|piu\s+diretto|piu\s+concreto|riassumi|spiegalo\s+meglio|traduci\s+in\s+inglese|dammi\s+solo\s+i\s+numeri|senza\s+callout|put\s+(?:it|them|this|that)\s+in\s+(?:a\s+)?table|make\s+(?:a\s+)?table|sort\s+(?:it|them|this|that)?\s*chronologically|put\s+(?:it|them|this|that)\s+in\s+chronological\s+order|chronological\s+order|make\s+it\s+shorter|summari[sz]e|rewrite\s+(?:it|this|that)?\s*(?:cleaner|better|shorter)?|translate\s+(?:it|this|that)?\s*to\s+english|only\s+give\s+me\s+the\s+numbers|more\s+direct|more\s+concrete)\b/.test(text);
  if (!transformLanguage) return false;

  const contextReference = /\b(?:it|them|this|that|answer|response|list|table|lo|la|li|le|questo|questa|questi|queste|risposta|lista|mettile|mettili|mettilo|ordinale|ordinarle|riassumi|cronologico|tabella)\b/.test(text);
  const shortImplicitTransform = text.split(/\s+/).length <= 8;
  return contextReference || shortImplicitTransform;
}

function preferredNameFromMemory(brainContext) {
  const memory = (Array.isArray(brainContext?.memories) ? brainContext.memories : []).find((item) => {
    const title = normalizeBrainText(item.title);
    const content = normalizeBrainText(item.content);
    return item.category === 'identity' && (title.includes('name') || content.includes('preferred name') || content.includes('name is'));
  });
  const match = String(memory?.content ?? '').match(/\b(?:is|name is)\s+([\p{L}\p{M}' -]{1,40})\./u);
  return match?.[1]?.trim() || '';
}

function hasExplicitActionRequest(message) {
  const text = normalizeBrainText(message);
  if (!text || hasNegativeWriteIntent(text)) return false;
  if (/\b(?:create|add|log|schedule|remind me|set a memo|put .*calendar|put it in calendar|put this in calendar|block)\b/.test(text)) return true;
  if (/\b(?:segna|aggiungi|crea|programma|programmamelo|logga|ricordami|segnalo|segnala|metti .*calendario)\b/.test(text)) return true;
  if (/\b(?:blocca|fissa|pianifica|metti|mettimelo|mettilo|segnami|segnamelo)\b/.test(text)
    && /\b(?:oggi|domani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|calendario|evento|\d{1,2}(?::\d{2})?|mattina|pomeriggio|sera|dopo pranzo|dopo cena)\b/.test(text)) {
    return true;
  }
  if (/\bremember to\b/.test(text)) return true;
  if (/\b(?:expense|spesa|euro|euros|eur|dollar|dollars|usd|\$)\b/.test(text) && /\d/.test(text)) return true;
  if (isObviousDayScheduleRequest(message) || isObviousExplicitMultiEventCalendarRequest(message) || isFiniteRecurringCalendarRequest(message)) return true;
  return false;
}

function isReadOnlyAnalysisRequest(message) {
  const text = normalizeBrainText(message);
  return /\b(?:analyze|analyse|analysis|review|status|how am i doing|how should you answer me|how should you respond|what should i do|what should i train|look at my workouts|review my week|dimmi cosa dovrei allenare|analizza|come sto andando|cosa dovrei fare|consigli|advice)\b/.test(text)
    || /\b(?:be brutally honest|be honest|too complicated|becoming too complicated)\b/.test(text)
    || /\b(?:what should we build|build next|what should i build|product strategy|roadmap|saas|architecture|architettura|feature roadmap)\b/.test(text)
    || (/\blifeos\b/.test(text) && /\b(?:build|ship|feature|roadmap|product|business|architecture|ui|ux)\b/.test(text))
    || isWorkoutAdviceOnlyRequest(message);
}

function isCasualBrainMessage(message) {
  const text = normalizeBrainText(message);
  if (/^(?:hello|hi|hey|yo|ciao|ok|okay|thanks|thank you|grazie|lol|no|yes|yep|nope|nah|sure|not sure|actually)\b/.test(text)) return true;
  if (text.length <= 80 && !hasExplicitActionRequest(message) && !isReadOnlyAnalysisRequest(message)) return true;
  return false;
}

function hasTentativeWriteLanguage(message) {
  const text = normalizeBrainText(message);
  return /\b(?:might need|maybe i need|i think i might|i could|maybe|forse dovrei|magari|potrei aver bisogno|potrei)\b/.test(text);
}

function memoNeedsTimeClarification(message, args = {}) {
  if (!hasExplicitActionRequest(message)) return false;
  const text = normalizeBrainText(message);
  const rawTime = args?.memo_time ?? args?.time ?? args?.due_time;
  const rawDate = args?.memo_date ?? args?.date ?? args?.due_date;
  const partOfDay = /\b(?:afternoon|evening|morning|tonight|pomeriggio|sera|mattina|stanotte)\b/.test(text);
  const hasExactTime = /\b\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\b/.test(text);
  if (partOfDay && !hasExactTime) return true;
  if (rawTime && /[a-z]/i.test(String(rawTime)) && !/\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?/i.test(String(rawTime))) return true;
  return Boolean(rawDate && partOfDay && !hasExactTime);
}

function normalizeBrainText(value) {
  return String(value ?? '')
    .replace(/['\u2019]/g, "'")
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  return String(value ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
  const { skipMemoryExtraction = false, ...publicData } = data ?? {};
  const selectedSkill = publicData.selected_skill ?? serializeSkillSelection(context?.brainSkill);
  const brainRoute = publicData.brain_route ?? serializeBrainRoute(context?.brainRoute);
  const vaultContext = publicData.vault_context ?? serializeVaultContextForMetadata(context?.brainVault?.results);
  const workingContext = buildResponseWorkingContext({
    context,
    answer: publicData.answer,
    plan: publicData.plan,
    actions: publicData.actions ?? [],
    message: logInfo?.message,
  });
  context.workingContextForResponse = workingContext;
  const responseData = {
    ...publicData,
    ...(selectedSkill ? { selected_skill: selectedSkill } : {}),
    ...(brainRoute ? { brain_route: brainRoute } : {}),
    ...(vaultContext?.retrieved_count ? { vault_context: vaultContext } : {}),
  };
  await safeLogAiSuccess({
    context,
    message: logInfo?.message,
    source: logInfo?.source,
    answer: responseData?.answer,
    actions: responseData?.actions ?? [],
    selectedSkill,
    brainRoute,
    vaultContext,
  });
  const actionType = inferActionLogType(responseData?.actions ?? []);
  const recordRefs = extractRecordRefs(responseData?.actions ?? []);
  const assistantMessage = await safePersistBrainSuccess({
    context,
    answer: responseData?.answer,
    plan: responseData?.plan,
    actions: responseData?.actions ?? [],
    actionType,
    recordRefs,
    selectedSkill,
    brainRoute,
    vaultContext,
    workingContext,
  });
  await safeAutoSaveBrainReport({
    context,
    assistantMessage,
    answer: responseData?.answer,
    actions: responseData?.actions ?? [],
    selectedSkill,
    brainRoute,
    workingContext,
    userMessage: logInfo?.message,
  });
  if (!skipMemoryExtraction) {
    await safeExtractBrainKnowledge({
      context,
      message: logInfo?.message,
      answer: responseData?.answer,
      actionType,
    });
  }
  return sendSuccess(res, status, {
    ...responseData,
    ...(context?.clientRequestId ? { client_request_id: context.clientRequestId } : {}),
    ...(context?.brainChat?.thread?.id ? {
      thread_id: context.brainChat.thread.id,
      persisted_user_message: context.brainChat.userMessage ?? null,
      persisted_message: assistantMessage,
    } : {}),
  }, context);
}

function buildResponseWorkingContext({ context, answer, plan, actions, message } = {}) {
  const current = context?.workingContext ?? {};
  const base = serializeWorkingContextForMetadata(current) ?? {
    language: current.language || 'en',
    last_subject: current.last_subject || null,
    last_action_result: current.last_action_result || null,
  };
  const firstAction = Array.isArray(actions) ? actions.find((action) => action?.type && !action.type.startsWith('blocked')) : null;
  if (!firstAction) return base;
  const actionType = firstAction.type;
  const result = firstAction.data;
  const args = {
    ...(plan?.args && typeof plan.args === 'object' ? plan.args : {}),
    ...(context?.pendingActionForResponse?.args && typeof context.pendingActionForResponse.args === 'object' ? context.pendingActionForResponse.args : {}),
  };
  const subject = buildSubjectFromActionResult({
    actionType,
    args,
    result,
    message,
    language: current.language || base.language,
  });
  if (!subject && context?.pendingActionForResponse) {
    const pendingSubject = buildSubjectFromPendingAction(context.pendingActionForResponse);
    if (!pendingSubject) return base;
  }
  const actionResult = {
    action_type: actionType,
    status: 'success',
    summary: String(answer || '').slice(0, 300),
    args,
    result: result && typeof result === 'object' ? result : {},
    created_at: new Date().toISOString(),
  };
  return {
    ...base,
    language: current.language || base.language || 'en',
    last_subject: subject || buildSubjectFromPendingAction(context?.pendingActionForResponse),
    last_action_result: actionResult,
  };
}

async function planMessage(message, brainContext, brainChat, brainSkill, brainRoute, brainVault) {
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

function createDayScheduleSyntheticPlan(message) {
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

function isDaySchedulePlannerGuard(message, plan) {
  if (plan?.intent !== 'create_calendar_event') return false;
  return isObviousDayScheduleRequest(message)
    || looksLikeMultiItemScheduleMessage(message);
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
          sourcePath: 'explicit_multi_event',
          target_date: extracted.target_date,
          created_dates: [...new Set(result.created.map((event) => event.event_date))],
        },
      },
    ],
    answer: formatCalendarEventsSuccess(extracted.target_date, result),
  };
}

async function executeDaySchedulePlan(message, plan) {
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

async function executeWriteIntent(plan, message, lifeosContext, brainContext, brainChat, brainSkill, brainRoute) {
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

function splitDayScheduleSegments(message) {
  return getDayScheduleBody(message)
    .split(/[,;\n]+|\s+\b(?:then|poi)\b\s+/i)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segmentHasScheduleTime(segment));
}

function getDayScheduleBody(message) {
  const value = String(message ?? '').trim();
  const colonIndex = value.indexOf(':');
  if (colonIndex >= 0 && colonIndex < value.length - 1) return value.slice(colonIndex + 1);
  return value.replace(/^\s*(?:(?:segna|programma|pianifica)\s+(?:la\s+)?giornata(?:\s+di\s+oggi)?|(?:log|plan|schedule)\s+(?:my\s+)?day)\s*/i, '');
}

function segmentHasScheduleTime(segment) {
  return Boolean(extractDayScheduleRange(segment) || extractDaySchedulePoint(segment));
}

function extractDayScheduleRange(segment) {
  const patterns = [
    new RegExp(String.raw`\bda\s+(${DAY_TIME_TOKEN_SOURCE})\s+a\s+(${DAY_TIME_TOKEN_SOURCE})(?=$|[^\da-z])`, 'i'),
    new RegExp(String.raw`\bfrom\s+(${DAY_TIME_TOKEN_SOURCE})\s+to\s+(${DAY_TIME_TOKEN_SOURCE})(?=$|[^\da-z])`, 'i'),
    new RegExp(String.raw`(${DAY_TIME_TOKEN_SOURCE})\s*(?:-|–|—|\bto\b)\s*(${DAY_TIME_TOKEN_SOURCE})(?=$|[^\da-z])`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(String(segment ?? ''));
    if (!match) continue;
    const startMeridiem = readMeridiem(match[1]);
    const endMeridiem = readMeridiem(match[2]);
    const startTime = normalizeDayScheduleTime(match[1], endMeridiem);
    const endTime = normalizeDayScheduleTime(match[2], startMeridiem);
    if (!startTime || !endTime) continue;
    const adjustedEnd = timeToMinutes(endTime) <= timeToMinutes(startTime) && !endMeridiem
      ? addMinutesToTime(endTime, 12 * 60)
      : endTime;
    if (timeToMinutes(adjustedEnd) <= timeToMinutes(startTime)) continue;
    return {
      index: match.index,
      raw: match[0],
      startTime,
      endTime: adjustedEnd,
    };
  }
  return null;
}

function extractDaySchedulePoint(segment) {
  const pattern = new RegExp(String.raw`(${DAY_POINT_TIME_TOKEN_SOURCE})\s*[.!?]?\s*$`, 'i');
  const match = pattern.exec(String(segment ?? '').trim());
  if (!match) return null;
  const time = normalizeDayScheduleTime(match[1]);
  if (!time) return null;
  return { index: match.index, raw: match[0], time };
}

function normalizeDayScheduleTime(value, inheritedMeridiem = null) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/(\d)\.(\d)/g, '$1:$2')
    .replace(/\s+/g, '');
  const match = text.match(/^(\d{1,2})(?::([0-5]\d))?(am|pm)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3] ?? inheritedMeridiem;
  if (meridiem && hours <= 12) {
    if (hours < 1) return null;
    if (meridiem === 'am') hours = hours === 12 ? 0 : hours;
    if (meridiem === 'pm') hours = hours === 12 ? 12 : hours + 12;
  }
  if (hours < 0 || hours > 23) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function readMeridiem(value) {
  return String(value ?? '').trim().toLowerCase().match(/(am|pm)$/)?.[1] ?? null;
}

function cleanDayScheduleTitle(value) {
  const title = String(value ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*(?:e|and|then|poi)\s+/i, '')
    .replace(/\b(?:da|from|to|a)\s*$/i, '')
    .replace(/^\s*[-:]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return title ? titleCaseTitle(title) : '';
}

function defaultDayScheduleDuration(title) {
  const text = String(title ?? '').toLowerCase();
  if (/\b(sveglia|wake(?:\s+up)?)\b/.test(text)) return 15;
  if (/\b(pranzo|lunch)\b/.test(text)) return 30;
  if (/\b(cena|dinner)\b/.test(text)) return 45;
  return 30;
}

function addMinutesToTime(value, minutesToAdd) {
  const total = timeToMinutes(value) + minutesToAdd;
  if (total < 0 || total >= 24 * 60) return null;
  return minutesToTime(total);
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
  if (/\b(science|study|studying|lesson|learning|exam|homework|matematica|studio|studiare)\b/.test(text)) return 'Study';
  if (/\b(doctor|dentist|medical|hospital|health|recovery|lunch|meal|eat|eating|pranzo|cena|dinner)\b/.test(text)) return 'Health';
  if (/\b(gym|workout|boxing|cardio|training|sport|sports|palestra|allenamento)\b/.test(text)) return 'Workout';
  if (/\b(work|coding|business|content|client|money)\b/.test(text)) return 'Work';
  if (/\b(errand|errands|appointment|shopping|take .+ somewhere|logistics)\b/.test(text)) return 'Errands';
  if (/\b(mom|mother|dad|father|family|friend|friends|girlfriend|dinner with)\b/.test(text)) return 'Social';
  if (/\b(movie|game|games|leisure|fun|entertainment)\b/.test(text)) return 'Entertainment';
  if (/\b(journal|journaling|admin|routine|planning|chores?|sveglia|wake up)\b/.test(text)) return 'Personal';
  if (/\b(sleep|nap|bedtime)\b/.test(text)) return 'Sleep';
  return 'Personal';
}

function countExplicitTimeRanges(message) {
  const text = String(message ?? '');
  const regexMatches = [...text.matchAll(new RegExp(TIME_RANGE_PATTERN_SOURCE, 'gi'))].length;
  const segmentMatches = splitExplicitScheduleSegments(text).length;
  return Math.max(regexMatches, segmentMatches);
}

function countDayScheduleItems(message) {
  return splitDayScheduleSegments(message).length;
}

function hasDayScheduleLanguage(message) {
  const text = String(message ?? '').trim().toLowerCase();
  return /(?:^|\b)(?:segna|programma|pianifica)\s+(?:la\s+)?giornata/.test(text)
    || /\b(?:log|plan|schedule)\s+(?:my\s+)?day\b/.test(text)
    || /^(?:plan|schedule|log)\s+(?:today|oggi)\s*:/.test(text)
    || /^(?:today|oggi)\s*:/.test(text);
}

function hasMixedPointAndRangeItems(message) {
  const text = String(message ?? '').toLowerCase();
  if (/\b(remind me|remember to|ricordami|memo|expense|spesa|euro|euros|eur)\b/.test(text)) return false;
  const segments = splitDayScheduleSegments(message);
  const hasRange = segments.some((segment) => Boolean(extractDayScheduleRange(segment)));
  const hasPoint = segments.some((segment) => !extractDayScheduleRange(segment) && Boolean(extractDaySchedulePoint(segment)));
  return hasRange && hasPoint;
}

function looksLikeMultiItemScheduleMessage(message) {
  const text = String(message ?? '').toLowerCase();
  if (countDayScheduleItems(message) < 2) return false;
  if (/\b(remind me|remember to|ricordami|memo|expense|spesa|euro|euros|eur)\b/.test(text)) return false;
  const hasScheduleAction = /\b(plan|schedule|add|create|log|programma|pianifica|segna)\b/.test(text);
  const hasDayReference = /\b(today|tomorrow|oggi|domani|day|giornata)\b/.test(text);
  return hasMixedPointAndRangeItems(message) || hasScheduleAction || hasDayReference;
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

function formatMemoSuccess(memo) {
  const due = memo.memo_date
    ? ` - ${memo.memo_date}${memo.memo_time ? ` ${formatTime(memo.memo_time)}` : ''}`
    : '';
  return `Created memo: ${memo.title}${due}.`;
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

function formatDayScheduleSuccess(targetDate, result, message) {
  const names = result.created.map((event) => event.title).join(', ');
  const skipped = result.skipped.length ? ` ${result.skipped.length} item${result.skipped.length === 1 ? '' : 's'} could not be created.` : '';
  if (/\b(?:segna|giornata|oggi|pranzo|cena|palestra|sveglia)\b/i.test(message)) {
    return `Ho creato ${result.created.length} eventi per ${targetDate}: ${names}.${skipped}`;
  }
  return `Created ${result.created.length} calendar events for ${targetDate}: ${names}.${skipped}`;
}

function dayScheduleClarification(message) {
  if (/\b(?:segna|giornata|oggi|pranzo|cena|palestra|sveglia)\b/i.test(message)) {
    return 'Ho capito che vuoi segnare la giornata, ma non sono riuscito a ricavare bene alcuni orari. Scrivila tipo: pranzo 13:30, studio 14:00-16:00.';
  }
  return 'I understood that you want to schedule your day, but I could not read some times. Try: lunch 13:30, study 14:00-16:00.';
}

function friendlyDayScheduleError(error) {
  const message = error instanceof Error ? error.message : '';
  if (/title is required|start_time is required|end_time must be (?:after|later)|no calendar events|could not extract/i.test(message)) {
    return new HttpError(400, 'I understood that you want to schedule your day, but I could not read some times. Try: lunch 13:30, study 14:00-16:00.');
  }
  return error;
}

function appendWorkoutReadOnlyConfirmation(answer, message) {
  const text = String(answer ?? '').trim();
  const isItalian = /\b(analizza|dimmi|allenamento|allenare|petto|schiena|gambe|spalle|panca|oggi|prestazioni)\b/i.test(message);
  const confirmation = isItalian ? 'Non ho creato eventi o attività.' : 'No calendar events or activities were created.';
  if (text.toLowerCase().includes(confirmation.toLowerCase())) return text;
  return `${text}\n\n${confirmation}`;
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

async function proposeCalendarPlan(message, plan, lifeosContext, targetDate, brainContext, brainChat, brainSkill, brainRoute) {
  const prompt = JSON.stringify({
    userMessage: message,
    targetDate,
    range: getRangeWindow(plan.range),
    plan,
    lifeosContext,
    brainRoute: formatBrainRouteForPrompt(brainRoute),
    userMemoryContext: formatBrainContextForPrompt(brainContext),
    recentConversation: formatBrainConversationForPrompt(brainChat),
    workingContext: buildCommandContextForPrompt(brainChat?.workingContext),
    selectedBrainSkill: formatBrainSkillForPrompt(brainSkill?.skill ?? brainSkill),
  });
  const proposal = await generateGeminiJson({ system: PLAN_SYSTEM, prompt, temperature: 0.25 });
  return {
    analysis: String(proposal.analysis ?? '').trim(),
    events: Array.isArray(proposal.events) ? proposal.events : [],
    skipped: Array.isArray(proposal.skipped) ? proposal.skipped : [],
  };
}

async function answerWithGemini(message, plan, lifeosContext, actions, brainContext, brainChat, brainSkill, brainRoute, brainVault) {
  const prompt = JSON.stringify({
    userMessage: message,
    plan,
    lifeosContext,
    actions,
    brainRoute: formatBrainRouteForPrompt(brainRoute),
    userMemoryContext: formatBrainContextForPrompt(brainContext),
    recentConversation: formatBrainConversationForPrompt(brainChat),
    selectedBrainSkill: formatBrainSkillForPrompt(brainSkill?.skill ?? brainSkill),
    relevantBrainVaultContext: brainVault?.formatted ?? formatVaultResultsForPrompt([]),
  });
  return generateGeminiText({ system: ANSWER_SYSTEM, prompt, temperature: 0.25 });
}

async function answerFollowUpTransform(message, brainChat) {
  const latestAssistant = getLatestAssistantMessage(brainChat);
  if (!latestAssistant) return 'Send me the text you want me to transform, then tell me how to change it.';
  const latestUser = getLatestUserMessageBefore(brainChat, latestAssistant.created_at);
  const prompt = JSON.stringify({
    userMessage: message,
    latestUserMessage: latestUser?.content ?? null,
    latestAssistantAnswer: latestAssistant.content,
    recentConversation: formatBrainConversationForPrompt(brainChat),
  });
  return generateGeminiText({ system: FOLLOW_UP_TRANSFORM_SYSTEM, prompt, temperature: 0.15 });
}

function getLatestAssistantMessage(brainChat) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === 'assistant' && String(message.content ?? '').trim()) return message;
  }
  return null;
}

function getLatestUserMessageBefore(brainChat, beforeCreatedAt) {
  const history = Array.isArray(brainChat?.conversationHistory) ? brainChat.conversationHistory : [];
  const beforeTime = beforeCreatedAt ? new Date(beforeCreatedAt).getTime() : Number.POSITIVE_INFINITY;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const createdAt = message?.created_at ? new Date(message.created_at).getTime() : 0;
    if (message?.role === 'user' && createdAt <= beforeTime && String(message.content ?? '').trim()) return message;
  }
  return null;
}

function shouldRetrieveBrainVault({ brainRoute, brainSkill }) {
  const mode = brainRoute?.mode;
  if (['casual_chat', 'memory_write', 'memory_forget', 'follow_up_transform', 'clarification'].includes(mode)) return false;
  if (mode === 'memory_recall') return false;
  const skillId = brainSkill?.skill?.id ?? brainSkill?.id;
  if (['workout_coach', 'project_ops_coach', 'finance_analyst', 'life_review', 'product_builder'].includes(skillId)) return true;
  if (['read_only_analysis', 'explicit_action'].includes(mode)) return true;
  return false;
}

function documentTypesForSkill(skill) {
  const id = skill?.id;
  if (id === 'workout_coach') return ['workout_report', 'life_review', 'brain_answer'];
  if (id === 'project_ops_coach') return ['project_report', 'product_report', 'life_review', 'brain_answer'];
  if (id === 'finance_analyst') return ['finance_report', 'project_report', 'life_review', 'brain_answer'];
  if (id === 'product_builder') return ['product_report', 'project_report', 'brain_answer'];
  if (id === 'life_review') return ['life_review', 'daily_report', 'weekly_report', 'workout_report', 'project_report', 'finance_report'];
  return null;
}

function isSaveToVaultRequest(message) {
  const text = String(message ?? '').toLowerCase();
  if (!text) return false;
  return /\b(save|turn|convert)\b.*\b(vault|report|note)\b/.test(text)
    || /\b(save this|save it|save that)\b/.test(text)
    || /\b(create|make)\s+(?:a\s+)?(?:workout|project|finance|product|life)?\s*report\b/.test(text)
    || /\bsalva(?:lo|la|re)?\b.*\b(vault|report|nota)\b/.test(text)
    || /\bmetti(?:lo|la)?\b.*\bnel vault\b/.test(text);
}

function inferVaultDocumentTypeFromMessage(message, brainSkill) {
  const text = String(message ?? '').toLowerCase();
  if (/\bworkout|allenamento|gym|palestra\b/.test(text)) return 'workout_report';
  if (/\bproject|ops|progetto|deep work|ai ofm\b/.test(text)) return 'project_report';
  if (/\bfinance|money|expense|spese|soldi\b/.test(text)) return 'finance_report';
  if (/\bproduct|saas|roadmap|lifeos\b/.test(text)) return 'product_report';
  if (/\blife review|review|weekly|daily|settimana|giornata\b/.test(text)) return 'life_review';
  const skillId = brainSkill?.skill?.id ?? brainSkill?.id;
  if (skillId === 'workout_coach') return 'workout_report';
  if (skillId === 'project_ops_coach') return 'project_report';
  if (skillId === 'finance_analyst') return 'finance_report';
  if (skillId === 'product_builder') return 'product_report';
  if (skillId === 'life_review') return 'life_review';
  return 'brain_answer';
}

function inferVaultTagsFromSkill(brainSkill) {
  const skillId = brainSkill?.skill?.id ?? brainSkill?.id;
  if (skillId === 'workout_coach') return ['workout'];
  if (skillId === 'project_ops_coach') return ['projects', 'ops'];
  if (skillId === 'finance_analyst') return ['finance'];
  if (skillId === 'product_builder') return ['product', 'lifeos'];
  if (skillId === 'life_review') return ['life_review'];
  return ['brain'];
}

function formatVaultSaveAnswer(document) {
  const base = `Saved to Vault as "${document.title}".`;
  const result = document.embedding_result;
  if (result?.configured === false && Number(result.skipped ?? 0) > 0) {
    return `${base} Semantic embedding was skipped because GEMINI_API_KEY is missing.`;
  }
  if (Number(result?.failed ?? 0) > 0) {
    return `${base} Embeddings failed for ${result.failed} chunk${Number(result.failed) === 1 ? '' : 's'}; use Re-embed later.`;
  }
  return base;
}

async function safeLogAiSuccess({ context, message, source, answer, actions, selectedSkill, brainRoute, vaultContext }) {
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
      actions: actions.map((action) => ({
        ...sanitizeActionForLog(action),
        ...(selectedSkill ? { selected_skill: selectedSkill } : {}),
        ...(brainRoute ? { brain_route: brainRoute } : {}),
        ...(vaultContext?.retrieved_count ? { vault_context: vaultContext } : {}),
      })),
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
        selected_skill: serializeSkillSelection(context?.brainSkill),
        brain_route: serializeBrainRoute(context?.brainRoute),
        vault_context: serializeVaultContextForMetadata(context?.brainVault?.results),
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
    if (action.type === 'create_memo' && action.data?.id) {
      refs.push({
        table: 'memos',
        id: action.data.id,
        label: action.data.title,
        date: action.data.memo_date,
      });
    }
    if (action.type === 'create_calendar_event' && action.data?.id) {
      refs.push(calendarEventRef(action.data));
    }
    if ((action.type === 'create_calendar_events' || action.type === 'analyze_and_plan') && Array.isArray(action.data?.created)) {
      refs.push(...action.data.created.map(calendarEventRef));
    }
    if (action.type === 'create_vault_document' && action.data?.document?.id) {
      refs.push({
        table: 'ai_vault_documents',
        id: action.data.document.id,
        label: action.data.document.title,
        date: action.data.document.created_at,
      });
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
    dayScheduleLikely: isObviousDayScheduleRequest(message),
    dayScheduleItemCount: countDayScheduleItems(message),
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
