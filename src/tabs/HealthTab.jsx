import { Ban, Check, Coffee, Loader2, Minus, Moon, Plus, ShieldCheck, TriangleAlert, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';
import { localDate, localTime } from '../utils/date';
import {
  HEALTH_HABITS,
  buildHabitUpdate,
  formatHabitTimes,
  getHabitEntry,
  normalizeHygieneObject,
} from '../utils/habits';

const today = localDate();

const defaultHygiene = Object.fromEntries(HEALTH_HABITS.map((habit) => [habit.id, { count: 0, times: [] }]));

const emptyForm = {
  logged_on: today,
  sleep_hours: '',
  sleep_start: '',
  wake_time: '',
  coffee: '0',
  adc: '0',
  notes: '',
  hygiene: defaultHygiene,
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
  const formRef = useRef(form);
  const selectedDateRef = useRef(form.logged_on);
  const changeSequenceRef = useRef(0);
  const dirtyVersionsRef = useRef({});
  const saveQueueRef = useRef(Promise.resolve());
  const pendingSavesRef = useRef(0);
  const [saveState, setSaveState] = useState('idle');
  const [formError, setFormError] = useState('');
  const selectedLog = useMemo(
    () => sortedLogs.find((log) => log.logged_on === form.logged_on) ?? null,
    [form.logged_on, sortedLogs],
  );
  const selectedIsToday = form.logged_on === today;
  const panelTitle = selectedIsToday ? 'Today Check-In' : 'Selected Date';

  useEffect(() => {
    if (!selectedLog || selectedDateRef.current !== selectedLog.logged_on) return;
    if (Object.keys(dirtyVersionsRef.current).length > 0) return;
    replaceForm(formFromLog(selectedLog));
  }, [selectedLog?.id, selectedLog?.updated_at]);

  const updateField = (field, value) => {
    changeSequenceRef.current += 1;
    dirtyVersionsRef.current[field] = changeSequenceRef.current;
    replaceForm({ ...formRef.current, [field]: value });
    setSaveState('dirty');
    setFormError('');
  };

  const updateLoggedOn = (value) => {
    if (!isValidDate(value)) return;
    const existing = sortedLogs.find((log) => log.logged_on === value);
    selectedDateRef.current = value;
    dirtyVersionsRef.current = {};
    replaceForm(existing ? formFromLog(existing) : emptyFormForDate(value));
    setFormError('');
    setSaveState('idle');
  };

  const stepField = (field, delta, min = 0, max = 20) => {
    const next = Math.max(min, Math.min(max, parseInteger(formRef.current[field]) + delta));
    updateField(field, String(next));
    queueSave(formRef.current.logged_on, { [field]: next }, { [field]: dirtyVersionsRef.current[field] });
  };

  const stepHabit = (id, delta) => {
    const hygiene = buildHabitUpdate(formRef.current.hygiene, id, delta, localTime());
    updateField('hygiene', hygiene);
    queueSave(formRef.current.logged_on, { hygiene }, { hygiene: dirtyVersionsRef.current.hygiene });
  };

  const commitField = (field) => {
    const version = dirtyVersionsRef.current[field];
    if (!version) return;
    const value = formRef.current[field];
    const validationError = validateAutosaveField(field, value);
    if (validationError) {
      setFormError(validationError);
      setSaveState('dirty');
      return;
    }
    queueSave(
      formRef.current.logged_on,
      { [field]: normalizeAutosaveValue(field, value) },
      { [field]: version },
    );
  };

  function replaceForm(next) {
    formRef.current = next;
    setForm(next);
  }

  function queueSave(loggedOn, patch, versions) {
    pendingSavesRef.current += 1;
    if (selectedDateRef.current === loggedOn) setSaveState('saving');

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        let failed = false;
        if (selectedDateRef.current === loggedOn) {
          setSaveState('saving');
          setFormError('');
        }
        try {
          const saved = await saveHealthLog({ logged_on: loggedOn, ...patch });
          if (selectedDateRef.current === loggedOn) {
            const serverForm = formFromLog(saved);
            const next = { ...formRef.current };
            const savedCurrentWakeEdit = Object.prototype.hasOwnProperty.call(patch, 'wake_time')
              && dirtyVersionsRef.current.wake_time === versions.wake_time;
            if (!dirtyVersionsRef.current.wake_time || savedCurrentWakeEdit) next.sleep_hours = serverForm.sleep_hours;
            for (const field of Object.keys(patch)) {
              if (dirtyVersionsRef.current[field] !== versions[field]) continue;
              next[field] = serverForm[field];
              delete dirtyVersionsRef.current[field];
            }
            replaceForm(next);
          }
        } catch (error) {
          failed = true;
          if (selectedDateRef.current === loggedOn) {
            setFormError(error.message || 'Failed to save changes.');
            setSaveState('error');
          }
        } finally {
          pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
          if (selectedDateRef.current === loggedOn && pendingSavesRef.current === 0) {
            setSaveState(failed ? 'error' : Object.keys(dirtyVersionsRef.current).length ? 'dirty' : 'saved');
          }
        }
      });
  };

  return (
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <Panel className="col-span-12 xl:col-span-8">
        <PanelHeader eyebrow="Daily Check-In" title={panelTitle} right={<AutosaveStatus saveState={saveState} sourceStatus={healthLogsStatus} />} />
        <div className="grid gap-3 p-3">
          <section className="rounded-md border border-white/5 bg-black/25 p-2">
            <div className="mb-2 flex items-center gap-2">
              <Moon size={15} className="text-cyan-300" />
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Sleep</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <HealthField label="Date" type="date" value={form.logged_on} onChange={updateLoggedOn} />
              <HealthField
                label="Wake Time"
                helper="Used for this selected day."
                type="time"
                value={form.wake_time}
                onChange={(value) => updateField('wake_time', value)}
                onCommit={() => commitField('wake_time')}
              />
              <HealthField
                label="Sleep Start"
                helper="Used for the following morning."
                type="time"
                value={form.sleep_start}
                onChange={(value) => updateField('sleep_start', value)}
                onCommit={() => commitField('sleep_start')}
              />
              <CalculatedSleepHours value={form.sleep_hours} />
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {HEALTH_HABITS.map((habit) => (
                <HabitTracker
                  key={habit.id}
                  habit={habit}
                  entry={getHabitEntry(form.hygiene, habit.id)}
                  onStep={(delta) => stepHabit(habit.id, delta)}
                />
              ))}
            </div>
          </section>

          <HealthField
            label="Notes"
            value={form.notes}
            placeholder="Optional context"
            onChange={(value) => updateField('notes', value)}
            onCommit={() => commitField('notes')}
          />

          {formError || healthLogsError ? <p className="data-text text-[11px] text-red-300">{formError || healthLogsError}</p> : null}
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-4">
        <PanelHeader eyebrow="7-Day Summary" title="Measurable Signals" />
        <div className="grid grid-cols-2 gap-2 p-3">
          <MiniMetric label="Avg Sleep" value={formatSummary(summary.avgSleep, 'h')} tone="text-cyan-300" sub={`${visibleLogs.length} logs`} />
          <MiniMetric label="Coffee" value={`${summary.totalCoffee}`} tone="text-amber-300" sub="total" />
          <MiniMetric label="ADC" value={`${summary.totalAdc}`} tone="text-red-300" sub="total" />
          <div className="col-span-2 rounded-md border border-white/5 bg-black/25 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Habits</p>
            <div className="grid grid-cols-3 gap-2 text-xs xl:grid-cols-1 2xl:grid-cols-3">
              {summary.habits.counts.map((habit) => (
                <div key={habit.id} className="min-w-0">
                  <p className="truncate text-zinc-500">{habit.label}</p>
                  <p className="data-text font-semibold text-emerald-300">{habit.total}</p>
                </div>
              ))}
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
              No persisted health logs yet. Change a field to start today&apos;s history.
            </div>
          ) : (
            <LoadingRow label="Health history pending" />
          )}
        </div>
      </Panel>
    </div>
  );
}

