import { ArrowUpRight, Bell, CalendarDays, Dumbbell, MessageSquare, Moon, Target } from 'lucide-react';
import { useEffect } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { useLocalDay } from '../hooks/useLocalDay';
import { addDays, localDate, localTime } from '../utils/date';
import { HEALTH_HABITS, getHabitEntry } from '../utils/habits';

export function HomeTab() {
  const {
    activeWorkoutSession, calendarEvents, calendarEventsStatus, healthLogs,
    loadCalendarRange, memos, memosStatus, projects, projectSessions,
    setActiveTab, setActiveWorkoutId, workoutSessions,
  } = useLifeOS();
  const today = useLocalDay();
  const tomorrow = addDays(today, 1);
  useEffect(() => { loadCalendarRange(today, tomorrow); }, [loadCalendarRange, today, tomorrow]);
  const events = calendarEvents.filter((event) => event.event_date === today && event.status !== 'cancelled')
    .sort((a, b) => String(a.start_time || '99:99').localeCompare(String(b.start_time || '99:99')));
  const tomorrowEvents = calendarEvents.filter((event) => event.event_date === tomorrow && event.status !== 'cancelled')
    .sort((a, b) => String(a.start_time || '99:99').localeCompare(String(b.start_time || '99:99')));
  const dueMemos = memos.filter((memo) => memo.status === 'open' && memo.memo_date && memo.memo_date <= today)
    .sort((a, b) => String(a.memo_date).localeCompare(String(b.memo_date)) || String(a.memo_time || '99:99').localeCompare(String(b.memo_time || '99:99')));
  const liveWorkout = activeWorkoutSession && !activeWorkoutSession.ended_at ? activeWorkoutSession : workoutSessions.find((session) => !session.ended_at);
  const activeProjectSession = projectSessions.find((session) => !session.ended_at);
  const project = projects.find((item) => item.id === activeProjectSession?.project_id);
  const health = healthLogs.find((log) => log.logged_on === today);
  const sleep = health?.sleep_hours;
  const hasSleep = sleep !== null && sleep !== undefined && sleep !== '' && Number.isFinite(Number(sleep));
  const habits = HEALTH_HABITS.map((habit) => ({ ...habit, entry: getHabitEntry(health?.hygiene, habit.id) })).filter((habit) => habit.entry.count > 0);
  const completedWorkouts = workoutSessions.filter((session) => session.performed_on === today && session.ended_at);
  const completedSessions = projectSessions.filter((session) => session.ended_at && validLocalDate(session.started_at) === today);
  const nextEvent = events.find((event) => (!event.status || event.status === 'planned') && (!event.end_time || event.end_time.slice(0, 5) >= localTime()));
  const quiet = !liveWorkout && !activeProjectSession && !events.length && !dueMemos.length;
  const unavailable = calendarEventsStatus === 'error' || memosStatus === 'error';
  const loading = ['idle', 'loading'].includes(calendarEventsStatus) || ['idle', 'loading'].includes(memosStatus);

  const resumeWorkout = () => { setActiveWorkoutId(liveWorkout.id); setActiveTab('workout'); };
  return <div className="command-surface">
    <header className="command-intro">
      <p className="text-sm text-zinc-400">{formatDay(today)}</p>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">{liveWorkout ? 'Training in progress.' : activeProjectSession ? 'One block at a time.' : nextEvent ? 'Your day, in view.' : dueMemos.length ? 'A few open loops.' : 'Room to focus.'}</h2>
      <button className="mt-4 flex min-h-11 items-center gap-2 text-sm text-zinc-300 hover:text-white" onClick={() => setActiveTab('assistant')}><MessageSquare size={17} />Talk to Companion<ArrowUpRight size={15} /></button>
    </header>

    {liveWorkout || activeProjectSession ? <section aria-label="Active work" className="command-active">
      {liveWorkout ? <button className="command-active-row" onClick={resumeWorkout}>
        <Dumbbell size={24} className="shrink-0 text-zinc-200" /><span className="min-w-0 flex-1 text-left"><span className="block text-xs text-zinc-400">Active Training</span><span className="mt-1 block break-words text-lg font-semibold">{liveWorkout.name || 'Workout'}</span></span><ArrowUpRight size={20} />
      </button> : null}
      {activeProjectSession ? <button className="command-active-row" onClick={() => setActiveTab('projects')}>
        <Target size={22} className="shrink-0 text-zinc-400" /><span className="min-w-0 flex-1 text-left"><span className="block text-xs text-zinc-400">Project session in progress</span><span className="mt-1 block break-words text-base font-semibold">{project?.name || 'Project session'}</span>{activeProjectSession.target_output ? <span className="mt-1 block break-words text-sm text-zinc-400">{activeProjectSession.target_output}</span> : null}</span><ArrowUpRight size={18} />
      </button> : null}
    </section> : null}

    {unavailable ? <p role="alert" className="border-t border-white/10 py-4 text-sm text-amber-200">Some commitments could not be refreshed. Open Calendar or Memos to retry.</p> : null}
    {quiet ? <p className="command-quiet text-zinc-500">{loading ? 'Checking today’s commitments…' : unavailable ? 'Today’s commitments are not fully available.' : 'No dated commitments need your attention here.'}</p> : null}

    <div className="command-columns">
      {events.length ? <section aria-label="Today's agenda" className="command-section">
        <SectionLink title="Today" icon={CalendarDays} onClick={() => setActiveTab('calendar')} />
        {events.slice(0, 5).map((event) => <button key={event.id} className="command-record" onClick={() => setActiveTab('calendar')}>
          <time className="command-record-time">{timeLabel(event)}</time><span className="min-w-0 flex-1 text-left"><span className={`block break-words text-sm ${event.status === 'done' ? 'text-zinc-500' : 'text-zinc-200'}`}>{event.title}</span>{event.status && event.status !== 'planned' ? <span className="mt-1 block text-xs text-zinc-500">{event.status}</span> : null}</span><ArrowUpRight size={15} className="text-zinc-600" />
        </button>)}
        {events.length > 5 ? <button className="min-h-11 text-sm text-zinc-400" onClick={() => setActiveTab('calendar')}>View all {events.length} commitments</button> : null}
      </section> : null}
      {dueMemos.length ? <section aria-label="Open loops" className="command-section">
        <SectionLink title="Open loops" icon={Bell} onClick={() => setActiveTab('memos')} />
        {dueMemos.slice(0, 4).map((memo) => <button key={memo.id} className="command-record" onClick={() => setActiveTab('memos')}>
          <span className={`command-record-time ${memo.memo_date < today ? 'text-amber-200' : ''}`}>{memo.memo_date < today ? 'Overdue' : memo.memo_time?.slice(0, 5) || 'Today'}</span><span className="min-w-0 flex-1 break-words text-left text-sm text-zinc-200">{memo.title}</span><ArrowUpRight size={15} className="text-zinc-600" />
        </button>)}
        {dueMemos.length > 4 ? <button className="min-h-11 text-sm text-zinc-400" onClick={() => setActiveTab('memos')}>View all {dueMemos.length} open loops</button> : null}
      </section> : null}
    </div>

    {hasSleep || habits.length || completedWorkouts.length || completedSessions.length ? <section aria-label="Recorded today" className="command-section">
      <h3 className="py-4 text-sm font-semibold text-zinc-400">Recorded today</h3>
      <div className="flex flex-wrap gap-x-8 gap-y-3 pb-5">
        {hasSleep ? <button className="flex min-h-11 items-center gap-2 text-sm" onClick={() => setActiveTab('health')}><Moon size={17} className={Number(sleep) < 6 ? 'text-amber-200' : 'text-zinc-500'} /><span className={Number(sleep) < 6 ? 'text-amber-200' : 'text-zinc-300'}>{Number(sleep).toLocaleString(undefined, { maximumFractionDigits: 1 })}h sleep</span></button> : null}
        {habits.map((habit) => <button key={habit.id} className="min-h-11 text-sm text-zinc-400" onClick={() => setActiveTab('health')}>{habit.label}{habit.entry.count > 1 ? ` ×${habit.entry.count}` : ''}<span className="ml-2 text-xs text-zinc-600">{habit.entry.times.at(-1) || 'Logged'}</span></button>)}
        {completedWorkouts.length ? <button className="flex min-h-11 items-center gap-2 text-sm text-zinc-400" onClick={() => setActiveTab('workout')}><Dumbbell size={17} />{completedWorkouts.length} training session{completedWorkouts.length > 1 ? 's' : ''} completed</button> : null}
        {completedSessions.length ? <button className="flex min-h-11 items-center gap-2 text-sm text-zinc-400" onClick={() => setActiveTab('projects')}><Target size={17} />{completedSessions.length} project block{completedSessions.length > 1 ? 's' : ''} completed</button> : null}
      </div>
    </section> : null}

    {tomorrowEvents.length ? <section aria-label="Tomorrow" className="command-section">
      <SectionLink title="Coming tomorrow" icon={CalendarDays} onClick={() => setActiveTab('calendar')} />
      {tomorrowEvents.slice(0, 2).map((event) => <button key={event.id} className="command-record" onClick={() => setActiveTab('calendar')}><span className="command-record-time">{timeLabel(event)}</span><span className="min-w-0 flex-1 break-words text-left text-sm text-zinc-400">{event.title}</span><ArrowUpRight size={15} className="text-zinc-600" /></button>)}
    </section> : null}
  </div>;
}

function SectionLink({ title, icon: Icon, onClick }) {
  return <button className="flex min-h-14 w-full items-center gap-2 py-4 text-left" onClick={onClick}><Icon size={16} className="text-zinc-500" /><h3 className="flex-1 text-base font-semibold text-zinc-200">{title}</h3><ArrowUpRight size={16} className="text-zinc-500" /></button>;
}

function timeLabel(event) {
  return event.start_time ? event.start_time.slice(0, 5) : 'Anytime';
}

function validLocalDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : localDate(0, date);
}

function formatDay(value) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });
}
