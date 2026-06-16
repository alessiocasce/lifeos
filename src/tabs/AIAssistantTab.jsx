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
import { useEffect, useMemo, useRef, useState } from 'react';
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
    aiVaultDocuments,
    aiVaultError,
    aiVaultStatus,
    archiveAiChatThread,
    archiveAiMemory,
    archiveAiVaultDocument,
    createAiChatThread,
    loadAiChatMessages,
    loadAiChatThreads,
    loadCalendarRange,
    loadExpenseMonth,
    reloadAiActionLogs,
    reloadAiInsights,
    reloadAiMemories,
    reloadAiVaultDocuments,
    reloadExpenses,
    reloadHealthLogs,
    reloadMemos,
    renameAiChatThread,
    reembedAiVaultDocuments,
    saveBrainMessageToVault,
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
  const [showActionErrors, setShowActionErrors] = useState(false);
  const [renamingThread, setRenamingThread] = useState(false);
  const [threadTitleDraft, setThreadTitleDraft] = useState('');
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultDetail, setVaultDetail] = useState(null);
  const [vaultSaveMessage, setVaultSaveMessage] = useState(null);
  const [vaultSaveDraft, setVaultSaveDraft] = useState({ title: '', documentType: 'brain_answer', tags: '' });
  const [vaultSaveStatus, setVaultSaveStatus] = useState('idle');
  const [vaultSaveError, setVaultSaveError] = useState('');
  const [vaultRepairStatus, setVaultRepairStatus] = useState('idle');
  const [vaultRepairMessage, setVaultRepairMessage] = useState('');
  const [lastFailedMessage, setLastFailedMessage] = useState(null);
  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const userPinnedToBottomRef = useRef(true);
  const forceScrollRef = useRef(false);
  const sendingRef = useRef(false);

  const activeThreads = useMemo(
    () => aiChatThreads.filter((thread) => thread.status === 'active'),
    [aiChatThreads],
  );
  const activeThread = activeThreads.find((thread) => thread.id === activeAiThreadId) ?? null;
  const messages = useMemo(
    () => mergeBrainMessages(activeAiChatMessages, pendingMessages),
    [activeAiChatMessages, pendingMessages],
  );
  const messageScrollKey = useMemo(() => {
    const latest = messages[messages.length - 1];
    return [messages.length, latest?.id, latest?.created_at, latest?.content?.length, aiStatus, aiError?.message].join('|');
  }, [messages, aiStatus, aiError?.message]);
  const actionLimit = recentActionsExpanded ? 10 : 3;
  const successfulActionLogs = useMemo(
    () => aiActionLogs.filter((log) => log.status !== 'error'),
    [aiActionLogs],
  );
  const failedActionCount = aiActionLogs.length - successfulActionLogs.length;
  const brainActionLogs = showActionErrors ? aiActionLogs : successfulActionLogs;

  useEffect(() => {
    setThreadTitleDraft(activeThread?.title || '');
    setRenamingThread(false);
  }, [activeThread?.id, activeThread?.title]);

  useEffect(() => {
    const updatePinnedState = () => {
      userPinnedToBottomRef.current = isNearPageBottom();
    };
    updatePinnedState();
    window.addEventListener('scroll', updatePinnedState, { passive: true });
    window.addEventListener('resize', updatePinnedState);
    return () => {
      window.removeEventListener('scroll', updatePinnedState);
      window.removeEventListener('resize', updatePinnedState);
    };
  }, []);

  useEffect(() => {
    const shouldScroll = forceScrollRef.current || userPinnedToBottomRef.current || aiStatus === 'loading' || Boolean(aiError);
    if (!shouldScroll) return;
    const behavior = forceScrollRef.current ? 'smooth' : 'auto';
    forceScrollRef.current = false;
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end', behavior });
    });
  }, [messageScrollKey, aiStatus, aiError]);

  const submitAiMessage = (event) => {
    event.preventDefault();
    void sendBrainMessage(aiInput);
  };

  const sendBrainMessage = async (rawMessage, options = {}) => {
    const message = String(rawMessage ?? '').trim();
    if (!message || aiStatus === 'loading' || sendingRef.current) return;
    sendingRef.current = true;

    let threadId = options.threadId || activeAiThreadId;
    try {
      if (!threadId) {
        const created = await createAiChatThread();
        threadId = created.id;
      }
    } catch (error) {
      setAiError({ message: error.message || 'Could not create a Brain conversation.' });
      sendingRef.current = false;
      return;
    }

    const clientRequestId = options.clientRequestId || createClientRequestId();
    const optimisticId = `pending-user-${clientRequestId}`;
    setPendingMessages((prev) => [...prev, {
      id: optimisticId,
      client_request_id: clientRequestId,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
      pending: true,
      metadata: { client_request_id: clientRequestId },
    }]);
    forceScrollRef.current = true;
    setAiInput('');
    setAiError(null);
    setLastFailedMessage(null);
    setAiStatus('loading');

    try {
      const result = await sendLifeOSAiMessage(message, threadId, { clientRequestId });
      const persistedMessage = result.persisted_message;
      setPendingMessages((prev) => [...prev, {
        id: `pending-assistant-${clientRequestId}`,
        client_request_id: clientRequestId,
        role: 'assistant',
        content: result.answer,
        pending: true,
        metadata: {
          ...(persistedMessage?.metadata ?? {}),
          client_request_id: clientRequestId,
          ...(result.selected_skill ? { selected_skill: result.selected_skill } : {}),
          ...(result.brain_route ? { brain_route: result.brain_route } : {}),
          ...(result.vault_context ? { vault_context: result.vault_context } : {}),
        },
        created_at: persistedMessage?.created_at || new Date().toISOString(),
      }]);
      await refreshAfterAiActions(result.actions ?? []);
      await Promise.allSettled([
        loadAiChatThreads?.(),
        loadAiChatMessages?.(result.thread_id || threadId),
        reloadAiMemories?.(),
        reloadAiInsights?.(),
        reloadAiVaultDocuments?.(),
        reloadAiActionLogs?.(10),
      ].filter(Boolean));
      setPendingMessages((prev) => prev.filter((item) => item.client_request_id !== clientRequestId));
    } catch (error) {
      setPendingMessages((prev) => prev.filter((item) => item.client_request_id !== clientRequestId));
      setAiInput(message);
      setLastFailedMessage({ message, threadId, clientRequestId });
      setAiError({
        message: error.message || 'LifeOS Brain failed.',
        code: error.code,
        requestId: error.requestId,
        providerStatus: error.providerStatus,
        providerMessage: error.providerMessage,
      });
      await Promise.allSettled([reloadAiActionLogs?.(10)].filter(Boolean));
    } finally {
      setAiStatus('idle');
      sendingRef.current = false;
      forceScrollRef.current = true;
    }
  };

  const retryLastFailedMessage = () => {
    if (!lastFailedMessage || aiStatus === 'loading') return;
    void sendBrainMessage(lastFailedMessage.message, {
      threadId: lastFailedMessage.threadId,
      clientRequestId: lastFailedMessage.clientRequestId,
    });
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
    if (types.has('create_vault_document')) tasks.push(reloadAiVaultDocuments?.());
    if (types.has('create_calendar_event') || types.has('create_calendar_events') || types.has('analyze_and_plan')) {
      tasks.push(loadCalendarRange?.(today, addDays(today, 45)));
    }
    await Promise.allSettled(tasks.filter(Boolean));
  };

  const openVaultSave = (message) => {
    const defaultType = defaultVaultTypeForMessage(message);
    setVaultSaveMessage(message);
    setVaultSaveDraft({
      title: defaultVaultTitle(message),
      documentType: defaultType,
      tags: defaultVaultTags(message, defaultType),
    });
    setVaultSaveStatus('idle');
    setVaultSaveError('');
  };

  const saveVaultDraft = async () => {
    if (!vaultSaveMessage) return;
    setVaultSaveStatus('saving');
    setVaultSaveError('');
    try {
      const created = await saveBrainMessageToVault({
        source_message_id: isUuid(vaultSaveMessage.id) ? vaultSaveMessage.id : undefined,
        content_md: vaultSaveMessage.content,
        title: vaultSaveDraft.title,
        document_type: vaultSaveDraft.documentType,
        tags: parseTags(vaultSaveDraft.tags),
        metadata: {
          selected_skill: vaultSaveMessage.metadata?.selected_skill ?? null,
          saved_from_ui: true,
        },
      });
      await reloadAiVaultDocuments?.();
      setVaultSaveStatus('idle');
      setVaultSaveMessage(null);
      setVaultOpen(true);
      const embeddingResult = created?.embedding_result;
      if (embeddingResult && embeddingResult.configured === false && Number(embeddingResult.skipped ?? 0) > 0) {
        setVaultRepairMessage('Saved; Gemini key missing - embeddings skipped.');
        setVaultRepairStatus('ready');
      } else if (embeddingResult && Number(embeddingResult.failed ?? 0) > 0) {
        setVaultRepairMessage('Saved; embeddings failed. Try Re-embed later.');
        setVaultRepairStatus('error');
      } else {
        setVaultRepairMessage('');
        setVaultRepairStatus('idle');
      }
    } catch (error) {
      setVaultSaveError(error.message || 'Could not save to Vault.');
      setVaultSaveStatus('error');
    }
  };

  const repairVaultEmbeddings = async () => {
    setVaultRepairStatus('loading');
    setVaultRepairMessage('');
    try {
      const result = await reembedAiVaultDocuments?.({ limit: 25, includeWrongModel: true });
      const processed = Number(result?.processed_count ?? 0);
      const ready = Number(result?.ready_count ?? 0);
      const failed = Number(result?.failed_count ?? 0);
      const skipped = Number(result?.skipped_count ?? 0);
      if (!processed) {
        setVaultRepairMessage('No chunks need repair.');
      } else if (ready > 0) {
        setVaultRepairMessage(`Re-embedded ${ready} chunk${ready === 1 ? '' : 's'}.`);
      } else if (skipped > 0 && !result?.configured) {
        setVaultRepairMessage('Gemini key missing - embeddings skipped.');
      } else {
        setVaultRepairMessage(`Processed ${processed}; ${failed} failed.`);
      }
      setVaultRepairStatus('ready');
    } catch (error) {
      setVaultRepairStatus('error');
      setVaultRepairMessage(error.message || 'Embedding repair failed.');
    }
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

        <div
          ref={messagesContainerRef}
          className="grid min-h-[58dvh] content-start gap-2 p-2 md:min-h-[64dvh] md:p-3"
          aria-label="Brain conversation messages"
          data-testid="brain-message-list"
        >
          {aiChatMessagesStatus === 'loading' && !messages.length ? (
            <div className="grid min-h-48 place-items-center text-zinc-500">
              <Loader2 size={20} className="animate-spin" aria-label="Loading Brain messages" />
            </div>
          ) : messages.length ? (
            messages.map((message) => <AssistantMessage key={message.id} message={message} onSaveToVault={openVaultSave} />)
          ) : (
            <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-white/10 bg-black/20 p-4 text-center">
              <div>
                <BrainCircuit size={24} className="mx-auto text-cyan-300" />
                <p className="mt-2 text-sm font-medium text-zinc-100">Start a conversation.</p>
                <p className="mt-1 text-xs text-zinc-500">Brain can analyze LifeOS data or perform explicit supported actions.</p>
              </div>
            </div>
          )}

          {aiStatus === 'loading' ? (
            <div
              className="mr-auto inline-flex items-center gap-2 rounded-md border border-cyan-400/15 bg-cyan-400/[0.06] px-3 py-2 text-xs text-cyan-200"
              data-testid="brain-loading-indicator"
            >
              <Loader2 size={13} className="animate-spin" />
              Brain is thinking...
            </div>
          ) : null}

          {aiError ? <AssistantError error={aiError} onRetry={lastFailedMessage ? retryLastFailedMessage : null} /> : null}
          <div ref={messagesEndRef} aria-hidden="true" />
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
                  if (aiStatus !== 'loading' && !sendingRef.current) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }
              }}
              placeholder="Message LifeOS Brain..."
              aria-label="Brain message input"
              data-testid="brain-message-input"
              className="max-h-40 min-h-12 min-w-0 flex-1 resize-y rounded-md border border-white/10 bg-black/50 px-3 py-3 text-base leading-6 text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-400/40"
            />
            <button
              type="submit"
              disabled={aiStatus === 'loading' || !aiInput.trim()}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
              aria-label="Send Brain message"
              title={aiStatus === 'loading' ? 'Brain is thinking' : 'Send message'}
              aria-busy={aiStatus === 'loading'}
              data-testid="brain-send-button"
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
            onClick={() => setVaultOpen((open) => !open)}
            className="flex w-full min-w-0 items-center justify-between gap-3 border-b border-white/5 px-3 py-2 text-left"
            aria-expanded={vaultOpen}
          >
            <div className="min-w-0">
              <p className="data-text text-[10px] uppercase tracking-wider text-emerald-300">Vault</p>
              <h2 className="truncate text-sm font-semibold text-zinc-100">Saved Reports</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Tag tone="emerald">{aiVaultDocuments.length}</Tag>
              <ChevronDown size={16} className={`text-zinc-500 transition ${vaultOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {vaultOpen ? (
            <div className="grid gap-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-500">Long-form Brain answers saved as searchable reports.</p>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={repairVaultEmbeddings}
                    disabled={vaultRepairStatus === 'loading'}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs text-zinc-300 hover:border-emerald-400/25 disabled:opacity-50"
                  >
                    {vaultRepairStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Re-embed
                  </button>
                  <button
                    type="button"
                    onClick={() => reloadAiVaultDocuments?.()}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs text-zinc-300 hover:border-emerald-400/25"
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>
              </div>
              {vaultRepairMessage ? (
                <p className={`text-xs ${vaultRepairStatus === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>{vaultRepairMessage}</p>
              ) : null}
              {aiVaultStatus === 'loading' && !aiVaultDocuments.length ? (
                <p className="py-3 text-center text-sm text-zinc-500">Loading Vault...</p>
              ) : aiVaultDocuments.length ? (
                aiVaultDocuments.slice(0, 5).map((document) => (
                  <VaultDocumentCard
                    key={document.id}
                    document={document}
                    onOpen={() => setVaultDetail(document)}
                    onArchive={() => archiveAiVaultDocument(document.id)}
                  />
                ))
              ) : (
                <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-3">
                  <p className="text-sm font-medium text-zinc-100">No saved reports yet.</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">Use Save on a useful Brain answer to store it here.</p>
                </div>
              )}
              {aiVaultError ? <p className="text-xs text-red-300">{aiVaultError}</p> : null}
            </div>
          ) : null}
        </Panel>

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
            <AiActionHistoryList logs={brainActionLogs} status={aiActionLogsStatus} limit={actionLimit} quietErrors />
            <div className="flex flex-wrap gap-2">
              {brainActionLogs.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setRecentActionsExpanded((expanded) => !expanded)}
                  className="h-9 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs text-zinc-400 hover:border-violet-400/25 hover:text-violet-200"
                >
                  {recentActionsExpanded ? 'Show less' : 'View more'}
                </button>
              ) : null}
              {failedActionCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowActionErrors((shown) => !shown)}
                  className="h-9 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs text-zinc-500 hover:border-red-400/20 hover:text-red-200"
                >
                  {showActionErrors ? 'Hide errors' : `Errors (${failedActionCount})`}
                </button>
              ) : null}
            </div>
          </div>
        </Panel>
      </div>

      {vaultSaveMessage ? (
        <VaultSaveModal
          draft={vaultSaveDraft}
          status={vaultSaveStatus}
          error={vaultSaveError}
          onDraftChange={setVaultSaveDraft}
          onClose={() => setVaultSaveMessage(null)}
          onSave={saveVaultDraft}
        />
      ) : null}

      {vaultDetail ? (
        <VaultDetailModal
          document={vaultDetail}
          onClose={() => setVaultDetail(null)}
          onArchive={async () => {
            await archiveAiVaultDocument(vaultDetail.id);
            setVaultDetail(null);
          }}
        />
      ) : null}
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

