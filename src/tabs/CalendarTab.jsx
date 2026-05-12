import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
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
const emptyForm = (date = todayString()) => ({
  title: '',
  event_date: date,
  start_time: '',
  end_time: '',
  category: '',
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
  const [weekStart, setWeekStart] = useState(startOfWeek(todayString()));
  const [form, setForm] = useState(emptyForm(todayString()));
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [actionStatus, setActionStatus] = useState('idle');
  const [deleteId, setDeleteId] = useState(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const eventsByDate = useMemo(() => groupEventsByDate(calendarEvents), [calendarEvents]);
  const selectedEvents = eventsByDate[selectedDate] ?? [];
  const isLoading = calendarEventsStatus === 'loading';
  const isInitialLoading = isLoading && calendarEvents.length === 0;
  const isSyncing = isLoading && calendarEvents.length > 0;
  const rangeLabel = `${formatShortDate(weekStart)} - ${formatShortDate(addDays(weekStart, 6))}`;

  useEffect(() => {
    loadCalendarRange(weekStart, weekEnd);
  }, [loadCalendarRange, weekEnd, weekStart]);

  useEffect(() => {
    if (!editingId) {
      setForm(emptyForm(selectedDate));
      setFormError('');
    }
  }, [editingId, selectedDate]);

  const reloadCurrentWeek = () => loadCalendarRange(weekStart, weekEnd);
  const reloadWeekForDate = (date) => {
    const rangeStart = startOfWeek(date);
    setWeekStart(rangeStart);
    return loadCalendarRange(rangeStart, addDays(rangeStart, 7));
  };

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError('');
    if (field === 'event_date') {
      setSelectedDate(value);
      if (isValidDate(value)) setWeekStart(startOfWeek(value));
    }
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
      await reloadWeekForDate(form.event_date);
      setEditingId(null);
      setForm(emptyForm(form.event_date));
    } catch (error) {
      setFormError(error.message || 'Failed to save calendar event.');
    } finally {
      setActionStatus('idle');
    }
  };

  const startEdit = (event) => {
    setEditingId(event.id);
    setForm({
      title: event.title ?? '',
      event_date: event.event_date ?? selectedDate,
      start_time: normalizeTime(event.start_time),
      end_time: normalizeTime(event.end_time),
      category: event.category ?? '',
      location: event.location ?? '',
      notes: event.notes ?? '',
      status: event.status ?? 'planned',
    });
    setSelectedDate(event.event_date);
    setWeekStart(startOfWeek(event.event_date));
    setFormError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm(selectedDate));
    setFormError('');
  };

  const removeEvent = async (id) => {
    if (!window.confirm('Delete this calendar event?')) return;
    setDeleteId(id);
    setFormError('');
    try {
      await deleteCalendarEvent(id);
      await reloadCurrentWeek();
      if (editingId === id) cancelEdit();
    } catch (error) {
      setFormError(error.message || 'Failed to delete calendar event.');
    } finally {
      setDeleteId(null);
    }
  };

  const moveWeek = (delta) => {
    const nextStart = addDays(weekStart, delta * 7);
    setWeekStart(nextStart);
    setSelectedDate(nextStart);
  };

  const selectToday = () => {
    const today = todayString();
    setSelectedDate(today);
    setWeekStart(startOfWeek(today));
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 pb-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-3">
        <Panel>
          <PanelHeader
            eyebrow="Schedule"
            title="Calendar Events"
            right={
              <div className="flex items-center gap-1">
                <IconButton label="Previous week" onClick={() => moveWeek(-1)}>
                  <ChevronLeft size={16} />
                </IconButton>
                <button
                  type="button"
                  onClick={selectToday}
                  className="data-text h-9 rounded-md border border-cyan-400/20 bg-cyan-400/10 px-3 text-xs text-cyan-300"
                >
                  Today
                </button>
                <IconButton label="Next week" onClick={() => moveWeek(1)}>
                  <ChevronRight size={16} />
                </IconButton>
              </div>
            }
          />

          <div className="space-y-3 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="data-text text-xs uppercase text-zinc-500">Selected week</p>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="data-text text-sm font-semibold text-zinc-100">{rangeLabel}</p>
                  {isSyncing ? <span className="data-text text-[10px] text-cyan-300">SYNCING</span> : null}
                </div>
              </div>
              <label className="flex min-w-0 items-center gap-2">
                <span className="data-text shrink-0 text-[10px] uppercase text-zinc-500">Date</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedDate(value);
                    if (isValidDate(value)) setWeekStart(startOfWeek(value));
                  }}
                  className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-[16px] text-zinc-100 outline-none focus:border-cyan-400/50 sm:w-44"
                />
              </label>
            </div>

            {calendarEventsError ? (
              <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                {calendarEventsError}
              </div>
            ) : null}

            <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-7">
              {weekDays.map((day) => (
                <DayColumn
                  key={day.date}
                  day={day}
                  events={eventsByDate[day.date] ?? []}
                  loading={isLoading}
                  selected={selectedDate === day.date}
                  onEdit={startEdit}
                  onRemove={removeEvent}
                  onSelect={() => setSelectedDate(day.date)}
                  deletingId={deleteId}
                />
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            eyebrow="Selected Date"
            title={formatLongDate(selectedDate)}
            right={<CalendarDays size={16} className="text-cyan-300" />}
          />
          <div className="space-y-2 p-3">
            {isInitialLoading ? (
              <LoadingRow label="Loading selected date" />
            ) : selectedEvents.length ? (
              selectedEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onEdit={() => startEdit(event)}
                  onRemove={() => removeEvent(event.id)}
                  deleting={deleteId === event.id}
                />
              ))
            ) : isLoading ? (
              <LoadingRow label="Syncing selected date" />
            ) : (
              <EmptyState title="No events on this date." detail="Create a schedule item to make it part of LifeOS." />
            )}
          </div>
        </Panel>
      </div>

      <Panel className="min-w-0 xl:sticky xl:top-[84px] xl:self-start">
        <PanelHeader
          eyebrow={editingId ? 'Edit Event' : 'Create Event'}
          title={editingId ? 'Update Schedule Item' : 'New Schedule Item'}
          right={editingId ? <button type="button" onClick={cancelEdit} className="text-zinc-500 hover:text-zinc-200"><X size={16} /></button> : <Plus size={16} className="text-emerald-300" />}
        />
        <form onSubmit={submitEvent} className="space-y-3 p-3">
          <CalendarField label="Title" value={form.title} placeholder="Deep work, lecture, lift..." onChange={(value) => updateForm('title', value)} />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <CalendarField label="Date" type="date" value={form.event_date} onChange={(value) => updateForm('event_date', value)} />
            <label className="space-y-1">
              <span className="data-text text-[10px] uppercase text-zinc-500">Status</span>
              <select
                value={form.status}
                onChange={(event) => updateForm('status', event.target.value)}
                className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-[16px] text-zinc-100 outline-none focus:border-cyan-400/50"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <CalendarField label="Start" type="time" value={form.start_time} onChange={(value) => updateForm('start_time', value)} />
            <CalendarField label="End" type="time" value={form.end_time} onChange={(value) => updateForm('end_time', value)} />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <CalendarField label="Category" value={form.category} placeholder="deep-work" onChange={(value) => updateForm('category', value)} />
            <CalendarField label="Location" value={form.location} placeholder="Library, gym, office" onChange={(value) => updateForm('location', value)} />
          </div>

          <label className="space-y-1">
            <span className="data-text text-[10px] uppercase text-zinc-500">Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) => updateForm('notes', event.target.value)}
              rows={4}
              className="min-h-24 w-full resize-y rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[16px] text-zinc-100 outline-none focus:border-cyan-400/50"
              placeholder="Prep, constraints, or agenda notes"
            />
          </label>

          {formError ? (
            <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
              {formError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={actionStatus === 'saving'}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {actionStatus === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {actionStatus === 'saving' ? 'Saving Event' : editingId ? 'Update Event' : 'Create Event'}
          </button>
        </form>
      </Panel>
    </div>
  );
}

function DayColumn({ day, deletingId, events, loading, onEdit, onRemove, onSelect, selected }) {
  return (
    <section
      className={`min-w-0 rounded-md border p-2 transition ${
        selected ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-white/5 bg-black/20'
      }`}
    >
      <button type="button" onClick={onSelect} className="mb-2 flex w-full items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <p className="data-text text-[10px] uppercase text-zinc-500">{day.weekday}</p>
          <p className={`data-text text-sm font-semibold ${selected ? 'text-cyan-200' : 'text-zinc-100'}`}>
            {day.label}
          </p>
        </div>
        <span className="data-text shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">
          {events.length}
        </span>
      </button>

      <div className="space-y-1.5">
        {events.length ? (
          events.map((event) => (
            <CompactEvent key={event.id} event={event} onEdit={() => onEdit(event)} onRemove={() => onRemove(event.id)} deleting={deletingId === event.id} />
          ))
        ) : loading ? (
          <div className="h-12 animate-pulse rounded border border-white/5 bg-white/[0.03]" />
        ) : (
          <p className="rounded border border-white/5 bg-[#121212]/60 px-2 py-2 text-xs text-zinc-600">Open</p>
        )}
      </div>
    </section>
  );
}

function CompactEvent({ deleting, event, onEdit, onRemove }) {
  return (
    <article className="min-w-0 rounded-md border border-white/5 bg-[#121212] p-2">
      <div className="mb-1 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-100">{event.title}</p>
          <p className="data-text mt-0.5 truncate text-[10px] text-zinc-500">{formatTimeRange(event)}</p>
        </div>
        <Tag tone={statusTone(event.status)}>{event.status}</Tag>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {event.category ? <CategoryBadge category={event.category} /> : <span className="text-[10px] text-zinc-700">No category</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <MiniButton label="Edit event" onClick={onEdit}><Pencil size={13} /></MiniButton>
          <MiniButton label="Delete event" onClick={onRemove} disabled={deleting}>
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </MiniButton>
        </div>
      </div>
    </article>
  );
}

function EventCard({ deleting, event, onEdit, onRemove }) {
  return (
    <article className="min-w-0 rounded-md border border-white/5 bg-black/25 p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Tag tone={statusTone(event.status)}>{event.status}</Tag>
            {event.category ? <CategoryBadge category={event.category} /> : null}
          </div>
          <h3 className="break-words text-sm font-semibold text-zinc-100">{event.title}</h3>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span className="data-text inline-flex items-center gap-1"><Clock size={13} />{formatTimeRange(event)}</span>
            {event.location ? <span className="inline-flex max-w-full min-w-0 items-center gap-1"><MapPin size={13} className="shrink-0" /><span className="truncate">{event.location}</span></span> : null}
          </div>
          {event.notes ? <p className="mt-2 break-words text-sm text-zinc-400">{event.notes}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
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

function CategoryBadge({ category }) {
  return (
    <span className="data-text inline-flex max-w-full truncate rounded border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] text-cyan-300">
      #{category}
    </span>
  );
}

function EmptyState({ detail, title }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/20 p-3">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
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
      className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-300 transition hover:border-cyan-400/30 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function MiniButton({ children, disabled = false, label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded border border-white/10 bg-black/30 text-zinc-400 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function validateEventForm(form) {
  if (!form.title.trim()) return 'Title is required.';
  if (!isValidDate(form.event_date)) return 'Choose a valid event date.';
  if (form.status && !statuses.includes(form.status)) return 'Choose a valid event status.';
  if (form.start_time && !isValidTime(form.start_time)) return 'Choose a valid start time.';
  if (form.end_time && !isValidTime(form.end_time)) return 'Choose a valid end time.';
  if (form.start_time && form.end_time && form.end_time < form.start_time) return 'End time must be after start time.';
  return '';
}

function groupEventsByDate(events = []) {
  return events.reduce((grouped, event) => {
    if (!grouped[event.event_date]) grouped[event.event_date] = [];
    grouped[event.event_date].push(event);
    return grouped;
  }, {});
}

function startOfWeek(dateString) {
  const date = parseDate(dateString);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toDateString(date);
}

function getWeekDays(startDate) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(startDate, index);
    return {
      date,
      weekday: parseDate(date).toLocaleDateString(undefined, { weekday: 'short' }),
      label: parseDate(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    };
  });
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

function formatShortDate(dateString) {
  if (!isValidDate(dateString)) return 'Invalid date';
  return parseDate(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatLongDate(dateString) {
  if (!isValidDate(dateString)) return 'Select a valid date';
  return parseDate(dateString).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
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

function statusTone(status) {
  if (status === 'done') return 'emerald';
  if (status === 'skipped') return 'amber';
  if (status === 'cancelled') return 'red';
  return 'zinc';
}
