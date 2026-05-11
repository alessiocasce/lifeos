import {
  ChevronDown,
  Database,
  Dumbbell,
  Flame,
  History,
  LogIn,
  Plus,
  Power,
  Timer,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Sparkline, Tag } from '../components/ui';

const today = new Date().toISOString().slice(0, 10);

export function WorkoutTab() {
  const {
    activeWorkoutId,
    activeWorkoutSession,
    authError,
    authUser,
    createWorkoutSession,
    createWorkoutSet,
    deleteWorkoutSet,
    expandedWorkout,
    isSupabaseConfigured,
    setActiveWorkoutId,
    setExpandedWorkout,
    signIn,
    signOut,
    signUp,
    workout,
    workoutSessions,
    workoutSessionsError,
    workoutSessionsStatus,
    workoutSets,
  } = useLifeOS();
  const [authMode, setAuthMode] = useState('sign-in');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [sessionForm, setSessionForm] = useState({ name: 'Push Day A', performed_on: today, notes: '' });
  const [setForm, setSetForm] = useState({
    exercise: workout.current.name,
    set_number: 1,
    weight: workout.current.inputs.weight,
    reps: workout.current.inputs.reps,
    rpe: workout.current.inputs.rpe,
    date: today,
    notes: '',
  });
  const [savingSet, setSavingSet] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [formError, setFormError] = useState('');
  const minutes = Math.floor(workout.restTimerSeconds / 60);
  const seconds = String(workout.restTimerSeconds % 60).padStart(2, '0');

  const recentVolume = useMemo(
    () => workoutSets.reduce((total, set) => total + Number(set.weight) * Number(set.reps), 0),
    [workoutSets],
  );

  const todaysSessions = useMemo(
    () => workoutSessions.filter((session) => session.performed_on === today),
    [workoutSessions],
  );

  const updateSetForm = (field, value) => setSetForm((prev) => ({ ...prev, [field]: value }));

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthMessage('');
    setFormError('');
    try {
      const action = authMode === 'sign-up' ? signUp : signIn;
      const data = await action(authForm);
      if (authMode === 'sign-up' && !data.session) {
        setAuthMessage('Account created. Confirm your email if Supabase requires confirmation, then sign in.');
      }
    } catch (error) {
      setFormError(error.message || 'Authentication failed.');
    }
  };

  const startWorkout = async (event) => {
    event.preventDefault();
    setFormError('');

    if (!sessionForm.name.trim()) {
      setFormError('Workout name is required.');
      return;
    }

    if (!isValidDate(sessionForm.performed_on)) {
      setFormError('Workout date is invalid.');
      return;
    }

    setSavingSession(true);
    try {
      await createWorkoutSession({
        name: sessionForm.name.trim(),
        performed_on: sessionForm.performed_on,
        started_at: new Date().toISOString(),
        notes: sessionForm.notes.trim(),
      });
    } catch (error) {
      setFormError(error.message || 'Failed to start workout session.');
    } finally {
      setSavingSession(false);
    }
  };

  const selectOrStartToday = async () => {
    setFormError('');
    const existing = todaysSessions[0];
    if (existing) {
      setActiveWorkoutId(existing.id);
      return;
    }

    setSavingSession(true);
    try {
      await createWorkoutSession({
        name: sessionForm.name.trim() || 'Today Workout',
        performed_on: today,
        started_at: new Date().toISOString(),
        notes: sessionForm.notes.trim(),
      });
    } catch (error) {
      setFormError(error.message || 'Failed to start today workout.');
    } finally {
      setSavingSession(false);
    }
  };

  const submitSet = async (event) => {
    event.preventDefault();
    setFormError('');

    const validationError = validateSetForm(setForm, activeWorkoutSession);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSavingSet(true);
    try {
      await createWorkoutSet({
        workout_id: activeWorkoutSession.id,
        exercise: setForm.exercise.trim(),
        set_number: Number(setForm.set_number),
        weight: Number(setForm.weight),
        reps: Number(setForm.reps),
        rpe: Number(setForm.rpe),
        performed_at: dateToPerformedAt(setForm.date),
        notes: setForm.notes.trim(),
      });
      setSetForm((prev) => ({
        ...prev,
        set_number: Number(prev.set_number) + 1,
        reps: '',
        notes: '',
      }));
    } catch (error) {
      setFormError(error.message || 'Failed to save set.');
    } finally {
      setSavingSet(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-3">
      <Panel className="col-span-12 overflow-hidden">
        <div className="grid min-h-44 grid-cols-1 border-b border-white/5 bg-black md:grid-cols-[1fr_2fr]">
          <div className="flex items-center gap-4 border-b border-white/5 p-5 md:border-b-0 md:border-r">
            <div className="grid h-16 w-16 place-items-center rounded-md border border-red-400/30 bg-red-400/10 text-red-300 shadow-ember">
              <Timer size={30} />
            </div>
            <div>
              <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">Rest Timer</p>
              <p className="data-text text-7xl font-black leading-none text-red-300">
                {minutes}:{seconds}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-[0.9fr_1.4fr]">
            <div>
              <div className="flex items-center gap-2">
                <Dumbbell size={18} className="text-cyan-300" />
                <p className="text-lg font-semibold text-zinc-100">
                  {activeWorkoutSession?.name ?? workout.current.name}
                </p>
              </div>
              <p className="data-text mt-1 text-xs text-zinc-500">
                {activeWorkoutSession
                  ? `${activeWorkoutSession.performed_on} / ${activeWorkoutSession.workout_sets?.length ?? 0} persisted sets`
                  : `${workout.current.block} / ${workout.current.target}`}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniMetric label="Sessions" value={workoutSessions.length} tone="text-cyan-300" sub="loaded" />
                <MiniMetric label="Sets" value={workoutSets.length} tone="text-emerald-300" sub="persisted" />
                <MiniMetric label="Volume" value={Math.round(recentVolume).toLocaleString()} tone="text-amber-300" sub="kg x reps" />
              </div>
            </div>

            {!isSupabaseConfigured ? (
              <ConfigNotice />
            ) : !authUser ? (
              <AuthPanel
                authError={authError}
                authForm={authForm}
                authMessage={authMessage}
                authMode={authMode}
                formError={formError}
                setAuthForm={setAuthForm}
                setAuthMode={setAuthMode}
                submitAuth={submitAuth}
              />
            ) : (
              <form onSubmit={submitSet} className="grid grid-cols-2 gap-2 xl:grid-cols-[1.1fr_0.45fr_0.55fr_0.45fr_0.45fr_0.65fr_1fr_44px]">
                <SetField label="Exercise" value={setForm.exercise} onChange={(value) => updateSetForm('exercise', value)} />
                <SetField label="Set" type="number" value={setForm.set_number} onChange={(value) => updateSetForm('set_number', value)} />
                <SetField label="Weight" type="number" value={setForm.weight} suffix="kg" onChange={(value) => updateSetForm('weight', value)} />
                <SetField label="Reps" type="number" value={setForm.reps} onChange={(value) => updateSetForm('reps', value)} />
                <SetField label="RPE" type="number" step="0.5" value={setForm.rpe} onChange={(value) => updateSetForm('rpe', value)} />
                <SetField label="Date" type="date" value={setForm.date} onChange={(value) => updateSetForm('date', value)} />
                <SetField label="Notes" value={setForm.notes} onChange={(value) => updateSetForm('notes', value)} />
                <button
                  type="submit"
                  disabled={savingSet || !activeWorkoutSession}
                  className="mt-5 grid h-[54px] place-items-center rounded-md border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
                  title="Save set"
                >
                  <Plus size={20} />
                </button>
                {formError ? <p className="col-span-full data-text text-[11px] text-red-300">{formError}</p> : null}
              </form>
            )}
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-5">
        <PanelHeader
          eyebrow="Session Control"
          title="Start Or Select Workout"
          right={<SourceStatus status={workoutSessionsStatus} configured={isSupabaseConfigured} authed={Boolean(authUser)} />}
        />
        <div className="space-y-3 p-3">
          {authUser ? (
            <div className="flex items-center justify-between rounded-md border border-white/5 bg-black/25 px-3 py-2">
              <div className="min-w-0">
                <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">Authenticated</p>
                <p className="truncate text-sm text-zinc-200">{authUser.email}</p>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="grid h-9 w-9 place-items-center rounded-md border border-red-400/20 bg-red-400/10 text-red-300"
                title="Sign out"
              >
                <Power size={16} />
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={selectOrStartToday}
            disabled={!authUser || savingSession}
            className="flex w-full items-center justify-between rounded-md border border-cyan-400/20 bg-cyan-400/10 px-3 py-3 text-left text-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
          >
            <span>
              <span className="block text-sm font-semibold">Select or start today</span>
              <span className="data-text text-[10px] text-cyan-300/70">{today}</span>
            </span>
            <Plus size={18} />
          </button>

          <form onSubmit={startWorkout} className="grid gap-2">
            <SetField label="Workout Name" value={sessionForm.name} onChange={(value) => setSessionForm((prev) => ({ ...prev, name: value }))} />
            <SetField label="Performed On" type="date" value={sessionForm.performed_on} onChange={(value) => setSessionForm((prev) => ({ ...prev, performed_on: value }))} />
            <SetField label="Session Notes" value={sessionForm.notes} onChange={(value) => setSessionForm((prev) => ({ ...prev, notes: value }))} />
            <button
              type="submit"
              disabled={!authUser || savingSession}
              className="h-10 rounded-md border border-emerald-400/20 bg-emerald-400/10 text-sm font-medium text-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            >
              Start Session
            </button>
          </form>

          <label className="block rounded-md border border-white/5 bg-black/25 p-3">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Active Session</span>
            <select
              value={activeWorkoutId ?? ''}
              onChange={(event) => setActiveWorkoutId(event.target.value || null)}
              disabled={!authUser || !workoutSessions.length}
              className="mt-2 w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/40 disabled:text-zinc-600"
            >
              <option value="">No session selected</option>
              {workoutSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.performed_on} / {session.name}
                </option>
              ))}
            </select>
          </label>

          {workoutSessionsError ? <p className="data-text text-[11px] text-red-300">{workoutSessionsError}</p> : null}
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-7">
        <PanelHeader eyebrow="Persisted Log" title="Sets Grouped By Workout Session" right={<History size={16} className="text-cyan-300" />} />
        <div className="thin-scrollbar max-h-[560px] space-y-2 overflow-y-auto p-3">
          {workoutSessions.length ? (
            workoutSessions.map((session) => (
              <SessionLog
                key={session.id}
                active={session.id === activeWorkoutId}
                deleteWorkoutSet={deleteWorkoutSet}
                session={session}
                setActiveWorkoutId={setActiveWorkoutId}
              />
            ))
          ) : (
            <div className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">
              {authUser ? 'No persisted workout sessions yet.' : 'Sign in to load user-scoped workout sessions.'}
            </div>
          )}
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-5">
        <PanelHeader eyebrow="Performance Center" title="Exercise Trend HUD" right={<Flame size={16} className="text-amber-300" />} />
        <div className="divide-y divide-white/5">
          {workout.exercises.map((exercise) => (
            <div key={exercise.name} className="flex items-center justify-between gap-3 px-3 py-3">
              <div>
                <p className="text-sm font-medium text-zinc-100">{exercise.name}</p>
                <p className="data-text text-[10px] text-zinc-500">6-week volume trend</p>
              </div>
              <Sparkline data={exercise.trend} color="#22c55e" />
              <Tag tone="emerald">{exercise.status}</Tag>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-7">
        <PanelHeader eyebrow="Mock Archive" title="Legacy Workout Examples" right={<History size={16} className="text-zinc-500" />} />
        <div className="space-y-2 p-3">
          {workout.history.map((session) => {
            const open = expandedWorkout === session.date;
            return (
              <div key={session.date} className="rounded-md border border-white/5 bg-black/25">
                <button
                  type="button"
                  onClick={() => setExpandedWorkout(open ? null : session.date)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{session.title}</p>
                    <p className="data-text text-[11px] text-zinc-500">
                      {session.date} / {session.duration} / {session.volume.toLocaleString()}kg volume
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag tone={session.prs ? 'emerald' : 'zinc'}>{session.prs} PR</Tag>
                    <ChevronDown size={16} className={`text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {open ? (
                  <div className="grid gap-2 border-t border-white/5 p-3">
                    {session.exercises.map((exercise) => (
                      <div key={exercise.name} className="grid grid-cols-[180px_1fr] gap-2 rounded border border-white/5 bg-[#121212] p-2">
                        <p className="text-xs font-medium text-zinc-200">{exercise.name}</p>
                        <div className="flex flex-wrap gap-1">
                          {exercise.sets.map((set) => (
                            <span key={set} className="data-text rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-zinc-300">
                              {set}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function AuthPanel({ authError, authForm, authMessage, authMode, formError, setAuthForm, setAuthMode, submitAuth }) {
  return (
    <form onSubmit={submitAuth} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_44px]">
      <SetField
        label="Email"
        type="email"
        value={authForm.email}
        onChange={(value) => setAuthForm((prev) => ({ ...prev, email: value }))}
      />
      <SetField
        label="Password"
        type="password"
        value={authForm.password}
        onChange={(value) => setAuthForm((prev) => ({ ...prev, password: value }))}
      />
      <button
        type="submit"
        className="mt-5 grid h-[54px] place-items-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
        title={authMode === 'sign-up' ? 'Sign up' : 'Sign in'}
      >
        <LogIn size={20} />
      </button>
      <div className="col-span-full flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAuthMode(authMode === 'sign-up' ? 'sign-in' : 'sign-up')}
          className="data-text text-[11px] text-cyan-300"
        >
          {authMode === 'sign-up' ? 'Use existing account' : 'Create account'}
        </button>
        <span className="data-text text-[10px] text-zinc-500">Supabase Auth required by RLS</span>
      </div>
      {authMessage ? <p className="col-span-full data-text text-[11px] text-emerald-300">{authMessage}</p> : null}
      {authError || formError ? <p className="col-span-full data-text text-[11px] text-red-300">{authError || formError}</p> : null}
    </form>
  );
}

function ConfigNotice() {
  return (
    <div className="rounded-md border border-amber-400/20 bg-amber-400/10 p-3">
      <p className="text-sm font-medium text-amber-200">Supabase env missing</p>
      <p className="mt-1 text-xs leading-5 text-amber-100/70">
        Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env.local`, run `supabase/schema.sql`,
        then restart the dev server.
      </p>
    </div>
  );
}

function SessionLog({ active, deleteWorkoutSet, session, setActiveWorkoutId }) {
  const sets = session.workout_sets ?? [];
  const volume = sets.reduce((total, set) => total + Number(set.weight) * Number(set.reps), 0);

  return (
    <div className={`rounded-md border bg-black/25 ${active ? 'border-cyan-400/30' : 'border-white/5'}`}>
      <button
        type="button"
        onClick={() => setActiveWorkoutId(session.id)}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">{session.name}</p>
          <p className="data-text mt-1 text-[11px] text-zinc-500">
            {session.performed_on} / {sets.length} sets / {Math.round(volume).toLocaleString()}kg volume
          </p>
        </div>
        <div className="flex items-center gap-1">
          {active ? <Tag tone="cyan">ACTIVE</Tag> : null}
          <Tag tone={session.ended_at ? 'zinc' : 'emerald'}>{session.ended_at ? 'ENDED' : 'LIVE'}</Tag>
        </div>
      </button>
      <div className="grid gap-1 border-t border-white/5 p-2">
        {sets.length ? (
          sets.map((set) => (
            <div key={set.id} className="grid grid-cols-[40px_1fr_auto_32px] items-center gap-2 rounded border border-white/5 bg-[#121212] px-2 py-2">
              <span className="data-text text-sm font-bold text-cyan-300">#{set.set_number}</span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-100">{set.exercise}</p>
                <p className="data-text text-[10px] text-zinc-500">{formatDate(set.performed_at)}</p>
              </div>
              <span className="data-text text-xs text-zinc-200">
                {Number(set.weight)}kg x {set.reps} @ {Number(set.rpe)}
              </span>
              <button
                type="button"
                onClick={() => deleteWorkoutSet(set.id)}
                className="grid h-8 w-8 place-items-center rounded-md border border-red-400/20 bg-red-400/10 text-red-300"
                title="Delete set"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        ) : (
          <p className="px-2 py-2 text-sm text-zinc-500">No sets logged in this session.</p>
        )}
      </div>
    </div>
  );
}

function SetField({ label, value, onChange, type = 'text', step, suffix }) {
  return (
    <label className="rounded-md border border-white/5 bg-[#121212] p-3">
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="mt-2 flex items-end gap-1">
        <input
          type={type}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="data-text min-w-0 flex-1 bg-transparent text-base font-black text-zinc-100 outline-none md:text-lg"
        />
        {suffix ? <span className="data-text pb-1 text-sm text-zinc-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

function SourceStatus({ status, configured, authed }) {
  const label = !configured ? 'OFFLINE' : !authed ? 'AUTH' : status === 'loading' ? 'SYNCING' : status === 'error' ? 'ERROR' : 'LIVE';
  const tone = !configured || !authed
    ? 'border-amber-400/20 bg-amber-400/10 text-amber-300'
    : status === 'error'
      ? 'border-red-400/20 bg-red-400/10 text-red-300'
      : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';

  return (
    <span className={`data-text inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${tone}`}>
      <Database size={12} />
      {label}
    </span>
  );
}

function validateSetForm(form, activeWorkoutSession) {
  if (!activeWorkoutSession) return 'Select or start a workout session first.';
  if (!form.exercise.trim()) return 'Exercise is required.';
  if (!Number.isFinite(Number(form.set_number)) || Number(form.set_number) <= 0) return 'Set number must be greater than 0.';
  if (!Number.isFinite(Number(form.weight)) || Number(form.weight) < 0) return 'Weight must be 0 or greater.';
  if (!Number.isInteger(Number(form.reps)) || Number(form.reps) <= 0) return 'Reps must be a positive whole number.';
  if (!Number.isFinite(Number(form.rpe)) || Number(form.rpe) < 0 || Number(form.rpe) > 10) return 'RPE must be between 0 and 10.';
  if (!isValidDate(form.date)) return 'Date is invalid.';
  return '';
}

function isValidDate(value) {
  if (!value) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
}

function dateToPerformedAt(value) {
  const now = new Date();
  const time = now.toTimeString().slice(0, 8);
  return new Date(`${value}T${time}`).toISOString();
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}
