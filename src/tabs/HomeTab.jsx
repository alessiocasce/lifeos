import {
  Bell,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Moon,
  Target,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';
import { localDate } from '../utils/date';
import { HEALTH_HABITS, getHabitEntry } from '../utils/habits';

export function HomeTab() {
  const {
    activeWorkoutSession,
    calendarEvents,
    healthLogs,
    loadCalendarRange,
    memos,
    projects,
    projectSessions,
    workoutSessions,
  } = useLifeOS();

  const today = getToday();
  const tomorrow = addDays(today, 1);

  useEffect(() => {
    loadCalendarRange(today, tomorrow);
  }, [loadCalendarRange, today, tomorrow]);

  const todaysEvents = useMemo(
    () => sortEvents(calendarEvents.filter((event) => event.event_date === today)),
    [calendarEvents, today],
  );
  const visibleAgendaEvents = todaysEvents.filter((event) => event.status !== 'cancelled');
  const nextEvent = getNextEvent(visibleAgendaEvents);
  const shownAgenda = visibleAgendaEvents.slice(0, 5);
  const agendaMoreCount = Math.max(0, visibleAgendaEvents.length - shownAgenda.length);
  const todaysMemos = useMemo(
    () => memos.filter((memo) => memo.status === 'open' && memo.memo_date === today),
    [memos, today],
  );
  const overdueMemos = useMemo(
    () => memos.filter((memo) => memo.status === 'open' && memo.memo_date && memo.memo_date < today),
    [memos, today],
  );
  const nextMemo = useMemo(() => getNextMemo(memos, today), [memos, today]);

  const todaysHealthLog = useMemo(
    () => healthLogs.find((log) => log.logged_on === today) ?? null,
    [healthLogs, today],
  );
  const normalizedHabits = Object.fromEntries(
    HEALTH_HABITS.map((habit) => [habit.id, getHabitEntry(todaysHealthLog?.hygiene, habit.id)]),
  );
  const completedHabitCount = HEALTH_HABITS.filter((habit) => normalizedHabits[habit.id].count > 0).length;
  const loggedHabits = HEALTH_HABITS
    .map((habit) => ({ habit, entry: normalizedHabits[habit.id] }))
    .filter((item) => item.entry.count > 0);
  const loggedHealthSignals = buildLoggedHealthSignals(todaysHealthLog, loggedHabits);

  const todaysWorkoutSessions = useMemo(
    () => workoutSessions.filter((session) => session.performed_on === today),
    [today, workoutSessions],
  );
  const liveWorkout = todaysWorkoutSessions.find((session) => !session.ended_at) ?? (activeWorkoutSession?.performed_on === today && !activeWorkoutSession.ended_at ? activeWorkoutSession : null);
  const latestTodayWorkout = todaysWorkoutSessions[0] ?? null;
  const todayWorkoutMetrics = getWorkoutMetrics(todaysWorkoutSessions);

  const activeProjectSession = projectSessions.find((session) => !session.ended_at) ?? null;
  const activeSessionProject = activeProjectSession ? projects.find((project) => project.id === activeProjectSession.project_id) : null;
  const todayProjectMinutes = projectSessions
    .filter((session) => isSameLocalDate(session.started_at, today))
    .reduce((sum, session) => sum + getProjectSessionMinutes(session), 0);

  const todaySignal = buildTodaySignal({
    activeProjectSession,
    liveWorkout,
    nextEvent,
    overdueMemos,
    todaysMemos,
    todaysWorkoutSessions,
    todaysHealthLog,
    visibleAgendaEvents,
  });
  const importantMemos = [...overdueMemos, ...todaysMemos].slice(0, 3);
  const commandPills = buildCommandPills({
    completedHabitCount,
    loggedHabits,
    overdueMemos,
    todaysHealthLog,
    todaysMemos,
  });
  const showAgendaLane = visibleAgendaEvents.length > 0;
  const showMemoLane = importantMemos.length > 0 || Boolean(nextMemo);
  const showOpsLane = Boolean(activeProjectSession) || todayProjectMinutes > 0;
  const showTrainingLane = Boolean(liveWorkout) || todaysWorkoutSessions.length > 0;
  const showHealthLane = loggedHealthSignals.length > 0;
  const TodaySignalIcon = todaySignal?.icon;

  return (
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-hidden">
      <section className="col-span-12 rounded-lg border border-white/5 bg-[linear-gradient(135deg,rgba(34,211,238,0.10),rgba(18,18,18,0.82)_36%,rgba(0,0,0,0.45))] p-3 shadow-[0_18px_80px_rgba(0,0,0,0.30)]">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="data-text text-[10px] uppercase tracking-[0.22em] text-cyan-300">Today Command</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">What matters today?</h1>
            <p className="mt-1 text-sm text-zinc-500">{formatDate(today)}</p>
          </div>
          {commandPills.length ? (
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:justify-end">
              {commandPills.map((pill) => (
                <StatusPill key={pill.label} label={pill.label} value={pill.value} tone={pill.tone} />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {todaySignal ? (
      <Panel className="col-span-12">
        <div className="flex min-w-0 flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/[0.06] px-3 py-1">
              <TodaySignalIcon size={14} className={todaySignal.tone} />
              <span className="data-text text-[10px] uppercase tracking-wider text-cyan-300">Today Signal</span>
            </div>
            <h2 className="text-xl font-semibold text-zinc-50">{todaySignal.primary}</h2>
            {todaySignal.secondary ? <p className="mt-2 text-sm leading-6 text-zinc-500">{todaySignal.secondary}</p> : null}
          </div>
        </div>
      </Panel>
      ) : null}

      {showAgendaLane ? (
        <Panel className="col-span-12 xl:col-span-7">
          <PanelHeader eyebrow="Agenda" title="Today" right={<span className="data-text text-[11px] text-cyan-300">{visibleAgendaEvents.length}</span>} />
          <div className="space-y-2 p-3">
            {shownAgenda.slice(0, 4).map((event) => (
              <AgendaRow key={event.id} event={event} />
            ))}
            {agendaMoreCount > 0 ? <p className="data-text px-1 text-[11px] text-zinc-500">+{agendaMoreCount} more today</p> : null}
          </div>
        </Panel>
      ) : null}

      {showMemoLane ? (
        <Panel className="col-span-12 xl:col-span-5">
          <PanelHeader eyebrow="Reminders" title="Memos" right={<Bell size={16} className={overdueMemos.length ? 'text-amber-300' : 'text-cyan-300'} />} />
          <div className="grid gap-2 p-3">
            {importantMemos.map((memo) => <MemoRow key={memo.id} memo={memo} today={today} />)}
            {!importantMemos.length && nextMemo ? <MemoRow memo={nextMemo} today={today} /> : null}
          </div>
        </Panel>
      ) : null}

      {showOpsLane ? (
        <Panel className="col-span-12 xl:col-span-6">
          <PanelHeader eyebrow="Ops" title="Execution" right={<Target size={16} className="text-cyan-300" />} />
          <div className="grid gap-3 p-3">
            {activeProjectSession ? (
              <div className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.06] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone="cyan">ACTIVE SESSION</Tag>
                  {getProjectSessionMinutes(activeProjectSession) > 0 ? (
                    <span className="data-text text-[11px] text-zinc-500">{formatDuration(getProjectSessionMinutes(activeProjectSession))}</span>
                  ) : null}
                </div>
                <h3 className="mt-2 break-words text-base font-semibold text-zinc-100">{activeSessionProject?.name ?? 'Project session'}</h3>
                {activeProjectSession.target_output ? <p className="mt-1 break-words text-xs text-zinc-500">{activeProjectSession.target_output}</p> : null}
              </div>
            ) : null}
            {todayProjectMinutes > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                <MiniMetric label="Today" value={formatDuration(todayProjectMinutes)} tone="text-cyan-300" sub="project work" />
                <MiniMetric label="Latest" value={truncateText(getLastProjectName(projects, projectSessions), 16)} tone="text-zinc-100" sub="project" />
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {showTrainingLane ? (
        <Panel className="col-span-12 xl:col-span-6">
          <PanelHeader eyebrow="Training" title={liveWorkout ? 'Workout Live' : 'Training Done'} right={<Dumbbell size={16} className={liveWorkout ? 'text-red-300' : 'text-emerald-300'} />} />
          <div className="grid gap-3 p-3">
            <div className="rounded-md border border-white/5 bg-black/25 p-3">
              <Tag tone={liveWorkout ? 'red' : 'emerald'}>{liveWorkout ? 'LIVE' : 'TRAINED'}</Tag>
              <h3 className="mt-2 truncate text-base font-semibold text-zinc-100" title={liveWorkout?.name ?? latestTodayWorkout?.name}>
                {liveWorkout?.name ?? latestTodayWorkout?.name ?? 'Workout'}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">{todaysWorkoutSessions.length || 1} session{(todaysWorkoutSessions.length || 1) === 1 ? '' : 's'} today</p>
            </div>
            {todayWorkoutMetrics.setCount > 0 || todayWorkoutMetrics.volume > 0 || todayWorkoutMetrics.exerciseCount > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {todayWorkoutMetrics.setCount > 0 ? <MiniMetric label="Sets" value={todayWorkoutMetrics.setCount} tone="text-cyan-300" sub="working" /> : null}
                {todayWorkoutMetrics.volume > 0 ? <MiniMetric label="Volume" value={formatCompact(todayWorkoutMetrics.volume)} tone="text-emerald-300" sub="kg" /> : null}
                {todayWorkoutMetrics.exerciseCount > 0 ? <MiniMetric label="Moves" value={todayWorkoutMetrics.exerciseCount} tone="text-amber-300" sub="exercises" /> : null}
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {showHealthLane ? (
        <Panel className="col-span-12 xl:col-span-6">
          <PanelHeader eyebrow="Health" title="Daily Signals" />
          <div className="grid gap-3 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {loggedHealthSignals.map((signal) => (
                signal.type === 'habit'
                  ? <HabitPill key={signal.key} habit={signal.habit} entry={signal.entry} />
                  : <SignalMini key={signal.key} label={signal.label} value={signal.value} />
              ))}
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function StatusPill({ label, tone, value }) {
  return (
    <div className="min-w-0 rounded-md border border-white/5 bg-black/25 px-3 py-2 lg:min-w-28">
      <p className="data-text truncate text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`data-text mt-1 truncate text-sm font-bold ${tone}`}>{value || '--'}</p>
    </div>
  );
}

function SignalMini({ label, value }) {
  return (
    <div className="min-w-0 rounded-md border border-white/5 bg-black/25 p-2 text-center">
      <p className="data-text text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="data-text mt-1 truncate text-sm font-bold text-zinc-100">{value || '--'}</p>
    </div>
  );
}

function buildCommandPills({ completedHabitCount, loggedHabits, overdueMemos, todaysHealthLog, todaysMemos }) {
  const pills = [];
  const sleep = Number(todaysHealthLog?.sleep_hours ?? 0);
  if (sleep > 0) {
    pills.push({
      label: 'Sleep',
      value: formatWithUnit(sleep, 'h'),
      tone: sleep < 6 ? 'text-amber-300' : 'text-cyan-300',
    });
  }
  if (loggedHabits.length > 0) {
    pills.push({
      label: 'Habits',
      value: `${completedHabitCount}`,
      tone: 'text-emerald-300',
    });
  }
  const memoCount = overdueMemos.length + todaysMemos.length;
  if (memoCount > 0) {
    pills.push({
      label: 'Memos',
      value: String(memoCount),
      tone: overdueMemos.length ? 'text-amber-300' : 'text-cyan-300',
    });
  }
  return pills;
}

function buildLoggedHealthSignals(log, loggedHabits) {
  const signals = [];
  const sleep = Number(log?.sleep_hours ?? 0);
  const coffee = Number(log?.coffee ?? 0);
  const adc = Number(log?.adc ?? 0);
  if (sleep > 0) signals.push({ key: 'sleep', label: 'Sleep', value: formatWithUnit(sleep, 'h') });
  loggedHabits.forEach((item) => signals.push({ key: item.habit.id, type: 'habit', ...item }));
  if (coffee > 0) signals.push({ key: 'coffee', label: 'Coffee', value: formatNumber(coffee) });
  if (adc > 0) signals.push({ key: 'adc', label: 'ADC', value: formatNumber(adc) });
  return signals;
}

function buildTodaySignal({
  activeProjectSession,
  liveWorkout,
  nextEvent,
  overdueMemos,
  todayProjectMinutes,
  todaysMemos,
  todaysWorkoutSessions,
  todaysHealthLog,
  visibleAgendaEvents,
}) {
  const sleep = Number(todaysHealthLog?.sleep_hours ?? 0);
  const signals = [];
  if (sleep > 0 && sleep < 6) {
    signals.push({
      icon: Moon,
      primary: 'Low sleep - keep today realistic.',
      secondary: 'Protect focus, keep training technical, and avoid stacking too many commitments.',
      tone: 'text-amber-300',
    });
  }
  if (activeProjectSession) {
    signals.push({
      icon: Target,
      primary: 'Active Ops session running.',
      secondary: 'Finish the current output before opening more loops.',
      tone: 'text-cyan-300',
    });
  }
  if (liveWorkout) {
    signals.push({
      icon: Dumbbell,
      primary: 'Workout in progress.',
      secondary: 'Keep logging clean sets and finish the session when done.',
      tone: 'text-red-300',
    });
  }
  if (overdueMemos.length) {
    signals.push({
      icon: Bell,
      primary: `Reminder due: ${truncateText(overdueMemos[0].title, 52)}.`,
      secondary: 'Clear or reschedule the stale reminder before it becomes background noise.',
      tone: 'text-amber-300',
    });
  }
  if (nextEvent) {
    signals.push({
      icon: Clock3,
      primary: `Next: ${truncateText(nextEvent.title, 56)} at ${formatEventTime(nextEvent)}.`,
      secondary: visibleAgendaEvents.length > 1 ? `${visibleAgendaEvents.length - 1} more agenda item${visibleAgendaEvents.length === 2 ? '' : 's'} after that.` : null,
      tone: 'text-cyan-300',
    });
  }
  if (todaysWorkoutSessions.length) {
    signals.push({
      icon: CheckCircle2,
      primary: 'Training done.',
      secondary: 'Recovery and the next useful block matter more than another dashboard check.',
      tone: 'text-emerald-300',
    });
  }
  if (!signals.length) return null;
  const primary = signals[0];
  const secondary = signals[1]?.primary && signals[1].primary !== primary.primary
    ? [primary.secondary, signals[1].primary].filter(Boolean).join(' ')
    : primary.secondary;
  return {
    ...primary,
    secondary,
  };
}

function AgendaRow({ event }) {
  const cancelled = event.status === 'cancelled';
  const category = normalizeCategoryLabel(event.category);
  return (
    <div className={`min-w-0 rounded-md border border-white/5 bg-black/25 p-3 ${cancelled ? 'opacity-55' : ''}`}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="data-text text-[11px] font-semibold text-cyan-300">{formatEventTime(event)}</p>
          <p className="mt-1 break-words text-sm font-semibold text-zinc-100">{event.title}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {category ? <span className={`data-text rounded border px-2 py-1 text-[10px] ${categoryTone(category)}`}>{category}</span> : null}
          <span className={`data-text rounded border px-2 py-1 text-[10px] ${statusTone(event.status)}`}>{event.status ?? 'planned'}</span>
        </div>
      </div>
    </div>
  );
}

function MemoRow({ memo, today }) {
  const overdue = memo.memo_date && memo.memo_date < today;
  return (
    <div className={`min-w-0 rounded-md border p-3 ${overdue ? 'border-amber-400/20 bg-amber-400/[0.06]' : 'border-white/5 bg-black/25'}`}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`data-text text-[11px] font-semibold ${overdue ? 'text-amber-300' : 'text-cyan-300'}`}>
            {formatMemoDue(memo)}
          </p>
          <p className="mt-1 break-words text-sm font-semibold text-zinc-100">{memo.title}</p>
        </div>
        <Bell size={15} className={overdue ? 'shrink-0 text-amber-300' : 'shrink-0 text-cyan-300'} />
      </div>
    </div>
  );
}

function HabitPill({ habit, entry }) {
  const latestTime = entry.times.at(-1);
  const renderedDetail = latestTime
    ? entry.count > 1 ? `${entry.count}x - last ${latestTime}` : latestTime
    : `${entry.count}x`;
  return (
    <div className="min-w-0 rounded-md border border-emerald-400/15 bg-emerald-400/[0.06] p-2">
      <p className="truncate text-[10px] uppercase tracking-wider text-zinc-500">{habit.label}</p>
      <p className="data-text mt-1 truncate text-sm font-bold text-emerald-300">{renderedDetail}</p>
    </div>
  );
}

function getNextEvent(events) {
  const now = new Date();
  const todayMinutes = now.getHours() * 60 + now.getMinutes();
  return events.find((event) => {
    if (event.status && event.status !== 'planned') return false;
    if (!event.start_time) return true;
    return timeToMinutes(event.start_time) >= todayMinutes;
  }) ?? null;
}

function getNextMemo(memos, today) {
  return memos.find((memo) => memo.status === 'open' && (!memo.memo_date || memo.memo_date >= today)) ?? null;
}

function getWorkoutMetrics(sessions) {
  const sets = sessions.flatMap((session) => session.workout_sets ?? []).filter((set) => !set.is_warmup);
  const volume = sets.reduce((sum, set) => sum + Number(set.weight ?? 0) * Number(set.reps ?? 0), 0);
  const exerciseCount = new Set(sets.map((set) => set.exercise).filter(Boolean)).size;
  return { exerciseCount, setCount: sets.length, volume };
}

function getProjectSessionMinutes(session) {
  if (session.duration_minutes !== null && session.duration_minutes !== undefined && Number.isFinite(Number(session.duration_minutes))) {
    return Number(session.duration_minutes);
  }
  if (!session.ended_at) {
    return Math.max(0, Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000));
  }
  return Math.max(0, Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000));
}

function getLastProjectName(projects, sessions) {
  const latestSession = sessions
    .slice()
    .sort((a, b) => new Date(b.started_at ?? b.created_at ?? 0) - new Date(a.started_at ?? a.created_at ?? 0))[0];
  const project = latestSession
    ? projects.find((item) => item.id === latestSession.project_id)
    : projects.find((item) => item.status === 'active') ?? projects[0];
  return project?.name ?? '--';
}

function formatDuration(minutes) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes ?? 0)));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

function isSameLocalDate(value, dateValue) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const local = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return local === dateValue;
}

function sortEvents(events) {
  return events.slice().sort((a, b) => {
    if (a.status === 'cancelled' && b.status !== 'cancelled') return 1;
    if (b.status === 'cancelled' && a.status !== 'cancelled') return -1;
    const aTime = a.start_time || '99:99';
    const bTime = b.start_time || '99:99';
    if (aTime !== bTime) return aTime.localeCompare(bTime);
    return String(a.created_at ?? a.id ?? '').localeCompare(String(b.created_at ?? b.id ?? ''));
  });
}

function formatEventTime(event) {
  if (event.start_time && event.end_time) return `${formatTime(event.start_time)}-${formatTime(event.end_time)}`;
  if (event.start_time) return formatTime(event.start_time);
  return 'Anytime';
}

function formatMemoDue(memo) {
  if (!memo.memo_date) return 'No date';
  const time = memo.memo_time ? ` ${formatTime(memo.memo_time)}` : '';
  return `${memo.memo_date}${time}`;
}

function formatTime(value) {
  return String(value ?? '').slice(0, 5);
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value ?? '00:00').split(':').map(Number);
  return hours * 60 + minutes;
}

function formatCompact(value) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '--';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatWithUnit(value, unit) {
  const formatted = formatNumber(value);
  return formatted === '--' ? formatted : `${formatted}${unit}`;
}

function truncateText(value, maxLength) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function normalizeCategoryLabel(category) {
  const text = String(category ?? '').trim();
  const match = ['Work', 'Study', 'School', 'Health', 'Workout', 'Errands', 'Personal', 'Social', 'Entertainment', 'Sleep']
    .find((item) => item.toLowerCase() === text.toLowerCase());
  return match ?? text;
}

function categoryTone(category) {
  if (category === 'Work') return 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300';
  if (category === 'Study') return 'border-violet-400/20 bg-violet-400/10 text-violet-300';
  if (category === 'School') return 'border-amber-400/20 bg-amber-400/10 text-amber-300';
  if (category === 'Health') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
  if (category === 'Workout') return 'border-red-400/20 bg-red-400/10 text-red-300';
  if (category === 'Errands') return 'border-lime-400/20 bg-lime-400/10 text-lime-300';
  if (category === 'Personal') return 'border-sky-400/20 bg-sky-400/10 text-sky-300';
  if (category === 'Social') return 'border-rose-400/20 bg-rose-400/10 text-rose-300';
  if (category === 'Entertainment') return 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-300';
  if (category === 'Sleep') return 'border-indigo-400/20 bg-indigo-400/10 text-indigo-300';
  return 'border-white/10 bg-white/[0.03] text-zinc-400';
}

function statusTone(status) {
  if (status === 'done') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
  if (status === 'skipped') return 'border-amber-400/20 bg-amber-400/10 text-amber-300';
  if (status === 'cancelled') return 'border-red-400/20 bg-red-400/10 text-red-300';
  return 'border-white/10 bg-white/[0.03] text-zinc-300';
}

function getToday() {
  return localDate();
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateValue) {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