function VaultDocumentCard({ document, onOpen, onArchive }) {
  return (
    <article className="min-w-0 rounded-md border border-white/5 bg-black/25 p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <Tag tone="emerald">{formatDocumentType(document.document_type)}</Tag>
          <h3 className="mt-2 truncate text-sm font-semibold text-zinc-100">{document.title}</h3>
          {document.summary ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{document.summary}</p> : null}
        </button>
        <button type="button" onClick={onArchive} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 text-zinc-500 hover:border-red-400/25 hover:text-red-200" aria-label={`Archive ${document.title}`}>
          <Archive size={14} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {(document.tags ?? []).slice(0, 4).map((tag) => <Tag key={tag}>{tag}</Tag>)}
        <span className="data-text ml-auto text-[10px] text-zinc-600">{formatShortDate(document.created_at)}</span>
      </div>
    </article>
  );
}

function VaultSaveModal({ draft, status, error, onDraftChange, onClose, onSave }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-md border border-white/10 bg-[#111] p-4 shadow-2xl sm:max-w-lg sm:rounded-md">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="data-text text-[10px] uppercase tracking-wider text-emerald-300">Vault</p>
            <h2 className="text-base font-semibold text-zinc-100">Save Brain Answer</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-zinc-400" aria-label="Close Vault save">
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm text-zinc-300">
            Title
            <input
              value={draft.title}
              onChange={(event) => onDraftChange((current) => ({ ...current, title: event.target.value }))}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-base text-zinc-100 outline-none focus:border-emerald-400/40"
            />
          </label>
          <label className="grid gap-1 text-sm text-zinc-300">
            Type
            <select
              value={draft.documentType}
              onChange={(event) => onDraftChange((current) => ({ ...current, documentType: event.target.value }))}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-base text-zinc-100 outline-none focus:border-emerald-400/40"
            >
              <option value="brain_answer">Brain Answer</option>
              <option value="workout_report">Workout Report</option>
              <option value="project_report">Project Report</option>
              <option value="finance_report">Finance Report</option>
              <option value="life_review">Life Review</option>
              <option value="product_report">Product Report</option>
              <option value="note">Note</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-zinc-300">
            Tags
            <input
              value={draft.tags}
              onChange={(event) => onDraftChange((current) => ({ ...current, tags: event.target.value }))}
              placeholder="workout, back_day"
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-base text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-emerald-400/40"
            />
          </label>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-md border border-white/10 px-3 text-sm text-zinc-400">
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={status === 'saving' || !draft.title.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-3 text-sm font-semibold text-emerald-200 disabled:opacity-50"
            >
              {status === 'saving' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VaultDetailModal({ document, onClose, onArchive }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-md border border-white/10 bg-[#111] p-4 shadow-2xl sm:max-w-3xl sm:rounded-md">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Tag tone="emerald">{formatDocumentType(document.document_type)}</Tag>
            <h2 className="mt-2 truncate text-lg font-semibold text-zinc-100">{document.title}</h2>
            <p className="data-text mt-1 text-[10px] text-zinc-600">{formatShortDate(document.created_at)}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onArchive} className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-zinc-500 hover:border-red-400/25 hover:text-red-200" aria-label="Archive Vault document">
              <Archive size={16} />
            </button>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-zinc-400" aria-label="Close Vault document">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-1">
          {(document.tags ?? []).map((tag) => <Tag key={tag}>{tag}</Tag>)}
          {(document.links ?? []).slice(0, 8).map((link) => <Tag key={link} tone="cyan">[[{link}]]</Tag>)}
        </div>
        <div className="rounded-md border border-white/5 bg-black/25 p-3">
          <AssistantMarkdown content={document.content_md || ''} />
        </div>
      </div>
    </div>
  );
}

function AssistantError({ error, onRetry }) {
  return (
    <div className="rounded-md border border-red-400/20 bg-red-400/[0.06] p-3" data-testid="brain-error">
      <p className="text-sm font-medium text-red-200">{error.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {error.providerStatus ? <Tag tone="amber">Provider: {error.providerStatus}</Tag> : null}
        {error.requestId ? <Tag tone="zinc">Request: {error.requestId}</Tag> : null}
        {error.code ? <Tag tone="amber">{error.code}</Tag> : null}
      </div>
      {error.providerMessage ? <p className="mt-2 text-xs leading-5 text-zinc-400">{error.providerMessage}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 h-9 rounded-md border border-red-300/20 bg-red-300/10 px-3 text-xs font-semibold text-red-100 hover:border-red-200/40"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

function AssistantMessage({ message, onSaveToVault }) {
  const isUser = message.role === 'user';
  const skill = !isUser ? normalizeMessageSkill(message.metadata?.selected_skill) : null;
  return (
    <article className={`min-w-0 rounded-md border px-3 py-2 ${isUser ? 'ml-auto max-w-[92%] border-cyan-400/20 bg-cyan-400/10 sm:max-w-[78%]' : 'mr-auto max-w-full border-white/5 bg-black/25 sm:max-w-[92%]'}`}>
      <div className="mb-2 flex items-center gap-2">
        {isUser ? <Sparkles size={15} className="text-cyan-300" /> : <Bot size={15} className="text-emerald-300" />}
        <span className="data-text text-[10px] uppercase tracking-wider text-zinc-500">{isUser ? 'You' : 'LifeOS'}</span>
        {skill ? (
          <span
            className="data-text max-w-28 truncate rounded border border-cyan-400/15 bg-cyan-400/[0.06] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-cyan-300"
            title={skill.label}
          >
            {skill.badge}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          {!isUser ? (
            <button
              type="button"
              onClick={() => onSaveToVault?.(message)}
              className="grid h-7 w-7 place-items-center rounded border border-white/10 bg-white/[0.03] text-zinc-500 hover:border-emerald-400/25 hover:text-emerald-200"
              aria-label="Save assistant answer to Vault"
              title="Save to Vault"
            >
              <Save size={13} />
            </button>
          ) : null}
          {message.created_at ? <span className="data-text text-[10px] text-zinc-600">{formatMessageTime(message.created_at)}</span> : null}
        </span>
      </div>
      {isUser
        ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{message.content}</p>
        : <AssistantMarkdown content={message.content} />}
    </article>
  );
}

function mergeBrainMessages(persistedMessages = [], pendingMessages = []) {
  const persisted = dedupePersistedBrainMessages(Array.isArray(persistedMessages) ? persistedMessages : []);
  const pending = Array.isArray(pendingMessages) ? pendingMessages : [];
  const visiblePending = pending.filter((pendingMessage) => !hasMatchingPersistedMessage(pendingMessage, persisted));
  return [...persisted, ...visiblePending].sort((left, right) => {
    const leftTime = Date.parse(left.created_at ?? '') || 0;
    const rightTime = Date.parse(right.created_at ?? '') || 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    if (left.pending && !right.pending) return 1;
    if (!left.pending && right.pending) return -1;
    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}

function dedupePersistedBrainMessages(messages) {
  const seenClientMessages = new Set();
  return [...messages]
    .sort((left, right) => (Date.parse(left.created_at ?? '') || 0) - (Date.parse(right.created_at ?? '') || 0))
    .filter((message) => {
      const clientRequestId = getMessageClientRequestId(message);
      if (!clientRequestId) return true;
      const key = `${message.role}:${clientRequestId}`;
      if (seenClientMessages.has(key)) return false;
      seenClientMessages.add(key);
      return true;
    });
}

function hasMatchingPersistedMessage(pendingMessage, persistedMessages) {
  const clientRequestId = getMessageClientRequestId(pendingMessage);
  if (clientRequestId) {
    return persistedMessages.some((message) => (
      message.role === pendingMessage.role
      && getMessageClientRequestId(message) === clientRequestId
    ));
  }

  const pendingContent = normalizeMessageContent(pendingMessage.content);
  const pendingTime = Date.parse(pendingMessage.created_at ?? '');
  if (!pendingContent || !Number.isFinite(pendingTime)) return false;
  return persistedMessages.some((message) => {
    if (message.role !== pendingMessage.role) return false;
    if (normalizeMessageContent(message.content) !== pendingContent) return false;
    const persistedTime = Date.parse(message.created_at ?? '');
    return Number.isFinite(persistedTime) && Math.abs(persistedTime - pendingTime) <= 120_000;
  });
}

function getMessageClientRequestId(message) {
  return String(message?.client_request_id || message?.metadata?.client_request_id || '').trim();
}

function normalizeMessageContent(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function createClientRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isNearPageBottom(threshold = 160) {
  const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const scrollHeight = Math.max(document.documentElement.scrollHeight || 0, document.body?.scrollHeight || 0);
  return scrollHeight - (scrollTop + viewportHeight) <= threshold;
}

function normalizeMessageSkill(value) {
  if (!value || typeof value !== 'object') return null;
  const label = String(value.label || value.id || '').trim();
  if (!label) return null;
  return {
    label,
    badge: String(value.badge || label).replaceAll('_', ' ').slice(0, 16),
  };
}

function defaultVaultTypeForMessage(message) {
  const skillId = message.metadata?.selected_skill?.id;
  if (skillId === 'workout_coach') return 'workout_report';
  if (skillId === 'project_ops_coach') return 'project_report';
  if (skillId === 'finance_analyst') return 'finance_report';
  if (skillId === 'product_builder') return 'product_report';
  if (skillId === 'life_review') return 'life_review';
  return 'brain_answer';
}

function defaultVaultTags(message, documentType) {
  const skillId = message.metadata?.selected_skill?.id;
  if (skillId === 'workout_coach') return 'workout';
  if (skillId === 'project_ops_coach') return 'projects, ops';
  if (skillId === 'finance_analyst') return 'finance';
  if (skillId === 'product_builder') return 'product, lifeos';
  if (documentType === 'life_review') return 'life_review';
  return 'brain';
}

function defaultVaultTitle(message) {
  const content = String(message.content ?? '')
    .replace(/[#>*_`[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = content.split(' ').filter(Boolean).slice(0, 8);
  return words.length ? words.join(' ') : 'Brain Vault Report';
}

function parseTags(value) {
  return String(value ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatDocumentType(value) {
  return String(value || 'note').replaceAll('_', ' ');
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: 'short',
  });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''));
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
