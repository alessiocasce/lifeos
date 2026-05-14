import {
  CalendarDays,
  Clock,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { Panel, PanelHeader, Tag } from '../components/ui';

const todayString = () => new Date().toISOString().slice(0, 10);
const statuses = ['planned', 'done', 'skipped', 'cancelled'];
const categories = ['Work', 'Study', 'School', 'Health', 'Workout', 'Entertainment', 'Sleep'];

const emptyForm = (date = todayString()) => ({
  title: '',
  event_date: date,
  start_time: '',
  end_time: '',
  category: 'Work',
  location: '',
  notes: '',
  status: 'planned',
});

export function CalendarTab() {
  const {
    calendarEvents,
    calendarEventsError,
    calendarEventsStatus,
    createCalendarEvent,
    deleteCalendarEvent,
    loadCalendarRange,
    updateCalendarEvent,
  } = useLifeOS();

  const [selectedDate, setSelectedDate] = useState(todayString());
  const [form, setForm] = useState(emptyForm(todayString()));
  const [editingId, setEditingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionStatus, setActionStatus] = useState('idle');
  const [deleteId, setDeleteId] = useState(null);

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const selectedEvents = useMemo(
    () => sortEvents(calendarEvents.filter((event) => event.event_date === selectedDate)),
    [calendarEvents, selectedDate],
  );
  const isToday = selectedDate === todayString();
  const isLoading = calendarEventsStatus === 'loading';
  const isInitialLoading = isLoading && calendarEvents.length === 0;
  const isSyncing = isLoading && calendarEvents.length > 0;

  useEffect(() => {
    loadCalendarRange(weekStart, weekEnd);
  }, [loadCalendarRange, weekEnd, weekStart]);

  useEffect(() => {
    if (!modalOpen) return undefined;

    const scrollY = window.scrollY || window.pageYOffset || 0;
    const bodyStyle = document.body.style;
    const rootStyle = document.documentElement.style;
    const previousBody = {
      left: bodyStyle.left,
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      right: bodyStyle.right,
      top: bodyStyle.top,
      width: bodyStyle.width,
    };
    const previousRootOverflow = rootStyle.overflow;

    rootStyle.overflow = 'hidden';
    bodyStyle.overflow = 'hidden';
    bodyStyle.position = 'fixed';
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.left = '0';
    bodyStyle.right = '0';
    bodyStyle.width = '100%';

    return () => {
      rootStyle.overflow = previousRootOverflow;
      bodyStyle.overflow = previousBody.overflow;
      bodyStyle.position = previousBody.position;
      bodyStyle.top = previousBody.top;
      bodyStyle.left = previousBody.left;
      bodyStyle.right = previousBody.right;
      bodyStyle.width = previousBody.width;
      window.scrollTo(0, scrollY);
    };
  }, [modalOpen]);

  const reloadSelectedRange = () => loadCalendarRange(startOfWeek(selectedDate), addDays(startOfWeek(selectedDate), 7));

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm(selectedDate));
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (event) => {
    setEditingId(event.id);
    setForm({
      title: event.title ?? '',
      event_date: event.event_date ?? selectedDate,
      start_time: normalizeTime(event.start_time),
      end_time: normalizeTime(event.end_time),
      category: categories.includes(event.category) ? event.category : 'Work',
      location: event.location ?? '',
      notes: event.notes ?? '',
      status: event.status ?? 'planned',
    });
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm(selectedDate));
    setFormError('');
    setActionStatus('idle');
  };

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

  const submitEvent = async (event) => {
    event.preventDefault();
    const validation = validateEventForm(form);
    if (validation) {
      setFormError(validation);
      return;
    }

    setActionStatus('saving');
    try {
      if (editingId) {
        await updateCalendarEvent(editingId, form);
      } else {
        await createCalendarEvent(form);
      }
      setSelectedDate(form.event_date);
      await loadCalendarRange(startOfWeek(form.event_date), addDays(startOfWeek(form.event_date), 7));
      closeModal();
    } catch (error) {
      setFormError(error.message || 'Failed to save calendar event.');
      setActionStatus('idle');
    }
  };

  const removeEvent = async (id) => {
    if (!window.confirm('Delete this calendar event?')) return;
    setDeleteId(id);
    setFormError('');
    try {
      await deleteCalendarEvent(id);
      await reloadSelectedRange();
      if (editingId === id) closeModal();
    } catch (error) {
      setFormError(error.message || 'Failed to delete calendar event.');
    } finally {
      setDeleteId(null);
    }
  };

  const selectDate = (value) => {
    if (!value) return;
    setSelectedDate(value);
  };

  const selectToday = () => {
    setSelectedDate(todayString());
  };

  return (
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <Panel className="col-span-12">
        <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">
              {isToday ? 'Today' : formatWeekday(selectedDate)}
            </p>
            <h2 className="mt-1 break-words text-2xl font-semibold leading-tight text-zinc-100">{formatLongDate(selectedDate)}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Tag tone={selectedEvents.length ? 'cyan' : 'zinc'}>{selectedEvents.length} events</Tag>
              {isSyncing ? <span className="data-text text-[10px] text-cyan-300">SYNCING</span> : null}
              {!isToday ? (
                <button
                  type="button"
                  onClick={selectToday}
                  className="data-text rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-300"
                >
                  Today
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:items-center sm:justify-end">
            <label className="grid h-11 min-w-0 grid-cols-[auto_1fr] items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3">
              <CalendarDays size={16} className="text-cyan-300" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => selectDate(event.target.value)}
                className="min-w-0 bg-transparent text-[16px] text-zinc-100 outline-none"
                aria-label="Choose calendar date"
              />
            </label>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 text-sm font-semibold text-emerald-200"
            >
              <Plus size={17} />
              <span className="hidden sm:inline">New</span>
            </button>
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12">
        <PanelHeader
          eyebrow="Selected-Day Agenda"
          title="Schedule"
          right={<CalendarDays size={16} className="text-cyan-300" />}
        />
        <div className="space-y-2 p-3">
          {calendarEventsError ? (
            <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
              {calendarEventsError}
            </div>
          ) : null}

          {isInitialLoading ? (
            <LoadingRow label="Loading selected day" />
          ) : selectedEvents.length ? (
            selectedEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onEdit={() => openEditModal(event)}
                onRemove={() => removeEvent(event.id)}
                deleting={deleteId === event.id}
              />
            ))
          ) : isLoading ? (
            <LoadingRow label="Syncing selected day" />
          ) : (
            <EmptyState onCreate={openCreateModal} />
          )}
        </div>
      </Panel>

      {modalOpen ? (
        <EventModal
          actionStatus={actionStatus}
          editing={Boolean(editingId)}
          error={formError}
          form={form}
          onChange={updateForm}
          onClose={closeModal}
          onSubmit={submitEvent}
        />
      ) : null}
    </div>
  );
}

