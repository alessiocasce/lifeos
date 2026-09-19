#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  applyRoutineStateTransition,
  computeRoutineNegativeFeedbackTransition,
  evaluateRoutineProactivePolicy,
  getCurrentRoutineBelief,
  listBeliefHistory,
  recordRoutineNegativeFeedback,
} from '../api/_utils/brainBeliefs.js';
import {
  applyRoutineSemanticOperation,
  inferRoutineStateChange,
  validateRoutineSemanticInference,
} from '../api/_utils/brainRoutineSemantics.js';
import { buildAccountabilityProactiveCandidates } from '../api/_utils/brainProactiveAccountability.js';
import { checkProactiveDelivery } from '../api/_utils/brainProactiveDelivery.js';
import {
  runCompanionProactiveTurn,
  runStandaloneRoutineSemanticTurn,
} from '../api/_utils/brainCompanionTurn.js';
import { buildButlerFallback, createCompanionResult } from '../api/_utils/brainButler.js';
import { selectBrainTurnInteraction } from '../api/_utils/brainInteractionSelection.js';
import { createReliabilityDatabase, fixtureUser } from '../tests/brain/reliabilityDatabase.js';

const tests = [];

test('routine transitions preserve one current row and immutable supersession history', async () => {
  const { db, client } = await createReliabilityDatabase();
  try {
    const stopped = await applyRoutineStateTransition({
      routineId: 'skin',
      state: 'inactive',
      confidence: 0.96,
      sourceType: 'user_explicit',
      sourceRef: { channel: 'whatsapp', message_id: 'message-stop-1' },
      provenance: { inference: 'semantic_state_change', evidence: 'stopped_about_a_month_ago' },
      effectiveFrom: new Date('2026-09-19T10:00:00Z'),
      idempotencyKey: 'belief:test:skin:stop:1',
      userId: fixtureUser,
      client,
    });
    assert.equal(stopped.value.state, 'inactive');
    assert.equal(stopped.record_status, 'current');

    const replay = await applyRoutineStateTransition({
      routineId: 'skin',
      state: 'inactive',
      confidence: 0.96,
      sourceType: 'user_explicit',
      sourceRef: { channel: 'whatsapp', message_id: 'message-stop-1' },
      provenance: { inference: 'semantic_state_change', evidence: 'stopped_about_a_month_ago' },
      effectiveFrom: new Date('2026-09-19T10:00:00Z'),
      idempotencyKey: 'belief:test:skin:stop:1',
      userId: fixtureUser,
      client,
    });
    assert.equal(replay.id, stopped.id);

    const active = await applyRoutineStateTransition({
      routineId: 'skin',
      state: 'active',
      confidence: 0.94,
      sourceType: 'user_explicit',
      sourceRef: { channel: 'whatsapp', message_id: 'message-start-1' },
      provenance: { inference: 'semantic_state_change', evidence: 'started_again' },
      effectiveFrom: new Date('2026-09-20T10:00:00Z'),
      idempotencyKey: 'belief:test:skin:start:1',
      userId: fixtureUser,
      client,
    });
    assert.equal(active.value.state, 'active');
    assert.equal(active.supersedes_id, stopped.id);

    const history = await listBeliefHistory({
      userId: fixtureUser,
      subjectType: 'routine',
      subjectKey: 'health.habit.skin',
      predicate: 'status',
      client,
    });
    assert.equal(history.length, 2);
    assert.equal(history.filter((row) => row.record_status === 'current').length, 1);
    assert.equal(history.find((row) => row.id === stopped.id).record_status, 'superseded');
    assert.equal(history.find((row) => row.id === stopped.id).provenance.evidence, 'stopped_about_a_month_ago');
    assert.equal((await getCurrentRoutineBelief({ routineId: 'skin', userId: fixtureUser, client })).id, active.id);
  } finally {
    await db.close();
  }
});

