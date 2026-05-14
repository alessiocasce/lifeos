import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  agendaBlocks,
  calendarWeeks,
  currentDate,
  financeData,
  initialHealth,
  mockNowMinutes,
  selectedDayAgenda,
  tabs,
  workoutData,
} from '../data/lifeosData';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import {
  authApi,
  calendarEventApi,
  dailyReviewApi,
  expenseApi,
  healthLogApi,
  workoutApi,
  workoutSetApi,
  workoutTemplateApi,
  workoutTemplateExerciseApi,
} from '../services/lifeosApi';

const LifeOSContext = createContext(null);
const today = () => new Date().toISOString().slice(0, 10);

const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export function LifeOSProvider({ children }) {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedDay, setSelectedDay] = useState(11);
  const [aiTriage, setAiTriage] = useState(true);
  const [health, setHealth] = useState(initialHealth);
  const [finance, setFinance] = useState(financeData);
  const [expandedWorkout, setExpandedWorkout] = useState(workoutData.history[0].date);
  const [authUser, setAuthUser] = useState(null);
  const [authStatus, setAuthStatus] = useState(isSupabaseConfigured ? 'loading' : 'not-configured');
  const [authError, setAuthError] = useState('');
  const [workoutSessions, setWorkoutSessions] = useState([]);
  const [activeWorkoutId, setActiveWorkoutId] = useState(null);
  const [workoutSessionsStatus, setWorkoutSessionsStatus] = useState(isSupabaseConfigured ? 'idle' : 'not-configured');
  const [workoutSessionsError, setWorkoutSessionsError] = useState('');
  const [workoutTemplates, setWorkoutTemplates] = useState([]);
  const [workoutTemplatesStatus, setWorkoutTemplatesStatus] = useState(isSupabaseConfigured ? 'idle' : 'not-configured');
  const [workoutTemplatesError, setWorkoutTemplatesError] = useState('');
  const [healthLogs, setHealthLogs] = useState([]);
  const [healthLogsStatus, setHealthLogsStatus] = useState(isSupabaseConfigured ? 'idle' : 'not-configured');
  const [healthLogsError, setHealthLogsError] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [expensesStatus, setExpensesStatus] = useState(isSupabaseConfigured ? 'idle' : 'not-configured');
  const [expensesError, setExpensesError] = useState('');
  const [monthlyExpenses, setMonthlyExpenses] = useState([]);
  const [monthlyExpensesStatus, setMonthlyExpensesStatus] = useState(isSupabaseConfigured ? 'idle' : 'not-configured');
  const [monthlyExpensesError, setMonthlyExpensesError] = useState('');
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarEventsStatus, setCalendarEventsStatus] = useState(isSupabaseConfigured ? 'idle' : 'not-configured');
  const [calendarEventsError, setCalendarEventsError] = useState('');
  const [dailyReviews, setDailyReviews] = useState([]);
  const [dailyReviewsStatus, setDailyReviewsStatus] = useState(isSupabaseConfigured ? 'idle' : 'not-configured');
  const [dailyReviewsError, setDailyReviewsError] = useState('');
  const lastAuthUserId = useRef(null);
  const lastCalendarRangeRequest = useRef(0);

  const clearUserScopedState = useCallback((status = 'idle') => {
    setWorkoutSessions([]);
    setActiveWorkoutId(null);
    setWorkoutSessionsError('');
    setWorkoutSessionsStatus(status);
    setWorkoutTemplates([]);
    setWorkoutTemplatesError('');
    setWorkoutTemplatesStatus(status);
    setHealthLogs([]);
    setHealth(initialHealth);
    setHealthLogsError('');
    setHealthLogsStatus(status);
    setExpenses([]);
    setExpensesError('');
    setExpensesStatus(status);
    setMonthlyExpenses([]);
    setMonthlyExpensesError('');
    setMonthlyExpensesStatus(status);
    setCalendarEvents([]);
    setCalendarEventsError('');
    setCalendarEventsStatus(status);
    lastCalendarRangeRequest.current += 1;
    setDailyReviews([]);
    setDailyReviewsError('');
    setDailyReviewsStatus(status);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthStatus('not-configured');
      return;
    }

    let active = true;

    authApi
      .getSession()
      .then(({ session }) => {
        if (!active) return;
        const nextUser = session?.user ?? null;
        if (lastAuthUserId.current !== (nextUser?.id ?? null)) {
          clearUserScopedState(nextUser ? 'idle' : 'no-session');
          lastAuthUserId.current = nextUser?.id ?? null;
        }
        setAuthUser((current) => (current?.id === nextUser?.id ? current : nextUser));
        setAuthStatus('ready');
      })
      .catch((error) => {
        if (!active) return;
        setAuthError(error.message || 'Failed to load Supabase session.');
        setAuthStatus('error');
      });

    const subscription = authApi.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      if (lastAuthUserId.current !== (nextUser?.id ?? null)) {
        clearUserScopedState(nextUser ? 'idle' : 'no-session');
        lastAuthUserId.current = nextUser?.id ?? null;
      }
      setAuthUser((current) => (current?.id === nextUser?.id ? current : nextUser));
      setAuthStatus('ready');
      setAuthError('');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [clearUserScopedState]);

  const loadWorkoutSessions = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setWorkoutSessionsStatus('not-configured');
      return;
    }

    if (!authUser) {
      setWorkoutSessions([]);
      setActiveWorkoutId(null);
      setWorkoutSessionsStatus('no-session');
      return;
    }

    setWorkoutSessionsStatus('loading');
    setWorkoutSessionsError('');
    try {
      const rows = await workoutApi.list();
      if (lastAuthUserId.current !== authUser.id) return;
      setWorkoutSessions(rows ?? []);
      setActiveWorkoutId((currentId) => {
        if (currentId && rows.some((session) => session.id === currentId)) return currentId;
        const todaysSession = rows.find((session) => session.performed_on === new Date().toISOString().slice(0, 10));
        return todaysSession?.id ?? null;
      });
      setWorkoutSessionsStatus('ready');
    } catch (error) {
      setWorkoutSessionsError(error.message || 'Failed to load workout sessions.');
      setWorkoutSessionsStatus('error');
    }
  }, [authUser]);

  useEffect(() => {
    loadWorkoutSessions();
  }, [loadWorkoutSessions]);

  const loadWorkoutTemplates = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setWorkoutTemplatesStatus('not-configured');
      return;
    }

    if (!authUser) {
      setWorkoutTemplates([]);
      setWorkoutTemplatesStatus('no-session');
      return;
    }

    setWorkoutTemplatesStatus('loading');
    setWorkoutTemplatesError('');
    try {
      const rows = await workoutTemplateApi.list();
      if (lastAuthUserId.current !== authUser.id) return;
      setWorkoutTemplates(sortWorkoutTemplates(rows ?? []));
      setWorkoutTemplatesStatus('ready');
    } catch (error) {
      setWorkoutTemplatesError(error.message || 'Failed to load workout templates.');
      setWorkoutTemplatesStatus('error');
    }
  }, [authUser]);

  useEffect(() => {
    loadWorkoutTemplates();
  }, [loadWorkoutTemplates]);

  const loadHealthLogs = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setHealthLogsStatus('not-configured');
      return;
    }

    if (!authUser) {
      setHealthLogs([]);
      setHealth(initialHealth);
      setHealthLogsStatus('no-session');
      return;
    }

    setHealthLogsStatus('loading');
    setHealthLogsError('');
    try {
      const rows = await healthLogApi.list();
      if (lastAuthUserId.current !== authUser.id) return;
      const sortedRows = sortHealthLogs(rows ?? []);
      setHealthLogs(sortedRows);
      setHealth(healthSnapshotFromLog(sortedRows.find((log) => log.logged_on === today()) ?? sortedRows[0]));
      setHealthLogsStatus('ready');
    } catch (error) {
      setHealthLogsError(error.message || 'Failed to load health logs.');
      setHealthLogsStatus('error');
    }
  }, [authUser]);

  useEffect(() => {
    loadHealthLogs();
  }, [loadHealthLogs]);

  const loadExpenses = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setExpensesStatus('not-configured');
      return;
    }

    if (!authUser) {
      setExpenses([]);
      setExpensesStatus('no-session');
      return;
    }

    setExpensesStatus('loading');
    setExpensesError('');
    try {
      const rows = await expenseApi.list();
      if (lastAuthUserId.current !== authUser.id) return;
      setExpenses(sortExpenses(rows ?? []));
      setExpensesStatus('ready');
    } catch (error) {
      setExpensesError(error.message || 'Failed to load expenses.');
      setExpensesStatus('error');
    }
  }, [authUser]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const loadExpenseMonth = useCallback(async (startDate, endDate) => {
    if (!isSupabaseConfigured) {
      setMonthlyExpensesStatus('not-configured');
      return [];
    }

    if (!authUser) {
      setMonthlyExpenses([]);
      setMonthlyExpensesStatus('no-session');
      return [];
    }

    setMonthlyExpensesStatus('loading');
    setMonthlyExpensesError('');
    try {
      const rows = await expenseApi.listByDateRange(startDate, endDate);
      if (lastAuthUserId.current !== authUser.id) return [];
      const sortedRows = sortExpenses(rows ?? []);
      setMonthlyExpenses(sortedRows);
      setMonthlyExpensesStatus('ready');
      return sortedRows;
    } catch (error) {
      setMonthlyExpensesError(error.message || 'Failed to load monthly expenses.');
      setMonthlyExpensesStatus('error');
      return [];
    }
  }, [authUser]);

  const loadExpenseRange = useCallback(async (startDate, endDate) => {
    if (!isSupabaseConfigured || !authUser) return [];
    return sortExpenses(await expenseApi.listByDateRange(startDate, endDate));
  }, [authUser]);

  const loadCalendarRange = useCallback(async (startDate, endDate) => {
    if (!isSupabaseConfigured) {
      setCalendarEventsStatus('not-configured');
      return [];
    }

    if (!authUser) {
      lastCalendarRangeRequest.current += 1;
      setCalendarEvents([]);
      setCalendarEventsStatus('no-session');
      return [];
    }

    const requestId = lastCalendarRangeRequest.current + 1;
    lastCalendarRangeRequest.current = requestId;
    setCalendarEventsStatus('loading');
    setCalendarEventsError('');
    try {
      const rows = await calendarEventApi.listByRange(startDate, endDate);
      if (lastAuthUserId.current !== authUser.id || lastCalendarRangeRequest.current !== requestId) return [];
      const sortedRows = sortCalendarEvents(rows ?? []);
      setCalendarEvents(sortedRows);
      setCalendarEventsStatus('ready');
      return sortedRows;
    } catch (error) {
      if (lastAuthUserId.current !== authUser.id || lastCalendarRangeRequest.current !== requestId) return [];
      setCalendarEventsError(calendarErrorMessage(error, 'Failed to load calendar events.'));
      setCalendarEventsStatus('error');
      return [];
    }
  }, [authUser]);

  const loadDailyReviews = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setDailyReviewsStatus('not-configured');
      return;
    }

    if (!authUser) {
      setDailyReviews([]);
      setDailyReviewsStatus('no-session');
      return;
    }

    setDailyReviewsStatus('loading');
    setDailyReviewsError('');
    try {
      const rows = await dailyReviewApi.list();
      if (lastAuthUserId.current !== authUser.id) return;
      setDailyReviews(sortDailyReviews(rows ?? []));
      setDailyReviewsStatus('ready');
    } catch (error) {
      setDailyReviewsError(error.message || 'Failed to load daily reviews.');
      setDailyReviewsStatus('error');
    }
  }, [authUser]);

  useEffect(() => {
    loadDailyReviews();
  }, [loadDailyReviews]);

  const activeWorkoutSession = useMemo(
    () => workoutSessions.find((session) => session.id === activeWorkoutId) ?? null,
    [activeWorkoutId, workoutSessions],
  );

  const workoutSets = useMemo(
    () => workoutSessions.flatMap((session) => session.workout_sets ?? []),
    [workoutSessions],
  );

  const workoutStatus = useMemo(() => {
    const workoutStart = toMinutes('15:00');
    const workoutEnd = toMinutes('16:10');
    if (mockNowMinutes < workoutStart) {
      return {
        mode: 'scheduled',
        label: 'Scheduled: Push Day',
        detail: '6 exercises | 15:00 launch',
        accent: 'text-cyan-400',
      };
    }
    if (mockNowMinutes <= workoutEnd) {
      return {
        mode: 'live',
        label: 'Live: Push Day',
        detail: 'Set 3 active | rest timer armed',
        accent: 'text-red-400',
      };
    }
    return {
      mode: 'complete',
      label: 'Completed: 45m Push Day',
      detail: '1 PR | 10,680kg volume',
      accent: 'text-emerald-400',
    };
  }, []);

  const timelineWindow = useMemo(() => {
    const first = toMinutes(agendaBlocks[0].start);
    const last = toMinutes(agendaBlocks[agendaBlocks.length - 1].end);
    return { first, last, nowPct: ((mockNowMinutes - first) / (last - first)) * 100 };
  }, []);

  const actions = useMemo(
    () => ({
      setActiveTab,
      setSelectedDay,
      setAiTriage,
      updateSleepHours: (value) => setHealth((prev) => ({ ...prev, sleepHours: Number(value) })),
      updateSleepQuality: (value) => setHealth((prev) => ({ ...prev, sleepQuality: Number(value) })),
      stepCoffee: (delta) =>
        setHealth((prev) => ({ ...prev, coffee: Math.max(0, Math.min(6, prev.coffee + delta)) })),
      stepWater: (delta) =>
        setHealth((prev) => ({ ...prev, water: Math.max(0, Math.min(8, prev.water + delta)) })),
      toggleHygiene: (id) =>
        setHealth((prev) => ({
          ...prev,
          hygiene: normalizeHygieneCounts(prev.hygiene).map((item) => (
            item.id === id && item.type === 'boolean'
              ? { ...item, done: !item.done }
              : item
          )),
        })),
      setExpandedWorkout,
      setActiveWorkoutId,
      signIn: async (credentials) => {
        setAuthError('');
        const data = await authApi.signInWithPassword(credentials);
        setAuthUser(data.session?.user ?? data.user ?? null);
        return data;
      },
      signUp: async (credentials) => {
        setAuthError('');
        const data = await authApi.signUp(credentials);
        setAuthUser(data.session?.user ?? null);
        return data;
      },
      signOut: async () => {
        await authApi.signOut();
        lastAuthUserId.current = null;
        setAuthUser(null);
        clearUserScopedState('no-session');
      },
      reloadWorkoutSessions: loadWorkoutSessions,
      createWorkoutSession: async (payload) => {
        if (!authUser) {
          throw new Error('Sign in before creating a workout session.');
        }
        const created = await workoutApi.create(payload);
        setWorkoutSessions((prev) => [created, ...prev]);
        setActiveWorkoutId(created.id);
        setWorkoutSessionsStatus('ready');
        return created;
      },
      updateWorkoutSession: async (id, patch) => {
        const updated = await workoutApi.update(id, patch);
        setWorkoutSessions((prev) => prev.map((session) => (session.id === id ? updated : session)));
        return updated;
      },
      endWorkoutSession: async (id) => {
        const updated = await workoutApi.update(id, { ended_at: new Date().toISOString() });
        setWorkoutSessions((prev) => prev.map((session) => (session.id === id ? updated : session)));
        return updated;
      },
      deleteWorkoutSession: async (id) => {
        await workoutApi.delete(id);
        const remaining = workoutSessions.filter((session) => session.id !== id);
        setWorkoutSessions(remaining);
        if (activeWorkoutId === id) {
          setActiveWorkoutId(remaining.find((session) => session.performed_on === today())?.id ?? null);
        }
      },
      createWorkoutSet: async (payload) => {
        if (!authUser) {
          throw new Error('Sign in before logging a set.');
        }
        setWorkoutSessionsError('');
        const created = await workoutSetApi.create(payload);
        setWorkoutSessions((prev) =>
          prev.map((session) =>
            session.id === created.workout_id
              ? {
                  ...session,
                  workout_sets: sortWorkoutSets([created, ...(session.workout_sets ?? [])]),
                }
              : session,
          ),
        );
        setWorkoutSessionsStatus('ready');
        return created;
      },
      updateWorkoutSet: async (id, patch) => {
        const updated = await workoutSetApi.update(id, patch);
        setWorkoutSessions((prev) =>
          prev.map((session) =>
            session.id === updated.workout_id
              ? {
                  ...session,
                  workout_sets: (session.workout_sets ?? [])
                    .map((set) => (set.id === id ? updated : set))
                    .sort(compareWorkoutSets),
                }
              : session,
          ),
        );
        return updated;
      },
      deleteWorkoutSet: async (id) => {
        await workoutSetApi.delete(id);
        setWorkoutSessions((prev) =>
          prev.map((session) => ({
            ...session,
            workout_sets: (session.workout_sets ?? []).filter((set) => set.id !== id),
          })),
        );
      },
      reloadWorkoutTemplates: loadWorkoutTemplates,
      createWorkoutTemplate: async (payload) => {
        if (!authUser) {
          throw new Error('Sign in before creating a workout template.');
        }
        setWorkoutTemplatesError('');
        const created = await workoutTemplateApi.create(normalizeWorkoutTemplatePayload(payload));
        setWorkoutTemplates((prev) => sortWorkoutTemplates([created, ...prev]));
        setWorkoutTemplatesStatus('ready');
        return created;
      },
      updateWorkoutTemplate: async (id, patch) => {
        if (!authUser) {
          throw new Error('Sign in before updating a workout template.');
        }
        setWorkoutTemplatesError('');
        const updated = await workoutTemplateApi.update(id, normalizeWorkoutTemplatePayload(patch));
        setWorkoutTemplates((prev) => sortWorkoutTemplates(prev.map((template) => (template.id === id ? updated : template))));
        setWorkoutTemplatesStatus('ready');
        return updated;
      },
      deleteWorkoutTemplate: async (id) => {
        if (!authUser) {
          throw new Error('Sign in before deleting a workout template.');
        }
        setWorkoutTemplatesError('');
        await workoutTemplateApi.delete(id);
        setWorkoutTemplates((prev) => prev.filter((template) => template.id !== id));
        setWorkoutTemplatesStatus('ready');
      },
      createWorkoutTemplateExercise: async (payload) => {
        if (!authUser) {
          throw new Error('Sign in before adding a template exercise.');
        }
        setWorkoutTemplatesError('');
        const created = await workoutTemplateExerciseApi.create({
          ...normalizeWorkoutTemplateExercisePayload(payload),
          template_id: payload.template_id,
        });
        setWorkoutTemplates((prev) => updateTemplateExercises(prev, created.template_id, (exercises) => sortWorkoutTemplateExercises([...exercises, created])));
        setWorkoutTemplatesStatus('ready');
        return created;
      },
      updateWorkoutTemplateExercise: async (id, patch) => {
        if (!authUser) {
          throw new Error('Sign in before updating a template exercise.');
        }
        setWorkoutTemplatesError('');
        const updated = await workoutTemplateExerciseApi.update(id, normalizeWorkoutTemplateExercisePayload(patch));
        setWorkoutTemplates((prev) =>
          updateTemplateExercises(prev, updated.template_id, (exercises) =>
            sortWorkoutTemplateExercises(exercises.map((exercise) => (exercise.id === id ? updated : exercise))),
          ),
        );
        setWorkoutTemplatesStatus('ready');
        return updated;
      },
      deleteWorkoutTemplateExercise: async (id) => {
        if (!authUser) {
          throw new Error('Sign in before deleting a template exercise.');
        }
        const template = workoutTemplates.find((item) => (item.workout_template_exercises ?? []).some((exercise) => exercise.id === id));
        setWorkoutTemplatesError('');
        await workoutTemplateExerciseApi.delete(id);
        if (template) {
          const remainingExercises = sortWorkoutTemplateExercises(
            (template.workout_template_exercises ?? []).filter((exercise) => exercise.id !== id),
          );
          const compactedRows = remainingExercises.length
            ? await workoutTemplateExerciseApi.reorder(
                remainingExercises.map((exercise, index) => ({ id: exercise.id, exercise_order: index + 1 })),
              )
            : [];
          const compactedById = new Map(compactedRows.map((exercise) => [exercise.id, exercise]));
          setWorkoutTemplates((prev) =>
            updateTemplateExercises(prev, template.id, (exercises) =>
              sortWorkoutTemplateExercises(
                exercises
                  .filter((exercise) => exercise.id !== id)
                  .map((exercise) => compactedById.get(exercise.id) ?? exercise),
              ),
            ),
          );
        }
        setWorkoutTemplatesStatus('ready');
      },
      reorderWorkoutTemplateExercise: async (templateId, exerciseId, direction) => {
        if (!authUser) {
          throw new Error('Sign in before reordering template exercises.');
        }
        const template = workoutTemplates.find((item) => item.id === templateId);
        const exercises = sortWorkoutTemplateExercises(template?.workout_template_exercises ?? []);
        const index = exercises.findIndex((exercise) => exercise.id === exerciseId);
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (!template || index < 0 || targetIndex < 0 || targetIndex >= exercises.length) return exercises[index] ?? null;

        const reordered = exercises.map((exercise) => ({ ...exercise }));
        const [moved] = reordered.splice(index, 1);
        reordered.splice(targetIndex, 0, moved);
        const updates = reordered.map((exercise, orderIndex) => ({ id: exercise.id, exercise_order: orderIndex + 1 }));

        setWorkoutTemplatesError('');
        const updatedRows = await workoutTemplateExerciseApi.reorder(updates);
        const updatedById = new Map(updatedRows.map((exercise) => [exercise.id, exercise]));
        setWorkoutTemplates((prev) =>
          updateTemplateExercises(prev, templateId, (current) =>
            sortWorkoutTemplateExercises(current.map((exercise) => updatedById.get(exercise.id) ?? exercise)),
          ),
        );
        setWorkoutTemplatesStatus('ready');
        return updatedRows;
      },
      reloadHealthLogs: loadHealthLogs,
      saveHealthLog: async (payload) => {
        if (!authUser) {
          throw new Error('Sign in before saving a health log.');
        }

        const normalizedPayload = normalizeHealthLogPayload(payload);
        const existing = healthLogs.find((log) => log.logged_on === normalizedPayload.logged_on)
          ?? await healthLogApi.getByDate(normalizedPayload.logged_on);
        let saved;

        try {
          saved = existing
            ? await healthLogApi.update(existing.id, normalizedPayload)
            : await healthLogApi.create(normalizedPayload);
        } catch (error) {
          if (!isDuplicateKeyError(error)) throw error;
          const duplicate = await healthLogApi.getByDate(normalizedPayload.logged_on);
          if (!duplicate) throw error;
          saved = await healthLogApi.update(duplicate.id, normalizedPayload);
        }

        setHealthLogs((prev) => sortHealthLogs([saved, ...prev.filter((log) => log.id !== saved.id)]));
        if (saved.logged_on === today()) {
          setHealth(healthSnapshotFromLog(saved));
        }
        setHealthLogsStatus('ready');
        return saved;
      },
      reloadExpenses: loadExpenses,
      loadExpenseMonth,
      loadExpenseRange,
      createExpense: async (payload) => {
        if (!authUser) {
          throw new Error('Sign in before creating an expense.');
        }
        setExpensesError('');
        const created = await expenseApi.create(normalizeExpensePayload(payload));
        setExpenses((prev) => sortExpenses([created, ...prev]));
        setExpensesStatus('ready');
        return created;
      },
      updateExpense: async (id, patch) => {
        setExpensesError('');
        const updated = await expenseApi.update(id, normalizeExpensePayload(patch));
        setExpenses((prev) => sortExpenses(prev.map((expense) => (expense.id === id ? updated : expense))));
        setExpensesStatus('ready');
        return updated;
      },
      deleteExpense: async (id) => {
        setExpensesError('');
        await expenseApi.delete(id);
        setExpenses((prev) => prev.filter((expense) => expense.id !== id));
        setExpensesStatus('ready');
      },
      loadCalendarRange,
      createCalendarEvent: async (payload) => {
        if (!authUser) {
          throw new Error('Sign in before creating a calendar event.');
        }
        const userId = authUser.id;
        setCalendarEventsError('');
        try {
          const created = await calendarEventApi.create(normalizeCalendarEventPayload(payload));
          if (lastAuthUserId.current !== userId) return created;
          setCalendarEvents((prev) => sortCalendarEvents([created, ...prev]));
          setCalendarEventsStatus('ready');
          return created;
        } catch (error) {
          const message = calendarErrorMessage(error, 'Failed to create calendar event.');
          setCalendarEventsError(message);
          throw new Error(message);
        }
      },
      updateCalendarEvent: async (id, patch) => {
        if (!authUser) {
          throw new Error('Sign in before updating a calendar event.');
        }
        const userId = authUser?.id;
        setCalendarEventsError('');
        try {
          const updated = await calendarEventApi.update(id, normalizeCalendarEventPayload(patch));
          if (lastAuthUserId.current !== userId) return updated;
          setCalendarEvents((prev) => sortCalendarEvents(prev.map((event) => (event.id === id ? updated : event))));
          setCalendarEventsStatus('ready');
          return updated;
        } catch (error) {
          const message = calendarErrorMessage(error, 'Failed to update calendar event.');
          setCalendarEventsError(message);
          throw new Error(message);
        }
      },
      deleteCalendarEvent: async (id) => {
        if (!authUser) {
          throw new Error('Sign in before deleting a calendar event.');
        }
        const userId = authUser?.id;
        setCalendarEventsError('');
        try {
          await calendarEventApi.delete(id);
          if (lastAuthUserId.current !== userId) return;
          setCalendarEvents((prev) => prev.filter((event) => event.id !== id));
          setCalendarEventsStatus('ready');
        } catch (error) {
          const message = calendarErrorMessage(error, 'Failed to delete calendar event.');
          setCalendarEventsError(message);
          throw new Error(message);
        }
      },
      reloadDailyReviews: loadDailyReviews,
      saveDailyReview: async (payload) => {
        if (!authUser) {
          throw new Error('Sign in before saving a daily review.');
        }

        const normalizedPayload = normalizeDailyReviewPayload(payload);
        const existing = dailyReviews.find((review) => review.review_on === normalizedPayload.review_on)
          ?? await dailyReviewApi.getByDate(normalizedPayload.review_on);
        let saved;

        try {
          saved = existing
            ? await dailyReviewApi.update(existing.id, normalizedPayload)
            : await dailyReviewApi.create(normalizedPayload);
        } catch (error) {
          if (!isDuplicateKeyError(error)) throw error;
          const duplicate = await dailyReviewApi.getByDate(normalizedPayload.review_on);
          if (!duplicate) throw error;
          saved = await dailyReviewApi.update(duplicate.id, normalizedPayload);
        }

        setDailyReviews((prev) => sortDailyReviews([saved, ...prev.filter((review) => review.id !== saved.id)]));
        setDailyReviewsStatus('ready');
        return saved;
      },
      addTransaction: ({ amount, category }) =>
        setFinance((prev) => {
          const numericAmount = Number(amount);
          if (!Number.isFinite(numericAmount) || numericAmount === 0) return prev;
          const entry = {
            id: Date.now(),
            date: 'May 11',
            vendor: 'Rapid Entry',
            category,
            amount: -Math.abs(numericAmount),
            signal: 'normal',
          };
          return {
            ...prev,
            balance: prev.balance + entry.amount,
            monthlySpend: prev.monthlySpend + Math.abs(entry.amount),
            entries: [entry, ...prev.entries],
          };
        }),
    }),
    [activeWorkoutId, authUser, clearUserScopedState, dailyReviews, healthLogs, loadCalendarRange, loadDailyReviews, loadExpenseMonth, loadExpenseRange, loadExpenses, loadHealthLogs, loadWorkoutSessions, loadWorkoutTemplates, workoutSessions, workoutTemplates],
  );

  const value = {
    activeTab,
    selectedDay,
    aiTriage,
    health,
    healthLogs,
    healthLogsError,
    healthLogsStatus,
    finance,
    expenses,
    expensesError,
    expensesStatus,
    monthlyExpenses,
    monthlyExpensesError,
    monthlyExpensesStatus,
    calendarEvents,
    calendarEventsError,
    calendarEventsStatus,
    dailyReviews,
    dailyReviewsError,
    dailyReviewsStatus,
    expandedWorkout,
    authError,
    authStatus,
    authUser,
    isSupabaseConfigured,
    agendaBlocks,
    calendarWeeks,
    currentDate,
    mockNowMinutes,
    selectedDayAgenda,
    tabs,
    timelineWindow,
    workout: workoutData,
    activeWorkoutId,
    activeWorkoutSession,
    workoutSets,
    workoutSessions,
    workoutSessionsError,
    workoutSessionsStatus,
    workoutTemplates,
    workoutTemplatesError,
    workoutTemplatesStatus,
    workoutSetsError: workoutSessionsError,
    workoutSetsStatus: workoutSessionsStatus,
    workoutStatus,
    ...actions,
  };

  return <LifeOSContext.Provider value={value}>{children}</LifeOSContext.Provider>;
}

