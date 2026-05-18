import { Bell, CalendarDays, Check, Clock3, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  const [formError, setFormError] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [busyId, setBusyId] = useState(null);

  const today = getToday();
  const tomorrow = addDays(today, 1);
  const groups = useMemo(() => groupMemos(memos, today, tomorrow), [memos, today, tomorrow]);
  const editingMemo = editingId ? memos.find((memo) => memo.id === editingId) : null;

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError('');
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setFormError('');
    setSaveStatus('idle');
  };

  const startEdit = (memo) => {
    setEditingId(memo.id);
    setForm({
      title: memo.title ?? '',
      memo_date: memo.memo_date ?? '',
      memo_time: formatInputTime(memo.memo_time),
      notes: memo.notes ?? '',
    });
    setFormError('');
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
      resetForm();
    } catch (error) {
      setFormError(error.message || 'Failed to save memo.');
      setSaveStatus('idle');
    }
  };

  const changeStatus = async (memo, status) => {
    setBusyId(`${memo.id}-${status}`);
    try {
      await updateMemo(memo.id, { status });
    } finally {
      setBusyId(null);
    }
  };

  const removeMemo = async (memo) => {
    if (!window.confirm(`Delete memo "${memo.title}"?`)) return;
    setBusyId(`${memo.id}-delete`);
    try {
      await deleteMemo(memo.id);
      if (editingId === memo.id) resetForm();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-hidden pb-3">
      <Panel className="col-span-12 xl:col-span-5">
        <PanelHeader
          eyebrow={editingId ? 'Edit Reminder' : 'Quick Capture'}
          title={editingId ? 'Update Memo' : 'New Memo'}
          right={<Bell size={16} className="text-cyan-300" />}
        />
        <form onSubmit={submit} className="grid gap-3 p-3">
          <label className="rounded-md border border-white/5 bg-black/25 p-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Remember</span>
            <input
              value={form.title}
              onChange={(event) => updateForm('title', event.target.value)}
              placeholder="Charge headphones"
              className="mt-1 w-full min-w-0 bg-transparent text-base font-semibold text-zinc-100 outline-none placeholder:text-zinc-700"
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="min-w-0 rounded-md border border-white/5 bg-black/25 p-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Date Optional</span>
              <input
                type="date"
                value={form.memo_date}
                onChange={(event) => updateForm('memo_date', event.target.value)}
                className="data-text mt-1 w-full min-w-0 bg-transparent text-base font-semibold text-zinc-100 outline-none"
              />
            </label>
            <label className="min-w-0 rounded-md border border-white/5 bg-black/25 p-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Time Optional</span>
              <input
                type="time"
                value={form.memo_time}
                onChange={(event) => updateForm('memo_time', event.target.value)}
                className="data-text mt-1 w-full min-w-0 bg-transparent text-base font-semibold text-zinc-100 outline-none"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <QuickDateButton label="Today" onClick={() => updateForm('memo_date', today)} />
            <QuickDateButton label="Tomorrow" onClick={() => updateForm('memo_date', tomorrow)} />
            <QuickDateButton label="Clear Date" onClick={() => updateForm('memo_date', '')} />
          </div>

          <label className="rounded-md border border-white/5 bg-black/25 p-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Notes Optional</span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) => updateForm('notes', event.target.value)}
              placeholder="Any extra context"
              className="mt-2 min-h-24 w-full min-w-0 resize-y bg-transparent text-base leading-6 text-zinc-100 outline-none placeholder:text-zinc-700"
            />
          </label>

          {formError ? <p className="data-text text-[11px] text-red-300">{formError}</p> : null}
          {memosError ? <p className="data-text text-[11px] text-red-300">{memosError}</p> : null}

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <button
              type="submit"
              disabled={saveStatus === 'saving'}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            >
              {saveStatus === 'saving' ? 'Saving' : editingId ? 'Update Memo' : 'Create Memo'}
              <Save size={16} />
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-zinc-300"
              >
                Cancel
                <X size={16} />
              </button>
            ) : null}
          </div>
        </form>
      </Panel>

      <div className="col-span-12 grid min-w-0 gap-3 xl:col-span-7">
        <MemoSection title="Today" subtitle={today} memos={groups.today} empty="No memos due today." status={memosStatus} busyId={busyId} onEdit={startEdit} onDelete={removeMemo} onStatus={changeStatus} />
        <MemoSection title="Tomorrow" subtitle={tomorrow} memos={groups.tomorrow} empty="Nothing queued for tomorrow." busyId={busyId} onEdit={startEdit} onDelete={removeMemo} onStatus={changeStatus} />
        <MemoSection title="Upcoming" memos={groups.upcoming} empty="No dated memos coming up." busyId={busyId} onEdit={startEdit} onDelete={removeMemo} onStatus={changeStatus} />
        <MemoSection title="No Date" memos={groups.noDate} empty="No open memory items without a date." busyId={busyId} onEdit={startEdit} onDelete={removeMemo} onStatus={changeStatus} />
        <MemoSection title="Done Recently" memos={groups.doneRecently} empty="Completed and dismissed memos will appear here." busyId={busyId} onEdit={startEdit} onDelete={removeMemo} onStatus={changeStatus} muted />
      </div>
    </div>
  );
}

function QuickDateButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-300 hover:border-cyan-400/25 hover:text-cyan-200"
    >
      {label}
    </button>
  );
}

function MemoSection({ busyId, empty, memos, muted = false, onDelete, onEdit, onStatus, status, subtitle, title }) {
  const loading = status === 'idle' || status === 'loading';
  return (
    <Panel>
      <PanelHeader
        eyebrow={subtitle || `${memos.length} item${memos.length === 1 ? '' : 's'}`}
        title={title}
        right={<span className="data-text text-[11px] text-zinc-500">{memos.length}</span>}
      />
      <div className="grid gap-2 p-3">
        {loading && !memos.length ? (
          <div className="rounded-md border border-cyan-400/10 bg-cyan-400/[0.03] p-3">
            <p className="data-text text-sm text-cyan-300">Loading memos...</p>
          </div>
        ) : memos.length ? (
          memos.map((memo) => (
            <MemoCard
              key={memo.id}
              busyId={busyId}
              memo={memo}
              muted={muted}
              onDelete={onDelete}
              onEdit={onEdit}
              onStatus={onStatus}
            />
          ))
        ) : (
          <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-3">
            <p className="text-sm font-medium text-zinc-200">{empty}</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function MemoCard({ busyId, memo, muted, onDelete, onEdit, onStatus }) {
  const overdue = memo.status === 'open' && memo.memo_date && memo.memo_date < getToday();
  const done = memo.status === 'done';
  const dismissed = memo.status === 'dismissed';
  return (
    <div className={`min-w-0 rounded-md border p-3 ${overdue ? 'border-amber-400/25 bg-amber-400/[0.06]' : 'border-white/5 bg-black/25'} ${muted || done || dismissed ? 'opacity-70' : ''}`}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <DueChip memo={memo} overdue={overdue} />
            <Tag tone={memo.status === 'open' ? 'cyan' : memo.status === 'done' ? 'emerald' : 'zinc'}>{memo.status}</Tag>
          </div>
          <p className={`mt-2 break-words text-sm font-semibold text-zinc-100 ${done ? 'line-through decoration-zinc-500' : ''}`}>{memo.title}</p>
          {memo.notes ? <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-zinc-500">{memo.notes}</p> : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5">
          {memo.status === 'open' ? (
            <>
              <IconButton label="Mark done" tone="emerald" busy={busyId === `${memo.id}-done`} onClick={() => onStatus(memo, 'done')}><Check size={15} /></IconButton>
              <IconButton label="Dismiss" tone="amber" busy={busyId === `${memo.id}-dismissed`} onClick={() => onStatus(memo, 'dismissed')}><X size={15} /></IconButton>
            </>
          ) : (
            <IconButton label="Reopen" tone="cyan" busy={busyId === `${memo.id}-open`} onClick={() => onStatus(memo, 'open')}><RotateCcw size={15} /></IconButton>
          )}
          <IconButton label="Edit" tone="zinc" onClick={() => onEdit(memo)}><Clock3 size={15} /></IconButton>
          <IconButton label="Delete" tone="red" busy={busyId === `${memo.id}-delete`} onClick={() => onDelete(memo)}><Trash2 size={15} /></IconButton>
        </div>
      </div>
    </div>
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
    <span className={`data-text inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] uppercase ${className}`}>
      {memo.memo_time ? <Clock3 size={12} /> : <CalendarDays size={12} />}
      {text}
    </span>
  );
}

function IconButton({ busy, children, label, onClick, tone }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
    : tone === 'amber'
      ? 'border-amber-400/20 bg-amber-400/10 text-amber-300'
      : tone === 'red'
        ? 'border-red-400/20 bg-red-400/10 text-red-300'
        : tone === 'cyan'
          ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300'
          : 'border-white/10 bg-white/[0.03] text-zinc-300';
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={busy}
      className={`grid h-10 w-10 place-items-center rounded-md border disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
    >
      {busy ? '...' : children}
    </button>
  );
}

function groupMemos(memos, today, tomorrow) {
  const open = memos.filter((memo) => memo.status === 'open');
  const closed = memos.filter((memo) => memo.status !== 'open');
  return {
    today: open.filter((memo) => memo.memo_date && memo.memo_date <= today),
    tomorrow: open.filter((memo) => memo.memo_date === tomorrow),
    upcoming: open.filter((memo) => memo.memo_date && memo.memo_date > tomorrow),
    noDate: open.filter((memo) => !memo.memo_date),
    doneRecently: closed.slice(0, 8),
  };
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatInputTime(value) {
  return String(value ?? '').slice(0, 5);
}

function formatDateLabel(value) {
  const today = getToday();
  if (value === today) return 'Today';
  if (value === addDays(today, 1)) return 'Tomorrow';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
