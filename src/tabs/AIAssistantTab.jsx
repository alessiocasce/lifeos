import { Bot, CalendarDays, ClipboardCheck, Dumbbell, Loader2, Plus, Save, Send, Sparkles, Trash2, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';
import { sendLifeOSAiMessage } from '../services/aiApi';

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (reviewOn = today()) => ({
  review_on: reviewOn,
  wins: '',
  risks: '',
  next_actions: [''],
  score: '',
});

const assistantPrompts = [
  'How have I been doing in the last 30 days?',
  'Analyze my expenses in the last 3 months.',
  'Am I progressing in workouts?',
  'Plan a more productive day for tomorrow.',
  'Add a 25 dollar expense for ChatGPT Plus.',
];

const calloutStyles = {
  good: {
    label: 'Signal',
    shell: 'border-emerald-400/25 bg-emerald-400/[0.08]',
    labelClass: 'text-emerald-300',
  },
  warn: {
    label: 'Caution',
    shell: 'border-amber-400/25 bg-amber-400/[0.08]',
    labelClass: 'text-amber-300',
  },
  bad: {
    label: 'Risk',
    shell: 'border-red-400/25 bg-red-400/[0.08]',
    labelClass: 'text-red-300',
  },
  info: {
    label: 'Info',
    shell: 'border-cyan-400/20 bg-cyan-400/[0.07]',
    labelClass: 'text-cyan-300',
  },
  action: {
    label: 'Action',
    shell: 'border-violet-400/25 bg-violet-400/[0.08]',
    labelClass: 'text-violet-300',
  },
};

const markdownComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-50">{children}</strong>,
  em: ({ children }) => <em className="italic text-zinc-200">{children}</em>,
  ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  pre: ({ children }) => (
    <pre className="my-2 max-w-full overflow-x-auto rounded-md border border-white/10 bg-black/50 p-3 text-xs leading-5 text-zinc-200">
      {children}
    </pre>
  ),
  code: ({ inline, children, node, ...props }) => {
    if (inline) {
      return (
        <code className="rounded border border-white/10 bg-white/[0.06] px-1 py-0.5 text-[0.9em] text-cyan-100" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="block min-w-0 whitespace-pre text-xs text-zinc-200" {...props}>
        {children}
      </code>
    );
  },
  a: ({ href, children }) => {
    const safeHref = getSafeHref(href);
    if (!safeHref) return <span>{children}</span>;
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan-300 underline decoration-cyan-400/30 underline-offset-2 hover:text-cyan-200"
      >
        {children}
      </a>
    );
  },
};

const markdownElements = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'a', 'br'];