test('a bare no records bounded evidence without fabricating an inactive routine', async () => {
  const { db, client } = await createReliabilityDatabase();
  try {
    const first = await recordRoutineNegativeFeedback({
      routineId: 'shower',
      sourceRef: { outbox_message_id: 'outbox-one' },
      provenance: { reply_kind: 'bare_no' },
      idempotencyKey: 'belief:test:shower:no:1',
      now: new Date('2026-09-19T12:00:00Z'),
      userId: fixtureUser,
      client,
    });
    assert.equal(first.value.state, 'active');
    assert.equal(first.negative_feedback_count, 1);
    assert.equal(first.provenance.permanent_state_inferred, false);
    assert.notEqual(first.value.state, 'inactive');
    assert.equal(evaluateRoutineProactivePolicy(first, { now: new Date('2026-09-19T12:05:00Z') }).reason, 'negative_feedback_cooldown');

    const replay = await recordRoutineNegativeFeedback({
      routineId: 'shower',
      sourceRef: { outbox_message_id: 'outbox-one' },
      provenance: { reply_kind: 'bare_no' },
      idempotencyKey: 'belief:test:shower:no:1',
      now: new Date('2026-09-19T12:00:00Z'),
      userId: fixtureUser,
      client,
    });
    assert.equal(replay.id, first.id);
    assert.equal(replay.negative_feedback_count, 1);
  } finally {
    await db.close();
  }
});

test('repeated negative feedback becomes uncertain and suppresses nagging without deactivation', async () => {
  const { db, client } = await createReliabilityDatabase();
  try {
    await recordRoutineNegativeFeedback({
      routineId: 'creatine',
      idempotencyKey: 'belief:test:creatine:no:1',
      now: new Date('2026-09-18T12:00:00Z'),
      userId: fixtureUser,
      client,
    });
    const second = await recordRoutineNegativeFeedback({
      routineId: 'creatine',
      idempotencyKey: 'belief:test:creatine:no:2',
      now: new Date('2026-09-19T12:00:00Z'),
      userId: fixtureUser,
      client,
    });
    assert.equal(second.value.state, 'uncertain');
    assert.equal(second.value.needs_clarification, true);
    assert.equal(second.negative_feedback_count, 2);
    assert.notEqual(second.value.state, 'inactive');
    const policy = evaluateRoutineProactivePolicy(second, { now: new Date('2026-09-20T12:00:00Z') });
    assert.equal(policy.allowed, false);
    assert.equal(policy.reason, 'negative_feedback_cooldown');

    const afterCooldown = evaluateRoutineProactivePolicy(second, { now: new Date('2026-09-27T12:01:00Z') });
    assert.equal(afterCooldown.allowed, true);
    assert.equal(afterCooldown.mode, 'clarify');
  } finally {
    await db.close();
  }
});

test('routine policy blocks inactive and bounded suspended beliefs', () => {
  assert.deepEqual(
    evaluateRoutineProactivePolicy({ value: { state: 'inactive' } }),
    { allowed: false, mode: 'suppressed', reason: 'routine_inactive' },
  );
  const suspended = evaluateRoutineProactivePolicy({
    value: { state: 'suspended' },
    effective_until: '2026-09-21T12:00:00Z',
  }, { now: new Date('2026-09-20T12:00:00Z') });
  assert.equal(suspended.allowed, false);
  assert.equal(suspended.reason, 'routine_suspended');
});

test('negative feedback decision remains pure and preserves an explicit inactive state', () => {
  const result = computeRoutineNegativeFeedbackTransition({
    currentBelief: {
      value: { state: 'inactive', routine_id: 'skin' },
      confidence: 0.9,
      negative_feedback_count: 0,
    },
    now: new Date('2026-09-19T12:00:00Z'),
  });
  assert.equal(result.state, 'inactive');
  assert.equal(result.negative_feedback_count, 1);
});

