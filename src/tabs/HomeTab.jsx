import {
  Activity,
  Ban,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Coffee,
  Dumbbell,
  History,
  Moon,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { AiActionHistoryList } from '../components/AiActionHistory';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';

const habits = [
  { id: 'brush', label: 'Brush', type: 'count' },
  { id: 'shower', label: 'Shower', type: 'count' },
  { id: 'creatine', label: 'Creatine', type: 'count' },
  { id: 'skin', label: 'Skin', type: 'count' },
  { id: 'journal', label: 'Journal', type: 'boolean' },
];

export function HomeTab() {
  const {
    activeWorkoutSession,
    aiActionLogs,
    aiActionLogsStatus,
    calendarEvents,
    calendarEventsStatus,
    expenses,
    expensesStatus,
    healthLogs,
    healthLogsStatus,
    loadCalendarRange,
    loadExpenseMonth,
    monthlyExpenses,
    monthlyExpensesError,
    monthlyExpensesStatus,
    workoutSessions,
    workoutSessionsStatus,
  } = useLifeOS();

  const today = getToday();
  const tomorrow = addDays(today, 1);
  const monthRange = useMemo(() => getMonthRange(today), [today]);

  useEffect(() => {
    loadCalendarRange(today, tomorrow);
  }, [loadCalendarRange, today, tomorrow]);

  useEffect(() => {
    loadExpenseMonth(monthRange.start, monthRange.end);
  }, [loadExpenseMonth, monthRange.end, monthRange.start]);

  const todaysEvents = useMemo(
    () => sortEvents(calendarEvents.filter((event) => event.event_date === today)),
    [calendarEvents, today],
  );
  const visibleAgendaEvents = todaysEvents.filter((event) => event.status !== 'cancelled');
  const nextEvent = getNextEvent(visibleAgendaEvents);
  const agendaCounts = getAgendaCounts(todaysEvents);
  const shownAgenda = todaysEvents.slice(0, 5);
  const agendaMoreCount = Math.max(0, todaysEvents.length - shownAgenda.length);

  const todaysHealthLog = useMemo(
    () => healthLogs.find((log) => log.logged_on === today) ?? null,
    [healthLogs, today],
  );
  const normalizedHabits = normalizeHabits(todaysHealthLog?.hygiene);
  const completedHabitCount = habits.filter((habit) => isHabitComplete(normalizedHabits[habit.id], habit)).length;

  const todaysWorkoutSessions = useMemo(
    () => workoutSessions.filter((session) => session.performed_on === today),
    [today, workoutSessions],
  );
  const liveWorkout = todaysWorkoutSessions.find((session) => !session.ended_at) ?? (activeWorkoutSession?.performed_on === today && !activeWorkoutSession.ended_at ? activeWorkoutSession : null);
  const latestTodayWorkout = todaysWorkoutSessions[0] ?? null;
  const todayWorkoutMetrics = getWorkoutMetrics(todaysWorkoutSessions);
  const workoutStatus = getWorkoutStatus(liveWorkout, todaysWorkoutSessions);

  const todaysExpenses = useMemo(
    () => expenses.filter((expense) => expense.spent_on === today),
    [expenses, today],
  );
  const currentMonthExpenses = useMemo(
    () => monthlyExpenses.filter((expense) => expense.spent_on >= monthRange.start && expense.spent_on < monthRange.end),
    [monthRange.end, monthRange.start, monthlyExpenses],
  );
  const todaySpend = sumExpenses(todaysExpenses);
  const currentMonthSpend = sumExpenses(currentMonthExpenses);
  const topCategory = buildCategorySpend(currentMonthExpenses)[0] ?? null;
  const latestExpense = expenses[0] ?? null;

  const calendarLoading = isInitialLoading(calendarEventsStatus, calendarEvents);
  const healthLoading = isInitialLoading(healthLogsStatus, healthLogs);
  const workoutsLoading = isInitialLoading(workoutSessionsStatus, workoutSessions);
  const expensesLoading = isInitialLoading(expensesStatus, expenses);
  const monthLoading = isInitialLoading(monthlyExpensesStatus, currentMonthExpenses);

  return (
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-hidden">
      <Panel className="col-span-12">
        <PanelHeader
          eyebrow="Today Command Center"
          title="Today Overview"
          right={<span className="data-text text-[11px] text-zinc-500">{formatDate(today)}</span>}
        />
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-5">
          <OverviewMetric
            icon={Clock3}
            label="Next Event"
            value={calendarLoading ? 'Loading...' : nextEvent ? nextEvent.title : 'No upcoming'}
            detail={nextEvent ? formatEventTime(nextEvent) : calendarLoading ? 'Loading today...' : 'No upcoming events'}
            tone={nextEvent ? 'text-cyan-300' : 'text-zinc-100'}
          />
          <OverviewMetric
            icon={CalendarDays}
            label="Agenda"
            value={calendarLoading ? '...' : `${agendaCounts.planned}/${agendaCounts.done}/${agendaCounts.skipped}`}
            detail="planned / done / skipped"
            tone="text-violet-300"
          />
          <OverviewMetric
            icon={CheckCircle2}
            label="Habits"
            value={healthLoading ? '...' : `${completedHabitCount}/5`}
            detail={todaysHealthLog ? 'completed today' : 'no health log today'}
            tone={completedHabitCount >= 3 ? 'text-emerald-300' : 'text-amber-300'}
          />
          <OverviewMetric
            icon={Dumbbell}
            label="Workout"
            value={workoutsLoading ? '...' : workoutStatus.value}
            detail={workoutStatus.detail}
            tone={workoutStatus.tone}
          />
          <OverviewMetric
            icon={CircleDollarSign}
            label="Spend Today"
            value={expensesLoading ? '...' : `EUR ${formatMoney(todaySpend)}`}
            detail={todaysExpenses.length ? `${todaysExpenses.length} expense${todaysExpenses.length === 1 ? '' : 's'}` : 'no expenses today'}
            tone={todaysExpenses.length ? 'text-amber-300' : 'text-zinc-100'}
          />
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-7">
        <PanelHeader eyebrow="Today" title="Today Agenda" />
        <div className="space-y-2 p-3">
          {calendarLoading ? (
            <LoadingState label="Loading today..." />
          ) : shownAgenda.length ? (
            <>
              {shownAgenda.map((event) => (
                <AgendaRow key={event.id} event={event} />
              ))}
              {agendaMoreCount > 0 ? <p className="data-text px-1 text-[11px] text-zinc-500">+{agendaMoreCount} more today</p> : null}
            </>
          ) : isResolvedStatus(calendarEventsStatus) ? (
            <EmptyState title="No events planned today." body="Calendar is clear for this selected day." />
          ) : (
            <LoadingState label="Loading today..." />
          )}
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-5">
        <PanelHeader eyebrow="Health" title="Daily Habits" right={<span className="data-text text-[11px] text-emerald-300">{completedHabitCount}/5</span>} />
        <div className="grid gap-3 p-3">
          {healthLoading ? (
            <LoadingState label="Loading habits..." />
          ) : (
            <>
              {!todaysHealthLog ? <EmptyState title="No health log today." body="Habits start at zero until today is logged." /> : null}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-2 2xl:grid-cols-5">
                {habits.map((habit) => (
                  <HabitPill key={habit.id} habit={habit} value={normalizedHabits[habit.id]} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <IconMetric icon={Moon} label="Sleep" value={formatWithUnit(todaysHealthLog?.sleep_hours, 'h')} tone="text-cyan-300" />
                <IconMetric icon={Activity} label="Energy" value={formatNumber(todaysHealthLog?.energy)} tone="text-amber-300" />
                <IconMetric icon={Coffee} label="Coffee" value={formatNumber(todaysHealthLog?.coffee)} tone="text-amber-300" />
                <IconMetric icon={Ban} label="ADC" value={formatNumber(todaysHealthLog?.adc)} tone="text-red-300" />
              </div>
            </>
          )}
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-6">
        <PanelHeader eyebrow="Training" title="Training Status" />
        <div className="grid gap-3 p-3">
          {workoutsLoading ? (
            <LoadingState label="Loading training..." />
          ) : todaysWorkoutSessions.length || liveWorkout ? (
            <>
              <div className="rounded-md border border-white/5 bg-black/25 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={liveWorkout ? 'red' : 'emerald'}>{liveWorkout ? 'LIVE' : 'TRAINED'}</Tag>
                  <span className="data-text text-[11px] text-zinc-500">{today}</span>
                </div>
                <h3 className="mt-2 truncate text-base font-semibold text-zinc-100" title={liveWorkout?.name ?? latestTodayWorkout?.name}>
                  {liveWorkout?.name ?? latestTodayWorkout?.name ?? 'Workout'}
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {todaysWorkoutSessions.length} session{todaysWorkoutSessions.length === 1 ? '' : 's'} today
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniMetric label="Working Sets" value={todayWorkoutMetrics.setCount} tone="text-cyan-300" sub="warmups excluded" />
                <MiniMetric label="Volume" value={formatCompact(todayWorkoutMetrics.volume)} tone="text-emerald-300" sub="kg total" />
                <MiniMetric label="Exercises" value={todayWorkoutMetrics.exerciseCount} tone="text-amber-300" sub="unique" />
              </div>
            </>
          ) : isResolvedStatus(workoutSessionsStatus) ? (
            <EmptyState title="No workout today." body="Training status will update after a session starts or finishes." />
          ) : (
            <LoadingState label="Loading training..." />
          )}
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-6">
        <PanelHeader eyebrow="Finance" title="Money Snapshot" />
        <div className="grid gap-3 p-3">
          {monthLoading ? <LoadingState label="Loading money snapshot..." /> : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniMetric label="Today" value={`EUR ${formatMoney(todaySpend)}`} tone="text-cyan-300" sub={todaysExpenses.length ? `${todaysExpenses.length} logged` : 'none'} />
            <MiniMetric label="Month" value={`EUR ${formatMoney(currentMonthSpend)}`} tone="text-emerald-300" sub={formatMonth(today)} />
            <MiniMetric
              label="Top Category"
              value={topCategory ? truncateText(topCategory.category, 16) : '--'}
              tone={topCategory ? 'text-amber-300' : 'text-zinc-100'}
              sub={topCategory ? `EUR ${formatMoney(topCategory.total)}` : 'none yet'}
            />
            <MiniMetric
              label="Latest"
              value={latestExpense ? truncateText(latestExpense.vendor, 16) : '--'}
              tone={latestExpense ? 'text-zinc-100' : 'text-zinc-500'}
              sub={latestExpense ? `EUR ${formatMoney(latestExpense.amount)}` : 'no expenses'}
            />
          </div>
          {monthlyExpensesError ? <p className="data-text text-[11px] text-red-300">{monthlyExpensesError}</p> : null}
        </div>
      </Panel>

      <Panel className="col-span-12">
        <PanelHeader eyebrow="AI" title="Recent AI Activity" right={<History size={16} className="text-violet-300" />} />
        <div className="grid gap-2 p-3">
          {isInitialLoading(aiActionLogsStatus, aiActionLogs) ? (
            <LoadingState label="Loading recent AI actions..." />
          ) : aiActionLogs.length ? (
            <div className="grid gap-2 lg:grid-cols-2">
              <AiActionHistoryList logs={aiActionLogs.slice(0, 5)} status={aiActionLogsStatus} limit={5} />
            </div>
          ) : (
            <EmptyState title="No AI actions yet." body="AI and Shortcut writes will appear here after they run." />
          )}
        </div>
      </Panel>
    </div>
  );
}

function OverviewMetric({ detail, icon: Icon, label, tone, value }) {
  return (
    <div className="min-w-0 rounded-md border border-white/5 bg-black/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
        <Icon size={15} className={tone} />
      </div>
      <p className={`data-text mt-2 truncate text-xl font-black uppercase ${tone}`} title={String(value)}>
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-500" title={detail}>{detail}</p>
    </div>
  );
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

function HabitPill({ habit, value }) {
  const complete = isHabitComplete(value, habit);
  return (
    <div className={`min-w-0 rounded-md border p-2 ${complete ? 'border-emerald-400/15 bg-emerald-400/[0.06]' : 'border-white/5 bg-black/25'}`}>
      <p className="truncate text-[10px] uppercase tracking-wider text-zinc-500">{habit.label}</p>
      <p className={`data-text mt-1 text-lg font-bold ${complete ? 'text-emerald-300' : 'text-zinc-300'}`}>
        {habit.type === 'boolean' ? (value ? 'Yes' : 'No') : Number(value ?? 0)}
      </p>
    </div>
  );
}

function IconMetric({ icon: Icon, label, tone, value }) {
  return (
    <div className="min-w-0 rounded-md border border-white/5 bg-black/25 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
        <Icon size={14} className={tone} />
      </div>
      <p className={`data-text truncate text-lg font-bold ${tone}`}>{value ?? '--'}</p>
    </div>
  );
}

function EmptyState({ body, title }) {
  return (
    <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-3">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">{body}</p>
    </div>
  );
}

function LoadingState({ label }) {
  return (
    <div className="rounded-md border border-cyan-400/10 bg-cyan-400/[0.03] p-3">
      <p className="data-text text-sm font-medium text-cyan-300">{label}</p>
    </div>
  );
}

function getAgendaCounts(events) {
  return events.reduce((counts, event) => {
    const status = event.status ?? 'planned';
    if (status === 'planned') counts.planned += 1;
    if (status === 'done') counts.done += 1;
    if (status === 'skipped') counts.skipped += 1;
    if (status === 'cancelled') counts.cancelled += 1;
    return counts;
  }, { planned: 0, done: 0, skipped: 0, cancelled: 0 });
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

function getWorkoutStatus(liveWorkout, todaysWorkoutSessions) {
  if (liveWorkout) return { value: 'Live', tone: 'text-red-300', detail: truncateText(liveWorkout.name, 28) };
  if (todaysWorkoutSessions.length) return { value: 'Completed', tone: 'text-emerald-300', detail: `${todaysWorkoutSessions.length} session${todaysWorkoutSessions.length === 1 ? '' : 's'} today` };
  return { value: 'None', tone: 'text-zinc-100', detail: 'no workout today' };
}

function getWorkoutMetrics(sessions) {
  const sets = sessions.flatMap((session) => session.workout_sets ?? []).filter((set) => !set.is_warmup);
  const volume = sets.reduce((sum, set) => sum + Number(set.weight ?? 0) * Number(set.reps ?? 0), 0);
  const exerciseCount = new Set(sets.map((set) => set.exercise).filter(Boolean)).size;
  return { exerciseCount, setCount: sets.length, volume };
}

function normalizeHabits(items = []) {
  const safeItems = Array.isArray(items) ? items : [];
  const byId = new Map(safeItems.map((item) => [item.id, item]));
  return habits.reduce((acc, habit) => {
    const item = byId.get(habit.id) ?? {};
    if (habit.type === 'boolean') {
      acc[habit.id] = Boolean(item.done) || Number(item.count ?? 0) > 0;
    } else {
      acc[habit.id] = Math.max(0, Math.trunc(Number(item.count ?? (item.done ? 1 : 0)) || 0));
    }
    return acc;
  }, {});
}

function isHabitComplete(value, habit) {
  return habit.type === 'boolean' ? Boolean(value) : Number(value ?? 0) > 0;
}

function buildCategorySpend(expenses) {
  const totals = new Map();
  expenses.forEach((expense) => {
    const category = expense.category || 'Uncategorized';
    totals.set(category, (totals.get(category) ?? 0) + Number(expense.amount ?? 0));
  });
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

function sumExpenses(expenses) {
  return expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
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

function formatTime(value) {
  return String(value ?? '').slice(0, 5);
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value ?? '00:00').split(':').map(Number);
  return hours * 60 + minutes;
}

function formatMoney(value) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function isInitialLoading(status, rows) {
  return (status === 'idle' || status === 'loading') && rows.length === 0;
}

function isResolvedStatus(status) {
  return ['ready', 'error', 'not-configured', 'no-session'].includes(status);
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
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getMonthRange(dateValue) {
  const [year, month] = dateValue.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function formatDate(dateValue) {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatMonth(dateValue) {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}
