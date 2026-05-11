import { ArrowDownLeft, ArrowUpRight, Banknote, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis } from 'recharts';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';

export function FinancesTab() {
  const { addTransaction, finance } = useLifeOS();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(finance.categories[0]);
  const spendPct = Math.min(100, Math.round((finance.monthlySpend / finance.monthlyBudget) * 100));
  const chartData = useMemo(() => finance.budgetSegments.map((segment) => ({ ...segment })), [finance.budgetSegments]);

  const submit = (event) => {
    event.preventDefault();
    addTransaction({ amount, category });
    setAmount('');
  };

  return (
    <div className="grid grid-cols-12 gap-3">
      <Panel className="col-span-12">
        <div className="grid gap-3 p-3 xl:grid-cols-[1fr_520px]">
          <div>
            <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">Current Bank Balance</p>
            <p className="data-text text-7xl font-black leading-none text-emerald-300">
              EUR {finance.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <form onSubmit={submit} className="grid grid-cols-[1fr_170px_48px] gap-2 self-end">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="Amount"
              className="data-text rounded-md border border-white/10 bg-black px-3 py-3 text-lg text-zinc-100 outline-none focus:border-cyan-400/40"
            />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-md border border-white/10 bg-black px-3 py-3 text-sm text-zinc-100 outline-none focus:border-cyan-400/40"
            >
              {finance.categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button type="submit" className="grid place-items-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
              <Send size={18} />
            </button>
          </form>
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-8">
        <PanelHeader eyebrow="Budget Burn" title="Monthly Spend Against Limit" right={<span className="data-text text-sm text-amber-300">{spendPct}%</span>} />
        <div className="p-3">
          <div className="mb-3 h-10 overflow-hidden rounded-md border border-white/5 bg-black">
            <div className="flex h-full" style={{ width: `${spendPct}%` }}>
              {finance.budgetSegments.map((segment) => (
                <div
                  key={segment.name}
                  className="h-full border-r border-black/40"
                  style={{
                    width: `${(segment.value / finance.monthlySpend) * 100}%`,
                    backgroundColor: segment.color,
                  }}
                  title={`${segment.name}: ${segment.value}`}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            {finance.budgetSegments.map((segment) => (
              <div key={segment.name} className="rounded border border-white/5 bg-black/25 p-2">
                <div className="mb-1 h-1.5 rounded" style={{ backgroundColor: segment.color }} />
                <p className="text-xs text-zinc-300">{segment.name}</p>
                <p className="data-text text-[11px] text-zinc-500">EUR {segment.value.toFixed(0)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-4">
        <PanelHeader eyebrow="Ledger" title="Recent Transactions" right={<Banknote size={16} className="text-emerald-300" />} />
        <div className="divide-y divide-white/5">
          {finance.entries.map((entry) => (
            <div key={entry.id} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 px-3 py-3">
              <div className={`grid h-6 w-6 place-items-center rounded border ${entry.amount > 0 ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-red-400/20 bg-red-400/10 text-red-300'}`}>
                {entry.amount > 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-100">{entry.vendor}</p>
                <p className="data-text text-[10px] text-zinc-500">{entry.date} / {entry.category}</p>
              </div>
              <span className={`data-text text-sm font-bold ${entry.amount > 0 ? 'text-emerald-300' : 'text-zinc-200'}`}>
                {entry.amount > 0 ? '+' : '-'}EUR {Math.abs(entry.amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="col-span-12">
        <PanelHeader eyebrow="Controls" title="Ledger Telemetry" />
        <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4">
          <MiniMetric label="Budget Limit" value={`EUR ${finance.monthlyBudget}`} tone="text-zinc-100" sub="monthly" />
          <MiniMetric label="Spend Left" value={`EUR ${(finance.monthlyBudget - finance.monthlySpend).toFixed(0)}`} tone="text-emerald-300" sub="remaining" />
          <MiniMetric label="Daily Cap" value="EUR 52" tone="text-cyan-300" sub="to month close" />
          <div className="rounded-md border border-white/5 bg-black/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Signal</p>
            <div className="mt-2 flex gap-1">
              <Tag tone="emerald">cashflow ok</Tag>
              <Tag tone="amber">software high</Tag>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