function sortHealthLogs(rows = []) {
  return rows.slice().sort((a, b) => {
    if (a.logged_on !== b.logged_on) return new Date(b.logged_on) - new Date(a.logged_on);
    return new Date(b.updated_at ?? 0) - new Date(a.updated_at ?? 0);
  });
}

function sortExpenses(rows = []) {
  return rows.slice().sort((a, b) => {
    if (a.spent_on !== b.spent_on) return new Date(b.spent_on) - new Date(a.spent_on);
    return new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0);
  });
}

function sortCalendarEvents(rows = []) {
  return rows.slice().sort((a, b) => {
    if (a.event_date !== b.event_date) return new Date(a.event_date) - new Date(b.event_date);
    if ((a.start_time || '') !== (b.start_time || '')) return String(a.start_time || '').localeCompare(String(b.start_time || ''));
    return new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0);
  });
}

function sortDailyReviews(rows = []) {
  return rows.slice().sort((a, b) => {
    if (a.review_on !== b.review_on) return new Date(b.review_on) - new Date(a.review_on);
    return new Date(b.updated_at ?? 0) - new Date(a.updated_at ?? 0);
  });
}

function sortWorkoutSets(rows = []) {
  return rows.slice().sort(compareWorkoutSets);
}

function sortWorkoutTemplates(rows = []) {
  return rows
    .map((template) => ({
      ...template,
      workout_template_exercises: sortWorkoutTemplateExercises(template.workout_template_exercises ?? []),
    }))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
}

