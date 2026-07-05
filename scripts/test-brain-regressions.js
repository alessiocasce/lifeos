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
import { validateBrainCommandDraft } from '../api/_utils/brainCommandDraft.js';
import { buildBrainWorkingContext } from '../api/_utils/brainWorkingContext.js';
import { shouldRetrieveBrainVault } from '../api/_utils/brainVaultEligibility.js';
import {
  canAckOutboxMessage,
  computeClaimRecovery,
  computeRetryBackoff,
  nextOutboxStatusForAck,
} from '../api/_utils/brainOutboxStateMachine.js';
import {
  buildProactiveWorkingContextFromOutbox,
  normalizeProactiveMemoReply,
  selectProactiveMemoReplyTarget,
} from '../api/_utils/brainProactiveReplies.js';
import {
  buildMemoIdempotencyKey,
  buildMemoProactiveCandidates,
  isWithinQuietHours,
  localDateTimeToUtcDate,
  validateProactiveCandidate,
} from '../api/_utils/brainProactiveRules.js';
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

test('calendar pending bypasses independent memo command', async () => {
  const resolution = await resolvePendingActionTurn({
    message: 'Ricordami di fare matematica tra 10 minuti',
    pendingAction: calendarPendingMissingTime,
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
