import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  agendaBlocks,
  assistantMessages,
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
import { authApi, expenseApi, healthLogApi, workoutApi, workoutSetApi } from '../services/lifeosApi';

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
  const [chatMessages, setChatMessages] = useState(assistantMessages);
  const [authUser, setAuthUser] = useState(null);
  const [authStatus, setAuthStatus] = useState(isSupabaseConfigured ? 'loading' : 'not-configured');
  const [authError, setAuthError] = useState('');
  const [workoutSessions, setWorkoutSessions] = useState([]);
  const [activeWorkoutId, setActiveWorkoutId] = useState(null);
  const [workoutSessionsStatus, setWorkoutSessionsStatus] = useState(isSupabaseConfigured ? 'idle' : 'not-configured');
  const [workoutSessionsError, setWorkoutSessionsError] = useState('');
  const [healthLogs, setHealthLogs] = useState([]);
  const [healthLogsStatus, setHealthLogsStatus] = useState(isSupabaseConfigured ? 'idle' : 'not-configured');
  const [healthLogsError, setHealthLogsError] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [expensesStatus, setExpensesStatus] = useState(isSupabaseConfigured ? 'idle' : 'not-configured');
  const [expensesError, setExpensesError] = useState('');

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
        setAuthUser(session?.user ?? null);
        setAuthStatus('ready');
      })
      .catch((error) => {
        if (!active) return;
        setAuthError(error.message || 'Failed to load Supabase session.');
        setAuthStatus('error');
      });

    const subscription = authApi.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      setAuthStatus('ready');
      setAuthError('');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

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
      setWorkoutSessions(rows ?? []);
      setActiveWorkoutId((currentId) => {
        if (currentId && rows.some((session) => session.id === currentId)) return currentId;
        const todaysSession = rows.find((session) => session.performed_on === new Date().toISOString().slice(0, 10));
        return todaysSession?.id ?? rows[0]?.id ?? null;
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
          hygiene: prev.hygiene.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
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
        setAuthUser(null);
        setWorkoutSessions([]);
        setActiveWorkoutId(null);
        setHealthLogs([]);
        setHealth(initialHealth);
        setExpenses([]);
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
          setActiveWorkoutId(remaining[0]?.id ?? null);
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
                  workout_sets: [created, ...(session.workout_sets ?? [])].sort(
                    (a, b) => Number(a.set_number) - Number(b.set_number),
                  ),
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
                    .sort((a, b) => Number(a.set_number) - Number(b.set_number)),
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
      acceptWidget: (id) =>
        setChatMessages((prev) =>
          prev.map((message) =>
            message.widgets
              ? {
                  ...message,
                  widgets: message.widgets.map((widget) =>
                    widget.id === id ? { ...widget, accepted: true } : widget,
                  ),
                }
              : message,
          ),
        ),
      rejectWidget: (id) =>
        setChatMessages((prev) =>
          prev.map((message) =>
            message.widgets
              ? {
                  ...message,
                  widgets: message.widgets.map((widget) =>
                    widget.id === id ? { ...widget, rejected: true } : widget,
                  ),
                }
              : message,
          ),
        ),
    }),
    [activeWorkoutId, authUser, healthLogs, loadExpenses, loadHealthLogs, loadWorkoutSessions, workoutSessions],
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
    expandedWorkout,
    chatMessages,
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

function normalizeHealthLogPayload(payload) {
  return {
    logged_on: payload.logged_on,
    sleep_hours: numberOrNull(payload.sleep_hours),
    sleep_start: payload.sleep_start || null,
    wake_time: payload.wake_time || null,
    sleep_quality: integerOrNull(payload.sleep_quality),
    energy: integerOrNull(payload.energy),
    coffee: Math.max(0, integerOrZero(payload.coffee)),
    water: Math.max(0, integerOrZero(payload.water)),
    mood: integerOrNull(payload.mood),
    social_time_minutes: Math.max(0, integerOrZero(payload.social_time_minutes)),
    main_time_waster: payload.main_time_waster?.trim() || null,
    notes: payload.notes?.trim() || null,
    hygiene: Array.isArray(payload.hygiene) ? payload.hygiene : initialHealth.hygiene,
  };
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

function healthSnapshotFromLog(log) {
  if (!log) return initialHealth;
  return {
    ...initialHealth,
    sleepHours: Number(log.sleep_hours ?? initialHealth.sleepHours),
    sleepQuality: Number(log.sleep_quality ?? initialHealth.sleepQuality),
    coffee: Number(log.coffee ?? initialHealth.coffee),
    water: Number(log.water ?? initialHealth.water),
    mood: Number(log.mood ?? initialHealth.mood),
    hygiene: Array.isArray(log.hygiene) ? log.hygiene : initialHealth.hygiene,
  };
}

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

export function useLifeOS() {
  const context = useContext(LifeOSContext);
  if (!context) {
    throw new Error('useLifeOS must be used inside LifeOSProvider');
  }
  return context;
}
