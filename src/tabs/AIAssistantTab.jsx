import {
  Archive,
  Bot,
  BrainCircuit,
  ChevronDown,
  Edit3,
  History,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AiActionHistoryList, AssistantMarkdown } from '../components/AiActionHistory';
import { Panel, PanelHeader, Tag } from '../components/ui';
import { useLifeOS } from '../context/LifeOSContext';
import { sendLifeOSAiMessage } from '../services/aiApi';
import { addDays, localDate } from '../utils/date';

export function AIAssistantTab() {
  const {
    activeAiChatMessages,
    activeAiThreadId,
    aiActionLogs,
    aiActionLogsStatus,
    aiChatMessagesStatus,
    aiChatThreads,
    aiInsights,
    aiMemories,
    aiMemoriesStatus,
    archiveAiChatThread,
    archiveAiMemory,
    createAiChatThread,
    loadAiChatMessages,
    loadAiChatThreads,
    loadCalendarRange,
    loadExpenseMonth,
    reloadAiActionLogs,
    reloadAiInsights,
    reloadAiMemories,
    reloadExpenses,
    reloadHealthLogs,
    reloadMemos,
    renameAiChatThread,
    selectAiChatThread,
    updateAiMemory,
  } = useLifeOS();
  const [aiInput, setAiInput] = useState('');
  const [pendingMessages, setPendingMessages] = useState([]);
  const [aiStatus, setAiStatus] = useState('idle');
  const [aiError, setAiError] = useState(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState(null);
  const [memoryDraft, setMemoryDraft] = useState({ title: '', content: '' });
  const [recentActionsExpanded, setRecentActionsExpanded] = useState(false);
  const [renamingThread, setRenamingThread] = useState(false);
  const [threadTitleDraft, setThreadTitleDraft] = useState('');

  const activeThreads = useMemo(
    () => aiChatThreads.filter((thread) => thread.status === 'active'),
    [aiChatThreads],
  );
  const activeThread = activeThreads.find((thread) => thread.id === activeAiThreadId) ?? null;
  const messages = [...activeAiChatMessages, ...pendingMessages];
  const actionLimit = recentActionsExpanded ? 10 : 3;

  useEffect(() => {
    setThreadTitleDraft(activeThread?.title || '');
    setRenamingThread(false);
  }, [activeThread?.id, activeThread?.title]);

  const submitAiMessage = async (event) => {
    event.preventDefault();
    const message = aiInput.trim();
    if (!message || aiStatus === 'loading') return;

    let threadId = activeAiThreadId;
    try {
      if (!threadId) {
        const created = await createAiChatThread();
        threadId = created.id;
      }
    } catch (error) {
      setAiError({ message: error.message || 'Could not create a Brain conversation.' });
      return;
    }

    const optimisticId = `user-${Date.now()}`;
    setPendingMessages((prev) => [...prev, {
      id: optimisticId,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    }]);
    setAiInput('');
    setAiError(null);
    setAiStatus('loading');

    try {
      const result = await sendLifeOSAiMessage(message, threadId);
      setPendingMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        created_at: new Date().toISOString(),
      }]);
      await refreshAfterAiActions(result.actions ?? []);
      await Promise.allSettled([
        loadAiChatThreads?.(),
        loadAiChatMessages?.(result.thread_id || threadId),
        reloadAiMemories?.(),
        reloadAiInsights?.(),
        reloadAiActionLogs?.(10),
      ].filter(Boolean));
      setPendingMessages([]);
    } catch (error) {
      setPendingMessages((prev) => prev.filter((item) => item.id !== optimisticId));
      setAiInput(message);
      setAiError({
        message: error.message || 'LifeOS Brain failed.',
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

  const handleNewChat = async () => {
    setAiError(null);
    setPendingMessages([]);
    await createAiChatThread();
  };

  const handleArchiveThread = async () => {
    if (!activeThread) return;
    await archiveAiChatThread(activeThread.id);
  };

  const saveThreadTitle = async () => {
    const title = threadTitleDraft.trim();
    if (!activeThread || !title || title === activeThread.title) {
      setRenamingThread(false);
      return;
    }
    await renameAiChatThread(activeThread.id, title);
    setRenamingThread(false);
  };

  const beginMemoryEdit = (memory) => {
    setEditingMemoryId(memory.id);
    setMemoryDraft({ title: memory.title, content: memory.content });
  };

  const saveMemoryEdit = async (memoryId) => {
    const title = memoryDraft.title.trim();
    const content = memoryDraft.content.trim();
    if (!title || !content) return;
    await updateAiMemory(memoryId, { title, content, source: 'manual' });
    setEditingMemoryId(null);
  };

  return (
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-clip pb-3">
      <Panel className="col-span-12 xl:col-span-8">
        <div className="grid min-w-0 gap-2 border-b border-white/5 px-3 py-2 sm:flex sm:items-center">
          <div className="min-w-0 sm:mr-auto">
            <p className="data-text text-[10px] uppercase tracking-wider text-cyan-400">Brain</p>
            {renamingThread ? (
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <input
                  value={threadTitleDraft}
                  onChange={(event) => setThreadTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') saveThreadTitle();
                    if (event.key === 'Escape') setRenamingThread(false);
                  }}
                  className="h-9 min-w-0 flex-1 rounded-md border border-cyan-400/25 bg-black/50 px-3 text-base text-zinc-100 outline-none"
                  aria-label="Brain thread title"
                />
                <button type="button" onClick={saveThreadTitle} className="grid h-9 w-9 place-items-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-200" aria-label="Save thread title">
                  <Save size={15} />
                </button>
              </div>
            ) : (
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <h1 className="truncate text-base font-semibold text-zinc-100">{activeThread?.title || 'New Chat'}</h1>
                <button
                  type="button"
                  onClick={() => setRenamingThread(true)}
                  disabled={!activeThread}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-500 hover:text-zinc-200 disabled:opacity-40"
                  aria-label="Rename Brain chat"
                  title="Rename chat"
                >
                  <Edit3 size={14} />
                </button>
              </div>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:w-56 sm:flex-none" aria-label="Select Brain conversation">
            <select
              value={activeAiThreadId || ''}
              onChange={(event) => selectAiChatThread(event.target.value)}
              disabled={!activeThreads.length}
              className="h-10 w-full appearance-none truncate rounded-md border border-white/10 bg-black/40 pl-3 pr-9 text-sm text-zinc-200 outline-none focus:border-cyan-400/40"
            >
              {!activeThreads.length ? <option value="">No conversations</option> : null}
              {activeThreads.map((thread) => <option key={thread.id} value={thread.id}>{thread.title}</option>)}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-zinc-500" />
          </label>
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-3 text-sm font-semibold text-cyan-200 hover:border-cyan-300/50"
            aria-label="New Brain chat"
            title="New chat"
          >
            <MessageSquarePlus size={17} />
            <span className="hidden sm:inline">New Chat</span>
          </button>
          <button
            type="button"
            onClick={handleArchiveThread}
            disabled={!activeThread}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-500 hover:border-amber-400/30 hover:text-amber-200 disabled:opacity-40"
            aria-label="Archive current Brain chat"
            title="Archive chat"
          >
            <Archive size={17} />
          </button>
          </div>
        </div>

        <div className="grid min-h-[58dvh] content-start gap-2 p-2 md:min-h-[64dvh] md:p-3">
          {aiChatMessagesStatus === 'loading' && !messages.length ? (
            <div className="grid min-h-48 place-items-center text-zinc-500">
              <Loader2 size={20} className="animate-spin" aria-label="Loading Brain messages" />
            </div>
          ) : messages.length ? (
            messages.map((message) => <AssistantMessage key={message.id} message={message} />)
          ) : (
            <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-white/10 bg-black/20 p-4 text-center">
              <div>
                <BrainCircuit size={24} className="mx-auto text-cyan-300" />
                <p className="mt-2 text-sm font-medium text-zinc-100">Start a conversation.</p>
                <p className="mt-1 text-xs text-zinc-500">Brain can analyze LifeOS data or perform explicit supported actions.</p>
              </div>
            </div>
          )}

          {aiError ? <AssistantError error={aiError} /> : null}
        </div>

        <form
          onSubmit={submitAiMessage}
          className="sticky bottom-[calc(env(safe-area-inset-bottom)+68px)] z-10 border-t border-white/10 bg-[#111]/95 p-3 backdrop-blur md:bottom-3"
        >
          {aiStatus === 'loading' ? (
            <p className="mb-2 inline-flex items-center gap-2 text-xs text-cyan-300">
              <Loader2 size={13} className="animate-spin" />
              Brain is thinking...
            </p>
          ) : null}
          <div className="flex min-w-0 items-end gap-2">
            <textarea
              rows={2}
              value={aiInput}
              onChange={(event) => {
                setAiInput(event.target.value);
                setAiError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Message LifeOS Brain..."
              className="max-h-40 min-h-12 min-w-0 flex-1 resize-y rounded-md border border-white/10 bg-black/50 px-3 py-3 text-base leading-6 text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-400/40"
            />
            <button
              type="submit"
              disabled={aiStatus === 'loading' || !aiInput.trim()}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
              aria-label={aiStatus === 'loading' ? 'Brain is thinking' : 'Send message'}
            >
              {aiStatus === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </form>
      </Panel>

      <div className="col-span-12 grid min-w-0 content-start gap-3 xl:col-span-4">
        <Panel>
          <button
            type="button"
            onClick={() => setMemoryOpen((open) => !open)}
            className="flex w-full min-w-0 items-center justify-between gap-3 border-b border-white/5 px-3 py-2 text-left"
            aria-expanded={memoryOpen}
          >
            <div className="min-w-0">
              <p className="data-text text-[10px] uppercase tracking-wider text-violet-300">Memory</p>
              <h2 className="truncate text-sm font-semibold text-zinc-100">What LifeOS Knows</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Tag tone="violet">{aiMemories.length}</Tag>
              <ChevronDown size={16} className={`text-zinc-500 transition ${memoryOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {memoryOpen ? (
            <div className="grid gap-2 p-3">
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => Promise.allSettled([reloadAiMemories?.(), reloadAiInsights?.()].filter(Boolean))}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs text-zinc-300 hover:border-cyan-400/25"
                >
                  <RefreshCw size={14} />
                  Refresh
                </button>
              </div>
              {aiMemoriesStatus === 'loading' && !aiMemories.length ? (
                <p className="py-3 text-center text-sm text-zinc-500">Loading memory...</p>
              ) : aiMemories.length ? (
                aiMemories.map((memory) => (
                  <MemoryCard
                    key={memory.id}
                    memory={memory}
                    editing={editingMemoryId === memory.id}
                    draft={memoryDraft}
                    onDraftChange={setMemoryDraft}
                    onEdit={() => beginMemoryEdit(memory)}
                    onCancel={() => setEditingMemoryId(null)}
                    onSave={() => saveMemoryEdit(memory.id)}
                    onArchive={() => archiveAiMemory(memory.id)}
                  />
                ))
              ) : (
                <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-3">
                  <p className="text-sm font-medium text-zinc-100">Memory will build as you use Brain.</p>
                  <div className="mt-3 grid gap-1 text-xs leading-5 text-zinc-500">
                    <p>Try:</p>
                    <p>"Remember my name is Ale"</p>
                    <p>"Remember I prefer direct practical advice"</p>
                    <p>"Remember LifeOS is a business idea"</p>
                  </div>
                </div>
              )}

              {aiInsights.length ? (
                <details className="rounded-md border border-white/5 bg-black/20 p-3">
                  <summary className="cursor-pointer data-text text-[10px] uppercase tracking-wider text-zinc-500">
                    Recent insights
                  </summary>
                  <div className="mt-3 grid gap-2">
                    {aiInsights.slice(0, 3).map((insight) => (
                      <div key={insight.id} className="rounded border border-white/5 bg-black/25 p-2">
                        <p className="text-xs font-semibold text-zinc-200">{insight.title}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">{insight.content}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
        </Panel>

        <Panel>
          <PanelHeader eyebrow="Action History" title="Recent Actions" right={<History size={16} className="text-violet-300" />} />
          <div className="grid gap-2 p-3">
            <AiActionHistoryList logs={aiActionLogs.slice(0, actionLimit)} status={aiActionLogsStatus} limit={actionLimit} />
            {aiActionLogs.length > 3 ? (
              <button
                type="button"
                onClick={() => setRecentActionsExpanded((expanded) => !expanded)}
                className="h-9 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs text-zinc-400 hover:border-violet-400/25 hover:text-violet-200"
              >
                {recentActionsExpanded ? 'Show less' : 'View all recent actions'}
              </button>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function MemoryCard({ memory, editing, draft, onDraftChange, onEdit, onCancel, onSave, onArchive }) {
  if (editing) {
    return (
      <div className="grid gap-2 rounded-md border border-violet-400/20 bg-violet-400/[0.05] p-3">
        <input
          value={draft.title}
          onChange={(event) => onDraftChange((current) => ({ ...current, title: event.target.value }))}
          className="h-10 rounded-md border border-white/10 bg-black/40 px-3 text-base text-zinc-100 outline-none focus:border-violet-400/40"
          aria-label="Memory title"
        />
        <textarea
          rows={3}
          value={draft.content}
          onChange={(event) => onDraftChange((current) => ({ ...current, content: event.target.value }))}
          className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-base text-zinc-100 outline-none focus:border-violet-400/40"
          aria-label="Memory content"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-zinc-400" aria-label="Cancel memory edit">
            <X size={15} />
          </button>
          <button type="button" onClick={onSave} className="grid h-9 w-9 place-items-center rounded-md border border-violet-400/25 bg-violet-400/10 text-violet-200" aria-label="Save memory">
            <Save size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <article className="min-w-0 rounded-md border border-white/5 bg-black/25 p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <Tag tone="violet">{String(memory.category || 'other').replaceAll('_', ' ')}</Tag>
          <h3 className="mt-2 text-sm font-semibold text-zinc-100">{memory.title}</h3>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={onEdit} className="h-8 rounded-md border border-white/10 px-2 text-[11px] text-zinc-400 hover:text-zinc-200">
            Edit
          </button>
          <button type="button" onClick={onArchive} className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-zinc-500 hover:border-red-400/25 hover:text-red-200" aria-label={`Forget ${memory.title}`}>
            <Archive size={14} />
          </button>
        </div>
      </div>
      <p className="mt-2 break-words text-xs leading-5 text-zinc-400">{memory.content}</p>
      <p className="data-text mt-2 text-[10px] text-zinc-600">Importance {memory.importance}/5</p>
    </article>
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
    <article className={`min-w-0 rounded-md border px-3 py-2 ${isUser ? 'ml-auto max-w-[92%] border-cyan-400/20 bg-cyan-400/10 sm:max-w-[78%]' : 'mr-auto max-w-full border-white/5 bg-black/25 sm:max-w-[92%]'}`}>
      <div className="mb-2 flex items-center gap-2">
        {isUser ? <Sparkles size={15} className="text-cyan-300" /> : <Bot size={15} className="text-emerald-300" />}
        <span className="data-text text-[10px] uppercase tracking-wider text-zinc-500">{isUser ? 'You' : 'LifeOS'}</span>
        {message.created_at ? <span className="data-text ml-auto text-[10px] text-zinc-600">{formatMessageTime(message.created_at)}</span> : null}
      </div>
      {isUser
        ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{message.content}</p>
        : <AssistantMarkdown content={message.content} />}
    </article>
  );
}

function formatMessageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  });
}