function sortWorkoutTemplateExercises(rows = []) {
  return rows.slice().sort((a, b) => {
    if (Number(a.exercise_order) !== Number(b.exercise_order)) return Number(a.exercise_order) - Number(b.exercise_order);
    return String(a.id).localeCompare(String(b.id));
  });
}

function updateTemplateExercises(templates, templateId, updater) {
  return sortWorkoutTemplates(
    templates.map((template) =>
      template.id === templateId
        ? {
            ...template,
            workout_template_exercises: updater(template.workout_template_exercises ?? []),
          }
        : template,
    ),
  );
}

function compareWorkoutSets(a, b) {
  const aTime = new Date(a.performed_at ?? a.created_at ?? 0).getTime();
  const bTime = new Date(b.performed_at ?? b.created_at ?? 0).getTime();
  if (aTime !== bTime) return aTime - bTime;
  if (Boolean(a.is_warmup) !== Boolean(b.is_warmup)) return Boolean(a.is_warmup) ? -1 : 1;
  if (Number(a.set_number) !== Number(b.set_number)) return Number(a.set_number) - Number(b.set_number);
  return String(a.id).localeCompare(String(b.id));
}

function normalizeHealthLogPayload(payload) {
  const normalized = {};
  if ('logged_on' in payload) normalized.logged_on = payload.logged_on;
  if ('sleep_hours' in payload) normalized.sleep_hours = numberOrNull(payload.sleep_hours);
  if ('sleep_start' in payload) normalized.sleep_start = payload.sleep_start || null;
  if ('wake_time' in payload) normalized.wake_time = payload.wake_time || null;
  if ('sleep_quality' in payload) normalized.sleep_quality = integerOrNull(payload.sleep_quality);
  if ('energy' in payload) normalized.energy = integerOrNull(payload.energy);
  if ('coffee' in payload) normalized.coffee = Math.max(0, integerOrZero(payload.coffee));
  if ('water' in payload) normalized.water = Math.max(0, integerOrZero(payload.water));
  if ('adc' in payload) normalized.adc = Math.max(0, integerOrZero(payload.adc));
  if ('mood' in payload) normalized.mood = integerOrNull(payload.mood);
  if ('social_time_minutes' in payload) normalized.social_time_minutes = Math.max(0, integerOrZero(payload.social_time_minutes));
  if ('main_time_waster' in payload) normalized.main_time_waster = payload.main_time_waster?.trim() || null;
  if ('notes' in payload) normalized.notes = payload.notes?.trim() || null;
  if ('hygiene' in payload) {
    normalized.hygiene = Array.isArray(payload.hygiene) ? normalizeHygieneCounts(payload.hygiene) : normalizeHygieneCounts(initialHealth.hygiene);
  }
  return normalized;
}

