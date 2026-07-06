#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  buildPendingActionFromCandidate,
  extractLatestPendingAction,
  isPotentialPendingSlotFill,
  isSleepStartLikePendingAction,
  normalizePendingReplyIntent,
  resolvePendingActionTurn,
  shouldBypassPendingActionForNewCommand,
  validatePendingActionCandidate,
} from '../api/_utils/brainPendingActions.js';
import {
  buildCalendarEventClarification,
  extractCalendarEventFieldUpdate,
  normalizeCalendarEventArgs,
  validateCalendarEventArgs,
} from '../api/_utils/brainActionNormalizers.js';
import {
  formatCommandDraftClarification,
  validateBrainCommandDraft,
} from '../api/_utils/brainCommandDraft.js';
import { buildBrainWorkingContext } from '../api/_utils/brainWorkingContext.js';
import { shouldRetrieveBrainVault } from '../api/_utils/brainVaultEligibility.js';
import { validateBrainRoute } from '../api/_utils/brainRouter.js';
import {
  buildOperationalContextAnswer,
  isTrueLongTermMemoryRecallRequest,
} from '../api/_utils/brainTurnArbitration.js';
import {
  canAckOutboxMessage,
  computeClaimRecovery,
  computeRetryBackoff,
  nextOutboxStatusForAck,
  sortOutboxRowsForDelivery,
} from '../api/_utils/brainOutboxStateMachine.js';
import {
  buildProactiveWorkingContextFromOutbox,
  looksLikeIndependentProactiveCommand,
  normalizeProactiveMemoReply,
  resolveProactiveMemoReply,
  selectProactiveMemoReplyTarget,
  shouldPrioritizeProactiveReplyOverPending,
} from '../api/_utils/brainProactiveReplies.js';
import {
  attachBrainChatToTurn,
  buildBrainTurnWorkingContext,
  checkBrainTurnPendingAction,
  checkBrainTurnProactivePriority,
  createBrainTurn,
  markBrainTurnProactiveBypassedPending,
  recordBrainTurnClassification,
  recordBrainTurnPendingResolution,
  recordBrainTurnRoute,
  recordBrainTurnSkill,
  recordBrainTurnVault,
} from '../api/_utils/brainTurn.js';
import {
  buildMemoIdempotencyKey,
  buildMemoProactiveCandidates,
  buildMemoProactiveCandidatesFromContext,
  isWithinQuietHours,
  localDateTimeToUtcDate,
  proactiveRuleRegistry,
  shouldSpendAttention,
  validateProactiveCandidate,
} from '../api/_utils/brainProactiveRules.js';
import { localDateRangeToUtcIso, localRangeToUtcWindow, startOfLocalDayUtcIso } from '../api/_utils/date.js';
import {
  canonicalizeWhatsappSender,
  getAllowedCanonicalWhatsappSenders,
  validateWhatsappSender,
} from '../api/_utils/whatsappBridge.js';
import { hasNegativeWriteIntent } from '../api/ai/chat.js';
import {
  dirtySleepStartPendingActions,
  calendarPendingMissingTime,
  napHealthNoteCandidate,
  negativeWriteFixtures,
  pendingInterruptionFixtures,
  pendingReplyIntentFixtures,
  proactiveMemoFixtures,
  proactiveReplyFixtures,
  referentWorkingContextFixture,
  simpleWriteVaultFixtures,
  sleepStartSourceMessage,
  staleSleepPendingAction,
} from '../tests/brain/fixtures.js';

const tests = [];

test('sleep-start dirty update_health_log coerces to log_sleep_start', () => {
  for (const fixture of dirtySleepStartPendingActions) {
    const validation = validatePendingActionCandidate(fixture.pendingAction);
    assert.equal(validation.ok, true, fixture.name);
    assertSleepStartCandidate(validation.candidate, fixture.name);
  }
});

test('source sleep-start message does not produce generic health detail question', () => {
  const validation = validatePendingActionCandidate(sleepStartSourceMessage.candidate);
  assert.equal(validation.ok, true);
  assertSleepStartCandidate(validation.candidate, sleepStartSourceMessage.message);
  assert.equal(/che dettaglio devo usare/i.test(validation.question || ''), false);

  const pending = buildPendingActionFromCandidate({
    candidate: sleepStartSourceMessage.candidate,
    message: sleepStartSourceMessage.message,
    context: { requestId: 'test-sleep-start' },
  });
  assertSleepStartCandidate(pending, 'built pending action');
  assert.notEqual(pending.status, 'awaiting_fields');
});