export function AIAssistantTab() {
  const {
    dailyReviews,
    dailyReviewsError,
    dailyReviewsStatus,
    healthLogs,
    healthLogsStatus,
    loadCalendarRange,
    loadExpenseMonth,
    loadExpenseRange,
    reloadExpenses,
    reloadHealthLogs,
    saveDailyReview,
    workoutSessions,
    workoutSessionsStatus,
  } = useLifeOS();

  const [selectedDate, setSelectedDate] = useState(today());
  const selectedReview = useMemo(
    () => dailyReviews.find((review) => review.review_on === selectedDate) ?? null,
    [dailyReviews, selectedDate],
  );
  const [form, setForm] = useState(emptyForm(selectedDate));
  const [formError, setFormError] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [dateExpenses, setDateExpenses] = useState([]);
  const [dateExpensesStatus, setDateExpensesStatus] = useState('idle');
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState([]);
  const [aiStatus, setAiStatus] = useState('idle');
  const [aiError, setAiError] = useState(null);

  useEffect(() => {
    setForm(reviewToForm(selectedReview, selectedDate));
    setFormError('');
  }, [selectedDate, selectedReview]);

  useEffect(() => {
    let active = true;
    const nextDay = addDays(selectedDate, 1);
    setDateExpensesStatus('loading');
    loadExpenseRange(selectedDate, nextDay)
      .then((rows) => {
        if (!active) return;
        setDateExpenses(rows);
        setDateExpensesStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setDateExpenses([]);
        setDateExpensesStatus('error');
      });
    return () => {
      active = false;
    };
  }, [loadExpenseRange, selectedDate]);

  const selectedHealthLog = useMemo(
    () => healthLogs.find((log) => log.logged_on === selectedDate) ?? null,
    [healthLogs, selectedDate],
  );
  const selectedWorkouts = useMemo(
    () => workoutSessions.filter((session) => session.performed_on === selectedDate),
    [selectedDate, workoutSessions],
  );
  const workoutSummary = useMemo(() => buildWorkoutSummary(selectedWorkouts), [selectedWorkouts]);
  const expenseTotal = useMemo(() => sumExpenses(dateExpenses), [dateExpenses]);
  const recentReviews = useMemo(() => sortReviews(dailyReviews).slice(0, 8), [dailyReviews]);
  const isToday = selectedDate === today();
  const reviewsLoading = isLoadingStatus(dailyReviewsStatus);
  const reviewsInitialLoading = reviewsLoading && dailyReviews.length === 0;
  const reviewsResolved = isResolvedStatus(dailyReviewsStatus);
  const titleMode = reviewsInitialLoading
    ? 'Loading Review'
    : selectedReview
      ? (isToday ? 'Update Today' : 'Update Selected Date')
      : (isToday ? 'Create Today' : 'Create Selected Date');

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError('');
  };

  const updateAction = (index, value) => {
    setForm((prev) => ({
      ...prev,
      next_actions: prev.next_actions.map((action, actionIndex) => (actionIndex === index ? value : action)),
    }));
    setFormError('');
  };

  const addAction = () => {
    setForm((prev) => ({ ...prev, next_actions: [...prev.next_actions, ''] }));
  };

  const removeAction = (index) => {
    setForm((prev) => ({
      ...prev,
      next_actions: prev.next_actions.length === 1
        ? ['']
        : prev.next_actions.filter((_, actionIndex) => actionIndex !== index),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaveStatus('saving');
    setFormError('');
    try {
      const saved = await saveDailyReview({
        review_on: form.review_on,
        wins: form.wins,
        risks: form.risks,
        score: form.score,
        next_actions: form.next_actions,
      });
      setSelectedDate(saved.review_on);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1400);
    } catch (error) {
      setFormError(error.message || 'Failed to save daily review.');
      setSaveStatus('idle');
    }
  };

  const submitAiMessage = async (event) => {
    event.preventDefault();
    const message = aiInput.trim();
    if (!message) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    };
    setAiMessages((prev) => [...prev, userMessage]);
    setAiInput('');
    setAiError(null);
    setAiStatus('loading');

    try {
      const result = await sendLifeOSAiMessage(message);
      setAiMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.answer,
          actions: result.actions ?? [],
          plan: result.plan,
        },
      ]);
      await refreshAfterAiActions(result.actions ?? []);
      setAiStatus('idle');
    } catch (error) {
      setAiError({
        message: error.message || 'LifeOS assistant failed.',
        requestId: error.requestId,
        providerStatus: error.providerStatus,
        providerMessage: error.providerMessage,
      });
      setAiStatus('idle');
    }
  };

  const refreshAfterAiActions = async (actions) => {
    if (!actions.length) return;
    const types = new Set(actions.map((action) => action.type));
    const tasks = [];
    if (types.has('create_expense')) {
      tasks.push(reloadExpenses?.());
      tasks.push(loadExpenseMonth?.(monthStart(today())));
    }
    if (types.has('update_health_log')) {
      tasks.push(reloadHealthLogs?.());
    }
    if (types.has('create_calendar_event') || types.has('analyze_and_plan')) {
      tasks.push(loadCalendarRange?.(today(), addDays(today(), 45)));
    }
    await Promise.allSettled(tasks.filter(Boolean));
  };

  return (
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-hidden pb-3">
      <Panel className="col-span-12">
        <PanelHeader
          eyebrow="LifeOS AI"
          title="Ask LifeOS"
          right={<Sparkles size={16} className="text-cyan-300" />}
        />
        <div className="grid gap-3 p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <form onSubmit={submitAiMessage} className="grid gap-2">
              <textarea
                rows={3}
                value={aiInput}
                onChange={(event) => {
                  setAiInput(event.target.value);
                  setAiError(null);
                }}
                placeholder="Type a LifeOS request..."
                className="min-h-28 w-full resize-y rounded-md border border-white/10 bg-black/40 px-3 py-3 text-base leading-6 text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-400/40"
              />
              <button
                type="submit"
                disabled={aiStatus === 'loading' || !aiInput.trim()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600 md:w-fit"
              >
                {aiStatus === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {aiStatus === 'loading' ? 'Thinking' : 'Send'}
              </button>
            </form>
            <div className="grid content-start gap-2 md:w-72">
              {assistantPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setAiInput(prompt)}
                  className="rounded-md border border-white/5 bg-black/25 px-3 py-2 text-left text-xs text-zinc-300 hover:border-cyan-400/20 hover:text-cyan-200"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {aiError ? <AssistantError error={aiError} /> : null}

          <div className="grid gap-2">
            {aiMessages.length ? (
              aiMessages.slice(-8).map((message) => <AssistantMessage key={message.id} message={message} />)
            ) : (
              <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-3">
                <p className="text-sm font-medium text-zinc-100">No assistant messages yet.</p>
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-8">
        <PanelHeader
          eyebrow="Daily Review"
          title={titleMode}
          right={<SourceStatus status={dailyReviewsStatus} />}
        />
        <form onSubmit={submit} className="grid gap-3 p-3">
          <div className="grid gap-2 sm:grid-cols-[220px_1fr]">
            <label className="rounded-md border border-white/5 bg-black/25 p-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Review Date</span>
              <input
                type="date"
                value={form.review_on}
                onChange={(event) => {
                  setSelectedDate(event.target.value || today());
                  updateForm('review_on', event.target.value || today());
                }}
                className="data-text mt-1 w-full bg-transparent text-base font-semibold text-zinc-100 outline-none"
              />
            </label>
            <label className="rounded-md border border-white/5 bg-black/25 p-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Score Optional / 1-100</span>
              <input
                inputMode="numeric"
                placeholder="82"
                value={form.score}
                onChange={(event) => updateForm('score', event.target.value)}
                className="data-text mt-1 w-full bg-transparent text-base font-semibold text-zinc-100 outline-none placeholder:text-zinc-700"
              />
            </label>
          </div>

          {reviewsInitialLoading ? (
            <LoadingCard label="Loading selected review from Supabase" />
          ) : null}

          <label className="rounded-md border border-white/5 bg-black/25 p-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Wins</span>
            <textarea
              rows={5}
              value={form.wins}
              onChange={(event) => updateForm('wins', event.target.value)}
              placeholder="What moved today?"
              className="mt-2 min-h-28 w-full resize-y bg-transparent text-base leading-6 text-zinc-100 outline-none placeholder:text-zinc-700 sm:min-h-32"
            />
          </label>

          <label className="rounded-md border border-white/5 bg-black/25 p-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Risks</span>
            <textarea
              rows={4}
              value={form.risks}
              onChange={(event) => updateForm('risks', event.target.value)}
              placeholder="What needs containment tomorrow?"
              className="mt-2 min-h-24 w-full resize-y bg-transparent text-base leading-6 text-zinc-100 outline-none placeholder:text-zinc-700 sm:min-h-28"
            />
          </label>

          <div className="rounded-md border border-white/5 bg-black/25 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Next Actions</span>
              <button
                type="button"
                onClick={addAction}
                className="inline-flex h-9 items-center gap-1 rounded border border-cyan-400/20 bg-cyan-400/10 px-2 text-xs text-cyan-300"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
            <div className="grid gap-2">
              {form.next_actions.map((action, index) => (
                <div key={index} className="grid grid-cols-[1fr_40px] gap-2">
                  <input
                    value={action}
                    onChange={(event) => updateAction(index, event.target.value)}
                    placeholder={`Action ${index + 1}`}
                    className="rounded border border-white/10 bg-black px-2 py-2 text-base text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-400/40"
                  />
                  <button
                    type="button"
                    onClick={() => removeAction(index)}
                    className="grid h-10 w-10 place-items-center rounded border border-red-400/20 bg-red-400/10 text-red-300"
                    title="Remove action"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {formError ? <p className="data-text text-[11px] text-red-300">{formError}</p> : null}
          {dailyReviewsError ? <p className="data-text text-[11px] text-red-300">{dailyReviewsError}</p> : null}

          <button
            type="submit"
            disabled={saveStatus === 'saving'}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
          >
            {saveStatus === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saveStatus === 'saving' ? 'Saving Review' : saveStatus === 'saved' ? 'Saved' : 'Save Review'}
          </button>
        </form>
      </Panel>

      <Panel className="col-span-12 xl:col-span-4">
        <PanelHeader eyebrow="Persisted Context" title="Selected Date" right={<CalendarDays size={16} className="text-cyan-300" />} />
        <div className="grid gap-2 p-3">
          <ContextHealth log={selectedHealthLog} status={healthLogsStatus} />
          <ContextWorkout status={workoutSessionsStatus} summary={workoutSummary} />
          <ContextExpenses count={dateExpenses.length} status={dateExpensesStatus} total={expenseTotal} />
        </div>
      </Panel>

      <Panel className="col-span-12">
        <PanelHeader eyebrow="Review Archive" title="Recent Persisted Reviews" />
        <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4">
          {reviewsInitialLoading ? (
            <LoadingCard label="Loading reviews" />
          ) : recentReviews.length ? (
            recentReviews.map((review) => (
              <button
                key={review.id}
                type="button"
                onClick={() => setSelectedDate(review.review_on)}
                className={`min-w-0 rounded-md border p-3 text-left ${
                  review.review_on === selectedDate
                    ? 'border-cyan-400/30 bg-cyan-400/10'
                    : 'border-white/5 bg-black/25 hover:border-white/10'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="data-text text-[11px] font-bold text-zinc-100">{review.review_on}</span>
                  {review.score ? <Tag tone="emerald">{review.score}/100</Tag> : <Tag tone="zinc">NO SCORE</Tag>}
                </div>
                <p className="line-clamp-2 text-sm text-zinc-300">{review.wins || 'No wins written.'}</p>
                {review.risks ? <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{review.risks}</p> : null}
                <p className="data-text mt-2 text-[10px] text-zinc-500">
                  {normalizeActions(review.next_actions).length} next actions
                </p>
              </button>
            ))
          ) : reviewsResolved ? (
            <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-3">
              <p className="text-sm font-medium text-zinc-100">No daily reviews yet.</p>
              <p className="mt-1 text-xs text-zinc-500">Save the selected date review to start the archive.</p>
            </div>
          ) : (
            <LoadingCard label="Review archive pending" />
          )}
        </div>
      </Panel>
    </div>
  );
}

function ContextHealth({ log, status }) {
  const loading = isLoadingStatus(status) && !log;
  return (
    <div className="rounded-md border border-white/5 bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">Health Log</p>
        <ClipboardCheck size={15} className={log ? 'text-emerald-300' : 'text-zinc-600'} />
      </div>
      {loading ? (
        <p className="data-text text-sm text-cyan-300">Loading health context...</p>
      ) : log ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniMetric label="Sleep" value={formatWithUnit(log.sleep_hours, 'h')} tone="text-cyan-300" />
          <MiniMetric label="Quality" value={formatWithUnit(log.sleep_quality, '%')} tone="text-emerald-300" />
          <MiniMetric label="Mood" value={formatValue(log.mood)} tone="text-amber-300" />
          <MiniMetric label="Energy" value={formatValue(log.energy)} tone="text-red-300" />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No health log for this date.</p>
      )}
    </div>
  );
}

function ContextWorkout({ status, summary }) {
  const loading = isLoadingStatus(status) && !summary.sessionCount;
  return (
    <div className="rounded-md border border-white/5 bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">Workout</p>
        <Dumbbell size={15} className={summary.sessionCount ? 'text-red-300' : 'text-zinc-600'} />
      </div>
      {loading ? (
        <p className="data-text text-sm text-cyan-300">Loading workout context...</p>
      ) : summary.sessionCount ? (
        <div className="grid grid-cols-3 gap-2">
          <MiniMetric label="Sessions" value={summary.sessionCount} tone="text-red-300" />
          <MiniMetric label="Sets" value={summary.setCount} tone="text-cyan-300" />
          <MiniMetric label="Volume" value={formatCompact(summary.volume)} tone="text-emerald-300" />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No workout logged for this date.</p>
      )}
    </div>
  );
}

function ContextExpenses({ count, status, total }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">Expenses</p>
        <WalletCards size={15} className={count ? 'text-amber-300' : 'text-zinc-600'} />
      </div>
      {status === 'loading' ? (
        <p className="data-text text-sm text-cyan-300">Loading expenses...</p>
      ) : status === 'error' ? (
        <p className="data-text text-sm text-red-300">Expense context failed to load.</p>
      ) : count ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniMetric label="Spend" value={`EUR ${formatMoney(total)}`} tone="text-amber-300" />
          <MiniMetric label="Entries" value={count} tone="text-cyan-300" />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No expenses logged for this date.</p>
      )}
    </div>
  );
}

function LoadingCard({ label }) {
  return (
    <div className="rounded-md border border-cyan-400/10 bg-cyan-400/[0.03] p-3">
      <p className="data-text text-sm text-cyan-300">{label}</p>
    </div>
  );
}

function SourceStatus({ status }) {
  const tone = status === 'ready' ? 'text-emerald-300' : status === 'loading' ? 'text-cyan-300' : 'text-zinc-500';
  return <span className={`data-text text-[10px] uppercase tracking-wider ${tone}`}>{status}</span>;
}

function AssistantError({ error }) {
  return (
    <div className="rounded-md border border-red-400/20 bg-red-400/[0.06] p-3">
      <p className="text-sm font-medium text-red-200">{error.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {error.providerStatus ? <Tag tone="amber">Provider: {error.providerStatus}</Tag> : null}
        {error.requestId ? <Tag tone="zinc">Request: {error.requestId}</Tag> : null}
      </div>
      {error.providerMessage ? (
        <p className="mt-2 text-xs leading-5 text-zinc-400">{error.providerMessage}</p>
      ) : null}
    </div>
  );
}

function AssistantMessage({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`rounded-md border p-3 ${isUser ? 'border-cyan-400/20 bg-cyan-400/10' : 'border-white/5 bg-black/25'}`}>
      <div className="mb-2 flex items-center gap-2">
        {isUser ? <Sparkles size={15} className="text-cyan-300" /> : <Bot size={15} className="text-emerald-300" />}
        <span className="data-text text-[10px] uppercase tracking-wider text-zinc-500">{isUser ? 'You' : 'LifeOS'}</span>
      </div>
      {isUser ? (
        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">{message.content}</p>
      ) : (
        <AssistantMarkdown content={message.content} />
      )}
      {message.actions?.length ? <ActionResults actions={message.actions} /> : null}
      {import.meta.env.DEV && message.plan ? (
        <details className="mt-2 rounded border border-white/5 bg-black/30 p-2">
          <summary className="cursor-pointer data-text text-[10px] text-zinc-500">planner details</summary>
          <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-[11px] text-zinc-400">
            {JSON.stringify(message.plan, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function AssistantMarkdown({ content }) {
  const parts = parseAssistantContent(content);
  return (
    <div className="grid min-w-0 gap-2 text-sm leading-6 text-zinc-100">
      {parts.map((part, index) => (
        part.type === 'callout' ? (
          <LifeOSCallout key={`${part.type}-${part.tone}-${index}`} tone={part.tone}>
            <MarkdownBlock content={part.content} />
          </LifeOSCallout>
        ) : (
          <MarkdownBlock key={`${part.type}-${index}`} content={part.content} />
        )
      ))}
    </div>
  );
}

function LifeOSCallout({ tone, children }) {
  const style = calloutStyles[tone] ?? calloutStyles.info;
  return (
    <div className={`min-w-0 rounded-md border px-3 py-2 ${style.shell}`}>
      <p className={`data-text mb-1 text-[10px] uppercase tracking-wider ${style.labelClass}`}>{style.label}</p>
      <div className="min-w-0 text-zinc-100">{children}</div>
    </div>
  );
}

function MarkdownBlock({ content }) {
  const markdown = String(content ?? '').trim();
  if (!markdown) return null;
  return (
    <div className="min-w-0">
      <ReactMarkdown
        allowedElements={markdownElements}
        components={markdownComponents}
        unwrapDisallowed
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function parseAssistantContent(content) {
  const value = String(content ?? '');
  const parts = [];
  const calloutPattern = /\[(good|warn|bad|info|action)\]([\s\S]*?)\[\/\1\]/gi;
  let cursor = 0;
  let match = calloutPattern.exec(value);

  while (match) {
    if (match.index > cursor) {
      parts.push({ type: 'markdown', content: value.slice(cursor, match.index) });
    }
    parts.push({ type: 'callout', tone: match[1].toLowerCase(), content: match[2] });
    cursor = match.index + match[0].length;
    match = calloutPattern.exec(value);
  }

  if (cursor < value.length) {
    parts.push({ type: 'markdown', content: value.slice(cursor) });
  }

  return parts.length ? parts : [{ type: 'markdown', content: value }];
}

function getSafeHref(href) {
  const value = String(href ?? '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : '';
  } catch {
    return '';
  }
}

function ActionResults({ actions }) {
  return (
    <div className="mt-3 grid gap-1.5">
      {actions.map((action, index) => {
        const blocked = String(action.type ?? '').startsWith('blocked');
        return (
        <div
          key={`${action.type}-${index}`}
          className={`rounded border px-2 py-1.5 ${
            blocked ? 'border-amber-400/15 bg-amber-400/[0.06]' : 'border-emerald-400/15 bg-emerald-400/[0.06]'
          }`}
        >
          <p className={`data-text text-[10px] uppercase tracking-wider ${blocked ? 'text-amber-300' : 'text-emerald-300'}`}>
            {formatActionType(action.type)}
          </p>
          {action.type === 'analyze_and_plan' ? (
            <p className="mt-1 text-xs text-zinc-300">
              Created {action.data?.created?.length ?? 0} events
              {action.data?.skipped?.length ? ` / skipped ${action.data.skipped.length}` : ''}.
            </p>
          ) : action.data ? (
            <p className="mt-1 truncate text-xs text-zinc-300">{formatActionData(action)}</p>
          ) : blocked ? (
            <p className="mt-1 text-xs text-zinc-300">Not executed.</p>
          ) : null}
        </div>
      );
      })}
    </div>
  );
}

function formatActionType(type) {
  return String(type ?? '').replaceAll('_', ' ');
}

function formatActionData(action) {
  const data = action.data;
  if (action.type === 'create_expense') return `${data.vendor} / EUR ${formatMoney(data.amount)} / ${data.spent_on}`;
  if (action.type === 'create_calendar_event') return `${data.title} / ${data.event_date}${data.start_time ? ` ${data.start_time}` : ''}`;
  if (action.type === 'update_health_log') return `Health log / ${data.logged_on}`;
  return data.title || data.id || 'Updated';
}

function reviewToForm(review, selectedDate) {
  if (!review) return emptyForm(selectedDate);
  const actions = normalizeActions(review.next_actions);
  return {
    review_on: review.review_on,
    wins: review.wins ?? '',
    risks: review.risks ?? '',
    next_actions: actions.length ? actions : [''],
    score: review.score ?? '',
  };
}

function validateForm(form) {
  if (!isValidDate(form.review_on)) return 'Choose a valid review date.';
  const score = String(form.score ?? '').trim();
  if (score !== '') {
    if (!/^(100|[1-9][0-9]?)$/.test(score)) return 'Score must be a whole number from 1 to 100.';
  }
  return '';
}

function normalizeActions(actions) {
  return Array.isArray(actions) ? actions.map((action) => String(action ?? '').trim()).filter(Boolean) : [];
}

function sortReviews(reviews) {
  return reviews.slice().sort((a, b) => {
    if (a.review_on !== b.review_on) return new Date(b.review_on) - new Date(a.review_on);
    return new Date(b.updated_at ?? 0) - new Date(a.updated_at ?? 0);
  });
}

function buildWorkoutSummary(sessions) {
  const sets = sessions.flatMap((session) => session.workout_sets ?? []);
  return {
    sessionCount: sessions.length,
    setCount: sets.length,
    volume: sets.reduce((sum, set) => sum + Number(set.weight ?? 0) * Number(set.reps ?? 0), 0),
  };
}

function sumExpenses(expenses) {
  return expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStart(dateValue) {
  return `${dateValue.slice(0, 7)}-01`;
}

function isValidDate(value) {
  return Boolean(value && !Number.isNaN(new Date(`${value}T00:00:00`).getTime()));
}

function isLoadingStatus(status) {
  return status === 'idle' || status === 'loading';
}

function isResolvedStatus(status) {
  return ['ready', 'error', 'not-configured', 'no-session'].includes(status);
}

function formatMoney(value) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCompact(value) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '--';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatWithUnit(value, unit) {
  const formatted = formatValue(value);
  return formatted === '--' ? formatted : `${formatted}${unit}`;
}