function normalizeExpensePayload(payload) {
  return {
    vendor: payload.vendor?.trim(),
    category: payload.category?.trim(),
    amount: numberOrNull(payload.amount),
    spent_on: payload.spent_on,
    notes: payload.notes?.trim() || null,
  };
}

function normalizeWorkoutTemplatePayload(payload) {
  const normalized = {};
  if ('name' in payload) normalized.name = payload.name?.trim();
  if ('notes' in payload) normalized.notes = payload.notes?.trim() || null;
  return normalized;
}

function normalizeWorkoutTemplateExercisePayload(payload) {
  const normalized = {};
  if ('exercise' in payload) normalized.exercise = payload.exercise?.trim();
  if ('exercise_order' in payload) normalized.exercise_order = Math.max(1, integerOrZero(payload.exercise_order));
  if ('notes' in payload) normalized.notes = payload.notes?.trim() || null;
  return normalized;
}

function normalizeCalendarEventPayload(payload) {
  const normalized = {};
  if ('title' in payload) normalized.title = payload.title?.trim();
  if ('event_date' in payload) normalized.event_date = payload.event_date;
  if ('start_time' in payload) normalized.start_time = payload.start_time || null;
  if ('end_time' in payload) normalized.end_time = payload.end_time || null;
  if ('category' in payload) normalized.category = payload.category?.trim() || null;
  if ('location' in payload) normalized.location = payload.location?.trim() || null;
  if ('notes' in payload) normalized.notes = payload.notes?.trim() || null;
  if (payload.status !== undefined) {
    normalized.status = ['planned', 'done', 'skipped', 'cancelled'].includes(payload.status) ? payload.status : 'planned';
  }
  return normalized;
}

