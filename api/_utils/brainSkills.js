const SKILL_DEFINITIONS = [
  {
    id: 'general_chat',
    label: 'General Chat',
    badge: 'General',
    description: 'Casual conversation, simple acknowledgments, and open-ended discussion.',
    whenToUse: [
      'Casual conversation and short acknowledgments.',
      'Open-ended discussion without a specific LifeOS domain.',
      'Follow-up transforms remain read-only conversation handling.',
    ],
    dataTables: [],
    allowedActions: [],
    forbiddenActions: ['create_calendar_event', 'create_calendar_events', 'create_memo', 'update_health_log', 'create_expense'],
    responseRules: [
      'Keep answers short and conversational.',
      'Do not perform broad LifeOS analysis unless the user asks.',
      'Do not write LifeOS records.',
    ],
    examples: ['hello', 'nah, just logging context', 'make it shorter'],
  },
  {
    id: 'memory_manager',
    label: 'Memory Manager',
    badge: 'Memory',
    description: 'Explicit long-term memory writes, memory recall, and memory forget guidance.',
    whenToUse: [
      'The user asks Brain to remember a durable personal fact.',
      'The user asks what Brain remembers.',
      'The user asks to forget a memory.',
    ],
    dataTables: ['ai_memories', 'ai_insights'],
    allowedActions: ['memory_update'],
    forbiddenActions: ['create_memo', 'create_calendar_event', 'create_expense', 'update_health_log'],
    responseRules: [
      'Durable memory goes to ai_memories, not Memos.',
      '"remember my name is Ale" is memory_manager.',
      '"remember to buy charger" is memo_assistant, not memory_manager.',
    ],
    examples: ['remember my name is Ale', 'what do you remember about me?', 'forget that I prefer X'],
  },
  {
    id: 'workout_coach',
    label: 'Workout Coach',
    badge: 'Workout',
    description: 'Workout analysis, exercise performance, progressive overload, and gym decisions.',
    whenToUse: [
      'The user asks about exercises, past workout performance, or what to train.',
      'The user asks how to improve a lift or session today.',
      'The user discusses fatigue, recovery, or exercise selection in a workout context.',
    ],
    dataTables: ['workouts', 'workout_sets'],
    allowedActions: [],
    forbiddenActions: ['create_calendar_event', 'create_calendar_events', 'create_memo', 'update_health_log'],
    responseRules: [
      'Read-only by default.',
      'Do not schedule workouts unless the current message explicitly asks to schedule/create/add to calendar.',
      'Give practical targets and caution around fatigue/recovery.',
      'Avoid medical diagnosis.',
    ],
    examples: ['Dumbbell bench press, dimmi prestazioni passate', 'what should I train today?', 'analyze chest workouts'],
  },
  {
    id: 'health_coach',
    label: 'Health Coach',
    badge: 'Health',
    description: 'Sleep, wake time, habits, coffee, recovery, and health pattern analysis.',
    whenToUse: [
      'The user mentions sleep, wake time, coffee, recovery, habits, or skincare.',
      'The user asks to analyze health patterns.',
      'The user explicitly asks to log a tracked health field.',
    ],
    dataTables: ['health_logs'],
    allowedActions: ['update_health_log'],
    forbiddenActions: ['create_calendar_event', 'create_memo', 'create_expense'],
    responseRules: [
      'Write health only when the user explicitly asks to log/update health.',
      'Sleep hours are calculated from previous sleep_start plus current wake_time.',
      'Visible Daily Habits are Shower, Creatine, and Skin only.',
      'Do not re-add Energy, Brush, or Journal as tracked habits.',
      'Lifestyle insights only, not medical diagnosis.',
    ],
    examples: ['log creatine at 9:37 AM', 'I slept badly', 'analyze my sleep this week'],
  },
  {
    id: 'calendar_planner',
    label: 'Calendar Planner',
    badge: 'Calendar',
    description: 'Explicit scheduling, day planning, recurring calendar events, and time blocks.',
    whenToUse: [
      'The user explicitly asks to schedule, create, block, or add calendar time.',
      'The user gives a day agenda or finite recurring calendar pattern.',
      'The user asks for calendar event creation.',
    ],
    dataTables: ['calendar_events', 'health_logs', 'workouts', 'project_sessions'],
    allowedActions: ['create_calendar_event', 'create_calendar_events', 'analyze_and_plan'],
    forbiddenActions: ['create_memo', 'create_expense'],
    responseRules: [
      'Write calendar_events only with explicit current-message schedule intent.',
      'Distinguish plan preview from created schedule.',
      'For analysis/advice requests, do not write.',
      'Respect Europe/Rome today/tomorrow handling.',
    ],
    examples: ['schedule study today from 15:00 to 17:00', 'plan today: wake up 9am, lunch 1pm', 'every monday for two weeks'],
  },
  {
    id: 'memo_assistant',
    label: 'Memo Assistant',
    badge: 'Memo',
    description: 'Reminders, tasks, quick memory items, and one-off reminder capture.',
    whenToUse: [
      'The user says remind me, remember to, I gotta, call, buy, charge, or take pill.',
      'The user asks for a reminder/task/memo, not a durable personal memory.',
      'The user gives a date/time-based reminder.',
    ],
    dataTables: ['memos'],
    allowedActions: ['create_memo'],
    forbiddenActions: ['create_calendar_event', 'update_health_log', 'create_expense'],
    responseRules: [
      'Write memos only with explicit reminder/task intent.',
      'Tentative language like "I might need" is not enough.',
      'Ask clarification for vague reminder times when needed.',
      'Do not confuse durable memory with Memos.',
    ],
    examples: ['remind me to take pill at 8:30pm', 'remember to buy charger', 'call doctor tomorrow'],
  },
  {
    id: 'project_ops_coach',
    label: 'Project Ops Coach',
    badge: 'Ops',
    description: 'Projects/Ops, project sessions, proof of work, output, consistency, and execution analysis.',
    whenToUse: [
      'The user asks about projects, Deep Work, Ops, AI OFM, proof of work, or project progress.',
      'The user asks whether project work is fake productivity.',
      'The user discusses output and consistency.',
    ],
    dataTables: ['projects', 'project_sessions', 'project_money_entries'],
    allowedActions: [],
    forbiddenActions: ['create_calendar_event', 'create_memo', 'create_expense', 'update_health_log'],
    responseRules: [
      'Writes only when the user explicitly asks to create/update project/session/progress.',
      'Focus on output, consistency, fake productivity, and practical next steps.',
      'Keep proof of work central.',
    ],
    examples: ['analyze my AI OFM sessions', 'am I doing fake productivity?', 'what should I ship next?'],
  },
  {
    id: 'finance_analyst',
    label: 'Finance Analyst',
    badge: 'Finance',
    description: 'Expenses, spending, subscriptions, project costs, and money snapshots.',
    whenToUse: [
      'The user asks about expenses, spending, subscriptions, or money.',
      'The user explicitly logs an expense.',
      'The user asks for project costs or project balance.',
    ],
    dataTables: ['expenses', 'project_money_entries'],
    allowedActions: ['create_expense'],
    forbiddenActions: ['create_calendar_event', 'create_memo', 'update_health_log'],
    responseRules: [
      'Create expenses only when explicitly logged.',
      'Give personal tracking insights only, not professional financial advice.',
      'Keep project money project-level, not session-level.',
    ],
    examples: ['analyze my expenses this month', '25 euro expense for ChatGPT Plus', 'subscriptions spending'],
  },
  {
    id: 'life_review',
    label: 'Life Review',
    badge: 'Review',
    description: 'Broad daily/weekly/monthly review and cross-domain LifeOS analysis.',
    whenToUse: [
      'The user asks how they are doing.',
      'The user asks for daily, weekly, monthly, or last-30-days review.',
      'The user asks for cross-domain analysis.',
    ],
    dataTables: ['health_logs', 'workouts', 'workout_sets', 'calendar_events', 'memos', 'projects', 'project_sessions', 'expenses', 'ai_memories', 'ai_insights'],
    allowedActions: [],
    forbiddenActions: ['create_calendar_event', 'create_calendar_events', 'create_memo', 'create_expense', 'update_health_log'],
    responseRules: [
      'Read-only by default.',
      'Connect sleep, training, schedule, projects, money, and memory where relevant.',
      'Do not create plans/events unless explicitly requested.',
      'Future Morning Briefing and Weekly Review should build on this skill, but are not implemented yet.',
    ],
    examples: ['how am I doing in the last 30 days?', 'review my week', 'analyze today'],
  },
  {
    id: 'product_builder',
    label: 'Product Builder',
    badge: 'Product',
    description: 'LifeOS product strategy, UI/UX, SaaS/business direction, architecture, and roadmap advice.',
    whenToUse: [
      'The user asks what to build next in LifeOS.',
      'The user discusses product strategy, UI/UX, SaaS/business potential, architecture, or coding roadmap.',
      'The user wants technical/product advice rather than LifeOS CRUD.',
    ],
    dataTables: ['projects', 'project_sessions', 'ai_memories', 'ai_insights'],
    allowedActions: [],
    forbiddenActions: ['create_calendar_event', 'create_memo', 'create_expense', 'update_health_log'],
    responseRules: [
      'Act as product strategist and technical advisor.',
      'No LifeOS CRUD writes unless explicitly requested and supported elsewhere.',
      'Keep advice concrete and implementation-aware.',
    ],
    examples: ['what should we build next in LifeOS?', 'is LifeOS a SaaS?', 'how should Brain architecture work?'],
  },
];

