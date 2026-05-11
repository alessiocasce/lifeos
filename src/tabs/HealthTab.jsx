import { Check, Coffee, Droplets, Loader2, Moon, Save, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';

const today = new Date().toISOString().slice(0, 10);

const defaultHygiene = [
  { id: 'brush', label: 'Brush', done: false },
  { id: 'floss', label: 'Floss', done: false },
  { id: 'skin', label: 'Skin', done: false },
  { id: 'stretch', label: 'Stretch', done: false },
  { id: 'journal', label: 'Journal', done: false },
];

const emptyForm = {
  logged_on: today,
  sleep_hours: '',
  sleep_start: '',
  wake_time: '',
  sleep_quality: '',
  energy: '',
  mood: '',
  water: '0',
  coffee: '0',
  social_time_minutes: '0',
  main_time_waster: '',
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
    setForm(formFromLog(todaysLog));
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

  const toggleHygiene = (id) => {
    setForm((prev) => ({
      ...prev,
      hygiene: prev.hygiene.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    }));
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
        <PanelHeader
          eyebrow="Daily Check-In"
          title={panelTitle}
          right={<SourceStatus status={healthLogsStatus} />}
        />
        <form onSubmit={submit} className="grid gap-3 p-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <HealthField label="Date" type="date" value={form.logged_on} onChange={updateLoggedOn} />
            <HealthField label="Sleep Hours" inputMode="decimal" value={form.sleep_hours} suffix="h" onChange={(value) => updateField('sleep_hours', value)} />
            <HealthField label="Sleep Start" type="time" value={form.sleep_start} onChange={(value) => updateField('sleep_start', value)} />
            <HealthField label="Wake Time" type="time" value={form.wake_time} onChange={(value) => updateField('wake_time', value)} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <HealthField label="Sleep Quality" inputMode="numeric" value={form.sleep_quality} suffix="%" onChange={(value) => updateField('sleep_quality', value)} />
            <HealthField label="Energy" inputMode="numeric" value={form.energy} suffix="/10" onChange={(value) => updateField('energy', value)} />
            <HealthField label="Mood" inputMode="numeric" value={form.mood} suffix="/10" onChange={(value) => updateField('mood', value)} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stepper label="Water" value={form.water} icon={Droplets} tone="cyan" onStep={(delta) => stepField('water', delta, 0, 16)} />
            <Stepper label="Coffee" value={form.coffee} icon={Coffee} tone="amber" onStep={(delta) => stepField('coffee', delta, 0, 10)} />
            <HealthField
              label="Social Time"
              inputMode="numeric"
              value={form.social_time_minutes}
              suffix="min"
              onChange={(value) => updateField('social_time_minutes', value)}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <HealthField
              label="Main Time Waster"
              value={form.main_time_waster}
              placeholder="Short label"
              onChange={(value) => updateField('main_time_waster', value)}
            />
            <HealthField label="Notes" value={form.notes} placeholder="Optional context" onChange={(value) => updateField('notes', value)} />
          </div>

          <div className="rounded-md border border-white/5 bg-black/25 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} className="text-emerald-300" />
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Hygiene</p>
              </div>
              <span className="data-text text-[10px] text-zinc-500">
                {form.hygiene.filter((item) => item.done).length}/{form.hygiene.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {form.hygiene.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleHygiene(item.id)}
                  className={`flex min-h-10 items-center justify-between gap-2 rounded border px-2 py-2 text-left text-xs ${
                    item.done
                      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                      : 'border-white/10 bg-[#121212] text-zinc-400'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {item.done ? <Check size={14} /> : null}
                </button>
              ))}
            </div>
          </div>

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
        <PanelHeader eyebrow="7-Day Summary" title="Health Signals" />
        <div className="grid grid-cols-2 gap-2 p-3">
          <MiniMetric label="Avg Sleep" value={formatSummary(summary.avgSleep, 'h')} tone="text-cyan-300" sub={`${visibleLogs.length} logs`} />
          <MiniMetric label="Avg Quality" value={formatSummary(summary.avgSleepQuality, '%')} tone="text-emerald-300" sub="sleep" />
          <MiniMetric label="Avg Mood" value={formatSummary(summary.avgMood, '/10')} tone="text-emerald-300" sub="signal" />
          <MiniMetric label="Avg Energy" value={formatSummary(summary.avgEnergy, '/10')} tone="text-amber-300" sub="readiness" />
          <div className="col-span-2">
            <MiniMetric label="Social Time" value={`${summary.totalSocial}m`} tone="text-cyan-300" sub="last 7 logs" />
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12">
        <PanelHeader eyebrow="Persisted Logs" title="7-Day History" right={<Users size={16} className="text-cyan-300" />} />
        <div className="grid gap-2 p-3">
          {healthLogsStatus === 'loading' ? (
            <LoadingRow label="Loading health logs" />
          ) : visibleLogs.length ? (
            visibleLogs.map((log) => <HistoryRow key={log.id} log={log} current={log.logged_on === today} />)
          ) : (
            <div className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">
              No persisted health logs yet. Save today&apos;s check-in to start the history.
            </div>
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

function Stepper({ icon: Icon, label, onStep, tone, value }) {
  const toneClass = tone === 'cyan' ? 'text-cyan-300 border-cyan-400/20 bg-cyan-400/10' : 'text-amber-300 border-amber-400/20 bg-amber-400/10';
  return (
    <div className="rounded-md border border-white/5 bg-black/25 p-2">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          <Icon size={15} className={tone === 'cyan' ? 'text-cyan-300' : 'text-amber-300'} />
          {label}
        </div>
        <span className={`data-text text-2xl font-black ${tone === 'cyan' ? 'text-cyan-300' : 'text-amber-300'}`}>{value || 0}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onStep(-1)} className="h-10 rounded border border-white/10 bg-[#121212] text-zinc-300">
          -
        </button>
        <button type="button" onClick={() => onStep(1)} className={`h-10 rounded border ${toneClass}`}>
          +
        </button>
      </div>
    </div>
  );
}

function HistoryRow({ current, log }) {
  return (
    <div className="grid gap-2 rounded-md border border-white/5 bg-black/25 p-3 sm:grid-cols-[120px_1fr_auto] sm:items-center">
      <div>
        <div className="flex items-center gap-2">
          <p className="data-text text-sm font-bold text-zinc-100">{log.logged_on}</p>
          {current ? <Tag tone="cyan">TODAY</Tag> : null}
        </div>
        <p className="data-text text-[10px] text-zinc-500">updated {formatShortDate(log.updated_at)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <HistoryMetric icon={Moon} label="Sleep" value={`${formatNumber(log.sleep_hours)}h`} tone="text-cyan-300" />
        <HistoryMetric label="Quality" value={`${log.sleep_quality ?? '--'}%`} tone="text-emerald-300" />
        <HistoryMetric label="Energy" value={`${log.energy ?? '--'}/10`} tone="text-amber-300" />
        <HistoryMetric label="Mood" value={`${log.mood ?? '--'}/10`} tone="text-emerald-300" />
        <HistoryMetric label="Social" value={`${log.social_time_minutes ?? 0}m`} tone="text-cyan-300" />
      </div>
      <p className="truncate data-text text-[10px] text-zinc-500 sm:max-w-40">{log.main_time_waster || 'no time waster logged'}</p>
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
    sleep_quality: stringValue(log.sleep_quality),
    energy: stringValue(log.energy),
    mood: stringValue(log.mood),
    water: stringValue(log.water ?? 0),
    coffee: stringValue(log.coffee ?? 0),
    social_time_minutes: stringValue(log.social_time_minutes ?? 0),
    main_time_waster: log.main_time_waster ?? '',
    notes: log.notes ?? '',
    hygiene: Array.isArray(log.hygiene) && log.hygiene.length ? cloneHygiene(log.hygiene) : cloneHygiene(defaultHygiene),
  };
}

function emptyFormForDate(loggedOn) {
  return {
    ...emptyForm,
    logged_on: loggedOn || today,
    hygiene: cloneHygiene(defaultHygiene),
  };
}

function cloneHygiene(items) {
  return items.map((item) => ({ ...item }));
}

function toPayload(form) {
  return {
    logged_on: form.logged_on,
    sleep_hours: parseOptionalDecimal(form.sleep_hours),
    sleep_start: form.sleep_start || null,
    wake_time: form.wake_time || null,
    sleep_quality: parseOptionalInteger(form.sleep_quality),
    energy: parseOptionalInteger(form.energy),
    mood: parseOptionalInteger(form.mood),
    water: parseOptionalInteger(form.water) ?? 0,
    coffee: parseOptionalInteger(form.coffee) ?? 0,
    social_time_minutes: parseOptionalInteger(form.social_time_minutes) ?? 0,
    main_time_waster: form.main_time_waster.trim(),
    notes: form.notes.trim(),
    hygiene: form.hygiene,
  };
}

function validateHealthForm(form) {
  if (!isValidDate(form.logged_on)) return 'Log date is invalid.';

  const sleepHours = parseOptionalDecimal(form.sleep_hours);
  if (sleepHours !== null && (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24)) return 'Sleep hours must be between 0 and 24.';

  const sleepQuality = parseOptionalInteger(form.sleep_quality);
  if (sleepQuality !== null && (!Number.isInteger(sleepQuality) || sleepQuality < 0 || sleepQuality > 100)) return 'Sleep quality must be between 0 and 100.';

  const energy = parseOptionalInteger(form.energy);
  if (energy !== null && (!Number.isInteger(energy) || energy < 1 || energy > 10)) return 'Energy must be between 1 and 10.';

  const mood = parseOptionalInteger(form.mood);
  if (mood !== null && (!Number.isInteger(mood) || mood < 1 || mood > 10)) return 'Mood must be between 1 and 10.';

  const water = parseOptionalInteger(form.water);
  if (water === null || !Number.isInteger(water) || water < 0) return 'Water must be zero or higher.';

  const coffee = parseOptionalInteger(form.coffee);
  if (coffee === null || !Number.isInteger(coffee) || coffee < 0) return 'Coffee must be zero or higher.';

  const social = parseOptionalInteger(form.social_time_minutes);
  if (social === null || !Number.isInteger(social) || social < 0) return 'Social time must be zero or higher.';

  return '';
}

function summarizeLogs(logs) {
  return {
    avgSleep: average(logs.map((log) => optionalLogNumber(log.sleep_hours)).filter(Number.isFinite)),
    avgMood: average(logs.map((log) => optionalLogNumber(log.mood)).filter(Number.isFinite)),
    avgEnergy: average(logs.map((log) => optionalLogNumber(log.energy)).filter(Number.isFinite)),
    avgSleepQuality: average(logs.map((log) => optionalLogNumber(log.sleep_quality)).filter(Number.isFinite)),
    totalSocial: logs.reduce((total, log) => total + (parseOptionalInteger(log.social_time_minutes) ?? 0), 0),
  };
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
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime());
}

function stringValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function formatSummary(value, suffix) {
  if (!Number.isFinite(value)) return '--';
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(1)}${suffix}`;
}

function formatShortDate(value) {
  if (!value) return '--';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
