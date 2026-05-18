import {
  AlarmClock,
  Bell,
  CalendarDays,
  Check,
  Clock3,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { Panel, PanelHeader, Tag } from '../components/ui';

const emptyForm = () => ({
  title: '',
  memo_date: '',
  memo_time: '',
  notes: '',
});

export function MemosTab() {
  const {
    createMemo,
    deleteMemo,
    memos,
    memosError,
    memosStatus,
    updateMemo,
  } = useLifeOS();
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [busyId, setBusyId] = useState(null);

  const today = getToday();
  const tomorrow = addDays(today, 1);
  const now = new Date();
  const groups = useMemo(() => groupMemos(memos, now), [memos, now]);
  const timelineGroups = useMemo(() => buildTimelineGroups(groups), [groups]);
  const nextMemo = groups.overdue[0] || groups.today[0] || groups.tomorrow[0] || groups.upcoming[0] || null;
  const hasTimelineMemos = timelineGroups.length > 0;
  const hasFloatingMemos = groups.noDate.length > 0;
  const hasClosedMemos = groups.doneRecently.length > 0;
  const hasAnyVisibleMemo = hasTimelineMemos || hasFloatingMemos || hasClosedMemos;
  const isInitialLoading = memosStatus === 'loading' && !memos.length;
  const editingMemo = editingId ? memos.find((memo) => memo.id === editingId) : null;

  useEffect(() => {
    if (!modalOpen) return undefined;

    const bodyStyle = document.body.style;
    const rootStyle = document.documentElement.style;
    const previousBody = {
      overflow: bodyStyle.overflow,
      overscrollBehavior: bodyStyle.overscrollBehavior,
    };
    const previousRoot = {
      overflow: rootStyle.overflow,
      overscrollBehavior: rootStyle.overscrollBehavior,
    };

    rootStyle.overflow = 'hidden';
    rootStyle.overscrollBehavior = 'none';
    bodyStyle.overflow = 'hidden';
    bodyStyle.overscrollBehavior = 'none';

    return () => {
      rootStyle.overflow = previousRoot.overflow;
      rootStyle.overscrollBehavior = previousRoot.overscrollBehavior;
      bodyStyle.overflow = previousBody.overflow;
      bodyStyle.overscrollBehavior = previousBody.overscrollBehavior;
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError('');
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setActionError('');
    setSaveStatus('idle');
    setModalOpen(true);
  };

  const openEdit = (memo) => {
    setEditingId(memo.id);
    setForm({
      title: memo.title ?? '',
      memo_date: memo.memo_date ?? '',
      memo_time: formatInputTime(memo.memo_time),
      notes: memo.notes ?? '',
    });
    setFormError('');
    setActionError('');
    setSaveStatus('idle');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setSaveStatus('idle');
  };

  const submit = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setFormError('Memo title is required.');
      return;
    }

    setSaveStatus('saving');
    setFormError('');
    setActionError('');
    try {
      const payload = {
        title,
        memo_date: form.memo_date || null,
        memo_time: form.memo_time || null,
        notes: form.notes.trim() || null,
        status: editingMemo?.status ?? 'open',
      };
      if (editingId) {
        await updateMemo(editingId, payload);
      } else {
        await createMemo(payload);
      }
      closeModal();
    } catch (error) {
      setFormError(error.message || 'Failed to save memo.');
      setSaveStatus('idle');
    }
  };

  const changeStatus = async (memo, status) => {
    setBusyId(`${memo.id}-${status}`);
    setActionError('');
    try {
      await updateMemo(memo.id, { status });
    } catch (error) {
      setActionError(error.message || 'Failed to update memo.');
    } finally {
      setBusyId(null);
    }
  };

  const removeMemo = async (memo) => {
    if (!window.confirm(`Delete memo "${memo.title}"?`)) return;
    setBusyId(`${memo.id}-delete`);
    setActionError('');
    try {
      await deleteMemo(memo.id);
      if (editingId === memo.id) closeModal();
    } catch (error) {
      setActionError(error.message || 'Failed to delete memo.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="grid min-w-0 gap-2 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+16px)] sm:gap-3">
      <Panel>
        <div className="grid gap-2 p-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:p-3">
          <div className="min-w-0">
            <p className="data-text text-[10px] uppercase tracking-wider text-cyan-300">Reminder Timeline</p>
            <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-100 sm:mt-1 sm:text-2xl">Memos</h2>
            <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-zinc-500 sm:block">
              Date-aware reminders, quick memory points, and loose tasks that do not belong on the calendar.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            aria-label="Create memo"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 text-sm font-semibold text-cyan-200 transition hover:border-cyan-300/50 sm:min-h-11 sm:px-4"
          >
            <Plus size={17} />
            New Memo
          </button>
        </div>
      </Panel>

      <div className="grid min-w-0 grid-cols-4 gap-1.5 rounded-md border border-white/5 bg-black/20 p-1.5 sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0">
        <MemoMetric label="Due Now" value={groups.overdue.length} tone={groups.overdue.length ? 'amber' : 'zinc'} />
        <MemoMetric label="Today" value={groups.today.length + groups.overdue.filter((memo) => memo.memo_date === today).length} tone="cyan" />
        <MemoMetric label="Upcoming" value={groups.tomorrow.length + groups.upcoming.length} tone="emerald" />
        <MemoMetric label="Floating" value={groups.noDate.length} tone="violet" />
      </div>

      {(actionError || memosError) ? (
        <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {actionError || memosError}
        </div>
      ) : null}

      {isInitialLoading ? (
        <LoadingState />
      ) : !hasAnyVisibleMemo ? (
        <GlobalEmptyState onCreate={openCreate} />
      ) : (
        <div className="grid min-w-0 gap-2 sm:gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Panel>
            <PanelHeader
              eyebrow="Open Dated Memos"
              title="Timeline"
              right={<AlarmClock size={16} className="text-cyan-300" />}
            />
            <div className="grid min-w-0 gap-2 p-2.5 sm:gap-3 sm:p-3">
              {nextMemo ? (
                <NextUpCard memo={nextMemo} today={today} />
              ) : null}

              {hasTimelineMemos ? (
                <div className="grid min-w-0 gap-4 sm:gap-5">
                  {timelineGroups.map((group) => (
                    <TimelineGroup
                      key={group.key}
                      busyId={busyId}
                      group={group}
                      onDelete={removeMemo}
                      onEdit={openEdit}
                      onStatus={changeStatus}
                    />
                  ))}
                </div>
              ) : (
                <SmallEmptyTimeline onCreate={openCreate} />
              )}
            </div>
          </Panel>

        {(hasFloatingMemos || hasClosedMemos) ? (
          <div className="grid min-w-0 gap-2 sm:gap-3">
            {hasFloatingMemos ? (
              <Panel>
                <PanelHeader
                  eyebrow={`${groups.noDate.length} open`}
                  title="Floating Memos"
                  right={<Bell size={16} className="text-violet-300" />}
                />
                <div className="grid min-w-0 gap-2 p-2.5 sm:p-3">
                  {groups.noDate.map((memo) => (
                    <FloatingMemoCard
                      key={memo.id}
                      busyId={busyId}
                      memo={memo}
                      onDelete={removeMemo}
                      onEdit={openEdit}
                      onStatus={changeStatus}
                    />
                  ))}
                </div>
              </Panel>
            ) : null}

            {hasClosedMemos ? (
              <Panel>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-white/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">{groups.doneRecently.length} recent</p>
                      <h2 className="truncate text-sm font-semibold text-zinc-100">Completed / Dismissed</h2>
                    </div>
                    <span className="data-text text-[10px] text-zinc-500 group-open:text-cyan-300">OPEN</span>
                  </summary>
                  <div className="grid min-w-0 gap-2 p-2.5 sm:p-3">
                    {groups.doneRecently.map((memo) => (
                      <FloatingMemoCard
                        key={memo.id}
                        busyId={busyId}
                        memo={memo}
                        muted
                        onDelete={removeMemo}
                        onEdit={openEdit}
                        onStatus={changeStatus}
                      />
                    ))}
                  </div>
                </details>
              </Panel>
            ) : null}
          </div>
        ) : null}
        </div>
      )}

      {modalOpen ? (
        <MemoEditorModal
          editing={Boolean(editingId)}
          error={formError}
          form={form}
          onChange={updateForm}
          onClose={closeModal}
          onQuickInOneHour={() => {
            const due = addMinutes(new Date(), 60);
            updateForm('memo_date', toDateString(due));
            updateForm('memo_time', toTimeString(due));
          }}
          onQuickTonight={() => {
            updateForm('memo_date', form.memo_date || today);
            updateForm('memo_time', '20:30');
          }}
          onSubmit={submit}
          saveStatus={saveStatus}
          today={today}
          tomorrow={tomorrow}
        />
      ) : null}
    </div>
  );
}

function MemoMetric({ label, tone, value }) {
  const toneClass = tone === 'amber'
    ? 'border-amber-400/20 bg-amber-400/[0.06] text-amber-300'
    : tone === 'cyan'
      ? 'border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-300'
      : tone === 'emerald'
        ? 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300'
        : tone === 'violet'
          ? 'border-violet-400/20 bg-violet-400/[0.06] text-violet-300'
          : 'border-white/10 bg-white/[0.03] text-zinc-300';
  return (
    <div className={`min-w-0 rounded border px-1.5 py-1 text-center sm:rounded-md sm:px-3 sm:py-2 sm:text-left ${toneClass}`}>
      <p className="data-text truncate text-[8px] uppercase tracking-wider opacity-80 sm:text-[10px]">{label}</p>
      <p className="data-text text-base font-bold text-zinc-100 sm:mt-1 sm:text-2xl">{value}</p>
    </div>
  );
}

function GlobalEmptyState({ onCreate }) {
  return (
    <div className="rounded-md border border-cyan-400/15 bg-cyan-400/[0.04] p-5 text-center sm:p-7">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-cyan-400/25 bg-cyan-400/10 text-cyan-300 shadow-glow">
        <Bell size={20} />
      </div>
      <p className="mt-4 text-lg font-semibold text-zinc-100">Memory queue clear.</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-zinc-500">Nothing is waiting for you.</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-200"
      >
        <Plus size={16} />
        Add Memo
      </button>
    </div>
  );
}

function NextUpCard({ memo, today }) {
  const overdue = isMemoOverdue(memo, today, getCurrentMinutes());
  return (
    <div className={`min-w-0 rounded-md border p-3 ${overdue ? 'border-amber-400/25 bg-amber-400/[0.07]' : 'border-cyan-400/20 bg-cyan-400/[0.05]'}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className={`data-text rounded border px-2 py-1 text-[10px] uppercase ${overdue ? 'border-amber-400/25 bg-amber-400/10 text-amber-300' : 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300'}`}>
          {overdue ? 'Due Now' : 'Next Up'}
        </span>
        <span className="data-text text-xs text-zinc-500">{formatMemoDue(memo)}</span>
      </div>
      <p className="mt-2 break-words text-base font-semibold text-zinc-100">{memo.title}</p>
      {memo.notes ? <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-zinc-500">{memo.notes}</p> : null}
    </div>
  );
}

function TimelineGroup({ busyId, group, onDelete, onEdit, onStatus }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={`data-text text-[10px] uppercase tracking-wider ${group.toneClass}`}>{group.title}</p>
          {group.subtitle ? <p className="mt-0.5 text-xs text-zinc-600">{group.subtitle}</p> : null}
        </div>
        <span className="data-text shrink-0 text-[10px] text-zinc-600">{group.memos.length}</span>
      </div>
      <div className="relative grid min-w-0 gap-2 pl-6 before:absolute before:left-2 before:top-0 before:h-full before:w-px before:bg-gradient-to-b before:from-cyan-400/25 before:via-white/10 before:to-transparent">
        {group.memos.map((memo) => (
          <TimelineMemoCard
            key={memo.id}
            busyId={busyId}
            memo={memo}
            tone={group.tone}
            onDelete={onDelete}
            onEdit={onEdit}
            onStatus={onStatus}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineMemoCard({ busyId, memo, onDelete, onEdit, onStatus, tone }) {
  const overdue = tone === 'overdue';
  return (
    <article className={`relative min-w-0 rounded-md border p-3 ${overdue ? 'border-amber-400/25 bg-amber-400/[0.06]' : 'border-white/5 bg-black/25'}`}>
      <span className={`absolute -left-[22px] top-4 h-3 w-3 rounded-full border ${overdue ? 'border-amber-300/60 bg-amber-300/30 shadow-[0_0_14px_rgba(251,191,36,0.28)]' : memo.memo_time ? 'border-cyan-300/60 bg-cyan-300/30 shadow-[0_0_14px_rgba(34,211,238,0.22)]' : 'border-zinc-500/60 bg-zinc-500/30'}`} />
      <div className="grid min-w-0 gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
        <div className="data-text min-w-16 rounded border border-white/10 bg-[#121212] px-2 py-1 text-center text-xs font-semibold text-zinc-100 md:min-w-20">
          {memo.memo_time ? formatInputTime(memo.memo_time) : 'ANY'}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <DueChip memo={memo} overdue={overdue} />
            <Tag tone="cyan">open</Tag>
          </div>
          <p className="mt-2 break-words text-sm font-semibold leading-6 text-zinc-100">{memo.title}</p>
          {memo.notes ? <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs leading-5 text-zinc-500">{memo.notes}</p> : null}
        </div>
        <MemoActions busyId={busyId} memo={memo} onDelete={onDelete} onEdit={onEdit} onStatus={onStatus} />
      </div>
    </article>
  );
}

function FloatingMemoCard({ busyId, memo, muted = false, onDelete, onEdit, onStatus }) {
  const closed = memo.status !== 'open';
  return (
    <article className={`min-w-0 rounded-md border border-white/5 bg-black/25 p-3 ${muted || closed ? 'opacity-70' : ''}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <DueChip memo={memo} overdue={false} />
          <Tag tone={memo.status === 'done' ? 'emerald' : memo.status === 'dismissed' ? 'zinc' : 'violet'}>
            {memo.status}
          </Tag>
        </div>
        <p className={`mt-2 break-words text-sm font-semibold leading-6 text-zinc-100 ${memo.status === 'done' ? 'line-through decoration-zinc-500' : ''}`}>{memo.title}</p>
        {memo.notes ? <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs leading-5 text-zinc-500">{memo.notes}</p> : null}
      </div>
      <div className="mt-3">
        <MemoActions busyId={busyId} memo={memo} onDelete={onDelete} onEdit={onEdit} onStatus={onStatus} />
      </div>
    </article>
  );
}

function MemoActions({ busyId, memo, onDelete, onEdit, onStatus }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5 md:justify-end">
      {memo.status === 'open' ? (
        <>
          <IconButton label="Mark memo done" tone="emerald" busy={busyId === `${memo.id}-done`} onClick={() => onStatus(memo, 'done')}><Check size={15} /></IconButton>
          <IconButton label="Dismiss memo" tone="amber" busy={busyId === `${memo.id}-dismissed`} onClick={() => onStatus(memo, 'dismissed')}><X size={15} /></IconButton>
        </>
      ) : (
        <IconButton label="Reopen memo" tone="cyan" busy={busyId === `${memo.id}-open`} onClick={() => onStatus(memo, 'open')}><RotateCcw size={15} /></IconButton>
      )}
      <IconButton label="Edit memo" tone="zinc" onClick={() => onEdit(memo)}><Pencil size={15} /></IconButton>
      <IconButton label="Delete memo" tone="red" busy={busyId === `${memo.id}-delete`} onClick={() => onDelete(memo)}><Trash2 size={15} /></IconButton>
    </div>
  );
}

function MemoEditorModal({
  editing,
  error,
  form,
  onChange,
  onClose,
  onQuickInOneHour,
  onQuickTonight,
  onSubmit,
  saveStatus,
  today,
  tomorrow,
}) {
  return (
    <div className="fixed inset-0 z-50 flex min-w-0 items-stretch justify-stretch overflow-hidden bg-[#0f0f0f] backdrop-blur sm:items-center sm:justify-center sm:bg-black/70 sm:p-4">
      <div
        className="flex h-[var(--memo-editor-height)] max-h-[var(--memo-editor-height)] min-h-0 w-full max-w-full flex-col overflow-hidden border-0 border-white/10 bg-[#0f0f0f] shadow-2xl sm:h-auto sm:max-h-[var(--memo-editor-max-height)] sm:max-w-xl sm:rounded-xl sm:border"
        role="dialog"
        aria-modal="true"
        aria-labelledby="memo-editor-title"
        style={{
          '--memo-editor-height': '100dvh',
          '--memo-editor-max-height': 'min(82dvh, 620px)',
        }}
      >
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-white/5 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] sm:px-3 sm:py-2.5">
          <div className="min-w-0">
            <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">{editing ? 'Edit Memo' : 'Create Memo'}</p>
            <h3 id="memo-editor-title" className="truncate text-lg font-semibold text-zinc-100">{editing ? 'Update Reminder' : 'New Reminder'}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-white/10 bg-black/30 text-zinc-300"
            aria-label="Close memo editor"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={onSubmit}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain sm:overflow-hidden"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="min-w-0 space-y-3 p-4 sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:overflow-x-hidden sm:p-3">
            <MemoField
              id="memo-title"
              label="Remember"
              value={form.title}
              placeholder="Charge headphones"
              onChange={(value) => onChange('title', value)}
            />

            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <MemoField id="memo-date" label="Date Optional" type="date" value={form.memo_date} onChange={(value) => onChange('memo_date', value)} />
              <MemoField id="memo-time" label="Time Optional" type="time" value={form.memo_time} onChange={(value) => onChange('memo_time', value)} />
            </div>

            <div className="flex flex-wrap gap-2">
              <QuickButton label="Today" onClick={() => onChange('memo_date', today)} />
              <QuickButton label="Tomorrow" onClick={() => onChange('memo_date', tomorrow)} />
              <QuickButton label="Clear Date" onClick={() => onChange('memo_date', '')} />
              <QuickButton label="+1h" onClick={onQuickInOneHour} />
              <QuickButton label="Tonight" onClick={onQuickTonight} />
              <QuickButton label="Clear Time" onClick={() => onChange('memo_time', '')} />
            </div>

            <MemoTextarea value={form.notes} onChange={(value) => onChange('notes', value)} />

            {error ? (
              <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <div className="grid min-w-0 gap-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:hidden">
              <MemoFormActions editing={editing} onClose={onClose} saveStatus={saveStatus} />
            </div>
          </div>

          <div className="hidden min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-white/5 p-3 sm:grid">
            <MemoFormActions editing={editing} onClose={onClose} saveStatus={saveStatus} />
          </div>
        </form>
      </div>
    </div>
  );
}

function MemoFormActions({ editing, onClose, saveStatus }) {
  return (
    <>
      <button
        type="submit"
        disabled={saveStatus === 'saving'}
        className="flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saveStatus === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saveStatus === 'saving' ? 'Saving Memo' : editing ? 'Update Memo' : 'Create Memo'}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="min-h-12 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-zinc-300 sm:w-auto"
      >
        Cancel
      </button>
    </>
  );
}

function MemoField({ id, label, onChange, placeholder = '', type = 'text', value }) {
  return (
    <div className="block min-w-0 space-y-1 overflow-hidden">
      <label htmlFor={id} className="data-text block text-[10px] uppercase text-zinc-500">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full min-w-0 max-w-full rounded-md border border-white/10 bg-black/40 px-3 text-[16px] font-semibold text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-400/50"
      />
    </div>
  );
}

function MemoTextarea({ onChange, value }) {
  return (
    <div className="block min-w-0 space-y-1 overflow-hidden">
      <label htmlFor="memo-notes" className="data-text block text-[10px] uppercase text-zinc-500">Notes Optional</label>
      <textarea
        id="memo-notes"
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Any extra context"
        className="min-h-24 w-full min-w-0 max-w-full resize-y rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[16px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-400/50"
      />
    </div>
  );
}

function QuickButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-cyan-400/25 hover:text-cyan-200"
    >
      {label}
    </button>
  );
}

function DueChip({ memo, overdue }) {
  const text = memo.memo_date
    ? `${formatDateLabel(memo.memo_date)}${memo.memo_time ? ` ${formatInputTime(memo.memo_time)}` : ''}`
    : 'No date';
  const className = overdue
    ? 'border-amber-400/25 bg-amber-400/10 text-amber-300'
    : memo.memo_time
      ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300'
      : 'border-white/10 bg-white/[0.03] text-zinc-400';
  return (
    <span className={`data-text inline-flex max-w-full items-center gap-1 rounded border px-2 py-1 text-[10px] uppercase ${className}`}>
      {memo.memo_time ? <Clock3 size={12} /> : <CalendarDays size={12} />}
      <span className="truncate">{text}</span>
    </span>
  );
}

function IconButton({ busy, children, label, onClick, tone }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:border-emerald-300/45'
    : tone === 'amber'
      ? 'border-amber-400/20 bg-amber-400/10 text-amber-300 hover:border-amber-300/45'
      : tone === 'red'
        ? 'border-red-400/20 bg-red-400/10 text-red-300 hover:border-red-300/45'
        : tone === 'cyan'
          ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300 hover:border-cyan-300/45'
          : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-cyan-400/30 hover:text-cyan-200';
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={busy}
      className={`grid h-10 w-10 place-items-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : children}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-cyan-400/10 bg-cyan-400/[0.03] p-3">
      <Loader2 size={15} className="animate-spin text-cyan-300" />
      <p className="data-text text-sm text-cyan-300">Loading memos...</p>
    </div>
  );
}

function SmallEmptyTimeline({ onCreate }) {
  return (
    <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-3">
      <p className="text-sm font-semibold text-zinc-100">No dated memos.</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">Floating memos can stay loose until they need a date.</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 text-sm font-semibold text-cyan-200"
      >
        <Plus size={16} />
        Add Dated Memo
      </button>
    </div>
  );
}

function groupMemos(memos, now) {
  const today = toDateString(now);
  const tomorrow = addDays(today, 1);
  const currentMinutes = getCurrentMinutes(now);
  const open = memos.filter((memo) => memo.status === 'open');
  const closed = memos
    .filter((memo) => memo.status !== 'open')
    .sort((a, b) => timestamp(b.updated_at || b.created_at) - timestamp(a.updated_at || a.created_at))
    .slice(0, 8);

  const datedOpen = open.filter((memo) => memo.memo_date).sort(sortOpenDated);
  return {
    overdue: datedOpen.filter((memo) => isMemoOverdue(memo, today, currentMinutes)),
    today: datedOpen.filter((memo) => memo.memo_date === today && !isMemoOverdue(memo, today, currentMinutes)),
    tomorrow: datedOpen.filter((memo) => memo.memo_date === tomorrow),
    upcoming: datedOpen.filter((memo) => memo.memo_date > tomorrow),
    noDate: open
      .filter((memo) => !memo.memo_date)
      .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at)),
    doneRecently: closed,
  };
}

function buildTimelineGroups(groups) {
  const result = [];
  if (groups.overdue.length) {
    result.push({
      key: 'overdue',
      memos: groups.overdue,
      subtitle: 'Past dates or earlier today',
      title: 'Overdue',
      tone: 'overdue',
      toneClass: 'text-amber-300',
    });
  }
  if (groups.today.length) {
    result.push({
      key: 'today',
      memos: groups.today,
      subtitle: formatFullDate(getToday()),
      title: 'Today',
      tone: 'today',
      toneClass: 'text-cyan-300',
    });
  }
  if (groups.tomorrow.length) {
    result.push({
      key: 'tomorrow',
      memos: groups.tomorrow,
      subtitle: formatFullDate(addDays(getToday(), 1)),
      title: 'Tomorrow',
      tone: 'upcoming',
      toneClass: 'text-emerald-300',
    });
  }

  const upcomingByDate = groups.upcoming.reduce((acc, memo) => {
    const key = memo.memo_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(memo);
    return acc;
  }, {});

  Object.keys(upcomingByDate).sort().forEach((date) => {
    result.push({
      key: date,
      memos: upcomingByDate[date],
      subtitle: formatFullDate(date),
      title: formatTimelineDate(date),
      tone: 'upcoming',
      toneClass: 'text-zinc-400',
    });
  });

  return result;
}

function sortOpenDated(a, b) {
  if (a.memo_date !== b.memo_date) return String(a.memo_date).localeCompare(String(b.memo_date));
  const aHasTime = Boolean(a.memo_time);
  const bHasTime = Boolean(b.memo_time);
  if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
  if ((a.memo_time || '') !== (b.memo_time || '')) return String(a.memo_time || '').localeCompare(String(b.memo_time || ''));
  return timestamp(a.created_at) - timestamp(b.created_at);
}

function isMemoOverdue(memo, today, currentMinutes) {
  if (memo.status !== 'open' || !memo.memo_date) return false;
  if (memo.memo_date < today) return true;
  if (memo.memo_date > today) return false;
  if (!memo.memo_time) return false;
  const memoMinutes = timeToMinutes(memo.memo_time);
  return memoMinutes != null && memoMinutes < currentMinutes;
}

function getToday() {
  return toDateString(new Date());
}

function addDays(dateValue, days) {
  const date = parseDate(dateValue);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

function addMinutes(date, minutes) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function parseDate(dateString) {
  return new Date(`${dateString}T00:00:00`);
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeString(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatInputTime(value) {
  return String(value ?? '').slice(0, 5);
}

function formatDateLabel(value) {
  const today = getToday();
  if (value === today) return 'Today';
  if (value === addDays(today, 1)) return 'Tomorrow';
  return parseDate(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatFullDate(value) {
  return parseDate(value).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimelineDate(value) {
  return parseDate(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatMemoDue(memo) {
  if (!memo.memo_date) return 'No date';
  const date = formatFullDate(memo.memo_date);
  return memo.memo_time ? `${date} at ${formatInputTime(memo.memo_time)}` : date;
}

function timeToMinutes(value) {
  const match = String(value ?? '').match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getCurrentMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

function timestamp(value) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}