test('semantic inference accepts grounded deactivation but rejects bare no as durable evidence', async () => {
  const now = new Date('2026-09-19T12:00:00Z');
  const semantic = await inferRoutineStateChange({
    message: 'no lol I stopped doing that like a month ago',
    targetRoutineId: 'skin',
    now,
    infer: async () => ({
      operation: 'deactivate',
      routine_id: 'skin',
      confidence: 0.97,
      reason: 'The user explicitly stopped the routine.',
      evidence: 'I stopped doing that like a month ago',
      effective_from: '2026-08-19T12:00:00Z',
    }),
  });
  assert.equal(semantic.operation, 'deactivate');
  assert.equal(semantic.state, 'inactive');
  assert.equal(semantic.routine_id, 'skin');
  assert.equal(semantic.persist, true);

  let called = false;
  const bare = await inferRoutineStateChange({
    message: 'no',
    targetRoutineId: 'skin',
    now,
    infer: async () => { called = true; return { operation: 'deactivate', routine_id: 'skin', confidence: 1 }; },
  });
  assert.equal(called, false);
  assert.equal(bare.operation, 'no_change');
  assert.equal(bare.validation_reason, 'bare_reply');
});

test('semantic validator blocks cross-target substitution and low-confidence state changes', () => {
  const crossTarget = validateRoutineSemanticInference({
    operation: 'deactivate',
    routine_id: 'creatine',
    confidence: 0.99,
  }, {
    message: 'I stopped doing that',
    targetRoutineId: 'skin',
    now: new Date('2026-09-19T12:00:00Z'),
  });
  assert.equal(crossTarget.operation, 'no_change');
  assert.equal(crossTarget.validation_reason, 'cross_target_not_grounded');

  const weak = validateRoutineSemanticInference({
    operation: 'deactivate',
    routine_id: 'skin',
    confidence: 0.5,
  }, {
    message: 'I might not care about skincare',
    targetRoutineId: 'skin',
    now: new Date('2026-09-19T12:00:00Z'),
  });
  assert.equal(weak.operation, 'no_change');
  assert.equal(weak.validation_reason, 'low_confidence');
});

test('temporary suspension gets a bounded default while explicit reactivation restores active state', async () => {
  const now = new Date('2026-09-19T12:00:00Z');
  const suspended = await inferRoutineStateChange({
    message: 'leave me alone about creatine for a while',
    now,
    infer: async () => ({ operation: 'suspend', routine_id: 'creatine', confidence: 0.9, evidence: 'for a while' }),
  });
  assert.equal(suspended.operation, 'suspend');
  assert.equal(suspended.inferred_default_duration, true);
  assert.equal(suspended.effective_until, '2026-10-03T12:00:00.000Z');

  const reactivated = await inferRoutineStateChange({
    message: 'actually I started doing skincare again',
    now,
    infer: async () => ({ operation: 'reactivate', routine_id: 'skin', confidence: 0.96, evidence: 'started doing skincare again' }),
  });
  assert.equal(reactivated.operation, 'reactivate');
  assert.equal(reactivated.state, 'active');
});

test('validated semantic operations persist through the belief service with provenance', async () => {
  const { db, client } = await createReliabilityDatabase();
  try {
    const semantic = validateRoutineSemanticInference({
      operation: 'deactivate',
      routine_id: 'skin',
      confidence: 0.98,
      reason: 'Explicitly stopped.',
      evidence: 'stopped doing skincare',
    }, {
      message: 'I stopped doing skincare',
      now: new Date('2026-09-19T12:00:00Z'),
    });
    const persisted = await applyRoutineSemanticOperation({
      semantic,
      userId: fixtureUser,
      idempotencyKey: 'semantic:test:skin:stop:1',
      sourceRef: { channel: 'whatsapp', message_id: 'message-1' },
      provenance: { path: 'compound_proactive_reply' },
      client,
    });
    assert.equal(persisted.value.state, 'inactive');
    assert.equal(persisted.provenance.semantic_operation, 'deactivate');
    assert.equal(persisted.provenance.path, 'compound_proactive_reply');
    assert.equal(persisted.provenance.validator, 'brain_routine_semantics_v1');
  } finally {
    await db.close();
  }
});