export const BRAIN_SKILLS = Object.freeze(Object.fromEntries(SKILL_DEFINITIONS.map((skill) => [skill.id, Object.freeze(skill)])));

const SKILL_LIST = Object.freeze(SKILL_DEFINITIONS.map((skill) => BRAIN_SKILLS[skill.id]));

export function listBrainSkills() {
  return SKILL_LIST;
}

export function getBrainSkill(skillId) {
  return BRAIN_SKILLS[skillId] ?? BRAIN_SKILLS.general_chat;
}

export function formatBrainSkillForPrompt(skill) {
  const selected = getBrainSkill(skill?.id);
  return [
    'Selected Brain Skill:',
    `- Skill: ${selected.label}`,
    `- Purpose: ${selected.description}`,
    `- Use when: ${selected.whenToUse.join(' ')}`,
    `- Allowed data: ${selected.dataTables.length ? selected.dataTables.join(', ') : 'none by default'}`,
    `- Allowed actions: ${selected.allowedActions.length ? selected.allowedActions.join(', ') : 'none'}`,
    `- Forbidden: ${selected.forbiddenActions.length ? selected.forbiddenActions.join(', ') : 'none listed'}`,
    `- Response rules: ${selected.responseRules.join(' ')}`,
    'Skill rules guide the assistant but never override global safety guards or current-message write-intent requirements.',
  ].join('\n');
}

