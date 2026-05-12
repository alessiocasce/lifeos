import { Area, AreaChart, ResponsiveContainer } from 'recharts';

export function Panel({ children, className = '' }) {
  return <section className={`terminal-card min-w-0 rounded-md ${className}`}>{children}</section>;
}

export function PanelHeader({ eyebrow, title, right }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/5 px-3 py-2">
      <div className="min-w-0">
        {eyebrow ? <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">{eyebrow}</p> : null}
        <h2 className="truncate text-sm font-semibold text-zinc-100">{title}</h2>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function Tag({ children, tone = 'zinc' }) {
  const tones = {
    cyan: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    red: 'border-red-400/20 bg-red-400/10 text-red-300',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
    violet: 'border-violet-400/20 bg-violet-400/10 text-violet-300',
    zinc: 'border-white/10 bg-white/[0.03] text-zinc-300',
  };
  return (
    <span className={`data-text inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function ProgressRing({ value, max, label, accent = '#22d3ee', size = 88 }) {
  const radius = 38;
  const stroke = 7;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / max, 1);
  const offset = circumference - pct * circumference;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="44" r={radius} stroke="#27272a" strokeWidth={stroke} fill="none" />
        <circle
          cx="44"
          cy="44"
          r={radius}
          stroke={accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 44 44)"
        />
      </svg>
      <div className="absolute text-center">
        <div className="data-text text-lg font-bold text-zinc-100">{value}/{max}</div>
        <div className="text-[10px] uppercase text-zinc-500">{label}</div>
      </div>
    </div>
  );
}

export function Sparkline({ data, color = '#22c55e' }) {
  const chartData = data.map((value, index) => ({ index, value }));
  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.16} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MiniMetric({ label, value, tone = 'text-zinc-100', sub }) {
  return (
    <div className="min-w-0 rounded-md border border-white/5 bg-black/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`data-text truncate text-xl font-bold ${tone}`}>{value}</p>
      {sub ? <p className="data-text truncate text-[10px] text-zinc-500">{sub}</p> : null}
    </div>
  );
}

export function PriorityDot({ priority }) {
  const color = priority === 'high' ? 'bg-red-400' : priority === 'medium' ? 'bg-amber-400' : 'bg-zinc-600';
  return <span className={`h-1.5 w-1.5 rounded-full ${color}`} />;
}