test('active proactive ownership admits a rich routine-state reply without target substitution', () => {
  const assistant = proactiveHabitMessage({ habitId: 'skin', assistantId: 'assistant-skin', outboxId: 'outbox-skin' });
  const selected = selectBrainTurnInteraction({
    message: 'no lol I stopped doing that like a month ago',
    brainChat: { conversationHistory: [assistant] },
    activeInteraction: {
      state: 'active',
      owner_kind: 'proactive',
      assistant_message_id: assistant.id,
      thread_id: 'thread-1',
      version: 4,
      expires_at: '2026-09-20T12:00:00Z',
    },
    now: new Date('2026-09-19T12:00:00Z'),
  });
  assert.equal(selected.path, 'proactive_reply');
  assert.equal(selected.selection_method, 'active_interaction_owner');
  assert.equal(selected.proactive_selection.proactive.accountability.habit_id, 'skin');
  assert.equal(selected.proactive_selection.intent.intent, 'other');
});

test('compound proactive turn resolves no-write target, updates belief, and renders one grounded reply', async () => {
  const calls = [];
  const selection = proactiveSelection({ habitId: 'skin', intent: 'other' });
  const result = await runCompanionProactiveTurn({
    message: 'no lol I stopped doing that like a month ago',
    brainChat: { userMessage: { id: 'user-message-1' } },
    context: {
      clientRequestId: 'request-1',
      brainChat: { userMessage: { id: 'user-message-1' }, thread: { id: 'thread-1' } },
      interactionSelection: { assistant_message_id: 'assistant-1', selection_method: 'active_interaction_owner' },
    },
    selection,
    now: new Date('2026-09-19T12:00:00Z'),
    actions: {
      getCurrentRoutineBelief: async () => null,
      inferRoutineStateChange: async () => ({
        operation: 'deactivate', routine_id: 'skin', state: 'inactive', confidence: 0.98, persist: true,
      }),
      resolveProactive: async ({ selection: resolvedSelection }) => {
        calls.push(`resolve:${resolvedSelection.intent.intent}`);
        return proactiveNoWriteResult();
      },
      applyRoutineSemanticOperation: async ({ idempotencyKey }) => {
        calls.push(`apply:${idempotencyKey}`);
        return { id: 'belief-1', value: { state: 'inactive' } };
      },
      recordRoutineNegativeFeedback: async () => { throw new Error('must not record ambiguous feedback'); },
      cancelQueuedRoutineCandidates: async () => { calls.push('cancel'); return { cancelled_count: 1 }; },
      renderCompanionResult: async ({ result: machine }) => {
        calls.push(`render:${machine.semantic.operation}`);
        return "Got it. I won't ask about that routine again.";
      },
    },
  });
  assert.equal(result.handled, true);
  assert.equal(result.result.companion_result.semantic.operation, 'deactivate');
  assert.equal(result.result.companion_result.deterministic.needs_write, false);
  assert.equal(result.result.actions.filter((action) => action.type === 'update_companion_belief').length, 1);
  assert.equal(result.result.actions.some((action) => action.type === 'update_health_log'), false);
  assert.deepEqual(calls, [
    'resolve:no',
    'apply:companion:user-message-1:semantic:deactivate',
    'cancel',
    'render:deactivate',
  ]);
});

test('bare no records bounded feedback but never invokes durable semantic mutation', async () => {
  let semanticWrites = 0;
  let feedbackWrites = 0;
  const result = await runCompanionProactiveTurn({
    message: 'no',
    brainChat: { userMessage: { id: 'user-message-no' } },
    context: { brainChat: { userMessage: { id: 'user-message-no' } } },
    selection: proactiveSelection({ habitId: 'skin', intent: 'no' }),
    actions: {
      getCurrentRoutineBelief: async () => null,
      inferRoutineStateChange: async () => ({ operation: 'no_change', persist: false, validation_reason: 'bare_reply' }),
      resolveProactive: async () => proactiveNoWriteResult(),
      applyRoutineSemanticOperation: async () => { semanticWrites += 1; },
      recordRoutineNegativeFeedback: async () => { feedbackWrites += 1; return { id: 'feedback-1', value: { state: 'active' } }; },
      cancelQueuedRoutineCandidates: async () => ({ cancelled_count: 0 }),
      renderCompanionResult: async ({ fallbackAnswer }) => fallbackAnswer,
    },
  });
  assert.equal(result.handled, true);
  assert.equal(semanticWrites, 0);
  assert.equal(feedbackWrites, 1);
  assert.equal(result.result.companion_result.semantic, null);
});

