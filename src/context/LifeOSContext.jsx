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
import { authApi, workoutApi, workoutSetApi } from '../services/lifeosApi';

const LifeOSContext = createContext(null);

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
    [activeWorkoutId, authUser, loadWorkoutSessions, workoutSessions],
  );

  const value = {
    activeTab,
    selectedDay,
    aiTriage,
    health,
    finance,
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

export function useLifeOS() {
  const context = useContext(LifeOSContext);
  if (!context) {
    throw new Error('useLifeOS must be used inside LifeOSProvider');
  }
  return context;
}
