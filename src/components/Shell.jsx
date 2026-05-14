import {
  BrainCircuit,
  CalendarDays,
  Dumbbell,
  HeartPulse,
  Home,
  Landmark,
  LogOut,
} from 'lucide-react';
import { useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { LifeOSLogo } from './LifeOSLogo';

const icons = {
  home: Home,
  calendar: CalendarDays,
  health: HeartPulse,
  workout: Dumbbell,
  finances: Landmark,
  assistant: BrainCircuit,
};

export function Shell({ children }) {
  const {
    activeTab,
    activeWorkoutSession,
    authUser,
    expenses,
    healthLogs,
    setActiveTab,
    signOut,
    tabs,
    workoutSessions,
  } = useLifeOS();
  const [signingOut, setSigningOut] = useState(false);
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? 'Pulse';
  const today = new Date().toISOString().slice(0, 10);
  const todaysHealthLog = healthLogs.find((log) => log.logged_on === today) ?? null;
  const currentMonthSpend = expenses.filter(isCurrentMonthExpense).reduce((total, expense) => total + Math.abs(Number(expense.amount) || 0), 0);
  const todaysSessions = workoutSessions.filter((session) => session.performed_on === today);
  const liveWorkout = todaysSessions.find((session) => !session.ended_at) ?? null;
  const trainingStatus = liveWorkout || (activeWorkoutSession?.performed_on === today && !activeWorkoutSession.ended_at)
    ? { value: 'LIVE', tone: 'text-red-300' }
    : todaysSessions.some((session) => session.ended_at)
      ? { value: 'DONE', tone: 'text-emerald-300' }
      : { value: 'NONE', tone: 'text-zinc-400' };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0a0a0a] text-zinc-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[76px] flex-col border-r border-white/5 bg-black md:flex">
        <div className="grid h-[72px] place-items-center border-b border-white/5">
          <div className="grid h-10 w-10 place-items-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 shadow-glow">
            <LifeOSLogo size={24} />
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 py-3">
          {tabs.map((tab) => {
            const Icon = icons[tab.id];
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                title={tab.label}
                onClick={() => setActiveTab(tab.id)}
                className={`group flex h-12 flex-col items-center justify-center rounded-md border text-[9px] transition ${
                  active
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300'
                    : 'border-transparent text-zinc-500 hover:border-white/10 hover:bg-white/[0.03] hover:text-zinc-200'
                }`}
              >
                <Icon size={18} />
                <span className="mt-1 font-mono uppercase leading-none">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-white/5 px-2 py-3">
          <StatusPip label="H2O" value={todaysHealthLog ? `${todaysHealthLog.water ?? 0}/8` : '--'} tone="text-cyan-300" />
          <StatusPip label="EXP" value={`EUR ${Math.round(currentMonthSpend)}`} tone="text-emerald-300" />
        </div>
      </aside>

      <main className="min-h-screen min-w-0 w-full md:ml-[76px] md:w-[calc(100%-76px)]">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/5 bg-[#0a0a0a]/95 px-3 backdrop-blur md:h-[72px] md:px-5">
          <div>
            <div className="flex items-center gap-2">
              <LifeOSLogo size={22} />
              <h1 className="text-lg font-semibold tracking-wide">LifeOS</h1>
              <span className="data-text rounded border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] text-cyan-300 md:hidden">
                {activeTabLabel}
              </span>
              <span className="data-text hidden rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500 md:inline-flex">
                MIDNIGHT OPS
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden grid-cols-4 gap-2 text-right md:grid">
              <HeaderMetric label="Energy" value={formatMetric(todaysHealthLog?.energy, '/10')} tone="text-emerald-300" />
              <HeaderMetric label="Sleep" value={formatMetric(todaysHealthLog?.sleep_hours, 'h')} tone="text-cyan-300" />
              <HeaderMetric label="Spend" value={`EUR ${Math.round(currentMonthSpend)}`} tone="text-amber-300" />
              <HeaderMetric label="Training" value={trainingStatus.value} tone={trainingStatus.tone} />
            </div>
            <button
              type="button"
              title={authUser?.email ? `Sign out ${authUser.email}` : 'Sign out'}
              onClick={handleSignOut}
              disabled={signingOut}
              className="grid h-10 w-10 place-items-center rounded-md border border-white/10 bg-[#121212] text-zinc-400 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300 disabled:cursor-not-allowed disabled:text-zinc-700 md:h-11 md:w-11"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <div className="p-2 pb-[calc(env(safe-area-inset-bottom)+80px)] md:p-4 md:pb-4">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid h-16 grid-cols-6">
          {tabs.map((tab) => {
            const Icon = icons[tab.id];
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 border-t text-[9px] transition ${
                  active
                    ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300'
                    : 'border-transparent text-zinc-500'
                }`}
              >
                <Icon size={18} />
                <span className="w-full truncate px-0.5 text-center font-mono uppercase leading-none">{mobileLabel(tab.id, tab.label)}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function isCurrentMonthExpense(expense) {
  const spentOn = new Date(`${expense.spent_on}T00:00:00`);
  const now = new Date();
  return spentOn.getFullYear() === now.getFullYear() && spentOn.getMonth() === now.getMonth();
}

function formatMetric(value, suffix) {
  if (value === null || value === undefined || value === '') return '--';
  return `${value}${suffix}`;
}

function mobileLabel(id, label) {
  if (id === 'assistant') return 'AI';
  if (id === 'finances') return 'Money';
  return label;
}

function HeaderMetric({ label, value, tone }) {
  return (
    <div className="min-w-24 rounded-md border border-white/5 bg-[#121212] px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`data-text text-sm font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function StatusPip({ label, value, tone }) {
  return (
    <div className="rounded border border-white/5 bg-[#121212] px-1.5 py-1 text-center">
      <p className="data-text text-[9px] text-zinc-600">{label}</p>
      <p className={`data-text text-[11px] font-bold ${tone}`}>{value}</p>
    </div>
  );
}
