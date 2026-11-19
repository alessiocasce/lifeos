import { getLocale, formatDate } from '../i18n';
import { t } from '../i18n';
import {
  Archive,
  ArrowUp,
  BrainCircuit,
  Check,
  ChevronDown,
  Copy,
  History,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AiActionHistoryList, AssistantMarkdown } from '../components/AiActionHistory';
import { CompanionState } from '../components/CompanionState';
import { Panel, PanelHeader, Tag } from '../components/ui';
import { useLifeOS } from '../context/LifeOSContext';
import { sendLifeOSAiMessage } from '../services/aiApi';
import { addDays, localDate } from '../utils/date';
import '../styles/companion.css';

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
    reembedAiVaultDocuments,
    saveBrainMessageToVault,
    startNewAiChatDraft,
    selectAiChatThread,
    updateAiMemory,
  } = useLifeOS();
  const [aiInput, setAiInput] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [contextMounted, setContextMounted] = useState(false);
  const contextDialogRef = useRef(null);
  const contextTriggerRef = useRef(null);
  const contextMotionRef = useRef(null);
  const composerRef = useRef(null);
  const focusComposerRef = useRef(false);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [aiStatus, setAiStatus] = useState('idle');
  const [aiError, setAiError] = useState(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState(null);
  const [memoryDraft, setMemoryDraft] = useState({ title: '', content: '' });
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryError, setMemoryError] = useState('');
  const memoryMutationRef = useRef(false);
  const [recentActionsExpanded, setRecentActionsExpanded] = useState(false);
  const [showActionErrors, setShowActionErrors] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [visibleReportCount, setVisibleReportCount] = useState(5);
  const [visibleConversationCount, setVisibleConversationCount] = useState(20);
  const [vaultDetail, setVaultDetail] = useState(null);
  const vaultDetailOpenerRef = useRef(null);
  const [vaultSaveMessage, setVaultSaveMessage] = useState(null);
  const [vaultSaveDraft, setVaultSaveDraft] = useState({ title: '', documentType: 'brain_answer', tags: '' });
  const [vaultSaveStatus, setVaultSaveStatus] = useState('idle');
  const [vaultSaveError, setVaultSaveError] = useState('');
  const vaultMutationRef = useRef(false);
  const [vaultArchiveBusy, setVaultArchiveBusy] = useState(false);
  const [vaultArchiveError, setVaultArchiveError] = useState('');
  const [vaultRepairStatus, setVaultRepairStatus] = useState('idle');
  const [vaultRepairMessage, setVaultRepairMessage] = useState('');
  const [lastFailedMessage, setLastFailedMessage] = useState(null);
  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const userPinnedToBottomRef = useRef(true);
  const [showLatestMessages, setShowLatestMessages] = useState(false);
  const forceScrollRef = useRef(false);
  const sendingRef = useRef(false);

  const messages = useMemo(
    () => mergeBrainMessages(activeAiChatMessages, pendingMessages),
    [activeAiChatMessages, pendingMessages],
  );
  const messageScrollKey = useMemo(() => {
    const latest = messages[messages.length - 1];
    return [messages.length, latest?.id, latest?.created_at, latest?.content?.length, aiStatus, aiError?.message].join('|');
  }, [messages, aiStatus, aiError?.message]);
  const actionLimit = recentActionsExpanded ? aiActionLogs.length : 3;
  const successfulActionLogs = useMemo(
    () => aiActionLogs.filter((log) => log.status !== 'error'),
    [aiActionLogs],
  );
  const failedActionCount = aiActionLogs.length - successfulActionLogs.length;
  const brainActionLogs = showActionErrors ? aiActionLogs : successfulActionLogs;

  useEffect(() => {
    const dialog = contextDialogRef.current;
    if (contextOpen) {
      setContextMounted(true);
      if (!dialog.open) {
        dialog.showModal();
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        contextMotionRef.current?.cancel();
        contextMotionRef.current = dialog.animate([
          { opacity: 0, transform: reduced ? 'none' : 'translateX(24px) scale(.98)' },
          { opacity: 1, transform: 'translateX(0) scale(1)' },
        ], { duration: reduced ? 100 : 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      } else {
        contextMotionRef.current?.updatePlaybackRate(1);
        contextMotionRef.current?.play();
      }
      contextMotionRef.current.onfinish = null;
    } else if (dialog.open) {
      const animation = contextMotionRef.current;
      const finishClosing = () => {
        dialog.close();
        setContextMounted(false);
        if (focusComposerRef.current) {
          focusComposerRef.current = false;
          composerRef.current?.focus();
        } else {
          contextTriggerRef.current?.focus({ preventScroll: true });
        }
      };
      if (Number(animation.currentTime) <= 0) finishClosing();
      else {
        // An opening finish event may already be queued when reversal begins.
        animation.onfinish = () => {
          if (animation.playbackRate < 0 && Number(animation.currentTime) <= 0) finishClosing();
        };
        animation.reverse();
      }
    }
  }, [contextOpen]);

  useEffect(() => () => { contextMotionRef.current?.cancel(); }, []);

  useEffect(() => {
    if (!contextMounted) return undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [contextMounted]);

  useEffect(() => {
    const input = composerRef.current;
    if (!input) return;
    resizeMessageInput(input);
  }, [aiInput]);

  useEffect(() => {
    const input = composerRef.current;
    let previousWidth;
    const observer = new ResizeObserver(([entry]) => {
      // Height changes are produced by the auto-grow helper itself. Resetting
      // height to auto again on every height notification causes visible churn.
      if (entry.contentRect.width === previousWidth) return;
      previousWidth = entry.contentRect.width;
      resizeMessageInput(input);
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updatePinnedState = () => {
      const pinned = isNearScrollBottom(messagesContainerRef.current);
      userPinnedToBottomRef.current = pinned;
      setShowLatestMessages(!pinned);
    };
    const container = messagesContainerRef.current;
    if (!container) return undefined;
    updatePinnedState();
    container.addEventListener('scroll', updatePinnedState, { passive: true });
    const observer = new ResizeObserver(() => {
      // Keyboard/composer resizing must retain the reader's existing intent.
      // Recomputing pinned state first would strand the latest reply below view.
      if (userPinnedToBottomRef.current) scrollMessagesToBottom(container);
      updatePinnedState();
    });
    observer.observe(container);
    return () => {
      container.removeEventListener('scroll', updatePinnedState);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const shouldScroll = forceScrollRef.current || userPinnedToBottomRef.current;
    if (!shouldScroll) { setShowLatestMessages(true); return; }
    const behavior = forceScrollRef.current && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto';
    const frame = window.requestAnimationFrame(() => {
      scrollMessagesToBottom(messagesContainerRef.current, behavior);
      forceScrollRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messageScrollKey, aiStatus, aiError]);

  useEffect(() => {
    userPinnedToBottomRef.current = true;
    setShowLatestMessages(false);
    scrollMessagesToBottom(messagesContainerRef.current);
  }, [activeAiThreadId]);

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
    if (!vaultSaveMessage || vaultMutationRef.current) return;
    vaultMutationRef.current = true;
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
        setVaultRepairMessage(t("Saved; Gemini key missing - embeddings skipped."));
        setVaultRepairStatus('ready');
      } else if (embeddingResult && Number(embeddingResult.failed ?? 0) > 0) {
        setVaultRepairMessage(t("Saved; embeddings failed. Try Re-embed later."));
        setVaultRepairStatus('error');
      } else {
        setVaultRepairMessage('');
        setVaultRepairStatus('idle');
      }
    } catch (error) {
      setVaultSaveError(error.message || t("Could not save to Vault."));
      setVaultSaveStatus('error');
    } finally { vaultMutationRef.current = false; }
  };

  const archiveVaultReport = async (documentId) => {
    if (vaultMutationRef.current) return;
    vaultMutationRef.current = true;
    setVaultArchiveBusy(true);
    setVaultArchiveError('');
    try {
      await archiveAiVaultDocument(documentId);
      setVaultDetail(null);
    } catch (error) { setVaultArchiveError(error.message || t("Report was not archived.")); }
    finally { vaultMutationRef.current = false; setVaultArchiveBusy(false); }
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
        setVaultRepairMessage(t("No chunks need repair."));
      } else if (ready > 0) {
        setVaultRepairMessage(t("Re-embedded {v0} chunk{v1}.", { v0: ready, v1: ready === 1 ? '' : 's' }));
      } else if (skipped > 0 && !result?.configured) {
        setVaultRepairMessage(t("Gemini key missing - embeddings skipped."));
      } else {
        setVaultRepairMessage(t("Processed {v0}; {v1} failed.", { v0: processed, v1: failed }));
      }
      setVaultRepairStatus('ready');
    } catch (error) {
      setVaultRepairStatus('error');
      setVaultRepairMessage(error.message || t("Embedding repair failed."));
    }
  };

  const handleNewChat = async () => {
    setAiError(null);
    setPendingMessages([]);
    setAiInput('');
    setLastFailedMessage(null);
    startNewAiChatDraft?.();
    composerRef.current?.focus();
  };

  const beginMemoryEdit = (memory) => {
    setMemoryError('');
    setEditingMemoryId(memory.id);
    setMemoryDraft({ title: memory.title, content: memory.content });
  };

  const saveMemoryEdit = async (memoryId) => {
    const title = memoryDraft.title.trim();
    const content = memoryDraft.content.trim();
    if (!title || !content) return;
    if (memoryMutationRef.current) return;
    memoryMutationRef.current = true;
    setMemoryBusy(true);
    setMemoryError('');
    try {
      await updateAiMemory(memoryId, { title, content, source: 'manual' });
      setEditingMemoryId(null);
    } catch (error) { setMemoryError(error.message || t("Memory was not saved.")); }
    finally { memoryMutationRef.current = false; setMemoryBusy(false); }
  };

  const forgetMemory = async (memoryId) => {
    if (memoryMutationRef.current) return;
    memoryMutationRef.current = true;
    setMemoryBusy(true);
    setMemoryError('');
    try { await archiveAiMemory(memoryId); }
    catch (error) { setMemoryError(error.message || t("Memory was not forgotten.")); }
    finally { memoryMutationRef.current = false; setMemoryBusy(false); }
  };

  return (
    <div className="companion-workspace">
      <section className="companion-conversation">
        <header className="companion-toolbar">
          <div className="companion-mark" aria-hidden="true"><BrainCircuit size={23} /></div>
          <div className="mr-auto min-w-0">
            <h2 className="companion-title">Companion</h2>
            <p className="companion-thread-title">{aiChatThreads.find((thread) => thread.id === activeAiThreadId)?.title || t("New conversation")}</p>
          </div>
          <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={handleNewChat}
            disabled={aiStatus === 'loading'}
            className="icon-button disabled:opacity-40"
            aria-label={t("New Brain chat")}
            title={t("New chat")}
          >
            <MessageSquarePlus size={17} />
          </button>
          <button ref={contextTriggerRef} type="button" className="icon-button" aria-label={t("Open Companion context")} title={t("Companion context")} aria-haspopup="dialog" aria-expanded={contextOpen} onClick={() => setContextOpen(true)}><SlidersHorizontal size={17} /></button>
          </div>
        </header>

        <div className="companion-transcript">
        <div
          ref={messagesContainerRef}
          className={`companion-messages ${!messages.length ? 'is-empty' : ''}`}
          aria-label={t("Brain conversation messages")}
          role="log"
          tabIndex={-1}
          data-testid="brain-message-list"
        >
          {aiChatMessagesStatus === 'loading' && !messages.length ? (
            <div className="grid min-h-48 place-items-center text-zinc-500">
              <Loader2 size={20} className="animate-spin" aria-label={t("Loading Brain messages")} />
            </div>
          ) : messages.length ? (
            messages.map((message) => <AssistantMessage key={message.id} message={message} onSaveToVault={openVaultSave} />)
          ) : (
            <div className="companion-welcome">
              <div>
                <div className="companion-welcome-mark" aria-hidden="true">
                  <BrainCircuit size={32} strokeWidth={1.4} />
                </div>
                <h3>{t("What's on your mind?")}</h3>
                <p>{t('A thought, a plan, a little clarity.')}</p>
                <div className="companion-starters" aria-label={t('Conversation starters')}>
                  {[
                    [t('Plan my day'), t('Help me plan my day.')],
                    [t('Review my training'), t('Help me review my recent training.')],
                    [t('Think it through'), t('Help me think through a decision: ')],
                  ].map(([label, draft]) => <button key={label} type="button" onClick={() => {
                    setAiInput(draft);
                    composerRef.current?.focus();
                  }}>{label}<ArrowUp size={15} aria-hidden="true" /></button>)}
                </div>
              </div>
            </div>
          )}

          {aiStatus === 'loading' ? (
            <div
              className="companion-thinking mr-auto inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              data-testid="brain-loading-indicator"
              role="status"
            >
              <Loader2 size={13} className="animate-spin" />{t('Companion is thinking...')}</div>
          ) : null}

          {aiError ? <AssistantError error={aiError} onRetry={lastFailedMessage ? retryLastFailedMessage : null} /> : null}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>
        {showLatestMessages ? <button type="button" className="companion-latest" onClick={() => {
          userPinnedToBottomRef.current = true;
          scrollMessagesToBottom(messagesContainerRef.current, matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
          messagesContainerRef.current?.focus({ preventScroll: true });
        }}><ChevronDown size={16} aria-hidden="true" />{t('Latest messages')}</button> : null}
        </div>

        <form
          onSubmit={submitAiMessage}
          className="companion-composer"
        >
          <div className="flex min-w-0 items-end gap-2">
            <textarea
              ref={composerRef}
              rows={1}
              inputMode="text"
              enterKeyHint="send"
              value={aiInput}
              onChange={(event) => {
                setAiInput(event.target.value);
                setAiError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (aiStatus !== 'loading' && !sendingRef.current) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }
              }}
              placeholder={t('Message...')}
              aria-label={t("Brain message input")}
              data-testid="brain-message-input"
              className="companion-input"
            />
            <button
              type="submit"
              onPointerDown={event => { if (event.isPrimary && event.button === 0) event.preventDefault(); }}
              onMouseDown={event => event.preventDefault()}
              disabled={aiStatus === 'loading' || !aiInput.trim()}
              className="companion-send"
              aria-label={t("Send Brain message")}
              title={aiStatus === 'loading' ? t("Brain is thinking") : t("Send message")}
              aria-busy={aiStatus === 'loading'}
              data-testid="brain-send-button"
            >
              {aiStatus === 'loading' ? <Loader2 size={20} className="animate-spin" /> : <ArrowUp size={22} />}
            </button>
          </div>
        </form>
      </section>

      <dialog ref={contextDialogRef} className="companion-context-dialog" aria-labelledby="companion-context-title" onCancel={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); setContextOpen(false); } }} onPointerDown={() => { if (!contextOpen) setContextOpen(true); }} onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setContextOpen(false);
      }}>
        <header className="companion-context-header">
          <h2 id="companion-context-title" className="text-lg font-semibold">{t("Companion context")}</h2>
          <button type="button" className="icon-button" aria-label={t("Close Companion context")} onClick={() => setContextOpen(false)}><X size={18} /></button>
        </header>
        <div className="companion-context-body">
        <section aria-label={t("Recent conversations")}>
          <h3 className="mb-2 text-sm font-semibold">{t("Conversations")}</h3>
          {aiChatThreads.length ? aiChatThreads.slice(0, visibleConversationCount).map((thread) => <button key={thread.id} type="button" disabled={aiStatus === 'loading'} aria-current={thread.id === activeAiThreadId ? 'true' : undefined} className="flex min-h-11 w-full items-center border-b border-white/10 py-3 text-left text-sm text-zinc-300 disabled:opacity-40" onClick={() => {
            selectAiChatThread(thread.id);
            setPendingMessages([]);
            setAiError(null);
            setLastFailedMessage(null);
            setContextOpen(false);
          }}>{thread.title || t("Untitled conversation")}</button>) : <p className="py-3 text-sm text-zinc-500">{t("No saved conversations.")}</p>}
          {aiChatThreads.length > visibleConversationCount ? <button type="button" className="min-h-11 text-sm text-zinc-300" onClick={() => setVisibleConversationCount((count) => count + 20)}>{t("View more conversations")}</button> : null}
          {visibleConversationCount > 20 ? <button type="button" className="min-h-11 text-sm text-zinc-400" onClick={() => setVisibleConversationCount(20)}>{t("Show fewer conversations")}</button> : null}
        </section>
        {contextMounted ? <CompanionState onCorrect={(item) => {
          setAiInput(`LifeOS, update your understanding of ${item.label.toLowerCase()}: `);
          focusComposerRef.current = true;
          setContextOpen(false);
        }} /> : null}
        <Panel>
          <PanelHeader eyebrow={t("Action History")} title={t("Recent Actions")} right={<History size={16} className="text-violet-300" />} />
          <div className="grid gap-2 p-3">
            <AiActionHistoryList logs={brainActionLogs} status={aiActionLogsStatus} limit={actionLimit} quietErrors />
            <div className="flex flex-wrap gap-2">
              {brainActionLogs.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setRecentActionsExpanded((expanded) => !expanded)}
                  className="min-h-11 rounded border border-white/10 px-3 text-sm text-zinc-400"
                >
                  {recentActionsExpanded ? t("Show less") : t("View more")}
                </button>
              ) : null}
              {failedActionCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowActionErrors((shown) => !shown)}
                  className="min-h-11 rounded border border-white/10 px-3 text-sm text-zinc-400"
                >
                  {showActionErrors ? t("Hide errors") : t("Errors ({v0})", { v0: failedActionCount })}
                </button>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel>
          <button
            type="button"
            onClick={() => setDiagnosticsOpen((open) => !open)}
            className="flex w-full min-w-0 items-center justify-between gap-3 border-b border-white/5 px-3 py-2 text-left"
            aria-expanded={diagnosticsOpen}
          >
            <div className="min-w-0">
              <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">{t("Diagnostics")}</p>
              <h2 className="truncate text-sm font-semibold text-zinc-100">{t("Brain Data")}</h2>
            </div>
            <ChevronDown size={16} className={`shrink-0 text-zinc-500 transition ${diagnosticsOpen ? 'rotate-180' : ''}`} />
          </button>

          {diagnosticsOpen ? (
            <div className="grid gap-3 p-3">
              <DiagnosticsSection
                count={aiVaultDocuments.length}
                label={t("Vault")}
                open={vaultOpen}
                tone="emerald"
                title={t("Saved Reports")}
                onToggle={() => setVaultOpen((open) => !open)}
              />
              {vaultOpen ? (
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">{t("Auto-saved reports and semantic context.")}</p>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={repairVaultEmbeddings}
                        disabled={vaultRepairStatus === 'loading'}
                        className="inline-flex min-h-11 items-center gap-2 rounded border border-white/10 px-3 text-sm text-zinc-300 disabled:opacity-50"
                      >
                        {vaultRepairStatus === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}{t("Re-embed")}</button>
                      <button
                        type="button"
                        onClick={() => reloadAiVaultDocuments?.()}
                        className="icon-button"
                        aria-label={t("Refresh Vault documents")}
                      >
                        <RefreshCw size={13} />
                      </button>
                    </div>
                  </div>
                  {vaultRepairMessage ? (
                    <p className={`text-xs ${vaultRepairStatus === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>{vaultRepairMessage}</p>
                  ) : null}
                  {aiVaultStatus === 'loading' && !aiVaultDocuments.length ? (
                    <p className="py-3 text-center text-sm text-zinc-500">{t("Loading Vault...")}</p>
                  ) : aiVaultDocuments.length ? (
                    aiVaultDocuments.slice(0, visibleReportCount).map((document) => (
                      <VaultDocumentCard
                        key={document.id}
                        document={document}
                        onOpen={(event) => { vaultDetailOpenerRef.current = event.currentTarget; setVaultArchiveError(''); setVaultDetail(document); }}
                        busy={vaultArchiveBusy}
                        onArchive={() => archiveVaultReport(document.id)}
                      />
                    ))
                  ) : (
                    <p className="rounded-md border border-dashed border-white/10 bg-black/20 p-3 text-xs leading-5 text-zinc-500">{t("Valuable long-form answers save here automatically.")}</p>
                  )}
                  {aiVaultDocuments.length > visibleReportCount ? <button type="button" disabled={vaultArchiveBusy} className="min-h-11 text-left text-sm text-zinc-300" onClick={() => setVisibleReportCount((count) => count + 5)}>{t("View more reports")}</button> : null}
                  {visibleReportCount > 5 ? <button type="button" disabled={vaultArchiveBusy} className="min-h-11 text-left text-sm text-zinc-400" onClick={() => setVisibleReportCount(5)}>{t("Show fewer reports")}</button> : null}
                  {aiVaultError ? <p className="text-xs text-red-300">{t(aiVaultError)}</p> : null}
                  {vaultArchiveError ? <p role="alert" className="text-sm text-red-300">{t(vaultArchiveError)}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </Panel>
        <Panel>
            <div className="grid gap-3 py-3">
              <DiagnosticsSection
                count={aiMemories.length}
                label={t("Memory")}
                open={memoryOpen}
                tone="violet"
                title={t("Saved memories")}
                onToggle={() => setMemoryOpen((open) => !open)}
              />
              {memoryOpen ? (
                <div className="grid gap-2">
                  {memoryError ? <p role="alert" className="text-sm text-red-300">{t(memoryError)}</p> : null}
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => Promise.allSettled([reloadAiMemories?.(), reloadAiInsights?.()].filter(Boolean))}
                      className="inline-flex min-h-11 items-center gap-2 rounded border border-white/10 px-3 text-sm text-zinc-300"
                    >
                      <RefreshCw size={13} />{t("Refresh")}</button>
                  </div>
                  {aiMemoriesStatus === 'loading' && !aiMemories.length ? (
                    <p className="py-3 text-center text-sm text-zinc-500">{t("Loading memory...")}</p>
                  ) : aiMemories.length ? (
                    aiMemories.map((memory) => (
                      <MemoryCard
                        key={memory.id}
                        memory={memory}
                        editing={editingMemoryId === memory.id}
                        draft={memoryDraft}
                        busy={memoryBusy}
                        onDraftChange={setMemoryDraft}
                        onEdit={() => beginMemoryEdit(memory)}
                        onCancel={() => setEditingMemoryId(null)}
                        onSave={() => saveMemoryEdit(memory.id)}
                        onArchive={() => forgetMemory(memory.id)}
                      />
                    ))
                  ) : (
                    <p className="rounded-md border border-dashed border-white/10 bg-black/20 p-3 text-xs leading-5 text-zinc-500">{t("Memory builds invisibly as you use Brain.")}</p>
                  )}

                  {aiInsights.length ? (
                    <details className="border-t border-white/10 py-3">
                      <summary className="min-h-11 cursor-pointer text-sm text-zinc-400">{t("Recent insights")}</summary>
                      <div className="mt-3 grid gap-2">
                        {aiInsights.slice(0, 3).map((insight) => (
                          <div key={insight.id} className="border-b border-white/10 py-3">
                            <p className="text-xs font-semibold text-zinc-200">{insight.title}</p>
                            <p className="mt-1 text-xs leading-5 text-zinc-500">{insight.content}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>
        </Panel>
        </div>
      </dialog>

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
          returnFocus={vaultDetailOpenerRef.current}
          busy={vaultArchiveBusy}
          error={vaultArchiveError}
          onClose={() => setVaultDetail(null)}
          onArchive={() => archiveVaultReport(vaultDetail.id)}
        />
      ) : null}
    </div>
  );
}

function DiagnosticsSection({ count, label, onToggle, open, title }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 border-b border-white/10 py-3 text-left"
      aria-expanded={open}
    >
      <div className="min-w-0">
        <p className="text-xs text-zinc-400">{label}</p>
        <h3 className="truncate text-sm font-semibold text-zinc-100">{title}</h3>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Tag>{count}</Tag>
        <ChevronDown size={15} className={`text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
      </div>
    </button>
  );
}

function MemoryCard({ memory, editing, draft, busy, onDraftChange, onEdit, onCancel, onSave, onArchive }) {
  if (editing) {
    return (
      <div className="grid gap-2 border-b border-white/10 py-3">
        <input
          value={draft.title}
          onChange={(event) => onDraftChange((current) => ({ ...current, title: event.target.value }))}
          className="min-h-11 rounded border border-white/15 bg-[#14171b] px-3 text-base text-zinc-100 outline-none focus:border-zinc-400"
          aria-label={t("Memory title")}
        />
        <textarea
          rows={3}
          value={draft.content}
          onChange={(event) => onDraftChange((current) => ({ ...current, content: event.target.value }))}
          className="rounded border border-white/15 bg-[#14171b] px-3 py-2 text-base text-zinc-100 outline-none focus:border-zinc-400"
          aria-label={t("Memory content")}
        />
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="icon-button" aria-label={t("Cancel memory edit")}>
            <X size={15} />
          </button>
          <button type="button" disabled={busy || !draft.title.trim() || !draft.content.trim()} onClick={onSave} className="icon-button" aria-label={t("Save memory")}>
            <Save size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <article className="min-w-0 border-b border-white/10 py-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <Tag>{String(memory.category || 'other').replaceAll('_', ' ')}</Tag>
          <h3 className="mt-2 text-sm font-semibold text-zinc-100">{memory.title}</h3>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" disabled={busy} onClick={onEdit} className="min-h-11 rounded border border-white/10 px-3 text-sm text-zinc-400 hover:text-zinc-200">{t("Edit")}</button>
          <button type="button" disabled={busy} onClick={onArchive} className="icon-button" aria-label={t("Forget {v0}", { v0: memory.title })}>
            <Archive size={14} />
          </button>
        </div>
      </div>
      <p className="mt-2 break-words text-xs leading-5 text-zinc-400">{memory.content}</p>
      <p className="data-text mt-2 text-[10px] text-zinc-600">{t("Importance ")}{memory.importance}/5</p>
    </article>
  );
}

function VaultDocumentCard({ document, busy, onOpen, onArchive }) {
  return (
    <article className="min-w-0 border-b border-white/10 py-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <button type="button" disabled={busy} onClick={onOpen} className="min-h-11 min-w-0 flex-1 text-left">
          <Tag>{formatDocumentType(document.document_type)}</Tag>
          <h3 className="mt-2 truncate text-sm font-semibold text-zinc-100">{document.title}</h3>
          {document.summary ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{document.summary}</p> : null}
        </button>
        <button type="button" disabled={busy} onClick={onArchive} className="icon-button shrink-0" aria-label={t("Archive {v0}", { v0: document.title })}>
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
  const dialogRef = useRef(null);
  const busy = status === 'saving';
  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <dialog ref={dialogRef} aria-labelledby="vault-save-title" onCancel={(event) => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }} className="vault-dialog w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded border border-white/10 bg-[#111] p-4 text-zinc-100">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="data-text text-[10px] uppercase tracking-wider text-emerald-300">{t("Vault")}</p>
            <h2 id="vault-save-title" className="text-base font-semibold text-zinc-100">{t("Save Brain Answer")}</h2>
          </div>
          <button type="button" disabled={busy} onClick={onClose} className="icon-button" aria-label={t("Close Vault save")}>
            <X size={16} />
          </button>
        </div>
        <fieldset disabled={busy} className="grid min-w-0 gap-3">
          <label className="grid gap-1 text-sm text-zinc-300">{t("Title")}<input
              value={draft.title}
              onChange={(event) => onDraftChange((current) => ({ ...current, title: event.target.value }))}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-base text-zinc-100 outline-none focus:border-emerald-400/40"
            />
          </label>
          <label className="grid gap-1 text-sm text-zinc-300">{t("Type")}<select
              value={draft.documentType}
              onChange={(event) => onDraftChange((current) => ({ ...current, documentType: event.target.value }))}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-base text-zinc-100 outline-none focus:border-emerald-400/40"
            >
              <option value="brain_answer">{t("Brain Answer")}</option>
              <option value="workout_report">{t("Workout Report")}</option>
              <option value="project_report">{t("Project Report")}</option>
              <option value="finance_report">{t("Finance Report")}</option>
              <option value="life_review">{t("Life Review")}</option>
              <option value="product_report">{t("Product Report")}</option>
              <option value="note">{t("Note")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm text-zinc-300">{t("Tags")}<input
              value={draft.tags}
              onChange={(event) => onDraftChange((current) => ({ ...current, tags: event.target.value }))}
              placeholder={t("workout, back_day")}
              className="h-11 rounded-md border border-white/10 bg-black/40 px-3 text-base text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-emerald-400/40"
            />
          </label>
          {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="min-h-11 rounded border border-white/10 px-3 text-sm text-zinc-400">{t("Cancel")}</button>
            <button
              type="button"
              onClick={onSave}
              disabled={status === 'saving' || !draft.title.trim()}
              className="inline-flex min-h-11 items-center gap-2 rounded bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-50"
            >
              {status === 'saving' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{t("Save")}</button>
          </div>
        </fieldset>
    </dialog>
  );
}

function VaultDetailModal({ document, busy, error, returnFocus, onClose, onArchive }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousFocus = returnFocus || document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => {
      dialog.close();
      queueMicrotask(() => { if (previousFocus?.isConnected) previousFocus.focus(); });
    };
  }, []);
  return (
    <dialog ref={dialogRef} aria-labelledby="vault-detail-title" onCancel={(event) => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }} className="vault-dialog w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded border border-white/10 bg-[#111] p-4 text-zinc-100">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Tag tone="emerald">{formatDocumentType(document.document_type)}</Tag>
            <h2 id="vault-detail-title" className="mt-2 break-words text-lg font-semibold text-zinc-100">{document.title}</h2>
            <p className="data-text mt-1 text-[10px] text-zinc-600">{formatShortDate(document.created_at)}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" disabled={busy} onClick={onArchive} className="icon-button" aria-label={t("Archive Vault document")}>
              <Archive size={16} />
            </button>
            <button type="button" disabled={busy} onClick={onClose} className="icon-button" aria-label={t("Close Vault document")}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-1">
          {(document.tags ?? []).map((tag) => <Tag key={tag}>{tag}</Tag>)}
          {(document.links ?? []).slice(0, 8).map((link) => <Tag key={link} tone="cyan">[[{link}]]</Tag>)}
        </div>
        {error ? <p role="alert" className="mb-3 text-sm text-red-300">{error}</p> : null}
        <div className="min-w-0 border-t border-white/10 pt-3">
          <AssistantMarkdown content={document.content_md || ''} />
        </div>
    </dialog>
  );
}

function AssistantError({ error, onRetry }) {
  return (
    <div className="rounded-md border border-red-400/20 bg-red-400/[0.06] p-3" data-testid="brain-error" role="alert">
      <p className="text-sm font-medium text-red-200">{error.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {error.providerStatus ? <Tag tone="amber">{t("Provider: ")}{error.providerStatus}</Tag> : null}
        {error.requestId ? <Tag tone="zinc">{t("Request: ")}{error.requestId}</Tag> : null}
        {error.code ? <Tag tone="amber">{error.code}</Tag> : null}
      </div>
      {error.providerMessage ? <p className="mt-2 text-xs leading-5 text-zinc-400">{error.providerMessage}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-11 rounded border border-red-300/20 bg-red-300/10 px-4 text-sm font-semibold text-red-100 hover:border-red-200/40"
        >{t("Retry")}</button>
      ) : null}
    </div>
  );
}

function AssistantMessage({ message, onSaveToVault }) {
  const isUser = message.role === 'user';
  const skill = !isUser ? normalizeMessageSkill(message.metadata?.selected_skill) : null;
  const [copyState, setCopyState] = useState('idle');
  const copyTimer = useRef(null);
  const mounted = useRef(true);
  const articleRef = useRef(null);
  useEffect(() => {
    mounted.current = true;
    const animation = message.pending ? articleRef.current.animate([
      { opacity: 0, transform: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'translateY(6px)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }) : null;
    return () => { mounted.current = false; clearTimeout(copyTimer.current); animation?.cancel(); };
  }, [message.id, message.pending]);
  const copyMessage = async () => {
    clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(message.content);
      if (!mounted.current) return;
      setCopyState('copied');
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => { if (mounted.current) setCopyState('idle'); }, 2000);
    } catch {
      if (mounted.current) setCopyState('error');
    }
  };
  return (
    <article ref={articleRef} aria-label={isUser ? t('Your message') : t('Companion reply')} className={`companion-message ${isUser ? 'is-user' : 'is-assistant'}`}>
      {!isUser ? <header className="companion-message-meta">
        <span className="companion-reply-mark" aria-hidden="true"><BrainCircuit size={16} /></span>
        <span className="companion-message-author">Companion</span>
        {skill ? (
          <span
            className="companion-skill"
            title={skill.label}
          >
            {skill.badge}
          </span>
        ) : null}
      </header> : null}
      <div className="companion-message-body">
      {isUser
        ? <p className="whitespace-pre-wrap break-words">{message.content}</p>
        : <AssistantMarkdown content={message.content} />}
      </div>
      <footer className="companion-message-footer">
        {!isUser ? <div className="companion-message-actions">
          <button type="button" className="companion-message-action" aria-label={t('Copy reply')} onClick={copyMessage}>
            {copyState === 'copied' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}<span>{copyState === 'copied' ? t('Copied') : t('Copy')}</span>
          </button>
          {onSaveToVault ? (
            <button
              type="button"
              onClick={() => onSaveToVault?.(message)}
              className="companion-message-action"
              aria-label={t("Save assistant answer to Vault")}
              title={t("Save to Vault")}
            >
              <Save size={15} aria-hidden="true" /><span>{t('Save')}</span>
            </button>
          ) : null}
        </div> : null}
        {message.created_at ? <time className="companion-message-time" dateTime={message.created_at} title={formatShortDate(message.created_at)}>{formatMessageTime(message.created_at)}</time> : null}
      </footer>
      {!isUser ? <span className="companion-copy-status" role={copyState === 'error' ? 'alert' : 'status'}>{copyState === 'error' ? t('Could not copy. Try again.') : copyState === 'copied' ? t('Reply copied.') : ''}</span> : null}
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

function resizeMessageInput(input) {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
}

function scrollMessagesToBottom(container, behavior = 'auto') {
  if (!container) return;
  container.scrollTo({
    top: container.scrollHeight,
    behavior,
  });
}

function isNearScrollBottom(container, threshold = 160) {
  if (!container) return true;
  return container.scrollHeight - (container.scrollTop + container.clientHeight) <= threshold;
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
  return date.toLocaleDateString(getLocale(), {
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
  return date.toLocaleTimeString(getLocale(), {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  });
}
