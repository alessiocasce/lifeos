import { createContext, useContext, useMemo, useState } from 'react';
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
    [],
  );

  const value = {
    activeTab,
    selectedDay,
    aiTriage,
    health,
    finance,
    expandedWorkout,
    chatMessages,
    agendaBlocks,
    calendarWeeks,
    currentDate,
    mockNowMinutes,
    selectedDayAgenda,
    tabs,
    timelineWindow,
    workout: workoutData,
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
