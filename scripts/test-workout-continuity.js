import assert from 'node:assert/strict';
import { chooseWorkoutSession, clearTrainingUser, clearWorkoutDraft, emptySetDraft, readTrainingWorkspace,
  readWorkoutDraft, sanitizeSetDraft, shouldResumeTraining, writeTrainingWorkspace, writeWorkoutDraft } from '../src/utils/workoutContinuity.js';

const entries = new Map();
const storage = {
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, value),
  removeItem: (key) => entries.delete(key),
  key: (index) => [...entries.keys()][index],
  get length() { return entries.size; },
};
const now = Date.parse('2026-09-28T14:00:00Z');
const options = { storage, now };
const draft = { exercise: 'Barbell Curl', set_number: 2, weight: '25', reps: '8', rpe: '8.5', notes: 'Controlled', is_warmup: true };
assert.equal(writeWorkoutDraft('a', 'session-a', draft, options), true);
assert.deepEqual(readWorkoutDraft('a', 'session-a', options), draft);
assert.deepEqual(readWorkoutDraft('b', 'session-a', options), emptySetDraft());
assert.deepEqual(readWorkoutDraft('a', 'session-b', options), emptySetDraft());
assert.deepEqual(readWorkoutDraft('a', 'session-a', { storage, now: now + 37 * 3600000 }), emptySetDraft());
writeWorkoutDraft('a', 'session-a', draft, options);
clearWorkoutDraft('a', 'session-a', options);
assert.deepEqual(readWorkoutDraft('a', 'session-a', options), emptySetDraft());
writeWorkoutDraft('a', 'session-a', draft, options);
writeWorkoutDraft('b', 'session-b', draft, options);
writeTrainingWorkspace('a', { tab: 'workout', sessionId: 'session-a' }, options);
const workspace = readTrainingWorkspace('a', options);
assert.deepEqual(workspace, { tab: 'workout', sessionId: 'session-a' });
const sessions = [{ id: 'session-newer', ended_at: null }, { id: 'session-a', ended_at: null }];
assert.equal(chooseWorkoutSession(sessions, null, workspace, '2026-09-28'), 'session-a');
assert.equal(chooseWorkoutSession(sessions, 'session-newer', workspace, '2026-09-28'), 'session-newer');
assert.equal(chooseWorkoutSession([], 'deleted', workspace, '2026-09-28'), null);
assert.equal(shouldResumeTraining({ pathname: '/', workspace, sessions, userNavigated: false }), true);
assert.equal(shouldResumeTraining({ pathname: '/health', workspace, sessions, userNavigated: false }), false);
assert.equal(shouldResumeTraining({ pathname: '/', workspace, sessions, userNavigated: true }), false);
assert.equal(shouldResumeTraining({ pathname: '/', workspace, sessions: [{ id: 'session-a', ended_at: 'ended' }] }), false);
clearTrainingUser('a', options);
assert.equal(readTrainingWorkspace('a', options), null);
assert.deepEqual(readWorkoutDraft('b', 'session-b', options), draft);
for (const key of entries.keys()) entries.set(key, '{broken');
assert.deepEqual(readWorkoutDraft('b', 'session-b', options), emptySetDraft());
assert.deepEqual(sanitizeSetDraft({ exercise: {}, notes: [], reps: 'NaN', weight: 'Infinity', is_warmup: 'true' }), emptySetDraft());
const unavailable = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
assert.equal(writeWorkoutDraft('a', 's', draft, { storage: unavailable, now }), false);
assert.deepEqual(readWorkoutDraft('a', 's', { storage: unavailable, now }), emptySetDraft());
console.log('PASS Training storage: full draft, user/session isolation, expiry, corruption, cleanup, route agency and session recovery');