export function selectBrainSkill({ message, classification, plan = null } = {}) {
  const text = normalizeSignalText(message);
  const signals = [];

  const pick = (id, confidence, reason, matchedSignals = signals) => ({
    skill: getBrainSkill(id),
    confidence,
    reason,
    matchedSignals: Array.from(new Set(matchedSignals)).slice(0, 12),
  });

  if (classification?.kind === 'follow_up_transform') {
    signals.push('follow_up_transform');
    return pick('general_chat', 0.9, 'Follow-up transformation is read-only conversation handling.');
  }
  if (['memory_write', 'memory_recall', 'memory_forget'].includes(classification?.kind)) {
    signals.push(classification.kind);
    return pick('memory_manager', 0.95, 'Explicit memory command or memory recall.');
  }

  if (plan?.intent === 'update_health_log') signals.push('planner:update_health_log');
  if (plan?.intent === 'create_expense') signals.push('planner:create_expense');
  if (plan?.intent === 'create_memo') signals.push('planner:create_memo');
  if (['create_calendar_event', 'create_calendar_events', 'analyze_and_plan'].includes(plan?.intent)) signals.push(`planner:${plan.intent}`);

  const workoutSignals = matchSignals(text, [
    ['dumbbell bench press', 'dumbbell bench press'],
    ['bench', '\\bbench\\b|\\bpanca\\b'],
    ['workout', '\\bworkouts?\\b|\\ballenament[oi]\\b|\\ballenare\\b'],
    ['exercise', '\\bexercise\\b|\\besercizi?\\b'],
    ['progressive overload', 'progressive overload'],
    ['prestazioni passate', 'prestazioni passate|performance'],
    ['train today', 'what should i train|cosa dovrei allenare|migliorare oggi'],
    ['muscle group', '\\bpetto\\b|\\bchest\\b|\\bschiena\\b|\\bspalle\\b|\\bshoulders?\\b|\\bgambe\\b|\\blegs?\\b'],
  ]);
  if (workoutSignals.length) return pick('workout_coach', 0.9, 'Workout or exercise performance request.', workoutSignals);

  const healthSignals = matchSignals(text, [
    ['sleep', '\\bsleep\\b|\\bslept\\b|\\bdormito\\b|\\bsonno\\b|sleep_start|wake_time'],
    ['wake', '\\bwake\\b|\\bsveglia\\b'],
    ['coffee', '\\bcoffee\\b|\\bcaffe\\b|\\bcaff[eè]\\b'],
    ['creatine', '\\bcreatine\\b|\\bcreatina\\b'],
    ['skin', '\\bskin\\b|\\bskincare\\b'],
    ['shower', '\\bshower\\b|\\bdoccia\\b'],
    ['recovery', '\\brecovery\\b|\\brecupero\\b|\\bfatigue\\b|\\bstanco\\b'],
  ]);
  if (plan?.intent === 'update_health_log' || healthSignals.length) {
    return pick('health_coach', plan?.intent === 'update_health_log' ? 0.88 : 0.78, 'Health, sleep, habit, or recovery request.', healthSignals);
  }

  const calendarSignals = matchSignals(text, [
    ['schedule', '\\bschedule\\b|\\bcalendar\\b|\\bcalendario\\b|\\bprogramma\\b|\\bpianifica\\b'],
    ['time block', '\\bfrom\\b|\\bdalle\\b|\\balle\\b'],
    ['recurrence', '\\bevery\\b|\\beveryday\\b|\\bweekly\\b|\\bweekdays\\b|\\bweekends\\b|\\bogni\\b|\\btutti\\b'],
    ['day agenda', 'plan my day|schedule my day|segna la giornata|programma la giornata'],
  ]);
  if (['create_calendar_event', 'create_calendar_events', 'analyze_and_plan'].includes(plan?.intent) || calendarSignals.length) {
    return pick('calendar_planner', 0.86, 'Explicit scheduling, day-planning, or calendar request.', calendarSignals);
  }

  const memoSignals = matchSignals(text, [
    ['remind me', '\\bremind me\\b|\\bricordami\\b'],
    ['remember to', '\\bremember to\\b'],
    ['task', '\\bi gotta\\b|\\bdevo\\b|\\bcall\\b|\\bbuy\\b|\\bcharge\\b|\\btake pill\\b|\\bpill\\b'],
    ['memo', '\\bmemo\\b|\\breminder\\b'],
  ]);
  if (plan?.intent === 'create_memo' || memoSignals.length) return pick('memo_assistant', 0.88, 'Reminder/task/memo request.', memoSignals);

  const projectSignals = matchSignals(text, [
    ['project', '\\bprojects?\\b|\\bprogetti?\\b|\\bops\\b'],
    ['deep work', 'deep work'],
    ['AI OFM', 'ai ofm|ofm'],
    ['proof of work', 'proof of work'],
    ['fake productivity', 'fake productivity|produttivita finta'],
    ['session', 'project sessions?|sessioni progetto'],
  ]);
  if (projectSignals.length) return pick('project_ops_coach', 0.82, 'Project/Ops execution request.', projectSignals);

  const financeSignals = matchSignals(text, [
    ['expense', '\\bexpenses?\\b|\\bspes[ae]\\b|\\bspent\\b|\\bspending\\b'],
    ['money', '\\bmoney\\b|\\bsoldi\\b|\\bfinance\\b|\\bfinances\\b'],
    ['subscription', '\\bsubscriptions?\\b|\\babbonament[oi]\\b'],
    ['currency', '\\beuro\\b|\\beur\\b|\\busd\\b|\\bdollars?\\b|\\$'],
    ['project cost', 'project cost|balance|revenue'],
  ]);
  if (plan?.intent === 'create_expense' || financeSignals.length) return pick('finance_analyst', 0.82, 'Finance, expense, or money request.', financeSignals);

  const reviewSignals = matchSignals(text, [
    ['status', '\\bstatus\\b|how am i doing|come sto andando'],
    ['review', '\\breview\\b|\\brevisione\\b|analizza tutto'],
    ['last 30 days', 'last 30 days|ultimi 30 giorni'],
    ['week review', 'review my week|weekly review|settimana'],
    ['what should I do', 'what should i do|cosa dovrei fare'],
  ]);
  if (classification?.kind === 'read_only_analysis' && reviewSignals.length) return pick('life_review', 0.78, 'Broad cross-domain review/status request.', reviewSignals);

  const productSignals = matchSignals(text, [
    ['LifeOS', '\\blifeos\\b'],
    ['product', '\\bproduct\\b|\\bprodotto\\b'],
    ['SaaS', '\\bsaas\\b|business'],
    ['roadmap', '\\broadmap\\b|what should we build|build next'],
    ['architecture', '\\barchitecture\\b|\\barchitettura\\b|\\bcoding\\b|\\bcode\\b|\\bui\\b|\\bux\\b'],
  ]);
  if (productSignals.length && !/\b(?:just opened|opened|open)\s+lifeos\b/.test(text)) {
    return pick('product_builder', 0.78, 'LifeOS product, business, UI, architecture, or roadmap request.', productSignals);
  }

  return pick('general_chat', classification?.kind === 'casual' ? 0.8 : 0.55, 'Fallback chat skill.');
}

