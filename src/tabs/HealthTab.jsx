import { Ban, Coffee, Loader2, Minus, Moon, Plus, Save, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';
import { localDate } from '../utils/date';

const today = localDate();

const defaultHabits = [
  { id: 'shower', label: 'Shower', type: 'count', count: 0 },
  { id: 'creatine', label: 'Creatine', type: 'count', count: 0 },
  { id: 'skin', label: 'Skin', type: 'count', count: 0 },
  { id: 'journal', label: 'Journal', type: 'boolean', done: false },
];

const emptyForm = {
  logged_on: today,
  sleep_hours: '',
  sleep_start: '',
  wake_time: '',
  coffee: '0',
  adc: '0',
  notes: '',
  hygiene: defaultHabits,
};

export function HealthTab() {
  const { healthLogs, healthLogsError, healthLogsStatus, saveHealthLog } = useLifeOS();
  const sortedLogs = useMemo(() => sortLogs(healthLogs), [healthLogs]);
  const todaysLog = sortedLogs.find((log) => log.logged_on === today) ?? null;
  const visibleLogs = useMemo(() => {
    const todayFirst = todaysLog ? [todaysLog, ...sortedLogs.filter((log) => log.id !== todaysLog.id)] : sortedLogs;
    return todayFirst.slice(0, 7);
  }, [sortedLogs, todaysLog]);
  const summary = useMemo(() => summarizeLogs(visibleLogs), [visibleLogs]);
  const historyInitialLoading = healthLogsStatus === 'loading' && visibleLogs.length === 0;
  const historyResolved = ['ready', 'error', 'not-configured', 'no-session'].includes(healthLogsStatus);

  const [form, setForm] = useState(() => formFromLog(todaysLog));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const selectedLog = useMemo(
    () => sortedLogs.find((log) => log.logged_on === form.logged_on) ?? null,
    [form.logged_on, sortedLogs],
  );
  const selectedIsToday = form.logged_on === today;
  const panelTitle = `${selectedLog ? 'Update' : 'Create'} ${selectedIsToday ? 'Today' : 'Selected Date'}`;

  useEffect(() => {
    setForm((prev) => (prev.logged_on === today ? formFromLog(todaysLog) : prev));
  }, [todaysLog?.id, todaysLog?.updated_at]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSavedMessage('');
  };

  const updateLoggedOn = (value) => {
    const existing = sortedLogs.find((log) => log.logged_on === value);
    setForm(existing ? formFromLog(existing) : emptyFormForDate(value));
    setFormError('');
    setSavedMessage('');
  };

  const stepField = (field, delta, min = 0, max = 20) => {
    setForm((prev) => {
      const next = Math.max(min, Math.min(max, parseInteger(prev[field]) + delta));
      return { ...prev, [field]: String(next) };
    });
    setSavedMessage('');
  };

  const stepHabit = (id, delta) => {
    setForm((prev) => {
      const tracked = normalizeHygiene(prev.hygiene).map((item) =>
        item.id === id && item.type === 'count' ? { ...item, count: Math.max(0, item.count + delta) } : item,
      );
      return { ...prev, hygiene: mergeTrackedHygiene(prev.hygiene, tracked) };
    });
    setSavedMessage('');
  };

  const toggleHabit = (id) => {
    setForm((prev) => {
      const tracked = normalizeHygiene(prev.hygiene).map((item) =>
        item.id === id && item.type === 'boolean' ? { ...item, done: !item.done } : item,
      );
      return { ...prev, hygiene: mergeTrackedHygiene(prev.hygiene, tracked) };
    });
    setSavedMessage('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSavedMessage('');

    const validationError = validateHealthForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    try {
      const saved = await saveHealthLog(toPayload(form));
      setForm(formFromLog(saved));
      setSavedMessage(saved.logged_on === today ? 'Today saved.' : `${saved.logged_on} saved.`);
    } catch (error) {
      setFormError(error.message || 'Failed to save health log.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <Panel className="col-span-12 xl:col-span-8">
        <PanelHeader eyebrow="Daily Check-In" title={panelTitle} right={<SourceStatus status={healthLogsStatus} />} />
        <form onSubmit={submit} className="grid gap-3 p-3">
          <section className="rounded-md border border-white/5 bg-black/25 p-2">
            <div className="mb-2 flex items-center gap-2">
              <Moon size={15} className="text-cyan-300" />
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Sleep</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <HealthField label="Date" type="date" value={form.logged_on} onChange={updateLoggedOn} />
              <CalculatedSleepHours value={form.sleep_hours} />
              <HealthField label="Sleep Start" type="time" value={form.sleep_start} onChange={(value) => updateField('sleep_start', value)} />
              <HealthField label="Wake Time" type="time" value={form.wake_time} onChange={(value) => updateField('wake_time', value)} />
            </div>
          </section>

          <section className="grid gap-2 sm:grid-cols-2">
            <Stepper label="Coffee" value={form.coffee} icon={Coffee} tone="amber" onStep={(delta) => stepField('coffee', delta, 0, 20)} />
            <Stepper label="ADC" value={form.adc} icon={Ban} tone="red" onStep={(delta) => stepField('adc', delta, 0, 50)} />
          </section>

          <section className="rounded-md border border-white/5 bg-black/25 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} className="text-emerald-300" />
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Daily Habits</p>
              </div>
              <span className="data-text text-[10px] text-zinc-500">tracked separately</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {normalizeHygiene(form.hygiene).map((item) => (
                <HabitTracker key={item.id} item={item} onStep={(delta) => stepHabit(item.id, delta)} onToggle={() => toggleHabit(item.id)} />
              ))}
            </div>
          </section>

          <HealthField label="Notes" value={form.notes} placeholder="Optional context" onChange={(value) => updateField('notes', value)} />

          <button
            type="submit"
            disabled={saving}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 text-base font-semibold text-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving Check-In' : selectedLog ? 'Update Check-In' : 'Save Check-In'}
          </button>

          {savedMessage ? <p className="data-text text-[11px] text-emerald-300">{savedMessage}</p> : null}
          {formError || healthLogsError ? <p className="data-text text-[11px] text-red-300">{formError || healthLogsError}</p> : null}
        </form>
      </Panel>

      <Panel className="col-span-12 xl:col-span-4">
        <PanelHeader eyebrow="7-Day Summary" title="Measurable Signals" />
        <div className="grid grid-cols-2 gap-2 p-3">
          <MiniMetric label="Avg Sleep" value={formatSummary(summary.avgSleep, 'h')} tone="text-cyan-300" sub={`${visibleLogs.length} logs`} />
          <MiniMetric label="Coffee" value={`${summary.totalCoffee}`} tone="text-amber-300" sub="total" />
          <MiniMetric label="ADC" value={`${summary.totalAdc}`} tone="text-red-300" sub="total" />
          <div className="col-span-2 rounded-md border border-white/5 bg-black/25 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Habits</p>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
              {summary.habits.counts.map((habit) => (
                <div key={habit.id} className="min-w-0">
                  <p className="truncate text-zinc-500">{habit.label}</p>
                  <p className="data-text font-semibold text-emerald-300">{habit.total}</p>
                </div>
              ))}
              <div className="min-w-0">
                <p className="truncate text-zinc-500">Journal</p>
                <p className="data-text font-semibold text-emerald-300">{summary.habits.journalDays}/{visibleLogs.length || 0} days</p>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12">
        <PanelHeader eyebrow="Persisted Logs" title="7-Day History" right={<Users size={16} className="text-cyan-300" />} />
        <div className="grid gap-2 p-3">
          {historyInitialLoading ? (
            <LoadingRow label="Loading health logs" />
          ) : visibleLogs.length ? (
            visibleLogs.map((log) => <HistoryRow key={log.id} log={log} current={log.logged_on === today} />)
          ) : historyResolved ? (
            <div className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">
              No persisted health logs yet. Save today&apos;s check-in to start the history.
            </div>
          ) : (
            <LoadingRow label="Health history pending" />
          )}
        </div>
      </Panel>
    </div>
  );
}

function HealthField({ inputMode, label, onChange, placeholder = '', suffix, type = 'text', value }) {
  return (
    <label className="rounded-md border border-white/5 bg-[#121212] px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="data-text min-w-0 flex-1 bg-transparent text-base font-semibold text-zinc-100 outline-none placeholder:text-zinc-700"
        />
        {suffix ? <span className="data-text text-xs text-zinc-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

function CalculatedSleepHours({ value }) {
  return (
    <div className="rounded-md border border-cyan-400/15 bg-cyan-400/[0.05] px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">Sleep Hours</span>
      <p className="data-text mt-1 text-base font-semibold text-cyan-200">{value === '' ? '--' : `${value}h`}</p>
      <p className="mt-1 text-[10px] leading-4 text-zinc-500">Previous sleep start + today&apos;s wake time</p>
    </div>
  );
}

function Stepper({ icon: Icon, label, onStep, tone, value }) {
  const tones = {
    cyan: {
      icon: 'text-cyan-300',
      value: 'text-cyan-300',
      button: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
    },
    amber: {
      icon: 'text-amber-300',
      value: 'text-amber-300',
      button: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
    },
    red: {
      icon: 'text-red-300',
      value: 'text-red-300',
      button: 'border-red-400/20 bg-red-400/10 text-red-300',
    },
  };
  const currentTone = tones[tone] ?? tones.cyan;

  return (
    <div className="min-w-0 rounded-md border border-white/5 bg-black/25 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-zinc-300">
          <Icon size={15} className={currentTone.icon} />
          <span className="truncate">{label}</span>
        </div>
        <span className={`data-text text-2xl font-black ${currentTone.value}`}>{value || 0}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onStep(-1)} className="grid h-10 place-items-center rounded border border-white/10 bg-[#121212] text-zinc-300">
          <Minus size={15} />
        </button>
        <button type="button" onClick={() => onStep(1)} className={`grid h-10 place-items-center rounded border ${currentTone.button}`}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function HabitTracker({ item, onStep, onToggle }) {
  if (item.type === 'boolean') {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`min-h-[86px] rounded-md border p-2 text-left transition ${
          item.done
            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
            : 'border-white/10 bg-[#121212] text-zinc-300'
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="truncate text-xs">{item.label}</span>
          <span className={`data-text rounded border px-2 py-0.5 text-[10px] ${item.done ? 'border-emerald-400/30 text-emerald-300' : 'border-white/10 text-zinc-500'}`}>
            {item.done ? 'YES' : 'NO'}
          </span>
        </div>
        <p className={`data-text text-sm font-semibold ${item.done ? 'text-emerald-300' : 'text-zinc-500'}`}>
          {item.done ? 'Journaled' : 'Not journaled'}
        </p>
      </button>
    );
  }

  return (
    <div className="rounded-md border border-white/10 bg-[#121212] p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-zinc-300">{item.label}</span>
        <span className="data-text text-lg font-black text-emerald-300">{item.count}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onStep(-1)} className="grid h-9 place-items-center rounded border border-white/10 bg-black/25 text-zinc-400">
          <Minus size={14} />
        </button>
        <button type="button" onClick={() => onStep(1)} className="grid h-9 place-items-center rounded border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function HistoryRow({ current, log }) {
  const hygiene = normalizeHygiene(log.hygiene);
  return (
    <div className="grid gap-2 rounded-md border border-white/5 bg-black/25 p-3 sm:grid-cols-[120px_1fr] sm:items-center">
      <div>
        <div className="flex items-center gap-2">
          <p className="data-text text-sm font-bold text-zinc-100">{log.logged_on}</p>
          {current ? <Tag tone="cyan">TODAY</Tag> : null}
        </div>
        <p className="data-text text-[10px] text-zinc-500">updated {formatShortDate(log.updated_at)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <HistoryMetric icon={Moon} label="Sleep" value={`${formatNumber(log.sleep_hours)}h`} tone="text-cyan-300" />
        <HistoryMetric icon={Coffee} label="Coffee" value={String(log.coffee ?? 0)} tone="text-amber-300" />
        <HistoryMetric icon={Ban} label="ADC" value={String(log.adc ?? 0)} tone="text-red-300" />
        <div className="col-span-2 min-w-0 rounded border border-white/5 bg-[#121212] px-2 py-1 sm:col-span-3">
          <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-zinc-500">
            <ShieldCheck size={11} />
            Habits
          </p>
          <p className="data-text mt-0.5 text-xs font-semibold leading-5 text-emerald-300">{formatHabitBreakdown(hygiene)}</p>
        </div>
      </div>
    </div>
  );
}

function HistoryMetric({ icon: Icon, label, tone, value }) {
  return (
    <div className="min-w-0 rounded border border-white/5 bg-[#121212] px-2 py-1">
      <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-zinc-500">
        {Icon ? <Icon size={11} /> : null}
        {label}
      </p>
      <p className={`data-text truncate text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function LoadingRow({ label }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/5 bg-black/25 p-3 data-text text-[11px] text-zinc-500">
      <Loader2 size={15} className="animate-spin text-cyan-300" />
      {label}
    </div>
  );
}

function SourceStatus({ status }) {
  const label = status === 'loading' ? 'SYNCING' : status === 'error' ? 'ERROR' : 'LIVE';
  const tone = status === 'error'
    ? 'border-red-400/20 bg-red-400/10 text-red-300'
    : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
  return <span className={`data-text rounded border px-2 py-1 text-[10px] ${tone}`}>{label}</span>;
}

function formFromLog(log) {
  if (!log) return emptyFormForDate(today);
  return {
    logged_on: log.logged_on ?? today,
    sleep_hours: stringValue(log.sleep_hours),
    sleep_start: log.sleep_start ?? '',
    wake_time: log.wake_time ?? '',
    coffee: stringValue(log.coffee ?? 0),
    adc: stringValue(log.adc ?? 0),
    notes: log.notes ?? '',
    hygiene: Array.isArray(log.hygiene) && log.hygiene.length ? log.hygiene : normalizeHygiene(defaultHabits),
  };
}

function emptyFormForDate(loggedOn) {
  return {
    ...emptyForm,
    logged_on: loggedOn || today,
    hygiene: normalizeHygiene(defaultHabits),
  };
}

function toPayload(form) {
  return {
    logged_on: form.logged_on,
    sleep_start: form.sleep_start || null,
    wake_time: form.wake_time || null,
    coffee: parseOptionalInteger(form.coffee) ?? 0,
    adc: parseOptionalInteger(form.adc) ?? 0,
    notes: form.notes.trim(),
    hygiene: mergeTrackedHygiene(form.hygiene, normalizeHygiene(form.hygiene)),
  };
}

function validateHealthForm(form) {
  if (!isValidDate(form.logged_on)) return 'Log date is invalid.';

  const coffee = parseOptionalInteger(form.coffee);
  if (coffee === null || !Number.isInteger(coffee) || coffee < 0) return 'Coffee must be zero or higher.';

  const adc = parseOptionalInteger(form.adc);
  if (adc === null || !Number.isInteger(adc) || adc < 0) return 'ADC must be zero or higher.';

  if (!hasValidHabitValues(form.hygiene)) {
    return 'Habit counts must be zero or higher.';
  }

  return '';
}

function summarizeLogs(logs) {
  const normalized = logs.map((log) => ({ ...log, hygiene: normalizeHygiene(log.hygiene) }));
  return {
    avgSleep: average(normalized.map((log) => optionalLogNumber(log.sleep_hours)).filter(Number.isFinite)),
    totalCoffee: normalized.reduce((total, log) => total + (parseOptionalInteger(log.coffee) ?? 0), 0),
    totalAdc: normalized.reduce((total, log) => total + (parseOptionalInteger(log.adc) ?? 0), 0),
    habits: summarizeHabits(normalized),
  };
}

function normalizeHygiene(items = []) {
  const safeItems = Array.isArray(items) ? items : [];
  const byId = new Map(safeItems.map((item) => [item.id, item]));
  return defaultHabits.map((base) => {
    const item = byId.get(base.id) ?? base;
    if (base.type === 'boolean') {
      const count = item.count ?? 0;
      return {
        id: base.id,
        label: base.label,
        type: base.type,
        done: Boolean(item.done) || parseInteger(count) > 0,
      };
    }
    const count = item.count ?? (item.done ? 1 : 0);
    return {
      id: base.id,
      label: base.label,
      type: base.type,
      count: Math.max(0, parseInteger(count)),
    };
  });
}

function mergeTrackedHygiene(existingItems, trackedItems) {
  const trackedIds = new Set(defaultHabits.map((habit) => habit.id));
  const legacyItems = (Array.isArray(existingItems) ? existingItems : [])
    .filter((item) => item?.id && !trackedIds.has(item.id));
  return [...trackedItems, ...legacyItems];
}

function hasValidHabitValues(items = []) {
  return normalizeHygiene(items).every((item) => {
    if (item.type === 'boolean') return typeof item.done === 'boolean';
    const count = item.count ?? (item.done ? 1 : 0);
    const parsed = parseOptionalInteger(count);
    return parsed !== null && Number.isInteger(parsed) && parsed >= 0;
  });
}

function summarizeHabits(logs) {
  const countHabits = defaultHabits.filter((habit) => habit.type === 'count');
  return {
    counts: countHabits.map((habit) => ({
      id: habit.id,
      label: habit.label,
      total: logs.reduce((sum, log) => sum + (normalizeHygiene(log.hygiene).find((item) => item.id === habit.id)?.count ?? 0), 0),
    })),
    journalDays: logs.reduce((sum, log) => sum + (normalizeHygiene(log.hygiene).find((item) => item.id === 'journal')?.done ? 1 : 0), 0),
  };
}

function formatHabitBreakdown(items = []) {
  const habits = normalizeHygiene(items);
  return habits
    .map((item) => {
      if (item.type === 'boolean') return `${item.label} ${item.done ? 'Yes' : 'No'}`;
      return `${item.label} ${item.count}`;
    })
    .join(' / ');
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sortLogs(logs) {
  return logs.slice().sort((a, b) => new Date(b.logged_on) - new Date(a.logged_on));
}

function parseDecimal(value) {
  const normalized = String(value ?? '').replace(',', '.');
  return Number(normalized);
}

function parseOptionalDecimal(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return parseDecimal(trimmed);
}

function parseOptionalInteger(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : NaN;
}

function parseInteger(value) {
  const parsed = parseOptionalInteger(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalLogNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return Number(value);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return false;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-') === value;
}

function stringValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function formatSummary(value, suffix) {
  if (!Number.isFinite(value)) return '--';
  return `${value.toFixed(1)}${suffix}`;
}

function formatShortDate(value) {
  if (!value) return '--';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
