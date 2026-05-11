import { Minus, Plus, ShieldCheck } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader } from '../components/ui';

export function HealthTab() {
  const { health, stepCoffee, stepWater, toggleHygiene, updateSleepHours, updateSleepQuality } = useLifeOS();

  return (
    <div className="grid grid-cols-12 gap-3">
      <Panel className="col-span-12 xl:col-span-7">
        <PanelHeader eyebrow="Manual Tracking" title="Frictionless Entry" />
        <div className="grid gap-3 p-3">
          <SliderControl
            label="Sleep Hours"
            value={health.sleepHours}
            min={4}
            max={10}
            step={0.25}
            suffix="h"
            tone="text-cyan-300"
            onChange={updateSleepHours}
          />
          <SliderControl
            label="Sleep Quality"
            value={health.sleepQuality}
            min={0}
            max={100}
            step={1}
            suffix="%"
            tone="text-emerald-300"
            onChange={updateSleepQuality}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Stepper label="Coffee" value={health.coffee} max={6} onStep={stepCoffee} dangerAt={4} />
            <Stepper label="Water" value={health.water} max={8} onStep={stepWater} cyan />
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-5">
        <PanelHeader eyebrow="Daily Hygiene" title="Toggle Checklist" right={<ShieldCheck size={16} className="text-emerald-300" />} />
        <div className="grid gap-2 p-3">
          {health.hygiene.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleHygiene(item.id)}
              className="flex items-center justify-between rounded-md border border-white/5 bg-black/25 px-3 py-3 text-left"
            >
              <span className="text-sm font-medium text-zinc-100">{item.label}</span>
              <span
                className={`relative h-6 w-11 rounded-full border transition ${
                  item.done ? 'border-emerald-400/40 bg-emerald-400/20' : 'border-white/10 bg-zinc-900'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition ${
                    item.done ? 'left-5 bg-emerald-300' : 'left-0.5 bg-zinc-600'
                  }`}
                />
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-8">
        <PanelHeader eyebrow="Consistency Tracker" title="30-Day Baseline Heatmap" />
        <div className="p-3">
          <div className="grid grid-cols-10 gap-1">
            {health.consistency.map((score, index) => (
              <div
                key={index}
                title={`Day ${index + 1}: ${Math.round(score * 100)}%`}
                className={`aspect-square rounded-sm border border-white/5 ${
                  score > 0.92
                    ? 'bg-emerald-300'
                    : score > 0.8
                      ? 'bg-emerald-500'
                      : score > 0.65
                        ? 'bg-emerald-700'
                        : score > 0.5
                          ? 'bg-emerald-900'
                          : 'bg-zinc-900'
                }`}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="data-text text-[11px] text-zinc-500">baseline = sleep 7h / water 6 / hygiene 4+</p>
            <p className="data-text text-sm text-emerald-300">23/30 HIT</p>
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-4">
        <PanelHeader eyebrow="Readiness" title="Signal Stack" />
        <div className="grid grid-cols-2 gap-2 p-3">
          <MiniMetric label="Recovery" value="88" tone="text-cyan-300" sub="up 6 pts" />
          <MiniMetric label="Stress" value="31" tone="text-emerald-300" sub="low" />
          <MiniMetric label="Caffeine" value={health.coffee} tone={health.coffee >= 4 ? 'text-red-300' : 'text-amber-300'} sub="cups" />
          <MiniMetric label="Mood" value={health.mood} tone="text-emerald-300" sub="stable" />
        </div>
      </Panel>
    </div>
  );
}

function SliderControl({ label, value, min, max, step, suffix, tone, onChange }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/25 p-4">
      <div className="mb-3 flex items-end justify-between">
        <span className="text-sm font-medium text-zinc-200">{label}</span>
        <span className={`data-text text-4xl font-black ${tone}`}>
          {value}
          <span className="text-xl">{suffix}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-2 w-full accent-cyan-400"
      />
      <div className="mt-2 flex justify-between data-text text-[10px] text-zinc-600">
        <span>{min}{suffix}</span>
        <span>{max}{suffix}</span>
      </div>
    </div>
  );
}

function Stepper({ label, value, max, onStep, dangerAt, cyan = false }) {
  const tone = dangerAt && value >= dangerAt ? 'text-red-300' : cyan ? 'text-cyan-300' : 'text-amber-300';
  return (
    <div className="rounded-md border border-white/5 bg-black/25 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-200">{label}</p>
          <p className="data-text text-[10px] text-zinc-600">target max {max}</p>
        </div>
        <span className={`data-text text-5xl font-black ${tone}`}>{value}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onStep(-1)} className="grid h-14 place-items-center rounded-md border border-white/10 bg-zinc-950 text-zinc-300">
          <Minus size={20} />
        </button>
        <button type="button" onClick={() => onStep(1)} className="grid h-14 place-items-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}