test('command draft sleep-start semantics coerce to log_sleep_start', () => {
  const validation = validateBrainCommandDraft({
    mode: 'action',
    skill: 'health_coach',
    language: 'it',
    intent_summary: sleepStartSourceMessage.message,
    action: {
      type: 'update_health_log',
      args: {
        activity: 'sonno',
        start_time: '3.41am',
        date: '2026-06-18',
      },
      missing_fields: ['health_field'],
      confirmation_required: true,
      risk_level: 'low',
    },
    confidence: 0.86,
    reason: 'Explicit sleep start logging.',
  }, {
    workingContext: { language: 'it' },
    brainRoute: { mode: 'explicit_action', write_intent: true },
    brainSkill: { id: 'health_coach' },
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.draft.action.type, 'log_sleep_start');
  assert.equal(validation.draft.action.args.time, '03:41');
  assert.deepEqual(validation.draft.action.missing_fields, []);
  assert.equal(/che dettaglio/i.test(validation.draft.clarification_question || ''), false);
});

test('calendar command draft repairs AM time from source message and asks for duration', () => {
  const sourceMessage = 'Segna dentista 7/9/26 11.45am';
  const validation = validateBrainCommandDraft({
    mode: 'clarify',
    skill: 'calendar_planner',
    language: 'it',
    intent_summary: 'Creare evento Dentista',
    action: {
      type: 'create_calendar_event',
      args: {
        title: 'Dentista',
        event_date: '7/9/26',
        start_time: '23:45',
      },
      missing_fields: ['end_time'],
      confirmation_required: false,
      risk_level: 'low',
    },
    clarification_question: "Mi manca solo l'orario esatto. Quale uso?",
    confidence: 0.9,
    reason: 'Explicit calendar event.',
  }, {
    workingContext: { language: 'it' },
    brainRoute: { mode: 'explicit_action', write_intent: true },
    brainSkill: { id: 'calendar_planner' },
    sourceMessage,
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.executable, false);
  assert.equal(validation.draft.action.args.event_date, '2026-09-07');
  assert.equal(validation.draft.action.args.start_time, '11:45');
  assert.deepEqual(validation.draft.action.missing_fields, ['end_time']);
  assert.match(validation.draft.clarification_question, /Quanto dura|a che ora finisce/i);
  assert.equal(/orario esatto/i.test(validation.draft.clarification_question), false);
});

test('calendar command draft preserves PM time from source message', () => {
  const validation = validateBrainCommandDraft({
    mode: 'clarify',
    skill: 'calendar_planner',
    language: 'it',
    intent_summary: 'Creare evento Dentista',
    action: {
      type: 'create_calendar_event',
      args: {
        title: 'Dentista',
        event_date: '7/9/26',
        start_time: '11.45pm',
      },
      missing_fields: ['end_time'],
      confirmation_required: false,
      risk_level: 'low',
    },
    confidence: 0.9,
    reason: 'Explicit calendar event.',
  }, {
    workingContext: { language: 'it' },
    brainRoute: { mode: 'explicit_action', write_intent: true },
    brainSkill: { id: 'calendar_planner' },
    sourceMessage: 'Segna dentista 7/9/26 11.45pm',
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.draft.action.args.event_date, '2026-09-07');
  assert.equal(validation.draft.action.args.start_time, '23:45');
  assert.deepEqual(validation.draft.action.missing_fields, ['end_time']);
});

test('calendar normalizer treats Italian slash dates and plain times deterministically', () => {
  const args = normalizeCalendarEventArgs({
    title: 'Dentista',
    date: '7/9/26',
    start_time: '11.45',
  });
  const missing = validateCalendarEventArgs(args, []);
  assert.equal(args.event_date, '2026-09-07');
  assert.equal(args.start_time, '11:45');
  assert.deepEqual(missing, ['end_time']);
  assert.match(buildCalendarEventClarification({ args, missingFields: missing, language: 'it' }), /Quanto dura/);
});

test('new vague calendar command does not inherit exact time from working context', () => {
  const validation = validateBrainCommandDraft({
    mode: 'clarify',
    skill: 'calendar_planner',
    language: 'it',
    intent_summary: 'Creare evento Parrucchiere domattina',
    action: {
      type: 'create_calendar_event',
      args: {
        title: 'Parrucchiere',
        event_date: '2026-07-07',
        start_time: '11:45',
      },
      missing_fields: ['end_time'],
      confirmation_required: false,
      risk_level: 'low',
    },
    clarification_question: "Ho l'orario di inizio: 11:45. Quanto dura?",
    confidence: 0.9,
    reason: 'Calendar event from vague morning phrase.',
  }, {
    workingContext: {
      language: 'it',
      last_subject: {
        type: 'memo',
        label: 'Dentista',
        date: '2026-09-07',
        start_time: '11:45',
      },
    },
    brainRoute: { mode: 'explicit_action', write_intent: true },
    brainSkill: { id: 'calendar_planner' },
    sourceMessage: 'Segna parrucchiere domattina',
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.executable, false);
  assert.equal(validation.draft.action.args.title, 'Parrucchiere');
  assert.equal(validation.draft.action.args.start_time, null);
  assert.notEqual(validation.draft.action.args.start_time, '11:45');
  assert.deepEqual(validation.draft.action.missing_fields, ['start_time', 'end_time']);
  assert.match(validation.draft.clarification_question, /orario di inizio|inizio e fine|a che ora/i);
  assert.equal(validation.draft.field_provenance?.working_context_blocked, true);
});

test('latest active pending action lookup normalizes dirty sleep-start metadata', () => {
  const pending = {
    id: 'pending-sleep-start',
    ...dirtySleepStartPendingActions[0].pendingAction,
  };
  const found = extractLatestPendingAction({
    conversationHistory: [
      { role: 'assistant', metadata: { pending_action: pending } },
    ],
  });
  assertSleepStartCandidate(found, 'latest pending action');
});

test('pending confirmation replies normalize correctly', () => {
  for (const value of pendingReplyIntentFixtures.confirm) {
    assert.equal(normalizePendingReplyIntent(value).intent, 'confirm', value);
  }
});

test('pending cancellation replies normalize correctly', () => {
  for (const value of pendingReplyIntentFixtures.cancel) {
    assert.equal(normalizePendingReplyIntent(value).intent, 'cancel', value);
  }
});

test('pending clarification replies normalize correctly', () => {
  for (const value of pendingReplyIntentFixtures.clarify) {
    assert.equal(normalizePendingReplyIntent(value).intent, 'clarify', value);
  }
});

test('stale missing_fields does not block executable sleep-start confirm', async () => {
  const dirtyPending = {
    id: 'pending-dirty-sleep-start',
    ...dirtySleepStartPendingActions[1].pendingAction,
  };
  const resolution = await resolvePendingActionTurn({
    message: 'Sì',
    pendingAction: dirtyPending,
    context: {},
  });
  assert.equal(resolution.handled, true);
  assert.equal(resolution.type, 'execute', compact(resolution));
  assertSleepStartCandidate(resolution.pending_action, 'resolved pending action');
});

test('stale sleep pending bypasses new memo command', async () => {
  const message = 'Ricordami di fare matematica tra 10 minuti';
  assert.equal(normalizePendingReplyIntent(message).intent, 'other');
  const bypass = shouldBypassPendingActionForNewCommand({
    message,
    pendingAction: staleSleepPendingAction,
    context: {},
  });
  assert.equal(bypass.bypass, true, compact(bypass));
  const resolution = await resolvePendingActionTurn({
    message,
    pendingAction: staleSleepPendingAction,
    context: {},
  });
  assert.equal(resolution.handled, false, compact(resolution));
  assert.equal(resolution.bypassed, true, compact(resolution));
  assert.equal(resolution.type, undefined);
  assert.equal(resolution.answer, undefined);
});

test('pending confirmations and slot fills do not bypass', () => {
  for (const message of pendingInterruptionFixtures.noBypassReplies) {
    const bypass = shouldBypassPendingActionForNewCommand({
      message,
      pendingAction: message.includes('14:30') || message.includes('domani')
        ? calendarPendingMissingTime
        : staleSleepPendingAction,
      context: {
        workingContext: {
          last_subject: {
            date: '2026-06-18',
            start_time: '03:41',
            end_time: '04:41',
            label: 'Inizio sonno',
          },
        },
      },
    });
    assert.equal(bypass.bypass, false, `${message}: ${compact(bypass)}`);
  }
});

test('calendar pending accepts exact time slot fill', () => {
  assert.equal(isPotentialPendingSlotFill({
    message: '14:30-15:30',
    pendingAction: calendarPendingMissingTime,
  }), true);
  assert.equal(shouldBypassPendingActionForNewCommand({
    message: '14:30-15:30',
    pendingAction: calendarPendingMissingTime,
    context: {},
  }).bypass, false);
});

test('calendar pending missing end_time accepts duration reply', async () => {
  const pendingAction = {
    id: 'pending-calendar-duration',
    action_type: 'create_calendar_event',
    status: 'awaiting_fields',
    confirmation_required: false,
    args: {
      title: 'Dentista',
      event_date: '2026-09-07',
      start_time: '11:45',
    },
    missing_fields: ['end_time'],
    confirmation_question: "Mi manca solo l'orario esatto. Quale uso?",
    language: 'it',
    confidence: 0.9,
  };
  assert.equal(isPotentialPendingSlotFill({ message: 'durata 1 ora', pendingAction }), true);
  const resolution = await resolvePendingActionTurn({
    message: 'durata 1 ora',
    pendingAction,
    context: {},
  });
  assert.equal(resolution.handled, true, compact(resolution));
  assert.equal(resolution.type, 'execute', compact(resolution));
  assert.equal(resolution.pending_action.args.start_time, '11:45');
  assert.equal(resolution.pending_action.args.end_time, '12:45');
  assert.deepEqual(resolution.pending_action.missing_fields, []);
});

test('calendar pending missing end_time accepts explicit end reply', async () => {
  const pendingAction = {
    id: 'pending-calendar-end',
    action_type: 'create_calendar_event',
    status: 'awaiting_fields',
    confirmation_required: false,
    args: {
      title: 'Dentista',
      event_date: '2026-09-07',
      start_time: '11:45',
    },
    missing_fields: ['end_time'],
    language: 'it',
    confidence: 0.9,
  };
  assert.deepEqual(extractCalendarEventFieldUpdate('fine 12:45', pendingAction).args_patch, { end_time: '12:45' });
  const resolution = await resolvePendingActionTurn({
    message: 'fine 12:45',
    pendingAction,
    context: {},
  });
  assert.equal(resolution.handled, true, compact(resolution));
  assert.equal(resolution.type, 'execute', compact(resolution));
  assert.equal(resolution.pending_action.args.start_time, '11:45');
  assert.equal(resolution.pending_action.args.end_time, '12:45');
});

test('calendar pending labeled start-time correction updates start_time, not end_time', async () => {
  const pendingAction = {
    id: 'pending-calendar-start-correction',
    action_type: 'create_calendar_event',
    status: 'awaiting_fields',
    confirmation_required: false,
    args: {
      title: 'Parrucchiere',
      event_date: '2026-07-07',
      start_time: '11:45',
    },
    missing_fields: ['end_time'],
    language: 'it',
    confidence: 0.9,
  };
  const update = extractCalendarEventFieldUpdate('Orario di inizio: 9.30', pendingAction);
  assert.equal(update.args_patch.start_time, '09:30');
  assert.equal(update.args_patch.end_time, undefined);
  assert.deepEqual(update.missing_fields, ['end_time']);
  const resolution = await resolvePendingActionTurn({
    message: 'Orario di inizio: 9.30',
    pendingAction,
    context: {},
  });
  assert.equal(resolution.handled, true, compact(resolution));
  assert.equal(resolution.type, 'ask', compact(resolution));
  assert.equal(resolution.pending_action.args.start_time, '09:30');
  assert.equal(resolution.pending_action.args.end_time, null);
  assert.deepEqual(resolution.pending_action.missing_fields, ['end_time']);
  assert.match(resolution.answer, /Quanto dura|a che ora finisce/i);
});

test('calendar event validation blocks identical start and end times', () => {
  const validation = validateBrainCommandDraft({
    mode: 'action',
    skill: 'calendar_planner',
    language: 'it',
    intent_summary: 'Creare evento Dentista',
    action: {
      type: 'create_calendar_event',
      args: {
        title: 'Dentista',
        event_date: '2026-09-07',
        start_time: '11:45',
        end_time: '11:45',
      },
      missing_fields: [],
      confirmation_required: false,
      risk_level: 'low',
    },
    confidence: 0.9,
    reason: 'Explicit calendar event.',
  }, {
    workingContext: { language: 'it' },
    brainRoute: { mode: 'explicit_action', write_intent: true },
    brainSkill: { id: 'calendar_planner' },
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.executable, false, compact(validation));
  assert.deepEqual(validation.draft.action.missing_fields, ['end_time']);
  assert.match(validation.draft.clarification_question, /fine deve essere dopo|deve essere dopo/i);
});

test('create_memo missing time keeps memo-specific clarification', () => {
  const validation = validateBrainCommandDraft({
    mode: 'clarify',
    skill: 'memo_assistant',
    language: 'it',
    intent_summary: 'Creare promemoria antibiotico',
    action: {
      type: 'create_memo',
      args: {
        title: 'Prendere antibiotico',
        memo_date: '2026-09-07',
        vague_time: 'dopo cena',
      },
      missing_fields: ['time'],
      confirmation_required: false,
      risk_level: 'low',
    },
    confidence: 0.9,
    reason: 'Reminder with vague time.',
  }, {
    workingContext: { language: 'it' },
    brainRoute: { mode: 'explicit_action', write_intent: true },
    brainSkill: { id: 'memo_assistant' },
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.executable, false);
  assert.match(formatCommandDraftClarification(validation.draft, { language: 'it' }), /giorno e orario|orario/i);
  assert.equal(/quanto dura|fine|end_time/i.test(formatCommandDraftClarification(validation.draft, { language: 'it' })), false);
});

test('calendar pending bypasses independent memo command', async () => {
  const resolution = await resolvePendingActionTurn({
    message: 'Ricordami di fare matematica tra 10 minuti',
    pendingAction: calendarPendingMissingTime,
    context: {},
  });
  assert.equal(resolution.handled, false, compact(resolution));
  assert.equal(resolution.bypassed, true, compact(resolution));
});

test('calendar pending bypasses new content-bearing segna command', async () => {
  const pendingAction = {
    ...calendarPendingMissingTime,
    args: {
      title: 'Parrucchiere',
      event_date: '2026-07-07',
      start_time: '11:45',
    },
    missing_fields: ['end_time'],
  };
  const message = 'Segna parrucchiere domani';
  assert.equal(normalizePendingReplyIntent(message).intent, 'other');
  const bypass = shouldBypassPendingActionForNewCommand({
    message,
    pendingAction,
    context: {},
  });
  assert.equal(bypass.bypass, true, compact(bypass));
  const resolution = await resolvePendingActionTurn({
    message,
    pendingAction,
    context: {},
  });
  assert.equal(resolution.handled, false, compact(resolution));
  assert.equal(resolution.bypassed, true, compact(resolution));
});

test('calendar pending bypasses explicit memo override command', async () => {
  const pendingAction = {
    ...calendarPendingMissingTime,
    args: {
      title: 'Parrucchiere',
      event_date: '2026-07-07',
      start_time: '11:45',
    },
    missing_fields: ['end_time'],
  };
  const message = 'Segna memo: domani 9.30 parrucchiere';
  assert.equal(normalizePendingReplyIntent(message).intent, 'other');
  const resolution = await resolvePendingActionTurn({
    message,
    pendingAction,
    context: {},
  });
  assert.equal(resolution.handled, false, compact(resolution));
  assert.equal(resolution.bypassed, true, compact(resolution));
});

test('new explicit commands bypass stale pending actions', () => {
  for (const message of pendingInterruptionFixtures.bypassNewCommands) {
    const bypass = shouldBypassPendingActionForNewCommand({
      message,
      pendingAction: staleSleepPendingAction,
      context: {},
    });
    assert.equal(bypass.bypass, true, `${message}: ${compact(bypass)}`);
  }
});

test('pisolino message does not mutate sleep-start pending', async () => {
  const resolution = await resolvePendingActionTurn({
    message: 'oggi ho fatto un pisolino dalle 7.40 alle 10 di sera',
    pendingAction: staleSleepPendingAction,
    context: {},
  });
  assert.equal(resolution.handled, false, compact(resolution));
  assert.notEqual(resolution.pending_action?.args?.time, '22:00');
  assert.equal(JSON.stringify(resolution).includes('19:40'), false);
});

test('nap health note does not coerce to sleep_start', () => {
  assert.equal(isSleepStartLikePendingAction({
    actionType: napHealthNoteCandidate.action_type,
    args: napHealthNoteCandidate.args,
    summary: napHealthNoteCandidate.summary,
    source_user_message: napHealthNoteCandidate.source_user_message,
  }), false);

  const validation = validatePendingActionCandidate(napHealthNoteCandidate);
  assert.equal(validation.ok, true);
  assert.equal(validation.candidate.action_type, 'update_health_log');
  assert.deepEqual(validation.candidate.missing_fields, []);
});

test('simple explicit writes skip Brain Vault retrieval', () => {
  for (const fixture of simpleWriteVaultFixtures) {
    const shouldRetrieve = shouldRetrieveBrainVault({
      brainRoute: {
        mode: 'explicit_action',
        write_intent: true,
        needs_data: [],
        proposed_action_types: [fixture.action],
      },
      brainSkill: { id: fixture.skill },
    });
    assert.equal(shouldRetrieve, false, fixture.message);
  }
});

test('analysis routes still allow Brain Vault retrieval', () => {
  assert.equal(shouldRetrieveBrainVault({
    brainRoute: {
      mode: 'read_only_analysis',
      write_intent: false,
      needs_data: ['workouts'],
      proposed_action_types: [],
    },
    brainSkill: { id: 'workout_coach' },
  }), true);
});

test('agenda query route invariant repairs contradictory memory_recall route', () => {
  const route = validateBrainRoute({
    mode: 'memory_recall',
    primary_skill: 'memory_manager',
    confidence: 0.8,
    reason: 'User asks for schedule/tasks tomorrow.',
    user_intent_summary: 'Che cosa devo fare domani? Guardami gli impegni',
    needs_data: ['ai_memories'],
    write_intent: false,
    proposed_action_types: [],
    risk_level: 'low',
    needs_clarification: false,
  }, {
    message: 'Che cosa devo fare domani? Guardami gli impegni',
  });
  assert.equal(route.mode, 'read_only_analysis', compact(route));
  assert.equal(route.primary_skill, 'calendar_planner');
  assert.equal(route.write_intent, false);
  assert.ok(route.needs_data.includes('calendar_events'), compact(route));
  assert.ok(route.needs_data.includes('memos'), compact(route));
  assert.equal(route.deterministic_override.route_repair.label, 'agenda_query');
});

test('operational memo follow-up is answered from working context, not memory recall', () => {
  const route = validateBrainRoute({
    mode: 'memory_recall',
    primary_skill: 'memory_manager',
    confidence: 0.75,
    reason: 'Asks when memo was set.',
    user_intent_summary: "Quando l'hai messo?",
    needs_data: ['ai_memories'],
    write_intent: false,
    proposed_action_types: [],
    risk_level: 'low',
    needs_clarification: false,
  }, {
    message: "Quando l'hai messo?",
  });
  assert.equal(route.mode, 'read_only_analysis', compact(route));
  assert.equal(route.primary_skill, 'memo_assistant');
  assert.equal(route.deterministic_override.route_repair.label, 'operational_context_query');

  const answer = buildOperationalContextAnswer({
    message: 'Quando hai messo il memo?',
    workingContext: {
      language: 'it',
      last_subject: {
        type: 'memo',
        label: 'aereo',
        date: '2026-07-08',
        start_time: '23:00',
      },
      last_action_result: {
        action_type: 'create_memo',
        created_at: '2026-07-06T12:56:00.000Z',
      },
    },
  });
  assert.match(answer, /8\/7\/2026/);
  assert.match(answer, /23:00/);
  assert.equal(/Here's what I remember/i.test(answer), false);
});

test('true long-term memory recall remains memory_recall', () => {
  assert.equal(isTrueLongTermMemoryRecallRequest('Cosa ti ricordi di me?'), true);
  const route = validateBrainRoute({
    mode: 'memory_recall',
    primary_skill: 'memory_manager',
    confidence: 0.9,
    reason: 'True memory recall.',
    user_intent_summary: 'Cosa ti ricordi di me?',
    needs_data: ['ai_memories'],
    write_intent: false,
    proposed_action_types: [],
    risk_level: 'low',
    needs_clarification: false,
  }, {
    message: 'Cosa ti ricordi di me?',
  });
  assert.equal(route.mode, 'memory_recall', compact(route));
  assert.equal(route.primary_skill, 'memory_manager');
});

test('negative write intent wins over action wording', () => {
  for (const value of negativeWriteFixtures) {
    assert.equal(hasNegativeWriteIntent(value), true, value);
  }
});

test('working context supplies referent date/time for calendar command draft', () => {
  const workingContext = buildBrainWorkingContext({
    brainChat: referentWorkingContextFixture.brainChat,
    currentMessage: referentWorkingContextFixture.userMessage,
  });
  assert.equal(workingContext.language, 'it');
  assert.equal(workingContext.last_subject?.label, 'Pisolino');
  assert.equal(workingContext.last_subject?.start_time, '19:40');
  assert.equal(workingContext.last_subject?.end_time, '22:00');

  const validation = validateBrainCommandDraft({
    mode: 'action',
    skill: 'calendar_planner',
    language: 'it',
    intent_summary: 'Aggiungere il pisolino precedente al calendario',
    referent: {
      needed: true,
      resolved: true,
      source: 'last_subject',
      confidence: 0.92,
      reason: 'User said aggiungilo and last subject is the nap.',
    },
    action: {
      type: 'create_calendar_event',
      args: {},
      missing_fields: [],
      confirmation_required: false,
      risk_level: 'low',
    },
    confidence: 0.92,
    reason: 'Referential calendar add.',
  }, {
    workingContext,
    brainRoute: { mode: 'explicit_action', write_intent: true },
    brainSkill: { id: 'calendar_planner' },
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.executable, true, compact(validation));
  assert.equal(validation.draft.action.args.title, 'Pisolino');
  assert.equal(validation.draft.action.args.event_date, '2026-06-18');
  assert.equal(validation.draft.action.args.start_time, '19:40');
  assert.equal(validation.draft.action.args.end_time, '22:00');
  assert.deepEqual(validation.missing_fields, []);
});

test('timed memo proactive candidate uses stable idempotency and WhatsApp body', () => {
  const dueAt = localDateTimeToUtcDate('2026-06-18', '09:30');
  const candidates = buildMemoProactiveCandidates({
    memo: proactiveMemoFixtures.timedMemo,
    now: new Date(dueAt.getTime() + 5 * 60000),
    recipient: proactiveMemoFixtures.recipient,
  });
  const due = candidates.find((item) => item.rule_key === 'timed_memo_due');
  assert.ok(due, compact(candidates));
  assert.equal(due.idempotency_key, buildMemoIdempotencyKey('memo_due', proactiveMemoFixtures.timedMemo, dueAt));
  assert.equal(due.source_type, 'memo');
  assert.equal(due.source_id, proactiveMemoFixtures.timedMemo.id);
  assert.equal(due.metadata.expected_reply_type, 'memo_done_snooze_cancel');
  assert.match(due.body, /Promemoria|Reminder/);
  assert.deepEqual(validateProactiveCandidate(due), { ok: true, reason: null });
  assert.equal(validateProactiveCandidate({ ...due, body: '' }).ok, false);
});

test('closed memo and future date-only memo do not create immediate proactive candidates', () => {
  assert.deepEqual(buildMemoProactiveCandidates({
    memo: proactiveMemoFixtures.closedMemo,
    now: new Date('2026-06-18T07:35:00.000Z'),
    recipient: proactiveMemoFixtures.recipient,
  }), []);
  assert.deepEqual(buildMemoProactiveCandidates({
    memo: { ...proactiveMemoFixtures.dateOnlyMemo, memo_date: '2026-06-19' },
    now: new Date('2026-06-18T07:35:00.000Z'),
    recipient: proactiveMemoFixtures.recipient,
  }), []);
});

test('date-only memo asks for time after safe daytime check instead of guessing exact due time', () => {
  const candidates = buildMemoProactiveCandidates({
    memo: proactiveMemoFixtures.dateOnlyMemo,
    now: new Date('2026-06-18T07:35:00.000Z'),
    recipient: proactiveMemoFixtures.recipient,
  });
  const dateOnly = candidates.find((item) => item.rule_key === 'date_only_memo_due_today');
  assert.ok(dateOnly, compact(candidates));
  assert.equal(dateOnly.metadata.date_only, true);
  assert.equal(dateOnly.metadata.memo.memo_time, null);
  assert.match(dateOnly.body, /A che ora|What time/);
});

test('quiet hours suppress non-critical proactive nudges', () => {
  assert.equal(isWithinQuietHours(new Date('2026-06-18T00:00:00.000Z'), '23:00', '08:00'), true);
  assert.equal(isWithinQuietHours(new Date('2026-06-18T10:00:00.000Z'), '23:00', '08:00'), false);
});

test('outbox ack status transitions retry then fail', () => {
  assert.deepEqual(nextOutboxStatusForAck({ currentAttempts: 1, ackStatus: 'failed', expired: false }), { status: 'queued', retry: true });
  assert.deepEqual(nextOutboxStatusForAck({ currentAttempts: 3, ackStatus: 'failed', expired: false }), { status: 'failed', retry: false });
  assert.deepEqual(nextOutboxStatusForAck({ currentAttempts: 1, ackStatus: 'sent', expired: false }), { status: 'sent', retry: false });
  assert.deepEqual(nextOutboxStatusForAck({ currentAttempts: 1, ackStatus: 'failed', expired: true }), { status: 'expired', retry: false });
  assert.equal(computeRetryBackoff(1), 2);
  assert.equal(computeRetryBackoff(2), 5);
  assert.equal(computeRetryBackoff(3), 0);
});

test('outbox state machine allows only safe ACK transitions', () => {
  assert.deepEqual(canAckOutboxMessage({ row: { id: '1', status: 'claimed' }, ackStatus: 'sent' }), {
    allowed: true,
    reason: null,
    idempotent: false,
    transition: 'claimed->sent',
  });
  assert.equal(canAckOutboxMessage({ row: { id: '1', status: 'sent' }, ackStatus: 'sent' }).idempotent, true);
  assert.equal(canAckOutboxMessage({ row: { id: '1', status: 'queued' }, ackStatus: 'sent' }).allowed, false);
  assert.equal(canAckOutboxMessage({ row: { id: '1', status: 'expired' }, ackStatus: 'sent' }).allowed, false);
  assert.equal(canAckOutboxMessage({ row: { id: '1', status: 'cancelled' }, ackStatus: 'sent' }).allowed, false);
  assert.equal(canAckOutboxMessage({ row: { id: '1', status: 'failed' }, ackStatus: 'sent' }).allowed, false);
  assert.equal(canAckOutboxMessage({ row: { id: '1', status: 'claimed' }, ackStatus: 'failed' }).allowed, true);
});

test('outbox delivery ordering uses priority rank before schedule time', () => {
  const ordered = sortOutboxRowsForDelivery([
    { id: 'low-old', priority: 'low', scheduled_for: '2026-06-18T08:00:00.000Z', created_at: '2026-06-18T07:00:00.000Z' },
    { id: 'normal-mid', priority: 'normal', scheduled_for: '2026-06-18T07:00:00.000Z', created_at: '2026-06-18T06:00:00.000Z' },
    { id: 'high-late', priority: 'high', scheduled_for: '2026-06-18T10:00:00.000Z', created_at: '2026-06-18T09:00:00.000Z' },
    { id: 'unknown', priority: 'urgent', scheduled_for: '2026-06-18T05:00:00.000Z', created_at: '2026-06-18T04:00:00.000Z' },
  ], 3);
  assert.deepEqual(ordered.map((row) => row.id), ['high-late', 'normal-mid', 'low-old']);

  const samePriority = sortOutboxRowsForDelivery([
    { id: 'later', priority: 'normal', scheduled_for: '2026-06-18T09:00:00.000Z', created_at: '2026-06-18T08:30:00.000Z' },
    { id: 'earlier', priority: 'normal', scheduled_for: '2026-06-18T08:00:00.000Z', created_at: '2026-06-18T08:30:00.000Z' },
  ]);
  assert.deepEqual(samePriority.map((row) => row.id), ['earlier', 'later']);
});

test('claimed outbox recovery classifies stale, expired, and max-attempt rows', () => {
  const now = new Date('2026-06-18T10:00:00.000Z');
  assert.deepEqual(computeClaimRecovery({
    status: 'claimed',
    attempts: 1,
    sent_at: null,
    expires_at: '2026-06-18T11:00:00.000Z',
  }, now), {
    action: 'requeue',
    reason: 'stale_claim',
    scheduled_for: '2026-06-18T10:00:00.000Z',
  });
  assert.deepEqual(computeClaimRecovery({
    status: 'claimed',
    attempts: 1,
    sent_at: null,
    expires_at: '2026-06-18T09:59:00.000Z',
  }, now), { action: 'expire', reason: 'expired' });
  assert.deepEqual(computeClaimRecovery({
    status: 'claimed',
    attempts: 3,
    sent_at: null,
    expires_at: '2026-06-18T11:00:00.000Z',
  }, now), { action: 'fail', reason: 'max_attempts' });
  assert.deepEqual(computeClaimRecovery({
    status: 'sent',
    attempts: 1,
    sent_at: '2026-06-18T09:55:00.000Z',
  }, now), { action: 'keep', reason: 'not_reclaimable' });
});

test('sent proactive outbox message metadata supplies memo working context', () => {
  const context = buildProactiveWorkingContextFromOutbox({
    id: 'outbox-1',
    rule_key: 'timed_memo_due',
    source_type: 'memo',
    source_id: proactiveMemoFixtures.timedMemo.id,
    scheduled_for: '2026-06-18T07:30:00.000Z',
    body: 'Promemoria: Prendere antibiotico. Fatto?',
    metadata: {
      expected_reply_type: 'memo_done_snooze_cancel',
      language: 'it',
      memo: proactiveMemoFixtures.timedMemo,
    },
  });
  assert.equal(context.language, 'it');
  assert.equal(context.last_subject.type, 'memo');
  assert.equal(context.last_subject.id, proactiveMemoFixtures.timedMemo.id);
  assert.equal(context.last_subject.label, proactiveMemoFixtures.timedMemo.title);
  assert.equal(context.last_subject.source, 'proactive_whatsapp_memo');
});

test('proactive memo reply intents normalize', () => {
  for (const value of proactiveReplyFixtures.done) {
    assert.equal(normalizeProactiveMemoReply(value).intent, 'done', value);
  }
  for (const value of proactiveReplyFixtures.snooze) {
    assert.equal(normalizeProactiveMemoReply(value).intent, 'snooze', value);
  }
  for (const value of proactiveReplyFixtures.cancel) {
    assert.equal(normalizeProactiveMemoReply(value).intent, 'cancel', value);
  }
  for (const value of proactiveReplyFixtures.explain) {
    assert.equal(normalizeProactiveMemoReply(value).intent, 'explain', value);
  }
});

test('proactive memo reply selects one recent reminder target', () => {
  const brainChat = buildProactiveBrainChat([
    proactiveAssistantMessage({
      id: 'message-1',
      created_at: '2026-06-18T09:55:00.000Z',
      source_id: proactiveMemoFixtures.timedMemo.id,
      title: proactiveMemoFixtures.timedMemo.title,
      rule_key: 'timed_memo_due',
    }),
  ]);
  const selection = selectProactiveMemoReplyTarget({
    message: 'fatto',
    brainChat,
    now: new Date('2026-06-18T10:00:00.000Z'),
  });
  assert.equal(selection.type, 'target', compact(selection));
  assert.equal(selection.intent.intent, 'done');
  assert.equal(selection.proactive.source_id, proactiveMemoFixtures.timedMemo.id);
});

test('proactive reminder replies can win over unrelated pending actions', () => {
  const brainChat = buildProactiveBrainChat([
    proactiveAssistantMessage({
      id: 'message-1',
      created_at: '2026-06-18T09:55:00.000Z',
      source_id: proactiveMemoFixtures.timedMemo.id,
      title: proactiveMemoFixtures.timedMemo.title,
      rule_key: 'timed_memo_due',
    }),
  ]);
  const decision = shouldPrioritizeProactiveReplyOverPending({
    message: 'fatto',
    brainChat,
    activePendingAction: staleSleepPendingAction,
    now: new Date('2026-06-18T10:00:00.000Z'),
  });
  assert.equal(decision.prioritize, true, compact(decision));
  assert.equal(decision.intent, 'done');

  const noProactive = shouldPrioritizeProactiveReplyOverPending({
    message: 'ok',
    brainChat: buildProactiveBrainChat([]),
    activePendingAction: staleSleepPendingAction,
    now: new Date('2026-06-18T10:00:00.000Z'),
  });
  assert.equal(noProactive.prioritize, false, compact(noProactive));
});

test('stale proactive reply does not dangerously confirm unrelated pending action', () => {
  const brainChat = buildProactiveBrainChat([
    proactiveAssistantMessage({
      id: 'message-old',
      created_at: '2026-06-18T01:00:00.000Z',
      source_id: proactiveMemoFixtures.timedMemo.id,
      title: proactiveMemoFixtures.timedMemo.title,
      rule_key: 'timed_memo_due',
    }),
  ]);
  const decision = shouldPrioritizeProactiveReplyOverPending({
    message: 'ok',
    brainChat,
    activePendingAction: staleSleepPendingAction,
    now: new Date('2026-06-18T10:00:00.000Z'),
  });
  assert.equal(decision.prioritize, true, compact(decision));
  assert.equal(decision.reason, 'stale_proactive_context_needs_clarification');
});

test('generic cancel with active pending is not stolen by proactive reply arbitration', async () => {
  const brainChat = buildProactiveBrainChat([
    proactiveAssistantMessage({
      id: 'message-old',
      created_at: '2026-06-18T09:55:00.000Z',
      source_id: proactiveMemoFixtures.timedMemo.id,
      title: proactiveMemoFixtures.timedMemo.title,
      rule_key: 'timed_memo_due',
    }),
  ]);
  const pendingAction = {
    id: 'pending-calendar-cancel',
    action_type: 'create_calendar_event',
    status: 'awaiting_fields',
    confirmation_required: false,
    args: {
      title: 'Parrucchiere',
      event_date: '2026-07-07',
      start_time: '11:45',
    },
    missing_fields: ['end_time'],
    language: 'it',
    confidence: 0.9,
  };
  const priority = shouldPrioritizeProactiveReplyOverPending({
    message: 'No. Cancella tutto',
    brainChat,
    activePendingAction: pendingAction,
    now: new Date('2026-06-18T10:00:00.000Z'),
  });
  assert.equal(priority.prioritize, false, compact(priority));
  assert.equal(priority.reason, 'generic_cancel_kept_for_pending_action');
  const resolution = await resolvePendingActionTurn({
    message: 'No. Cancella tutto',
    pendingAction,
    context: {},
  });
  assert.equal(resolution.handled, true, compact(resolution));
  assert.equal(resolution.type, 'cancelled');
});

test('stale proactive memo reply asks clarification instead of selecting target', () => {
  const brainChat = buildProactiveBrainChat([
    proactiveAssistantMessage({
      id: 'message-old',
      created_at: '2026-06-18T01:00:00.000Z',
      source_id: proactiveMemoFixtures.timedMemo.id,
      title: proactiveMemoFixtures.timedMemo.title,
      rule_key: 'timed_memo_due',
    }),
  ]);
  const selection = selectProactiveMemoReplyTarget({
    message: 'fatto',
    brainChat,
    now: new Date('2026-06-18T10:00:00.000Z'),
  });
  assert.equal(selection.type, 'stale', compact(selection));
});

test('new explicit commands are not treated as proactive memo replies', () => {
  assert.equal(looksLikeIndependentProactiveCommand('crea promemoria domani di chiamare Luca'), true);
  const brainChat = buildProactiveBrainChat([
    proactiveAssistantMessage({
      id: 'message-1',
      created_at: '2026-06-18T09:55:00.000Z',
      source_id: proactiveMemoFixtures.timedMemo.id,
      title: proactiveMemoFixtures.timedMemo.title,
      rule_key: 'timed_memo_due',
    }),
  ]);
  const selection = selectProactiveMemoReplyTarget({
    message: 'crea promemoria domani di chiamare Luca',
    brainChat,
    now: new Date('2026-06-18T10:00:00.000Z'),
  });
  assert.equal(selection.type, 'none', compact(selection));
  assert.equal(selection.reason, 'independent_command');
});

test('multiple recent proactive memo replies require disambiguation unless title is mentioned', () => {
  const otherMemo = {
    ...proactiveMemoFixtures.dateOnlyMemo,
    id: '55555555-5555-4555-8555-555555555555',
    title: 'Fare matematica',
  };
  const brainChat = buildProactiveBrainChat([
    proactiveAssistantMessage({
      id: 'message-1',
      created_at: '2026-06-18T09:50:00.000Z',
      source_id: proactiveMemoFixtures.timedMemo.id,
      title: proactiveMemoFixtures.timedMemo.title,
      rule_key: 'timed_memo_due',
    }),
    proactiveAssistantMessage({
      id: 'message-2',
      created_at: '2026-06-18T09:55:00.000Z',
      source_id: otherMemo.id,
      title: otherMemo.title,
      rule_key: 'timed_memo_due',
    }),
  ]);
  const ambiguous = selectProactiveMemoReplyTarget({
    message: 'fatto',
    brainChat,
    now: new Date('2026-06-18T10:00:00.000Z'),
  });
  assert.equal(ambiguous.type, 'ambiguous', compact(ambiguous));

  const explicit = selectProactiveMemoReplyTarget({
    message: 'fatto matematica',
    brainChat,
    now: new Date('2026-06-18T10:00:00.000Z'),
  });
  assert.equal(explicit.type, 'target', compact(explicit));
  assert.equal(explicit.proactive.source_id, otherMemo.id);
});

test('clean proactive snooze and cancel replies select the recent reminder', () => {
  const brainChat = buildProactiveBrainChat([
    proactiveAssistantMessage({
      id: 'message-1',
      created_at: '2026-06-18T09:55:00.000Z',
      source_id: proactiveMemoFixtures.timedMemo.id,
      title: proactiveMemoFixtures.timedMemo.title,
      rule_key: 'timed_memo_due',
    }),
  ]);
  for (const message of ['snooze 30', 'annulla']) {
    const selection = selectProactiveMemoReplyTarget({
      message,
      brainChat,
      now: new Date('2026-06-18T10:00:00.000Z'),
    });
    assert.equal(selection.type, 'target', `${message}: ${compact(selection)}`);
  }
});

test('proactive explain targets the reminder and random messages fall through', () => {
  const brainChat = buildProactiveBrainChat([
    proactiveAssistantMessage({
      id: 'message-1',
      created_at: '2026-06-18T09:55:00.000Z',
      source_id: proactiveMemoFixtures.timedMemo.id,
      title: proactiveMemoFixtures.timedMemo.title,
      rule_key: 'timed_memo_due',
    }),
  ]);
  const explain = selectProactiveMemoReplyTarget({
    message: '?',
    brainChat,
    now: new Date('2026-06-18T10:00:00.000Z'),
  });
  assert.equal(explain.type, 'target', compact(explain));
  assert.equal(explain.intent.intent, 'explain');

  const random = selectProactiveMemoReplyTarget({
    message: 'quanto volume ho fatto in palestra?',
    brainChat,
    now: new Date('2026-06-18T10:00:00.000Z'),
  });
  assert.equal(random.type, 'none', compact(random));
});

test('missing-source proactive memo reply is read-only clarification', async () => {
  const brainChat = buildProactiveBrainChat([
    proactiveAssistantMessage({
      id: 'message-missing-source',
      created_at: '2026-06-18T09:55:00.000Z',
      source_id: null,
      title: 'Promemoria senza source id',
      rule_key: 'timed_memo_due',
    }),
  ]);
  const result = await resolveProactiveMemoReply({
    message: 'fatto',
    brainChat,
    context: {},
  });
  assert.ok(result, compact(result));
  assert.equal(result.plan.needsWrite, false, compact(result));
  assert.deepEqual(result.actions, []);
});

test('BrainTurn records working context and active pending action stage', () => {
  const turn = createBrainTurn({
    message: 'ok',
    source: 'whatsapp',
    responseMode: 'whatsapp',
    requestId: 'turn-pending',
    clientRequestId: 'whatsapp:test:turn-pending',
    channelMetadata: { whatsapp_sender: '111780936298528@lid', whatsapp_message_id: 'message-turn-pending' },
  });
  attachBrainChatToTurn(turn, {
    thread: { id: 'thread-1' },
    userMessage: { id: 'user-message-1' },
    source: 'whatsapp',
    conversationHistory: [
      pendingAssistantMessage({ id: 'pending-message-1', pendingAction: { id: 'pending-1', ...staleSleepPendingAction } }),
    ],
  });
  const workingContext = buildBrainTurnWorkingContext(turn);
  const { activePendingAction, pendingReplyIntent } = checkBrainTurnPendingAction(turn);
  assert.equal(turn.brainChat.workingContext, workingContext);
  assert.equal(activePendingAction.action_type, 'log_sleep_start');
  assert.equal(pendingReplyIntent.intent, 'confirm');
  assert.equal(turn.brainTrace.pending_action.found, true);
  assert.equal(turn.brainTrace.pending_reply_intent, 'confirm');
  assert.equal(turn.brainTrace.decision_path.some((step) => step.step === 'working_context_built'), true);
});

test('BrainTurn proactive priority stage can bypass unrelated pending action', () => {
  const turn = createBrainTurn({
    message: 'fatto',
    source: 'whatsapp',
    responseMode: 'whatsapp',
    requestId: 'turn-proactive',
  });
  attachBrainChatToTurn(turn, {
    thread: { id: 'thread-2' },
    userMessage: { id: 'user-message-2' },
    source: 'whatsapp',
    conversationHistory: [
      pendingAssistantMessage({ id: 'pending-message-2', pendingAction: { id: 'pending-2', ...staleSleepPendingAction } }),
      proactiveAssistantMessage({
        id: 'message-1',
        created_at: '2026-06-18T09:55:00.000Z',
        source_id: proactiveMemoFixtures.timedMemo.id,
        title: proactiveMemoFixtures.timedMemo.title,
        rule_key: 'timed_memo_due',
      }),
    ],
  });
  buildBrainTurnWorkingContext(turn);
  const { activePendingAction } = checkBrainTurnPendingAction(turn);
  const priority = checkBrainTurnProactivePriority(turn, {
    activePendingAction,
    now: new Date('2026-06-18T10:00:00.000Z'),
  });
  assert.equal(priority.prioritize, true, compact(priority));
  markBrainTurnProactiveBypassedPending(turn, { activePendingAction, priority });
  assert.equal(turn.brainTrace.pending_resolution, 'not_handled');
  assert.equal(turn.brainTrace.pending_action_bypass.reason, 'proactive_reply_latest_proactive_reply_intent');
});

test('BrainTurn records explicit-command pending bypass without handling old pending', async () => {
  const turn = createBrainTurn({
    message: 'Ricordami di fare matematica tra 10 minuti',
    source: 'whatsapp',
    responseMode: 'whatsapp',
    requestId: 'turn-new-command',
  });
  attachBrainChatToTurn(turn, {
    thread: { id: 'thread-3' },
    userMessage: { id: 'user-message-3' },
    source: 'whatsapp',
    conversationHistory: [
      pendingAssistantMessage({ id: 'pending-message-3', pendingAction: { id: 'pending-3', ...staleSleepPendingAction } }),
    ],
  });
  buildBrainTurnWorkingContext(turn);
  const { activePendingAction } = checkBrainTurnPendingAction(turn);
  const resolution = await resolvePendingActionTurn({
    message: turn.message,
    pendingAction: activePendingAction,
    context: turn,
  });
  recordBrainTurnPendingResolution(turn, resolution, activePendingAction, 'not_handled');
  assert.equal(resolution.handled, false, compact(resolution));
  assert.equal(resolution.bypassed, true, compact(resolution));
  assert.equal(turn.brainTrace.pending_resolution, 'not_handled');
  assert.equal(turn.brainTrace.pending_action_bypass.bypass, true);
});

test('BrainTurn records normal route stages for non-pending app chat', () => {
  const turn = createBrainTurn({
    message: 'Come sto andando questa settimana?',
    source: 'app',
    responseMode: 'app',
    requestId: 'turn-normal',
  });
  attachBrainChatToTurn(turn, {
    thread: { id: 'thread-4' },
    userMessage: { id: 'user-message-4' },
    source: 'app',
    conversationHistory: [],
  });
  buildBrainTurnWorkingContext(turn);
  const { activePendingAction } = checkBrainTurnPendingAction(turn);
  recordBrainTurnClassification(turn, { language: 'it', looks_like_write: false });
  recordBrainTurnRoute(turn, { mode: 'read_only_analysis', primary_skill: 'life_review', confidence: 0.8, write_intent: false });
  recordBrainTurnSkill(turn, { skill: { id: 'life_review' }, confidence: 0.8, reason: 'weekly review' });
  recordBrainTurnVault(turn, { attempted: true, results: [{ document_id: 'doc-1' }] }, { documentCount: 1 });
  assert.equal(activePendingAction, null);
  assert.equal(turn.brainTrace.route, 'read_only_analysis');
  assert.equal(turn.brainTrace.selected_skill, 'life_review');
  assert.equal(turn.brainTrace.vault.documents, 1);
});

test('WhatsApp sender aliases canonicalize allowlisted identities', () => {
  const previousAllowed = process.env.LIFEOS_WHATSAPP_ALLOWED_SENDERS;
  const previousAliases = process.env.LIFEOS_WHATSAPP_SENDER_ALIASES;
  try {
    process.env.LIFEOS_WHATSAPP_ALLOWED_SENDERS = '39XXXXXXXXXX@c.us';
    process.env.LIFEOS_WHATSAPP_SENDER_ALIASES = '39XXXXXXXXXX@c.us=111780936298528@lid';
    assert.equal(canonicalizeWhatsappSender('111780936298528@lid'), '39XXXXXXXXXX@c.us');
    assert.equal(getAllowedCanonicalWhatsappSenders().has('39XXXXXXXXXX@c.us'), true);
    assert.equal(validateWhatsappSender('111780936298528@lid'), '39XXXXXXXXXX@c.us');
    assert.throws(() => validateWhatsappSender('unknown@lid'), /Sender is not allowed/);
  } finally {
    restoreEnv('LIFEOS_WHATSAPP_ALLOWED_SENDERS', previousAllowed);
    restoreEnv('LIFEOS_WHATSAPP_SENDER_ALIASES', previousAliases);
  }
});

test('memo proactive registry emits current memo candidates through family contract', () => {
  assert.equal(proactiveRuleRegistry.some((rule) => rule.family === 'memo' && typeof rule.loadContext === 'function' && typeof rule.buildCandidates === 'function'), true);
  const dueAt = localDateTimeToUtcDate('2026-06-18', '09:30');
  const candidates = buildMemoProactiveCandidatesFromContext({
    context: { memos: [proactiveMemoFixtures.timedMemo] },
    now: new Date(dueAt.getTime() + 5 * 60000),
    recipient: proactiveMemoFixtures.recipient,
  });
  assert.equal(candidates.some((candidate) => candidate.rule_key === 'timed_memo_due'), true, compact(candidates));
});

test('attention budget suppresses daily cap and min-gap messages', () => {
  const candidate = {
    metadata: { exact_due_reminder: false },
  };
  assert.deepEqual(shouldSpendAttention({
    candidate,
    preferences: { max_per_day: 2, min_gap_minutes: 60 },
    attentionBudget: { daily_count: 2, recent_message: null },
  }), { allowed: false, reason: 'daily_cap' });
  assert.deepEqual(shouldSpendAttention({
    candidate,
    preferences: { max_per_day: 6, min_gap_minutes: 60 },
    attentionBudget: { daily_count: 1, recent_message: { id: 'recent' } },
  }), { allowed: false, reason: 'min_gap' });
  assert.deepEqual(shouldSpendAttention({
    candidate: { metadata: { exact_due_reminder: true } },
    preferences: { max_per_day: 6, min_gap_minutes: 60 },
    attentionBudget: { daily_count: 1, recent_message: { id: 'recent' } },
  }), { allowed: true, reason: null });
});

test('Europe/Rome local date helpers produce stable UTC windows', () => {
  const normal = localDateRangeToUtcIso({ date: '2026-06-18' });
  assert.equal(normal.start, '2026-06-17T22:00:00.000Z');
  assert.equal(normal.end, '2026-06-18T21:59:59.999Z');
  assert.equal(startOfLocalDayUtcIso('2026-01-18'), '2026-01-17T23:00:00.000Z');
  const range = localRangeToUtcWindow({ startDate: '2026-03-29', endDate: '2026-03-29' });
  assert.ok(new Date(range.start) < new Date(range.end), compact(range));
});

function test(name, fn) {
  tests.push({ name, fn });
}

function assertSleepStartCandidate(candidate, label) {
  assert.equal(candidate?.action_type, 'log_sleep_start', `${label}: action_type`);
  assert.equal(candidate?.args?.time, '03:41', `${label}: args.time`);
  assert.deepEqual(candidate?.missing_fields ?? [], [], `${label}: missing_fields`);
}

function compact(value) {
  return JSON.stringify(value, null, 2);
}

function buildProactiveBrainChat(messages) {
  return {
    conversationHistory: messages,
  };
}

function proactiveAssistantMessage({ id, created_at, source_id, title, rule_key }) {
  return {
    id,
    role: 'assistant',
    content: `Promemoria: ${title}. Fatto?`,
    created_at,
    metadata: {
      proactive_message: true,
      outbox_message_id: `outbox-${id}`,
      rule_key,
      source_type: 'memo',
      source_id,
      expected_reply_type: 'memo_done_snooze_cancel',
      working_context: {
        language: 'it',
        last_subject: {
          id: source_id,
          type: 'memo',
          label: title,
          source: 'proactive_whatsapp_memo',
          source_type: 'memo',
          source_id,
          raw: {
            rule_key,
          },
        },
      },
    },
  };
}

function pendingAssistantMessage({ id, pendingAction }) {
  return {
    id,
    role: 'assistant',
    content: pendingAction?.confirmation_question || pendingAction?.summary || 'Pending action',
    created_at: '2026-06-18T09:50:00.000Z',
    metadata: {
      pending_action: pendingAction,
      working_context: {
        language: pendingAction?.language === 'en' ? 'en' : 'it',
        active_pending_action: pendingAction,
      },
    },
  };
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function main() {
  console.log('Brain Regression Harness v1');
  let failed = 0;

  for (const item of tests) {
    try {
      await item.fn();
      console.log(`PASS ${item.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${item.name}`);
      console.error(error?.message || error);
      if (error?.actual !== undefined || error?.expected !== undefined) {
        console.error(compact({
          expected: error.expected,
          actual: error.actual,
        }));
      }
    }
  }

  if (failed) {
    console.error(`${failed} Brain regression check${failed === 1 ? '' : 's'} failed.`);
    process.exitCode = 1;
    return;
  }

  console.log('All Brain regression checks passed.');
}

await main();
