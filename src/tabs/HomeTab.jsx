import {
  Activity,
  Ban,
  CheckCircle2,
  CircleDollarSign,
  Dumbbell,
  Coffee,
  Moon,
  ReceiptText,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis } from 'recharts';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';

export function HomeTab() {
  const {
    activeWorkoutSession,
    expenses,
    expensesStatus,
    healthLogs,
    healthLogsStatus,
    loadExpenseMonth,
    monthlyExpenses,
    monthlyExpensesError,
    monthlyExpensesStatus,
    workoutSessions,
    workoutSessionsStatus,
  } = useLifeOS();

  const today = getToday();
  const monthRange = useMemo(() => getMonthRange(today), [today]);
  const healthLoading = isLoadingStatus(healthLogsStatus);
  const workoutsLoading = isLoadingStatus(workoutSessionsStatus);
  const expensesLoading = isLoadingStatus(expensesStatus);
  const monthlyExpensesLoading = isLoadingStatus(monthlyExpensesStatus);
  const healthInitialLoading = healthLoading && healthLogs.length === 0;
  const workoutsInitialLoading = workoutsLoading && workoutSessions.length === 0;
  const expensesInitialLoading = expensesLoading && expenses.length === 0;
  const healthReady = isResolvedStatus(healthLogsStatus);
  const workoutsReady = isResolvedStatus(workoutSessionsStatus);
  const expensesReady = isResolvedStatus(expensesStatus);
  const monthlyExpensesReady = isResolvedStatus(monthlyExpensesStatus);

  useEffect(() => {
    loadExpenseMonth(monthRange.start, monthRange.end);
  }, [loadExpenseMonth, monthRange.end, monthRange.start]);

  const todaysHealthLog = useMemo(
    () => healthLogs.find((log) => log.logged_on === today) ?? null,
    [healthLogs, today],
  );
  const todaysWorkoutSessions = useMemo(
    () => workoutSessions.filter((session) => session.performed_on === today),
    [today, workoutSessions],
  );
  const liveWorkout = todaysWorkoutSessions.find((session) => !session.ended_at) ?? null;
  const latestTodayWorkout = todaysWorkoutSessions[0] ?? null;
  const endedWorkout = todaysWorkoutSessions.find((session) => session.ended_at) ?? null;
  const latestWorkout = workoutSessions[0] ?? null;
  const workoutForSummary = liveWorkout ?? latestTodayWorkout ?? activeWorkoutSession ?? latestWorkout;
  const workoutMetrics = getWorkoutMetrics(workoutForSummary);

  const todaysExpenses = useMemo(
    () => expenses.filter((expense) => expense.spent_on === today),
    [expenses, today],
  );
  const currentMonthExpenses = useMemo(
    () => monthlyExpenses.filter((expense) => expense.spent_on >= monthRange.start && expense.spent_on < monthRange.end),
    [monthRange.end, monthRange.start, monthlyExpenses],
  );
  const monthlyExpensesInitialLoading = monthlyExpensesLoading && currentMonthExpenses.length === 0;
  const todaySpend = sumExpenses(todaysExpenses);
  const currentMonthSpend = sumExpenses(currentMonthExpenses);
  const categorySpend = useMemo(() => buildCategorySpend(currentMonthExpenses), [currentMonthExpenses]);
  const topCategory = categorySpend[0] ?? null;
  const latestExpenses = expenses.slice(0, 5);
  const latestHealthLog = healthLogs[0] ?? null;

  const workoutStatus = getWorkoutStatus(liveWorkout, endedWorkout, todaysWorkoutSessions.length);

  return (
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-hidden">
      <Panel className="col-span-12">
        <PanelHeader
          eyebrow="Daily Pulse"
          title="Today Status"
          right={<span className="data-text text-[11px] text-zinc-500">{formatDate(today)}</span>}
        />
        <div className="grid gap-2 p-3 sm:grid-cols-3">
          <StatusCard
            icon={CheckCircle2}
            label="Health"
            value={todaysHealthLog ? 'Logged' : 'Missing'}
            tone={todaysHealthLog ? 'text-emerald-300' : 'text-amber-300'}
            detail={getTodayHealthDetail(todaysHealthLog, healthInitialLoading, healthReady)}
            loading={healthInitialLoading}
          />
          <StatusCard
            icon={Dumbbell}
            label="Workout"
            value={workoutStatus.value}
            tone={workoutStatus.tone}
            detail={workoutStatus.detail}
            loading={workoutsInitialLoading}
          />
          <StatusCard
            icon={CircleDollarSign}
            label="Spend"
            value={`EUR ${formatMoney(todaySpend)}`}
            tone={todaysExpenses.length ? 'text-amber-300' : 'text-zinc-100'}
            detail={getTodaySpendDetail(todaysExpenses, expensesInitialLoading, expensesReady)}
            loading={expensesInitialLoading}
          />
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-7">
        <PanelHeader
          eyebrow="Training"
          title="Workout Summary"
          right={<SourceStatus status={workoutSessionsStatus} />}
        />
        <div className="grid gap-3 p-3 md:grid-cols-[1fr_260px]">
          <div className="min-w-0 rounded-md border border-white/5 bg-black/25 p-3">
            {workoutsInitialLoading ? (
              <LoadingState title="Loading workouts" body="Syncing persisted workout sessions." />
            ) : workoutForSummary ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={workoutForSummary.ended_at ? 'emerald' : 'red'}>
                    {workoutForSummary.ended_at ? 'ENDED' : 'LIVE'}
                  </Tag>
                  <span className="data-text text-[11px] text-zinc-500">{workoutForSummary.performed_on}</span>
                </div>
                <h3 className="mt-2 truncate text-lg font-semibold text-zinc-100" title={workoutForSummary.name}>{workoutForSummary.name}</h3>
                <p className="mt-1 truncate text-sm text-zinc-500" title={workoutForSummary.notes || ''}>{workoutForSummary.notes || 'No session notes.'}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniMetric label="Sets" value={workoutMetrics.setCount} tone="text-cyan-300" sub="persisted" />
                  <MiniMetric label="Volume" value={formatCompact(workoutMetrics.volume)} tone="text-emerald-300" sub="kg total" />
                  <MiniMetric label="Exercises" value={workoutMetrics.exerciseCount} tone="text-amber-300" sub="unique" />
                </div>
              </>
            ) : workoutsReady ? (
              <EmptyState title="No workout logged yet." body="Start a workout session to populate this summary." />
            ) : (
              <LoadingState title="Workout status pending" body="Waiting for persisted workout data." />
            )}
          </div>

          <div className="grid gap-2">
            <MiniMetric
              label="Active Session"
              value={activeWorkoutSession && !activeWorkoutSession.ended_at ? truncateText(activeWorkoutSession.name, 18) : '--'}
              tone={activeWorkoutSession && !activeWorkoutSession.ended_at ? 'text-red-300' : 'text-zinc-100'}
              sub={activeWorkoutSession && !activeWorkoutSession.ended_at ? 'in progress' : 'none live'}
            />
            <MiniMetric
              label="Latest Session"
              value={latestWorkout?.name ? truncateText(latestWorkout.name, 18) : '--'}
              tone="text-zinc-100"
              sub={latestWorkout ? latestWorkout.performed_on : 'no persisted sessions'}
            />
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-5">
        <PanelHeader eyebrow="Health" title="Latest Check-In" right={<SourceStatus status={healthLogsStatus} />} />
        <div className="grid gap-3 p-3">
          {healthInitialLoading ? (
            <LoadingState title="Loading health logs" body="Syncing persisted health check-ins." />
          ) : latestHealthLog ? (
            <>
              <div className="flex items-center justify-between gap-2 rounded-md border border-white/5 bg-black/25 p-3">
                <div className="min-w-0">
                  <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">Logged On</p>
                  <p className="data-text text-lg font-bold text-zinc-100">{latestHealthLog.logged_on}</p>
                </div>
                <Tag tone={latestHealthLog.logged_on === today ? 'emerald' : 'zinc'}>
                  {latestHealthLog.logged_on === today ? 'TODAY' : 'LATEST'}
                </Tag>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <IconMetric icon={Moon} label="Sleep" value={formatWithUnit(latestHealthLog.sleep_hours, 'h')} tone="text-cyan-300" />
                <IconMetric icon={Activity} label="Energy" value={formatNumber(latestHealthLog.energy)} tone="text-amber-300" />
                <IconMetric icon={Coffee} label="Coffee" value={formatNumber(latestHealthLog.coffee)} tone="text-amber-300" />
                <IconMetric icon={Ban} label="ADC" value={formatNumber(latestHealthLog.adc)} tone="text-red-300" />
              </div>
            </>
          ) : healthReady ? (
            <EmptyState title="No health logs yet." body="Save a daily Health check-in to populate this panel." />
          ) : (
            <LoadingState title="Health status pending" body="Waiting for persisted health data." />
          )}
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-7">
        <PanelHeader
          eyebrow="Ledger"
          title="Current Month Finance"
          right={<SourceStatus status={monthlyExpensesStatus} />}
        />
        <div className="grid gap-3 p-3 lg:grid-cols-[1fr_260px]">
          <div className="min-w-0">
            <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">Current Month Spend</p>
            <p className="data-text text-4xl font-black leading-none text-emerald-300 sm:text-5xl">
              EUR {formatMoney(currentMonthSpend)}
            </p>
            <p className="data-text mt-2 text-[11px] text-zinc-500">
              {getMonthSpendDetail(monthlyExpenses, monthlyExpensesInitialLoading, monthlyExpensesReady, today)}
            </p>
            {monthlyExpensesError ? <p className="data-text mt-2 text-[11px] text-red-300">{monthlyExpensesError}</p> : null}
          </div>
          <div className="grid gap-2">
            <MiniMetric
              label="Top Category"
              value={topCategory ? truncateText(topCategory.category, 18) : '--'}
              tone={topCategory ? 'text-amber-300' : 'text-zinc-100'}
              sub={topCategory ? `EUR ${formatMoney(topCategory.total)}` : 'none yet'}
            />
            <MiniMetric label="Today" value={`EUR ${formatMoney(todaySpend)}`} tone="text-cyan-300" sub={`${todaysExpenses.length} expenses`} />
          </div>
          <div className="lg:col-span-2">
            {monthlyExpensesInitialLoading ? (
              <LoadingState title="Loading monthly expenses" body="Syncing current-month ledger rows." />
            ) : categorySpend.length ? (
              <div className="h-40 rounded-md border border-white/5 bg-black/25 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categorySpend.slice(0, 6)} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                    <XAxis
                      dataKey="category"
                      tick={{ fill: '#71717a', fontSize: 10 }}
                      axisLine={false}
                      tickFormatter={(value) => truncateText(value, 8)}
                      tickLine={false}
                    />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {categorySpend.slice(0, 6).map((item, index) => (
                        <Cell key={item.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : monthlyExpensesReady ? (
              <EmptyState title="No expenses this month." body="Create an expense in Finances to populate spend by category." />
            ) : (
              <LoadingState title="Monthly ledger pending" body="Waiting for persisted expense data." />
            )}
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-5">
        <PanelHeader eyebrow="Ledger" title="Latest Expenses" right={<ReceiptText size={16} className="text-amber-300" />} />
        <div className="space-y-2 p-3">
          {expensesInitialLoading ? (
            <LoadingState title="Loading expenses" body="Syncing latest persisted ledger rows." />
          ) : latestExpenses.length ? (
            latestExpenses.map((expense) => (
              <div key={expense.id} className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-black/25 p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100" title={expense.vendor}>{expense.vendor}</p>
                  <p className="truncate data-text text-[10px] text-zinc-500" title={`${expense.spent_on} / ${expense.category}`}>
                    {expense.spent_on} / {expense.category}
                  </p>
                </div>
                <span className="data-text shrink-0 text-sm font-bold text-zinc-100">EUR {formatMoney(expense.amount)}</span>
              </div>
            ))
          ) : expensesReady ? (
            <EmptyState title="No persisted expenses yet." body="Add expenses in Finances to populate recent activity." />
          ) : (
            <LoadingState title="Expense status pending" body="Waiting for persisted ledger data." />
          )}
        </div>
      </Panel>
    </div>
  );
}

function StatusCard({ detail, icon: Icon, label, loading, tone, value }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
        <Icon size={16} className={tone} />
      </div>
      <p className={`data-text mt-2 text-2xl font-black uppercase ${tone}`}>{loading ? '...' : value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function IconMetric({ icon: Icon, label, tone, value }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/25 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
        <Icon size={14} className={tone} />
      </div>
      <p className={`data-text text-xl font-bold ${tone}`}>{value ?? '--'}</p>
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

function LoadingState({ body, title }) {
  return (
    <div className="rounded-md border border-cyan-400/10 bg-cyan-400/[0.03] p-3">
      <p className="data-text text-sm font-medium text-cyan-300">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">{body}</p>
    </div>
  );
}

function SourceStatus({ status }) {
  const tone = status === 'ready' ? 'text-emerald-300' : status === 'loading' ? 'text-cyan-300' : 'text-zinc-500';
  return <span className={`data-text text-[10px] uppercase tracking-wider ${tone}`}>{status}</span>;
}

function getWorkoutStatus(liveWorkout, endedWorkout, todayCount) {
  if (liveWorkout) {
    return { value: 'Live', tone: 'text-red-300', detail: `${liveWorkout.name} is active.` };
  }
  if (endedWorkout) {
    return { value: 'Ended', tone: 'text-emerald-300', detail: `${todayCount} workout session${todayCount === 1 ? '' : 's'} today.` };
  }
  return { value: 'None', tone: 'text-zinc-100', detail: 'No workout logged today.' };
}

function getTodayHealthDetail(log, loading, ready) {
  if (loading) return 'Syncing persisted health logs.';
  if (log) return `${formatWithUnit(log.sleep_hours, 'h')} sleep / energy ${formatNumber(log.energy)}`;
  return ready ? 'No health log yet today.' : 'Waiting for persisted health data.';
}

function getTodaySpendDetail(expenses, loading, ready) {
  if (loading) return 'Syncing persisted expense rows.';
  if (expenses.length) return `${expenses.length} expenses today`;
  return ready ? 'No expenses logged today.' : 'Waiting for persisted expense data.';
}

function getMonthSpendDetail(expenses, loading, ready, today) {
  if (loading) return `Loading ${formatMonth(today)} expenses.`;
  if (expenses.length) return `${expenses.length} persisted expenses / ${formatMonth(today)}`;
  return ready ? 'No expenses this month.' : 'Waiting for monthly expense data.';
}

function getWorkoutMetrics(session) {
  const sets = (session?.workout_sets ?? []).filter((set) => !set.is_warmup);
  const volume = sets.reduce((sum, set) => sum + Number(set.weight ?? 0) * Number(set.reps ?? 0), 0);
  const exerciseCount = new Set(sets.map((set) => set.exercise).filter(Boolean)).size;
  return { exerciseCount, setCount: sets.length, volume };
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

function isLoadingStatus(status) {
  return status === 'idle' || status === 'loading';
}

function isResolvedStatus(status) {
  return ['ready', 'error', 'not-configured', 'no-session'].includes(status);
}

function truncateText(value, maxLength) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
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

const CATEGORY_COLORS = ['#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#71717a'];
