import {
  Activity,
  BrainCircuit,
  CalendarDays,
  Dumbbell,
  HeartPulse,
  Home,
  Landmark,
  RadioTower,
} from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';

const icons = {
  home: Home,
  calendar: CalendarDays,
  health: HeartPulse,
  workout: Dumbbell,
  finances: Landmark,
  assistant: BrainCircuit,
};

export function Shell({ children }) {
  const { activeTab, setActiveTab, tabs, health, finance, workoutStatus, currentDate } = useLifeOS();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[76px] flex-col border-r border-white/5 bg-black">
        <div className="grid h-[72px] place-items-center border-b border-white/5">
          <div className="grid h-10 w-10 place-items-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 shadow-glow">
            <RadioTower size={20} />
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
          <StatusPip label="H2O" value={`${health.water}/8`} tone="text-cyan-300" />
          <StatusPip label="BAL" value={`EUR ${Math.round(finance.balance / 1000)}k`} tone="text-emerald-300" />
        </div>
      </aside>

      <main className="ml-[76px] min-h-screen">
        <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-white/5 bg-[#0a0a0a]/95 px-5 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-cyan-400" />
              <h1 className="text-lg font-semibold tracking-wide">LifeOS</h1>
              <span className="data-text rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500">
                MIDNIGHT OPS
              </span>
            </div>
            <p className="data-text mt-1 text-[11px] text-zinc-500">{currentDate} / 13:42 LOCAL / LATENCY 18ms</p>
          </div>

          <div className="grid grid-cols-4 gap-2 text-right">
            <HeaderMetric label="Mood" value={`${health.mood}/10`} tone="text-emerald-300" />
            <HeaderMetric label="Sleep" value={`${health.sleepQuality}%`} tone="text-cyan-300" />
            <HeaderMetric label="Spend" value={`EUR ${Math.round(finance.monthlySpend)}`} tone="text-amber-300" />
            <HeaderMetric label="Training" value={workoutStatus.mode.toUpperCase()} tone={workoutStatus.accent} />
          </div>
        </header>

        <div className="p-4">{children}</div>
      </main>
    </div>
  );
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
