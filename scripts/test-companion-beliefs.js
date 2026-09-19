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