test('compound done plus unrelated information preserves residual without a second target write', async () => {
  let resolutions = 0;
  const result = await runCompanionProactiveTurn({
    message: "done btw I'm going away tomorrow",
    brainChat: { userMessage: { id: 'user-message-trip' } },
    context: { brainChat: { userMessage: { id: 'user-message-trip' } } },
    selection: proactiveSelection({ habitId: 'creatine', intent: 'done' }),
    actions: {
      getCurrentRoutineBelief: async () => null,
      inferRoutineStateChange: async () => ({
        operation: 'no_change', persist: false, validation_reason: 'model_no_change', residual_text: "I'm going away tomorrow",
      }),
      resolveProactive: async () => {
        resolutions += 1;
        return {
          ...proactiveNoWriteResult(),
          plan: { intent: 'update_health_log', needsRead: false, needsWrite: true, riskLevel: 'low', args: {} },
          actions: [{ type: 'update_health_log', data: { habit_id: 'creatine' } }],
          answer: 'Logged.',
        };
      },
      applyRoutineSemanticOperation: async () => { throw new Error('no routine mutation expected'); },
      recordRoutineNegativeFeedback: async () => { throw new Error('no negative feedback expected'); },
      cancelQueuedRoutineCandidates: async () => ({ cancelled_count: 0 }),
      renderCompanionResult: async () => 'Logged. I will keep the trip in mind.',
    },
  });
  assert.equal(resolutions, 1);
  assert.equal(result.result.actions.filter((action) => action.type === 'update_health_log').length, 1);
  assert.equal(result.result.memory_extraction_message, "I'm going away tomorrow");
  assert.equal(result.result.skipMemoryExtraction, false);
  assert.equal(result.result.companion_result.residual.disposition, 'knowledge_extraction');
});

test('inactive beliefs suppress generation and delivery while reactivation resumes generation', async () => {
  const now = new Date('2026-07-07T21:45:00Z');
  const inactive = {
    subject_type: 'routine',
    subject_key: 'health.habit.skin',
    predicate: 'status',
    value: { state: 'inactive', routine_id: 'skin' },
  };
  const suppressed = buildAccountabilityProactiveCandidates({
    healthLogs: [{ logged_on: '2026-07-07', wake_time: '08:00', sleep_start: '00:30', hygiene: {} }],
    routineBeliefs: [inactive],
    now,
    recipient: 'fixture@lid',
  });
  assert.equal(suppressed.some((candidate) => candidate.metadata?.accountability?.habit_id === 'skin'), false);

  const active = { ...inactive, value: { state: 'active', routine_id: 'skin' } };
  const resumed = buildAccountabilityProactiveCandidates({
    healthLogs: [{ logged_on: '2026-07-07', wake_time: '08:00', sleep_start: '00:30', hygiene: {} }],
    routineBeliefs: [active],
    now,
    recipient: 'fixture@lid',
  });
  assert.equal(resumed.some((candidate) => candidate.metadata?.accountability?.habit_id === 'skin'), true);

  const { db, client } = await createReliabilityDatabase();
  try {
    await applyRoutineStateTransition({
      routineId: 'skin', state: 'inactive', idempotencyKey: 'delivery:skin:inactive',
      userId: fixtureUser, client,
    });
    const delivery = await checkProactiveDelivery({
      row: {
        source_type: 'accountability',
        source_id: 'habit:skin:2026-07-07',
        metadata: { accountability: { kind: 'habit_missing', habit_id: 'skin', local_date: '2026-07-07', target_count: 1 } },
      },
      userId: fixtureUser,
      client,
    });
    assert.equal(delivery.eligible, false);
    assert.equal(delivery.reason, 'routine_inactive');
  } finally {
    await db.close();
  }
});

