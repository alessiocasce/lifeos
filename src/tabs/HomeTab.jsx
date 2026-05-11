import { ArrowUpRight, Coffee, Droplets, Moon, Target, TimerReset, Trophy } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, PriorityDot, ProgressRing, Tag } from '../components/ui';

const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const typeTone = {
  health: 'emerald',
  academic: 'violet',
  'deep-work': 'cyan',
  admin: 'zinc',
  workout: 'red',
  finance: 'amber',
  review: 'cyan',
};

export function HomeTab() {
  const { agendaBlocks, health, mockNowMinutes, timelineWindow, workoutStatus, finance } = useLifeOS();
  const focusScore = 86;
  const spendRatio = Math.round((finance.monthlySpend / finance.monthlyBudget) * 100);

  return (
    <div className="grid grid-cols-12 gap-3">
      <Panel className="col-span-12 overflow-hidden">
        <PanelHeader
          eyebrow="Daily Pulse"
          title="Timeblock Radar"
          right={<span className="data-text text-xs text-red-400">LIVE 13:42</span>}
        />
        <div className="thin-scrollbar relative overflow-x-auto px-3 py-3">
          <div className="relative min-w-[1080px]">
            <div className="absolute top-0 h-full w-px bg-red-500 shadow-ember" style={{ left: `${timelineWindow.nowPct}%` }}>
              <div className="-ml-8 -mt-1 w-16 rounded border border-red-400/30 bg-red-400/10 py-0.5 text-center data-text text-[10px] text-red-300">
                NOW
              </div>
            </div>
            <div className="grid h-28 grid-cols-9 gap-2">
              {agendaBlocks.map((block) => {
                const active = mockNowMinutes >= toMinutes(block.start) && mockNowMinutes <= toMinutes(block.end);
                return (
                  <div
                    key={`${block.start}-${block.title}`}
                    className={`relative flex min-w-32 flex-col justify-between rounded-md border p-2 ${
                      active ? 'border-red-400/40 bg-red-400/10' : 'border-white/5 bg-black/25'
                    }`}
                  >
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="data-text text-[10px] text-zinc-500">{block.start}-{block.end}</span>
                        <PriorityDot priority={block.priority} />
                      </div>
                      <p className="text-xs font-medium leading-tight text-zinc-100">{block.title}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {block.tags.map((tag) => (
                        <Tag key={tag} tone={typeTone[block.type]}>
                          {tag}
                        </Tag>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 lg:col-span-4">
        <PanelHeader eyebrow="Health Snapshot" title="Baseline Targets" />
        <div className="grid grid-cols-[96px_1fr] gap-3 p-3">
          <ProgressRing value={health.water} max={8} label="Water" accent="#22d3ee" />
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs text-zinc-400">
                <Coffee size={14} className="text-amber-300" />
                Coffee Load
              </div>
              <div className="grid grid-cols-6 gap-1">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className={`h-6 rounded-sm border ${
                      index < health.coffee
                        ? index >= 4
                          ? 'border-red-400/40 bg-red-400'
                          : 'border-amber-300/40 bg-amber-300'
                        : 'border-white/5 bg-zinc-900'
                    }`}
                  />
                ))}
              </div>
              <p className="data-text mt-1 text-[10px] text-zinc-500">yellow at 2 / red at 4</p>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                <span>Mood Signal</span>
                <span className="data-text text-emerald-300">{health.mood}/10</span>
              </div>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div
                    key={index}
                    className={`h-3 rounded-sm ${index < health.mood ? 'bg-emerald-400' : 'bg-zinc-900'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 lg:col-span-4">
        <PanelHeader eyebrow="Training" title="Workout Recap" right={<Trophy size={16} className="text-amber-300" />} />
        <div className="p-3">
          <div className="rounded-md border border-white/5 bg-black/30 p-3">
            <p className={`data-text text-2xl font-black uppercase ${workoutStatus.accent}`}>{workoutStatus.label}</p>
            <p className="mt-1 text-sm text-zinc-400">{workoutStatus.detail}</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniMetric label="Readiness" value="91" tone="text-emerald-300" sub="HRV +8%" />
              <MiniMetric label="Volume" value="10.7k" tone="text-cyan-300" sub="projected kg" />
              <MiniMetric label="PR Odds" value="64%" tone="text-amber-300" sub="dips" />
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 lg:col-span-4">
        <PanelHeader eyebrow="Operations" title="Command Metrics" />
        <div className="grid grid-cols-2 gap-2 p-3">
          <MiniMetric label="Focus Score" value={focusScore} tone="text-cyan-300" sub="deep work protected" />
          <MiniMetric label="Budget Burn" value={`${spendRatio}%`} tone="text-amber-300" sub="May pacing" />
          <MiniMetric label="Sleep Quality" value={`${health.sleepQuality}%`} tone="text-cyan-300" sub={`${health.sleepHours}h logged`} />
          <MiniMetric label="Inbox" value="12" tone="text-zinc-100" sub="3 urgent" />
        </div>
      </Panel>

      <Panel className="col-span-12 lg:col-span-7">
        <PanelHeader eyebrow="Energy Allocation" title="Today By System" />
        <div className="grid grid-cols-[220px_1fr] gap-3 p-3">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Deep Work', value: 225, color: '#22d3ee' },
                    { name: 'Academic', value: 165, color: '#8b5cf6' },
                    { name: 'Health', value: 100, color: '#10b981' },
                    { name: 'Finance', value: 90, color: '#f59e0b' },
                    { name: 'Ops', value: 25, color: '#71717a' },
                  ]}
                  innerRadius={54}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {['#22d3ee', '#8b5cf6', '#10b981', '#f59e0b', '#71717a'].map((color) => (
                    <Cell key={color} fill={color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid content-center gap-2">
            {[
              ['Deep Work', '3h 45m', 'text-cyan-300'],
              ['Academic', '2h 45m', 'text-violet-300'],
              ['Health', '1h 40m', 'text-emerald-300'],
              ['Finance', '1h 30m', 'text-amber-300'],
            ].map(([label, value, tone]) => (
              <div key={label} className="flex items-center justify-between border-b border-white/5 py-2">
                <span className="text-sm text-zinc-300">{label}</span>
                <span className={`data-text text-sm font-bold ${tone}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 lg:col-span-5">
        <PanelHeader eyebrow="Next Best Actions" title="AI Priority Queue" />
        <div className="space-y-2 p-3">
          {[
            ['Hydrate before training', 'Add 500ml by 14:30', Droplets, 'text-cyan-300'],
            ['Protect recovery buffer', 'Move ledger to after dinner if lecture overruns', TimerReset, 'text-emerald-300'],
            ['Evening sleep lock', 'No caffeine after 15:00', Moon, 'text-violet-300'],
          ].map(([title, body, Icon, tone]) => (
            <div key={title} className="flex gap-3 rounded-md border border-white/5 bg-black/25 p-3">
              <Icon size={18} className={tone} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100">{title}</p>
                <p className="text-xs text-zinc-500">{body}</p>
              </div>
              <ArrowUpRight size={15} className="text-zinc-600" />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