function EventModal({ actionStatus, editing, error, form, onChange, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 flex min-w-0 items-end justify-center overflow-hidden bg-black/70 p-2 pb-[calc(env(safe-area-inset-bottom)+8px)] backdrop-blur sm:items-center sm:p-4">
      <div
        className="flex min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-md border border-white/10 bg-[#0f0f0f] shadow-2xl"
        style={{ maxHeight: 'min(85dvh, 640px)' }}
      >
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2.5">
          <div className="min-w-0">
            <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">{editing ? 'Edit Event' : 'Create Event'}</p>
            <h3 className="truncate text-lg font-semibold text-zinc-100">{editing ? 'Update Schedule Item' : 'New Schedule Item'}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-white/10 bg-black/30 text-zinc-300"
            aria-label="Close event modal"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3" style={{ WebkitOverflowScrolling: 'touch' }}>
            <CalendarField label="Title" value={form.title} placeholder="Deep work, lecture, lift..." onChange={(value) => onChange('title', value)} />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <CalendarField label="Date" type="date" value={form.event_date} onChange={(value) => onChange('event_date', value)} />
              <SelectField label="Status" value={form.status} options={statuses} onChange={(value) => onChange('status', value)} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <CalendarField label="Start" type="time" value={form.start_time} onChange={(value) => onChange('start_time', value)} />
              <CalendarField label="End" type="time" value={form.end_time} onChange={(value) => onChange('end_time', value)} />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <SelectField label="Category" value={form.category} options={categories} onChange={(value) => onChange('category', value)} />
              <CalendarField label="Location" value={form.location} placeholder="Library, gym, office" onChange={(value) => onChange('location', value)} />
            </div>

            <label className="space-y-1">
              <span className="data-text text-[10px] uppercase text-zinc-500">Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) => onChange('notes', event.target.value)}
                rows={3}
                className="min-h-20 w-full resize-y rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[16px] text-zinc-100 outline-none focus:border-cyan-400/50 sm:min-h-24"
                placeholder="Prep, constraints, or agenda notes"
              />
            </label>

            {error ? (
              <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 grid gap-2 border-t border-white/5 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] sm:grid-cols-[1fr_auto] sm:items-center sm:pb-3">
            <button
              type="submit"
              disabled={actionStatus === 'saving'}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionStatus === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {actionStatus === 'saving' ? 'Saving Event' : editing ? 'Update Event' : 'Create Event'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 rounded-md border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EventCard({ deleting, event, onEdit, onRemove }) {
  return (
    <article className="min-w-0 rounded-md border border-white/5 bg-black/25 p-3">
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="data-text inline-flex items-center gap-1 rounded border border-white/10 bg-[#121212] px-2 py-1 text-xs font-semibold text-zinc-100">
              <Clock size={13} />
              {formatTimeRange(event)}
            </span>
            <CategoryBadge category={event.category} />
            <Tag tone={statusTone(event.status)}>{event.status}</Tag>
          </div>
          <h3 className="break-words text-base font-semibold leading-6 text-zinc-100">{event.title}</h3>
          <div className="mt-2 grid gap-1 text-sm text-zinc-400">
            {event.location ? (
              <p className="flex min-w-0 items-center gap-1">
                <MapPin size={14} className="shrink-0 text-zinc-500" />
                <span className="break-words">{event.location}</span>
              </p>
            ) : null}
            {event.notes ? <p className="break-words leading-6 text-zinc-400">{event.notes}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 md:justify-end">
          <IconButton label="Edit event" onClick={onEdit}><Pencil size={15} /></IconButton>
          <IconButton label="Delete event" onClick={onRemove} disabled={deleting}>
            {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          </IconButton>
        </div>
      </div>
    </article>
  );
}

function CalendarField({ label, onChange, placeholder = '', type = 'text', value }) {
  return (
    <label className="space-y-1">
      <span className="data-text text-[10px] uppercase text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-[16px] text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-400/50"
      />
    </label>
  );
}

function SelectField({ label, onChange, options, value }) {
  return (
    <label className="space-y-1">
      <span className="data-text text-[10px] uppercase text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-[16px] text-zinc-100 outline-none focus:border-cyan-400/50"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function CategoryBadge({ category }) {
  const label = normalizeCategoryLabel(category);
  const tone = categoryTone(label);
  return (
    <span className={`data-text inline-flex max-w-full rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${tone}`}>
      {label || 'Uncategorized'}
    </span>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/20 p-4">
      <p className="text-sm font-medium text-zinc-200">No events on this day</p>
      <p className="mt-1 text-sm text-zinc-500">Create a schedule item for the selected date.</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 text-sm font-semibold text-emerald-200"
      >
        <Plus size={16} />
        Create Event
      </button>
    </div>
  );
}

function LoadingRow({ label }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/5 bg-black/20 px-3 py-3 text-sm text-zinc-400">
      <Loader2 size={15} className="animate-spin text-cyan-300" />
      {label}
    </div>
  );
}

function IconButton({ children, disabled = false, label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-300 transition hover:border-cyan-400/30 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function validateEventForm(form) {
  if (!form.title.trim()) return 'Title is required.';
  if (!isValidDate(form.event_date)) return 'Choose a valid event date.';
  if (form.status && !statuses.includes(form.status)) return 'Choose a valid event status.';
  if (!categories.includes(form.category)) return 'Choose a valid category.';
  if (form.start_time && !isValidTime(form.start_time)) return 'Choose a valid start time.';
  if (form.end_time && !isValidTime(form.end_time)) return 'Choose a valid end time.';
  if (form.start_time && form.end_time && form.end_time < form.start_time) return 'End time must be after start time.';
  return '';
}

function sortEvents(events = []) {
  return events.slice().sort((a, b) => {
    const aHasTime = Boolean(a.start_time);
    const bHasTime = Boolean(b.start_time);
    if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
    if ((a.start_time || '') !== (b.start_time || '')) return String(a.start_time || '').localeCompare(String(b.start_time || ''));
    return new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0);
  });
}

function startOfWeek(dateString) {
  const date = parseDate(dateString);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toDateString(date);
}

function addDays(dateString, days) {
  const date = parseDate(dateString);
  date.setDate(date.getDate() + days);
  return toDateString(date);
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

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseDate(value);
  return !Number.isNaN(parsed.getTime()) && toDateString(parsed) === value;
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function formatLongDate(dateString) {
  if (!isValidDate(dateString)) return 'Select a valid date';
  return parseDate(dateString).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatWeekday(dateString) {
  if (!isValidDate(dateString)) return 'Selected day';
  return parseDate(dateString).toLocaleDateString(undefined, { weekday: 'long' });
}

function normalizeTime(value) {
  return value ? String(value).slice(0, 5) : '';
}

function formatTimeRange(event) {
  const start = normalizeTime(event.start_time);
  const end = normalizeTime(event.end_time);
  if (start && end) return `${start}-${end}`;
  if (start) return start;
  if (end) return `Ends ${end}`;
  return 'Any time';
}

function normalizeCategoryLabel(category) {
  const text = String(category ?? '').trim();
  const match = categories.find((item) => item.toLowerCase() === text.toLowerCase());
  return match ?? text;
}

function categoryTone(category) {
  if (category === 'Work') return 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300';
  if (category === 'Study') return 'border-violet-400/20 bg-violet-400/10 text-violet-300';
  if (category === 'School') return 'border-amber-400/20 bg-amber-400/10 text-amber-300';
  if (category === 'Health') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
  if (category === 'Workout') return 'border-red-400/20 bg-red-400/10 text-red-300';
  if (category === 'Entertainment') return 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-300';
  if (category === 'Sleep') return 'border-indigo-400/20 bg-indigo-400/10 text-indigo-300';
  return 'border-white/10 bg-white/[0.03] text-zinc-400';
}

function statusTone(status) {
  if (status === 'done') return 'emerald';
  if (status === 'skipped') return 'amber';
  if (status === 'cancelled') return 'red';
  return 'zinc';
}