export function canSkillPerformIntent(skill, plan = {}, message = '') {
  const selected = getBrainSkill(skill?.id);
  const intent = String(plan?.intent ?? '').trim();
  if (!intent || !plan?.needsWrite) return { allowed: true, reason: 'No write requested.' };
  if (['clarify', 'unsupported', 'blocked_destructive', 'analyze'].includes(intent)) return { allowed: true, reason: 'Non-write planner intent.' };

  if (selected.allowedActions.includes(intent)) return { allowed: true, reason: `${selected.id} allows ${intent}.` };
  if (intent === 'create_calendar_events' && selected.allowedActions.includes('create_calendar_events')) return { allowed: true, reason: `${selected.id} allows calendar event batches.` };
  if (intent === 'analyze_and_plan' && selected.id === 'calendar_planner') return { allowed: true, reason: 'Calendar planner may create explicit requested plans.' };

  if (selected.id === 'workout_coach' && ['create_calendar_event', 'create_calendar_events', 'analyze_and_plan'].includes(intent) && hasExplicitCalendarWriteSignal(message)) {
    return { allowed: true, reason: 'Workout request included explicit current calendar scheduling language.' };
  }

  return {
    allowed: false,
    reason: `${selected.id} cannot perform ${intent} without a more explicit supported action request.`,
  };
}

function hasExplicitCalendarWriteSignal(message) {
  const text = normalizeSignalText(message);
  return /\b(?:schedule|create event|add .*calendar|put .*calendar|calendar|programma|crea evento|segnalo in calendario|programmamelo in calendario)\b/.test(text);
}

function normalizeSignalText(value) {
  return String(value ?? '')
    .replace(/['\u2019]/g, "'")
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchSignals(text, patterns) {
  return patterns.flatMap(([label, source]) => {
    const pattern = new RegExp(source, 'i');
    return pattern.test(text) ? [label] : [];
  });
}