function normalizeDailyReviewPayload(payload) {
  const score = payload.score === null || payload.score === undefined ? '' : String(payload.score).trim();
  return {
    review_on: payload.review_on,
    wins: payload.wins?.trim() || null,
    risks: payload.risks?.trim() || null,
    next_actions: Array.isArray(payload.next_actions)
      ? payload.next_actions.map((action) => String(action ?? '').trim()).filter(Boolean)
      : [],
    score: integerOrNull(score),
  };
}

function healthSnapshotFromLog(log) {
  if (!log) return initialHealth;
  return {
    ...initialHealth,
    sleepHours: Number(log.sleep_hours ?? initialHealth.sleepHours),
    sleepQuality: Number(log.sleep_quality ?? initialHealth.sleepQuality),
    coffee: Number(log.coffee ?? initialHealth.coffee),
    water: Number(log.water ?? initialHealth.water),
    adc: Number(log.adc ?? initialHealth.adc ?? 0),
    energy: Number(log.energy ?? initialHealth.energy ?? 0),
    mood: Number(log.mood ?? initialHealth.mood),
    hygiene: Array.isArray(log.hygiene) ? normalizeHygieneCounts(log.hygiene) : normalizeHygieneCounts(initialHealth.hygiene),
  };
}

function normalizeHygieneCounts(items = []) {
  const safeItems = Array.isArray(items) ? items : [];
  const byId = new Map(safeItems.map((item) => [item.id, item]));
  return HEALTH_HABITS.map((base) => {
    const item = byId.get(base.id) ?? base;
    if (base.type === 'boolean') {
      return {
        id: base.id,
        label: base.label,
        type: base.type,
        done: Boolean(item.done) || integerOrZero(item.count) > 0,
      };
    }
    return {
      id: base.id,
      label: base.label,
      type: base.type,
      count: Math.max(0, integerOrZero(item.count ?? (item.done ? 1 : 0))),
    };
  });
}

const HEALTH_HABITS = [
  { id: 'brush', label: 'Brush', type: 'count', count: 0 },
  { id: 'shower', label: 'Shower', type: 'count', count: 0 },
  { id: 'creatine', label: 'Creatine', type: 'count', count: 0 },
  { id: 'skin', label: 'Skin', type: 'count', count: 0 },
  { id: 'journal', label: 'Journal', type: 'boolean', done: false },
];

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function integerOrZero(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
}

function isDuplicateKeyError(error) {
  return error?.code === '23505' || String(error?.message ?? '').toLowerCase().includes('duplicate key');
}

function calendarErrorMessage(error, fallback) {
  const message = String(error?.message ?? '');
  const isMissingTable = error?.code === '42P01' || /calendar_events/i.test(message) && /does not exist|not found|schema cache/i.test(message);
  if (isMissingTable) {
    return 'Calendar events table is missing. Apply supabase/schema.sql to create public.calendar_events, then reload.';
  }
  return message || fallback;
}

export function useLifeOS() {
  const context = useContext(LifeOSContext);
  if (!context) {
    throw new Error('useLifeOS must be used inside LifeOSProvider');
  }
  return context;
}
