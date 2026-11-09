export function Panel({ children, className = '' }) {
  return <section className={`terminal-card min-w-0 ${className}`}>{children}</section>;
}

export function PanelHeader({ eyebrow, title, right }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 px-3 py-4">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-[11px] text-zinc-400">{eyebrow}</p> : null}
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
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

export function MiniMetric({ label, value, tone = 'text-zinc-100', sub }) {
  return (
    <div className="min-w-0 rounded-md border border-white/5 bg-black/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`data-text truncate text-xl font-bold ${tone}`}>{value}</p>
      {sub ? <p className="data-text truncate text-[10px] text-zinc-500">{sub}</p> : null}
    </div>
  );
}
