import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { localDate } from '../src/utils/date.js';

const CONTEXT_MODULE_ID = '\0lifeos-workout-context-test';
const noop = () => {};
const today = localDate();
const activeSession = {
  id: 'workout-active',
  name: 'Push Day',
  performed_on: today,
  started_at: `${today}T15:00:00.000Z`,
  ended_at: null,
  template_snapshot: [],
  workout_sets: [],
};
const historicalSession = {
  id: 'workout-history',
  name: 'Previous Push Day',
  performed_on: '2026-09-01',
  started_at: '2026-09-01T15:00:00.000Z',
  ended_at: '2026-09-01T16:00:00.000Z',
  template_snapshot: [{ exercise: 'Bench Press', exercise_order: 1 }],
  workout_sets: [{
    id: 'set-history',
    workout_id: 'workout-history',
    exercise: 'Bench Press',
    set_number: 1,
    is_warmup: false,
    weight: 80,
    reps: 8,
    rpe: 8,
    performed_at: '2026-09-01T15:10:00.000Z',
  }],
};

const baseContext = {
  activeWorkoutId: null,
  activeWorkoutSession: null,
  workoutSessions: [],
  workoutSessionsError: '',
  workoutSessionsStatus: 'ready',
  workoutTemplates: [],
  workoutTemplatesError: '',
  workoutTemplatesStatus: 'ready',
  setUnsavedWork: noop,
  setActiveWorkoutId: noop,
  createWorkoutTemplate: noop,
  createWorkoutTemplateExercise: noop,
  createWorkoutSession: noop,
  createWorkoutSet: noop,
  deleteWorkoutTemplate: noop,
  deleteWorkoutTemplateExercise: noop,
  deleteWorkoutSession: noop,
  deleteWorkoutSet: noop,
  endWorkoutSession: noop,
  reorderWorkoutTemplateExercise: noop,
  updateWorkoutTemplate: noop,
  updateWorkoutTemplateExercise: noop,
  updateWorkoutSession: noop,
  updateWorkoutSet: noop,
};

const cases = [
  { name: 'empty datasets', context: {} },
  {
    name: 'datasets loading',
    context: { workoutSessionsStatus: 'loading', workoutTemplatesStatus: 'loading' },
  },
  { name: 'no active workout id', context: { activeWorkoutId: null } },
  {
    name: 'valid active session',
    context: { activeWorkoutId: activeSession.id, activeWorkoutSession: activeSession, workoutSessions: [activeSession] },
  },
  {
    name: 'stale active workout id',
    context: { activeWorkoutId: 'missing-workout', activeWorkoutSession: null, workoutSessions: [historicalSession] },
  },
  {
    name: 'active session without workout_sets property',
    context: {
      activeWorkoutId: activeSession.id,
      activeWorkoutSession: { ...activeSession, workout_sets: undefined },
      workoutSessions: [{ ...activeSession, workout_sets: undefined }],
    },
  },
  {
    name: 'active session with empty workout_sets',
    context: { activeWorkoutId: activeSession.id, activeWorkoutSession: activeSession, workoutSessions: [activeSession] },
  },
  {
    name: 'template without exercises',
    context: { workoutTemplates: [{ id: 'template-empty', name: 'Empty Template', workout_template_exercises: null }] },
  },
  {
    name: 'persisted historical workout data',
    context: { workoutSessions: [historicalSession] },
  },
  {
    name: 'active workout with persisted history',
    context: {
      activeWorkoutId: activeSession.id,
      activeWorkoutSession: activeSession,
      workoutSessions: [activeSession, historicalSession],
    },
  },
  {
    name: 'ended active workout',
    context: {
      activeWorkoutId: activeSession.id,
      activeWorkoutSession: { ...activeSession, ended_at: `${today}T16:00:00.000Z` },
      workoutSessions: [{ ...activeSession, ended_at: `${today}T16:00:00.000Z` }],
    },
  },
];

const server = await createServer({
  appType: 'custom',
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  plugins: [
    react(),
    {
      name: 'lifeos-workout-context-test',
      enforce: 'pre',
      resolveId(source, importer) {
        const normalizedImporter = importer?.replaceAll('\\', '/');
        if (source === '../context/LifeOSContext' && normalizedImporter?.endsWith('/src/tabs/WorkoutTab.jsx')) {
          return CONTEXT_MODULE_ID;
        }
        return null;
      },
      load(id) {
        if (id !== CONTEXT_MODULE_ID) return null;
        return 'export function useLifeOS() { return globalThis.__lifeosWorkoutTestContext; }';
      },
    },
  ],
});

try {
  const { WorkoutTab } = await server.ssrLoadModule('/src/tabs/WorkoutTab.jsx');
  for (const testCase of cases) {
    globalThis.__lifeosWorkoutTestContext = { ...baseContext, ...testCase.context };
    const html = renderToStaticMarkup(React.createElement(WorkoutTab));
    assert.match(html, /Workout/, `${testCase.name} did not render the Workout surface`);
    console.log(`PASS Workout renders with ${testCase.name}`);
  }
} finally {
  delete globalThis.__lifeosWorkoutTestContext;
  await server.close();
}

console.log('All Workout render checks passed.');
