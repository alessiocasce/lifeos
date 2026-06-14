import { Bot, History, Loader2, Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { AiActionHistoryList, AssistantMarkdown } from '../components/AiActionHistory';
import { Panel, PanelHeader, Tag } from '../components/ui';
import { useLifeOS } from '../context/LifeOSContext';
import { sendLifeOSAiMessage } from '../services/aiApi';
import { addDays, localDate } from '../utils/date';

export function AIAssistantTab() {
  const {
    aiActionLogs,
    aiActionLogsStatus,
    loadCalendarRange,
    loadExpenseMonth,
    reloadAiActionLogs,
    reloadExpenses,
    reloadHealthLogs,
    reloadMemos,
  } = useLifeOS();
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState([]);
  const [aiStatus, setAiStatus] = useState('idle');
  const [aiError, setAiError] = useState(null);

  const submitAiMessage = async (event) => {
    event.preventDefault();
    const message = aiInput.trim();
    if (!message) return;

    setAiMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    }]);
    setAiInput('');
    setAiError(null);
    setAiStatus('loading');

    try {
      const result = await sendLifeOSAiMessage(message);
      setAiMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        actions: result.actions ?? [],
        plan: result.plan,
      }]);
      await refreshAfterAiActions(result.actions ?? []);
      await Promise.allSettled([reloadAiActionLogs?.(10)].filter(Boolean));
    } catch (error) {
      setAiError({
        message: error.message || 'LifeOS assistant failed.',
        requestId: error.requestId,
        providerStatus: error.providerStatus,
        providerMessage: error.providerMessage,
      });
      await Promise.allSettled([reloadAiActionLogs?.(10)].filter(Boolean));
    } finally {
      setAiStatus('idle');
    }
  };

  const refreshAfterAiActions = async (actions) => {
    if (!actions.length) return;
    const types = new Set(actions.map((action) => action.type));
    const today = localDate();
    const tasks = [];
    if (types.has('create_expense')) {
      tasks.push(reloadExpenses?.());
      tasks.push(loadExpenseMonth?.(`${today.slice(0, 7)}-01`));
    }
    if (types.has('update_health_log')) tasks.push(reloadHealthLogs?.());
    if (types.has('create_memo')) tasks.push(reloadMemos?.());
    if (types.has('create_calendar_event') || types.has('create_calendar_events') || types.has('analyze_and_plan')) {
      tasks.push(loadCalendarRange?.(today, addDays(today, 45)));
    }
    await Promise.allSettled(tasks.filter(Boolean));
  };

  return (
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-hidden pb-3">
      <Panel className="col-span-12">
        <PanelHeader
          eyebrow="Brain"
          title="Ask LifeOS"
          right={<Sparkles size={16} className="text-cyan-300" />}
        />
        <div className="grid gap-3 p-3">
          <form onSubmit={submitAiMessage} className="grid gap-2">
            <textarea
              rows={4}
              value={aiInput}
              onChange={(event) => {
                setAiInput(event.target.value);
                setAiError(null);
              }}
              placeholder="Ask for analysis, log something, or plan your day..."
              className="min-h-32 w-full resize-y rounded-md border border-white/10 bg-black/40 px-3 py-3 text-base leading-6 text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-400/40"
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

          {aiError ? <AssistantError error={aiError} /> : null}

          <div className="grid gap-2">
            {aiMessages.length ? (
              aiMessages.slice(-10).map((message) => <AssistantMessage key={message.id} message={message} />)
            ) : (
              <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-4">
                <p className="text-sm font-medium text-zinc-100">Brain is ready.</p>
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12">
        <PanelHeader eyebrow="Action History" title="Recent Actions" right={<History size={16} className="text-violet-300" />} />
        <div className="grid gap-2 p-3">
          <AiActionHistoryList logs={aiActionLogs.slice(0, 10)} status={aiActionLogsStatus} limit={10} />
        </div>
      </Panel>
    </div>
  );
}

function AssistantError({ error }) {
  return (
    <div className="rounded-md border border-red-400/20 bg-red-400/[0.06] p-3">
      <p className="text-sm font-medium text-red-200">{error.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {error.providerStatus ? <Tag tone="amber">Provider: {error.providerStatus}</Tag> : null}
        {error.requestId ? <Tag tone="zinc">Request: {error.requestId}</Tag> : null}
      </div>
      {error.providerMessage ? <p className="mt-2 text-xs leading-5 text-zinc-400">{error.providerMessage}</p> : null}
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
      {isUser
        ? <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">{message.content}</p>
        : <AssistantMarkdown content={message.content} />}
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
              {String(action.type || 'AI action').replaceAll('_', ' ')}
            </p>
            {action.type === 'analyze_and_plan' || action.type === 'create_calendar_events' ? (
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

function formatActionData(action) {
  const data = action.data;
  if (action.type === 'create_expense') return `${data.vendor} / EUR ${formatMoney(data.amount)} / ${data.spent_on}`;
  if (action.type === 'create_calendar_event') return `${data.title} / ${data.event_date}${data.start_time ? ` ${data.start_time}` : ''}`;
  if (action.type === 'create_memo') return `${data.title}${data.memo_date ? ` / ${data.memo_date}` : ''}${data.memo_time ? ` ${data.memo_time}` : ''}`;
  if (action.type === 'update_health_log') return `Health log / ${data.logged_on}`;
  return data.title || data.id || 'Updated';
}

function formatMoney(value) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