function HealthField({ helper, inputMode, label, onChange, onCommit, placeholder = '', suffix, type = 'text', value }) {
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
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && onCommit) event.currentTarget.blur();
          }}
          className="data-text min-w-0 flex-1 bg-transparent text-base font-semibold text-zinc-100 outline-none placeholder:text-zinc-700"
        />
        {suffix ? <span className="data-text text-xs text-zinc-500">{suffix}</span> : null}
      </div>
      {helper ? <span className="mt-1 block text-[10px] leading-4 text-zinc-600">{helper}</span> : null}
    </label>
  );
}

function CalculatedSleepHours({ value }) {
  return (
    <div className="rounded-md border border-cyan-400/15 bg-cyan-400/[0.05] px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">Sleep Hours</span>
      <p className="data-text mt-1 text-base font-semibold text-cyan-200">{value === '' ? '--' : `${value}h`}</p>
      <p className="mt-1 text-[10px] leading-4 text-zinc-500">Previous day&apos;s sleep start + this day&apos;s wake time</p>
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

function HabitTracker({ habit, entry, onStep }) {
  const times = formatHabitTimes(entry.times);
  return (
    <div className="rounded-md border border-white/10 bg-[#121212] p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-zinc-300">{habit.label}</span>
        <span className="data-text text-lg font-black text-emerald-300">{entry.count}</span>
      </div>
      <p className={`data-text mb-2 min-h-4 text-[10px] ${entry.count ? 'text-emerald-300' : 'text-zinc-600'}`}>
        {entry.count ? `${entry.count} logged${times ? ` | ${times}` : ''}` : 'Not logged'}
      </p>
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
  const hygiene = normalizeHygieneObject(log.hygiene);
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

function AutosaveStatus({ saveState, sourceStatus }) {
  if (saveState === 'saving') {
    return <span className="data-text flex items-center gap-1 text-[10px] text-cyan-300"><Loader2 size={12} className="animate-spin" />Saving...</span>;
  }
  if (saveState === 'saved') {
    return <span className="data-text flex items-center gap-1 text-[10px] text-emerald-300"><Check size={12} />Saved</span>;
  }
  if (saveState === 'dirty') {
    return <span className="data-text text-[10px] text-amber-300">Unsaved changes</span>;
  }
  if (saveState === 'error' || sourceStatus === 'error') {
    return <span className="data-text flex items-center gap-1 text-[10px] text-red-300"><TriangleAlert size={12} />Failed to save</span>;
  }
  return <span className="data-text text-[10px] text-zinc-600">Autosave</span>;
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
    hygiene: normalizeHygieneObject(log.hygiene),
  };
}

function emptyFormForDate(loggedOn) {
  return {
    ...emptyForm,
    logged_on: loggedOn || today,
    hygiene: normalizeHygieneObject(defaultHygiene),
  };
}

function validateAutosaveField(field, value) {
  if (['sleep_start', 'wake_time'].includes(field) && value && !isValidTime(value)) {
    return 'Enter a complete time before leaving the field.';
  }
  if (['coffee', 'adc'].includes(field)) {
    const parsed = parseOptionalInteger(value);
    if (parsed === null || !Number.isInteger(parsed) || parsed < 0) {
      return `${field === 'adc' ? 'ADC' : 'Coffee'} must be zero or higher.`;
    }
  }
  return '';
}

function normalizeAutosaveValue(field, value) {
  if (['sleep_start', 'wake_time'].includes(field)) return value || null;
  if (['coffee', 'adc'].includes(field)) return parseOptionalInteger(value) ?? 0;
  if (field === 'notes') return value.trim();
  return value;
}

function summarizeLogs(logs) {
  const normalized = logs.map((log) => ({ ...log, hygiene: normalizeHygieneObject(log.hygiene) }));
  return {
    avgSleep: average(normalized.map((log) => optionalLogNumber(log.sleep_hours)).filter(Number.isFinite)),
    totalCoffee: normalized.reduce((total, log) => total + (parseOptionalInteger(log.coffee) ?? 0), 0),
    totalAdc: normalized.reduce((total, log) => total + (parseOptionalInteger(log.adc) ?? 0), 0),
    habits: summarizeHabits(normalized),
  };
}

function summarizeHabits(logs) {
  return {
    counts: HEALTH_HABITS.map((habit) => ({
      id: habit.id,
      label: habit.label,
      total: logs.reduce((sum, log) => sum + getHabitEntry(log.hygiene, habit.id).count, 0),
    })),
  };
}

function formatHabitBreakdown(items = []) {
  return HEALTH_HABITS
    .map((habit) => {
      const entry = getHabitEntry(items, habit.id);
      const times = formatHabitTimes(entry.times);
      return `${habit.label} ${entry.count}${times ? ` (${times})` : ''}`;
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

function isValidTime(value) {
  const match = String(value).match(/^(\d{2}):([0-5]\d)$/);
  return Boolean(match && Number(match[1]) <= 23);
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
