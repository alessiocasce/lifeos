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

function test(name, fn) {
  tests.push({ name, fn });
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