test('standalone natural reactivation uses the same semantic and Butler contracts', async () => {
  const result = await runStandaloneRoutineSemanticTurn({
    message: 'actually I started doing skincare again',
    context: { source: 'whatsapp', brainChat: { userMessage: { id: 'reactivate-message' } }, workingContext: { language: 'en' } },
    actions: {
      getCurrentRoutineBelief: async () => ({ id: 'inactive-belief', value: { state: 'inactive' } }),
      inferRoutineStateChange: async () => ({
        operation: 'reactivate', routine_id: 'skin', state: 'active', confidence: 0.98, persist: true,
      }),
      applyRoutineSemanticOperation: async () => ({ id: 'active-belief', value: { state: 'active' } }),
      cancelQueuedRoutineCandidates: async () => { throw new Error('reactivation must not cancel candidates'); },
      renderCompanionResult: async ({ result: machine }) => buildButlerFallback(machine),
    },
  });
  assert.equal(result.actions[0].type, 'update_companion_belief');
  assert.equal(result.actions[0].data.state, 'active');
  assert.match(result.answer, /include it in check-ins again/i);
});

test('Butler fallback is grounded in structured state and exposes no invented action', () => {
  const machine = createCompanionResult({
    semantic: { operation: 'deactivate', routine_id: 'skin', state: 'inactive', confidence: 0.95 },
    belief: { id: 'belief-1' },
    language: 'it',
  });
  assert.equal(buildButlerFallback(machine), 'Capito. Non te lo chiedo piu.');
  assert.equal(machine.deterministic.action_count, 0);
});

function test(name, fn) {
  tests.push({ name, fn });
}

function proactiveSelection({ habitId, intent }) {
  return {
    type: 'target',
    reply_type: 'accountability',
    selection_method: 'active_interaction_owner',
    intent: { intent, confidence: 0.9 },
    proactive: {
      outbox_message_id: `outbox-${habitId}`,
      source_type: 'accountability',
      source_id: `habit:${habitId}:2026-09-19`,
      language: 'en',
      accountability: { kind: 'habit_missing', habit_id: habitId, local_date: '2026-09-19', target_count: 1 },
      working_context: { language: 'en' },
    },
  };
}

function proactiveNoWriteResult() {
  return {
    answer: 'Ok, I will not log anything.',
    plan: { intent: 'clarify', needsRead: false, needsWrite: false, riskLevel: 'low', args: {} },
    actions: [],
    contextSummary: null,
    skipMemoryExtraction: true,
    proactive_reply_trace: { action_type: 'no', expected_reply_type: 'accountability' },
  };
}

function proactiveHabitMessage({ habitId, assistantId, outboxId }) {
  const accountability = { kind: 'habit_missing', habit_id: habitId, local_date: '2026-09-19', target_count: 1 };
  return {
    id: assistantId,
    role: 'assistant',
    content: `${habitId}?`,
    created_at: '2026-09-19T11:55:00Z',
    metadata: {
      proactive_message: true,
      expected_reply_type: 'accountability',
      outbox_message_id: outboxId,
      source_type: 'accountability',
      source_id: `habit:${habitId}:2026-09-19`,
      language: 'en',
      accountability,
      working_context: {
        language: 'en',
        last_subject: {
          id: `habit:${habitId}:2026-09-19`,
          type: 'accountability',
          source_type: 'accountability',
          source_id: `habit:${habitId}:2026-09-19`,
          raw: { outbox_message_id: outboxId, accountability },
        },
      },
    },
  };
}

let failures = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

if (failures) process.exitCode = 1;
else console.log(`Companion beliefs: ${tests.length} tests passed.`);
