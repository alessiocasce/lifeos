import {
  Check,
  ChevronDown,
  Database,
  Dumbbell,
  Flame,
  History,
  Loader2,
  LogIn,
  Medal,
  Pencil,
  Plus,
  Power,
  Square,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
    deleteWorkoutSession,
    deleteWorkoutSet,
    endWorkoutSession,
    expandedWorkout,
    isSupabaseConfigured,
    setActiveWorkoutId,
    setExpandedWorkout,
    signIn,
    signOut,
    signUp,
    updateWorkoutSet,
    workout,
    workoutSessions,
    workoutSessionsError,
    workoutSessionsStatus,
    workoutSets,
  } = useLifeOS();
  const [authMode, setAuthMode] = useState('sign-in');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
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
  const [editingSetId, setEditingSetId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingSet, setSavingSet] = useState(false);
  const [savingEditId, setSavingEditId] = useState(null);
  const [deletingSetId, setDeletingSetId] = useState(null);
  const [savingSession, setSavingSession] = useState(false);
  const [selectingToday, setSelectingToday] = useState(false);
  const [endingSessionId, setEndingSessionId] = useState(null);
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [showMockArchive, setShowMockArchive] = useState(false);
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

  const exerciseAnalytics = useMemo(() => buildExerciseAnalytics(workoutSessions), [workoutSessions]);
  const selectedExerciseKey = normalizeExercise(setForm.exercise);
  const selectedExerciseAnalytics = selectedExerciseKey
    ? getExerciseAnalyticsBeforeSession(workoutSessions, activeWorkoutSession, setForm.exercise)
    : null;
  const previousPerformance = useMemo(
    () => getPreviousPerformance(workoutSessions, activeWorkoutSession, setForm.exercise),
    [activeWorkoutSession, setForm.exercise, workoutSessions],
  );
  const draftPrs = useMemo(
    () => detectPrs(
      {
        exercise: setForm.exercise,
        weight: Number(setForm.weight),
        reps: Number(setForm.reps),
      },
      selectedExerciseAnalytics,
      activeWorkoutSession
        ? getSessionExerciseVolume(activeWorkoutSession, setForm.exercise) + Number(setForm.weight) * Number(setForm.reps)
        : 0,
      true,
    ),
    [activeWorkoutSession, selectedExerciseAnalytics, setForm.exercise, setForm.reps, setForm.weight],
  );

  const nextSetNumber = useMemo(
    () => getNextSetNumber(activeWorkoutSession, setForm.exercise),
    [activeWorkoutSession, setForm.exercise],
  );

  useEffect(() => {
    setSetForm((prev) => ({ ...prev, set_number: nextSetNumber }));
  }, [nextSetNumber]);

  const updateSetForm = (field, value) => setSetForm((prev) => ({ ...prev, [field]: value }));

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthMessage('');
    setFormError('');
    setAuthSubmitting(true);
    try {
      const action = authMode === 'sign-up' ? signUp : signIn;
      const data = await action(authForm);
      if (authMode === 'sign-up' && !data.session) {
        setAuthMessage('Account created. Confirm your email if Supabase requires confirmation, then sign in.');
      }
    } catch (error) {
      setFormError(error.message || 'Authentication failed.');
    } finally {
      setAuthSubmitting(false);
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

    setSelectingToday(true);
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
      setSelectingToday(false);
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
        set_number: nextSetNumber,
        weight: Number(setForm.weight),
        reps: Number(setForm.reps),
        rpe: Number(setForm.rpe),
        performed_at: dateToPerformedAt(setForm.date),
        notes: setForm.notes.trim(),
      });
      setSetForm((prev) => ({
        ...prev,
        set_number: getNextSetNumber(activeWorkoutSession, prev.exercise) + 1,
        reps: '',
        notes: '',
      }));
    } catch (error) {
      setFormError(error.message || 'Failed to save set.');
    } finally {
      setSavingSet(false);
    }
  };

  const beginEdit = (set) => {
    setEditingSetId(set.id);
    setEditForm({
      exercise: set.exercise,
      set_number: set.set_number,
      weight: set.weight,
      reps: set.reps,
      rpe: set.rpe,
      date: new Date(set.performed_at).toISOString().slice(0, 10),
      notes: set.notes ?? '',
    });
  };

  const saveEdit = async (setId) => {
    setFormError('');
    const validationError = validateSetForm(editForm, activeWorkoutSession);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSavingEditId(setId);
    try {
      await updateWorkoutSet(setId, {
        exercise: editForm.exercise.trim(),
        set_number: Number(editForm.set_number),
        weight: Number(editForm.weight),
        reps: Number(editForm.reps),
        rpe: Number(editForm.rpe),
        performed_at: dateToPerformedAt(editForm.date),
        notes: editForm.notes.trim() || null,
      });
      setEditingSetId(null);
      setEditForm(null);
    } catch (error) {
      setFormError(error.message || 'Failed to update set.');
    } finally {
      setSavingEditId(null);
    }
  };

  const removeSet = async (setId) => {
    setDeletingSetId(setId);
    setFormError('');
    try {
      await deleteWorkoutSet(setId);
    } catch (error) {
      setFormError(error.message || 'Failed to delete set.');
    } finally {
      setDeletingSetId(null);
    }
  };

  const endSession = async (sessionId) => {
    setEndingSessionId(sessionId);
    setFormError('');
    try {
      await endWorkoutSession(sessionId);
    } catch (error) {
      setFormError(error.message || 'Failed to end workout.');
    } finally {
      setEndingSessionId(null);
    }
  };

  const removeSession = async (sessionId) => {
    if (deleteConfirmId !== sessionId) {
      setDeleteConfirmId(sessionId);
      return;
    }

    setDeletingSessionId(sessionId);
    setFormError('');
    try {
      await deleteWorkoutSession(sessionId);
      setDeleteConfirmId(null);
    } catch (error) {
      setFormError(error.message || 'Failed to delete workout session.');
    } finally {
      setDeletingSessionId(null);
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
                  ? `${activeWorkoutSession.performed_on} / next ${setForm.exercise || 'exercise'} set #${nextSetNumber}`
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
                loading={authSubmitting}
                setAuthForm={setAuthForm}
                setAuthMode={setAuthMode}
                submitAuth={submitAuth}
              />
            ) : (
              <div className="grid gap-2">
                <PreviousPerformanceCard performance={previousPerformance} prs={draftPrs} />
                <form onSubmit={submitSet} className="grid grid-cols-2 gap-2 xl:grid-cols-[1.1fr_0.45fr_0.55fr_0.45fr_0.45fr_0.65fr_1fr_44px]">
                  <SetField label="Exercise" value={setForm.exercise} onChange={(value) => updateSetForm('exercise', value)} />
                  <SetField label="Set" type="number" value={setForm.set_number} onChange={(value) => updateSetForm('set_number', value)} readOnly />
                  <SetField label="Weight" type="number" value={setForm.weight} suffix="kg" onChange={(value) => updateSetForm('weight', value)} />
                  <SetField label="Reps" type="number" value={setForm.reps} onChange={(value) => updateSetForm('reps', value)} />
                  <SetField label="RPE" type="number" step="0.5" value={setForm.rpe} onChange={(value) => updateSetForm('rpe', value)} />
                  <SetField label="Date" type="date" value={setForm.date} onChange={(value) => updateSetForm('date', value)} />
                  <SetField label="Notes" value={setForm.notes} onChange={(value) => updateSetForm('notes', value)} />
                  <IconButton
                    type="submit"
                    disabled={savingSet || !activeWorkoutSession}
                    loading={savingSet}
                    icon={Plus}
                    title="Save set"
                    tone="emerald"
                    className="mt-5 h-[54px]"
                  />
                  {formError ? <p className="col-span-full data-text text-[11px] text-red-300">{formError}</p> : null}
                </form>
              </div>
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
              <IconButton icon={Power} onClick={signOut} title="Sign out" tone="red" />
            </div>
          ) : null}

          <button
            type="button"
            onClick={selectOrStartToday}
            disabled={!authUser || selectingToday}
            className="flex w-full items-center justify-between rounded-md border border-cyan-400/20 bg-cyan-400/10 px-3 py-3 text-left text-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
          >
            <span>
              <span className="block text-sm font-semibold">
                {selectingToday ? 'Syncing today session' : 'Select or start today'}
              </span>
              <span className="data-text text-[10px] text-cyan-300/70">{today}</span>
            </span>
            {selectingToday ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          </button>

          <form onSubmit={startWorkout} className="grid gap-2">
            <SetField label="Workout Name" value={sessionForm.name} onChange={(value) => setSessionForm((prev) => ({ ...prev, name: value }))} />
            <SetField label="Performed On" type="date" value={sessionForm.performed_on} onChange={(value) => setSessionForm((prev) => ({ ...prev, performed_on: value }))} />
            <SetField label="Session Notes" value={sessionForm.notes} onChange={(value) => setSessionForm((prev) => ({ ...prev, notes: value }))} />
            <button
              type="submit"
              disabled={!authUser || savingSession}
              className="flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 text-sm font-medium text-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            >
              {savingSession ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {savingSession ? 'Starting' : 'Start Session'}
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

          {activeWorkoutSession ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => endSession(activeWorkoutSession.id)}
                disabled={Boolean(activeWorkoutSession.ended_at) || endingSessionId === activeWorkoutSession.id}
                className="flex h-10 items-center justify-center gap-2 rounded-md border border-amber-400/20 bg-amber-400/10 text-sm font-medium text-amber-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
              >
                {endingSessionId === activeWorkoutSession.id ? <Loader2 size={15} className="animate-spin" /> : <Square size={15} />}
                {activeWorkoutSession.ended_at ? 'Ended' : 'End Workout'}
              </button>
              <button
                type="button"
                onClick={() => removeSession(activeWorkoutSession.id)}
                disabled={deletingSessionId === activeWorkoutSession.id}
                className={`flex h-10 items-center justify-center gap-2 rounded-md border text-sm font-medium disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600 ${
                  deleteConfirmId === activeWorkoutSession.id
                    ? 'border-red-400/40 bg-red-400/20 text-red-200'
                    : 'border-red-400/20 bg-red-400/10 text-red-300'
                }`}
              >
                {deletingSessionId === activeWorkoutSession.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {deleteConfirmId === activeWorkoutSession.id ? 'Confirm Delete' : 'Delete Session'}
              </button>
            </div>
          ) : null}

          {workoutSessionsError ? <p className="data-text text-[11px] text-red-300">{workoutSessionsError}</p> : null}
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-7">
        <PanelHeader eyebrow="Persisted Log" title="Sets Grouped By Workout Session" right={<History size={16} className="text-cyan-300" />} />
        <div className="thin-scrollbar max-h-[560px] space-y-2 overflow-y-auto p-3">
          {workoutSessionsStatus === 'loading' ? (
            <LoadingCard label="Loading workout sessions" />
          ) : workoutSessions.length ? (
            workoutSessions.map((session) => (
              <SessionLog
                key={session.id}
                active={session.id === activeWorkoutId}
                beginEdit={beginEdit}
                deletingSetId={deletingSetId}
                deleteWorkoutSet={removeSet}
                editForm={editForm}
                editingSetId={editingSetId}
                savingEditId={savingEditId}
                session={session}
                setActiveWorkoutId={setActiveWorkoutId}
                setEditForm={setEditForm}
                setEditingSetId={setEditingSetId}
                saveEdit={saveEdit}
                workoutSessions={workoutSessions}
              />
            ))
          ) : (
            <div className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">
              {authUser ? 'No persisted workout sessions yet.' : 'Sign in to load user-scoped workout sessions.'}
            </div>
          )}
        </div>
      </Panel>

      <Panel className="col-span-12">
        <PanelHeader eyebrow="Exercise History" title="Progression Over Time" right={<Medal size={16} className="text-amber-300" />} />
        <div className="grid gap-2 p-3 xl:grid-cols-2">
          {exerciseAnalytics.exercises.length ? (
            exerciseAnalytics.exercises.map((exercise) => <ExerciseHistoryCard key={exercise.key} exercise={exercise} />)
          ) : (
            <div className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">
              Log persisted sets to build exercise progression.
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

      <Panel className="col-span-12 xl:col-span-7 border-zinc-800/70 bg-[#0d0d0d] opacity-80">
        <PanelHeader
          eyebrow="Sample Data"
          title="Mock Workout Archive"
          right={
            <button
              type="button"
              onClick={() => setShowMockArchive((value) => !value)}
              className="rounded border border-white/10 px-2 py-1 data-text text-[10px] text-zinc-400"
            >
              {showMockArchive ? 'HIDE' : 'SHOW'}
            </button>
          }
        />
        {showMockArchive ? (
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
                      <p className="text-sm font-semibold text-zinc-300">{session.title}</p>
                      <p className="data-text text-[11px] text-zinc-600">
                        {session.date} / {session.duration} / {session.volume.toLocaleString()}kg mock volume
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tag tone="zinc">MOCK</Tag>
                      <ChevronDown size={16} className={`text-zinc-600 transition ${open ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {open ? (
                    <div className="grid gap-2 border-t border-white/5 p-3">
                      {session.exercises.map((exercise) => (
                        <div key={exercise.name} className="grid grid-cols-[180px_1fr] gap-2 rounded border border-white/5 bg-[#121212] p-2">
                          <p className="text-xs font-medium text-zinc-400">{exercise.name}</p>
                          <div className="flex flex-wrap gap-1">
                            {exercise.sets.map((set) => (
                              <span key={set} className="data-text rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-zinc-500">
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
        ) : (
          <div className="p-3 text-sm text-zinc-600">Mock examples are hidden so persisted Supabase data stays visually primary.</div>
        )}
      </Panel>
    </div>
  );
}

function AuthPanel({ authError, authForm, authMessage, authMode, formError, loading, setAuthForm, setAuthMode, submitAuth }) {
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
      <IconButton
        type="submit"
        loading={loading}
        icon={LogIn}
        title={authMode === 'sign-up' ? 'Sign up' : 'Sign in'}
        tone="cyan"
        className="mt-5 h-[54px]"
      />
      <div className="col-span-full flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => setAuthMode(authMode === 'sign-up' ? 'sign-in' : 'sign-up')}
          className="data-text text-[11px] text-cyan-300 disabled:text-zinc-600"
        >
          {authMode === 'sign-up' ? 'Use existing account' : 'Create account'}
        </button>
        <span className="data-text text-[10px] text-zinc-500">
          {loading ? 'Authenticating' : 'Supabase Auth required by RLS'}
        </span>
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

function PreviousPerformanceCard({ performance, prs }) {
  const prList = Object.entries(prs)
    .filter(([, active]) => active)
    .map(([key]) => key);

  if (!performance) {
    return (
      <div className="rounded-md border border-white/5 bg-black/25 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Previous Performance</p>
          <Tag tone="zinc">NO PRIOR</Tag>
        </div>
        <p className="mt-1 text-xs text-zinc-500">No previous session found for this exercise.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-white/5 bg-black/25 px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Previous Performance</p>
          <p className="data-text text-[10px] text-zinc-600">
            {performance.sessionName} / {performance.date}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {prList.length ? prList.map((pr) => <Tag key={pr} tone="emerald">{formatPrLabel(pr)} PR</Tag>) : <Tag tone="zinc">NO PR</Tag>}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <MiniMetric label="Heaviest" value={`${performance.heaviestSet.weight}kg`} tone="text-cyan-300" sub={`${performance.heaviestSet.reps} reps @ ${performance.heaviestSet.rpe}`} />
        <MiniMetric label="Best Volume" value={performance.bestVolumeSet.volume.toLocaleString()} tone="text-emerald-300" sub={`${performance.bestVolumeSet.weight}kg x ${performance.bestVolumeSet.reps}`} />
        <MiniMetric label="Est 1RM" value={`${formatNumber(performance.bestEstimated1Rm.estimated1Rm)}kg`} tone="text-violet-300" sub="Epley best" />
        <MiniMetric label="Exercise Vol" value={performance.totalVolume.toLocaleString()} tone="text-amber-300" sub="prior session" />
      </div>
    </div>
  );
}

function SessionLog({
  active,
  beginEdit,
  deletingSetId,
  deleteWorkoutSet,
  editForm,
  editingSetId,
  savingEditId,
  session,
  setActiveWorkoutId,
  setEditForm,
  setEditingSetId,
  saveEdit,
  workoutSessions,
}) {
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
          sets.map((set) => {
            const priorAnalytics = getExerciseAnalyticsBeforeSession(workoutSessions, session, set.exercise);
            const sessionExercise = getSessionExerciseSummary(session, set.exercise);
            const isLastSet = sessionExercise.lastSet?.id === set.id;
            const prs = detectPrs(set, priorAnalytics, sessionExercise.totalVolume, isLastSet);
            if (editingSetId === set.id) {
              return (
                <EditSetRow
                  key={set.id}
                  editForm={editForm}
                  loading={savingEditId === set.id}
                  setEditForm={setEditForm}
                  onCancel={() => {
                    setEditingSetId(null);
                    setEditForm(null);
                  }}
                  onSave={() => saveEdit(set.id)}
                />
              );
            }

            return (
              <div key={set.id} className="grid grid-cols-[40px_1fr_auto_72px] items-center gap-2 rounded border border-white/5 bg-[#121212] px-2 py-2">
                <span className="data-text text-sm font-bold text-cyan-300">#{set.set_number}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="truncate text-xs font-medium text-zinc-100">{set.exercise}</p>
                    <PrTags prs={prs} />
                  </div>
                  <p className="data-text text-[10px] text-zinc-500">{formatDate(set.performed_at)}</p>
                </div>
                <span className="data-text text-xs text-zinc-200">
                  {Number(set.weight)}kg x {set.reps} @ {Number(set.rpe)}
                </span>
                <div className="flex gap-1">
                  <IconButton icon={Pencil} onClick={() => beginEdit(set)} title="Edit set" tone="zinc" size="sm" />
                  <IconButton
                    icon={Trash2}
                    loading={deletingSetId === set.id}
                    onClick={() => deleteWorkoutSet(set.id)}
                    title="Delete set"
                    tone="red"
                    size="sm"
                  />
                </div>
              </div>
            );
          })
        ) : (
          <p className="px-2 py-2 text-sm text-zinc-500">No sets logged in this session.</p>
        )}
      </div>
    </div>
  );
}

function PrTags({ prs }) {
  const active = Object.entries(prs).filter(([, value]) => value);
  if (!active.length) return null;
  const labels = {
    setVolume: 'SET VOLUME',
    sessionVolume: 'SESSION VOLUME',
    weight: 'WEIGHT',
    reps: 'REPS',
  };
  return (
    <span className="flex gap-1">
      {active.map(([key]) => (
        <span key={key} className="data-text rounded border border-emerald-400/20 bg-emerald-400/10 px-1 text-[9px] text-emerald-300">
          {labels[key] ?? key.toUpperCase()}
        </span>
      ))}
    </span>
  );
}

function ExerciseHistoryCard({ exercise }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/25 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">{exercise.name}</p>
          <p className="data-text text-[10px] text-zinc-500">
            {exercise.sessions.length} sessions / {exercise.totalSets} sets / {exercise.totalVolume.toLocaleString()} volume
          </p>
        </div>
        <Tag tone="emerald">BEST 1RM {formatNumber(exercise.bestEstimated1Rm.estimated1Rm)}kg</Tag>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <TrendBars
          color="emerald"
          max={exercise.peakSessionVolume}
          sessions={exercise.sessions}
          title="Session Volume"
          valueKey="totalVolume"
        />
        <TrendBars
          color="cyan"
          max={exercise.peakEstimated1Rm}
          sessions={exercise.sessions}
          title="Best Est 1RM"
          valueKey="bestEstimated1Rm"
        />
      </div>
      <div className="grid gap-1">
        {exercise.sessions.slice(-4).reverse().map((session) => (
          <div key={session.sessionId} className="grid grid-cols-[72px_1fr_auto] items-center gap-2 rounded border border-white/5 bg-[#121212] px-2 py-2">
            <span className="data-text text-[10px] text-zinc-500">{session.date}</span>
            <span className="truncate text-xs text-zinc-200">{session.sessionName}</span>
            <span className="data-text text-xs text-cyan-300">
              {session.totalVolume.toLocaleString()} vol / {formatNumber(session.bestEstimated1Rm.estimated1Rm)}kg e1RM
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendBars({ color, max, sessions, title, valueKey }) {
  const barColor = color === 'cyan' ? 'border-cyan-400/20 bg-cyan-400/50' : 'border-emerald-400/20 bg-emerald-400/50';
  return (
    <div className="rounded border border-white/5 bg-[#121212] p-2">
      <p className="mb-2 data-text text-[10px] uppercase tracking-wider text-zinc-500">{title}</p>
      <div className="flex h-16 items-end gap-1">
        {sessions.slice(-12).map((session) => {
          const value = valueKey === 'bestEstimated1Rm' ? session.bestEstimated1Rm.estimated1Rm : session[valueKey];
          const height = Math.max(8, Math.round((value / Math.max(max, 1)) * 48));
          return (
            <div key={`${title}-${session.sessionId}`} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-sm border ${barColor}`}
                style={{ height }}
                title={`${session.date}: ${formatNumber(value)}`}
              />
              <span className="data-text text-[8px] text-zinc-600">{session.date.slice(5)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditSetRow({ editForm, loading, onCancel, onSave, setEditForm }) {
  const update = (field, value) => setEditForm((prev) => ({ ...prev, [field]: value }));
  return (
    <div className="grid grid-cols-2 gap-2 rounded border border-cyan-400/20 bg-cyan-400/[0.04] p-2 xl:grid-cols-[1.2fr_0.4fr_0.55fr_0.45fr_0.45fr_0.7fr_1fr_72px]">
      <SetField label="Exercise" value={editForm.exercise} onChange={(value) => update('exercise', value)} compact />
      <SetField label="Set" type="number" value={editForm.set_number} onChange={(value) => update('set_number', value)} compact />
      <SetField label="Weight" type="number" value={editForm.weight} suffix="kg" onChange={(value) => update('weight', value)} compact />
      <SetField label="Reps" type="number" value={editForm.reps} onChange={(value) => update('reps', value)} compact />
      <SetField label="RPE" type="number" step="0.5" value={editForm.rpe} onChange={(value) => update('rpe', value)} compact />
      <SetField label="Date" type="date" value={editForm.date} onChange={(value) => update('date', value)} compact />
      <SetField label="Notes" value={editForm.notes} onChange={(value) => update('notes', value)} compact />
      <div className="flex items-end gap-1">
        <IconButton icon={Check} loading={loading} onClick={onSave} title="Save edit" tone="emerald" size="sm" />
        <IconButton icon={X} onClick={onCancel} title="Cancel edit" tone="zinc" size="sm" />
      </div>
    </div>
  );
}

function SetField({ label, value, onChange, type = 'text', step, suffix, readOnly = false, compact = false }) {
  return (
    <label className={`rounded-md border border-white/5 bg-[#121212] ${compact ? 'p-2' : 'p-3'}`}>
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="mt-2 flex items-end gap-1">
        <input
          type={type}
          step={step}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          className={`data-text min-w-0 flex-1 bg-transparent font-black text-zinc-100 outline-none ${
            compact ? 'text-sm' : 'text-base md:text-lg'
          } ${readOnly ? 'text-cyan-300' : ''}`}
        />
        {suffix ? <span className="data-text pb-1 text-sm text-zinc-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

function IconButton({ className = '', disabled = false, icon: Icon, loading = false, onClick, size = 'md', title, tone = 'zinc', type = 'button' }) {
  const tones = {
    cyan: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
    emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    red: 'border-red-400/20 bg-red-400/10 text-red-300',
    zinc: 'border-white/10 bg-white/[0.03] text-zinc-300',
  };
  const dimensions = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const DisplayIcon = loading ? Loader2 : Icon;
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      className={`grid place-items-center rounded-md border transition disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600 ${tones[tone]} ${dimensions} ${className}`}
    >
      <DisplayIcon size={size === 'sm' ? 14 : 16} className={loading ? 'animate-spin' : ''} />
    </button>
  );
}

function LoadingCard({ label }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/5 bg-black/25 p-3 data-text text-[11px] text-zinc-500">
      <Loader2 size={15} className="animate-spin text-cyan-300" />
      {label}
    </div>
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

function getNextSetNumber(session, exercise) {
  if (!session || !exercise.trim()) return 1;
  const normalizedExercise = exercise.trim().toLowerCase();
  const matchingSets = (session.workout_sets ?? []).filter(
    (set) => set.exercise.trim().toLowerCase() === normalizedExercise,
  );
  return matchingSets.length ? Math.max(...matchingSets.map((set) => Number(set.set_number))) + 1 : 1;
}

function getSessionExerciseSummary(session, exercise) {
  const key = normalizeExercise(exercise);
  const sets = (session?.workout_sets ?? [])
    .filter((set) => normalizeExercise(set.exercise) === key)
    .map(normalizeSet)
    .sort((a, b) => Number(a.set_number) - Number(b.set_number));
  return {
    sets,
    totalVolume: sets.reduce((total, set) => total + set.volume, 0),
    lastSet: sets[sets.length - 1] ?? null,
  };
}

function getSessionExerciseVolume(session, exercise) {
  return getSessionExerciseSummary(session, exercise).totalVolume;
}

function buildExerciseAnalytics(sessions) {
  const map = {};

  sessions
    .slice()
    .sort(compareSessionsAscending)
    .forEach((session) => {
      const groupedSets = {};
      (session.workout_sets ?? []).forEach((set) => {
        const key = normalizeExercise(set.exercise);
        if (!key) return;
        groupedSets[key] = groupedSets[key] ?? [];
        groupedSets[key].push(set);
      });

      Object.entries(groupedSets).forEach(([key, sets]) => {
        const normalizedSets = sets.map(normalizeSet);
        const totalVolume = normalizedSets.reduce((total, set) => total + set.volume, 0);
        const bestVolumeSet = normalizedSets.reduce((best, set) => (set.volume > best.volume ? set : best), normalizedSets[0]);
        const heaviestSet = normalizedSets.reduce((best, set) => (set.weight > best.weight ? set : best), normalizedSets[0]);
        const bestEstimated1Rm = normalizedSets.reduce(
          (best, set) => (set.estimated1Rm > best.estimated1Rm ? set : best),
          normalizedSets[0],
        );
        const last = normalizedSets.slice().sort((a, b) => new Date(b.performed_at) - new Date(a.performed_at))[0];

        map[key] = map[key] ?? {
          key,
          name: sets[0].exercise,
          sessions: [],
          totalSets: 0,
          totalVolume: 0,
          bestVolumeSet,
          heaviestSet,
          bestEstimated1Rm,
          maxWeight: 0,
          maxReps: 0,
          maxSetVolume: 0,
          maxSessionVolume: 0,
          maxEstimated1Rm: 0,
          peakSessionVolume: 1,
          peakEstimated1Rm: 1,
        };

        map[key].sessions.push({
          sessionId: session.id,
          sessionName: session.name,
          date: session.performed_on,
          startedAt: session.started_at,
          sets: normalizedSets,
          last,
          bestVolumeSet,
          bestSet: bestVolumeSet,
          heaviestSet,
          bestEstimated1Rm,
          totalVolume,
        });
        map[key].totalSets += normalizedSets.length;
        map[key].totalVolume += totalVolume;
        map[key].bestVolumeSet = bestVolumeSet.volume > map[key].bestVolumeSet.volume ? bestVolumeSet : map[key].bestVolumeSet;
        map[key].bestSet = map[key].bestVolumeSet;
        map[key].heaviestSet = heaviestSet.weight > map[key].heaviestSet.weight ? heaviestSet : map[key].heaviestSet;
        map[key].bestEstimated1Rm =
          bestEstimated1Rm.estimated1Rm > map[key].bestEstimated1Rm.estimated1Rm
            ? bestEstimated1Rm
            : map[key].bestEstimated1Rm;
        map[key].maxWeight = Math.max(map[key].maxWeight, ...normalizedSets.map((set) => set.weight));
        map[key].maxReps = Math.max(map[key].maxReps, ...normalizedSets.map((set) => set.reps));
        map[key].maxSetVolume = Math.max(map[key].maxSetVolume, ...normalizedSets.map((set) => set.volume));
        map[key].maxSessionVolume = Math.max(map[key].maxSessionVolume, totalVolume);
        map[key].maxEstimated1Rm = Math.max(map[key].maxEstimated1Rm, ...normalizedSets.map((set) => set.estimated1Rm));
        map[key].peakSessionVolume = Math.max(map[key].peakSessionVolume, totalVolume);
        map[key].peakEstimated1Rm = Math.max(map[key].peakEstimated1Rm, bestEstimated1Rm.estimated1Rm);
      });
    });

  const exercises = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  return { byExercise: map, exercises };
}

function getPreviousPerformance(sessions, activeSession, exercise) {
  const key = normalizeExercise(exercise);
  if (!key || !activeSession) return null;

  const previousSession = sessions
    .filter((session) => session.id !== activeSession.id)
    .filter((session) => compareSessionPosition(session, activeSession) < 0)
    .sort(compareSessionsDescending)
    .find((session) => (session.workout_sets ?? []).some((set) => normalizeExercise(set.exercise) === key));

  if (!previousSession) return null;

  const sets = previousSession.workout_sets
    .filter((set) => normalizeExercise(set.exercise) === key)
    .map(normalizeSet)
    .sort((a, b) => Number(a.set_number) - Number(b.set_number));
  const totalVolume = sets.reduce((total, set) => total + set.volume, 0);
  const bestVolumeSet = sets.reduce((best, set) => (set.volume > best.volume ? set : best), sets[0]);
  const heaviestSet = sets.reduce((best, set) => (set.weight > best.weight ? set : best), sets[0]);
  const bestEstimated1Rm = sets.reduce((best, set) => (set.estimated1Rm > best.estimated1Rm ? set : best), sets[0]);
  const last = sets[sets.length - 1];

  return {
    sessionName: previousSession.name,
    date: previousSession.performed_on,
    sets,
    last,
    bestSet: bestVolumeSet,
    bestVolumeSet,
    heaviestSet,
    bestEstimated1Rm,
    totalVolume,
  };
}

function getExerciseAnalyticsBeforeSession(sessions, activeSession, exercise) {
  const key = normalizeExercise(exercise);
  if (!key || !activeSession) return null;
  const priorSessions = sessions
    .filter((session) => session.id !== activeSession.id)
    .filter((session) => compareSessionPosition(session, activeSession) < 0)
    .map((session) => ({
      ...session,
      workout_sets: (session.workout_sets ?? []).filter((set) => normalizeExercise(set.exercise) === key),
    }));
  return buildExerciseAnalytics(priorSessions).byExercise[key] ?? null;
}

function detectPrs(set, analytics, sessionExerciseVolume = 0, includeSessionVolume = false) {
  if (!analytics || !set.exercise || !Number.isFinite(Number(set.weight)) || !Number.isFinite(Number(set.reps))) {
    return { setVolume: false, sessionVolume: false, weight: false, reps: false };
  }

  const weight = Number(set.weight);
  const reps = Number(set.reps);
  const volume = weight * reps;

  return {
    setVolume: volume > analytics.maxSetVolume,
    sessionVolume: includeSessionVolume && Number(sessionExerciseVolume) > analytics.maxSessionVolume,
    weight: weight > analytics.maxWeight,
    reps: reps > analytics.maxReps,
  };
}

function normalizeSet(set) {
  const weight = Number(set.weight);
  const reps = Number(set.reps);
  const estimated1Rm = weight * (1 + reps / 30);
  return {
    ...set,
    weight,
    reps,
    rpe: Number(set.rpe),
    volume: weight * reps,
    estimated1Rm,
  };
}

function normalizeExercise(exercise) {
  return String(exercise ?? '').trim().toLowerCase();
}

function formatPrLabel(key) {
  const labels = {
    setVolume: 'SET VOLUME',
    sessionVolume: 'SESSION VOLUME',
    weight: 'WEIGHT',
    reps: 'REPS',
  };
  return labels[key] ?? key.toUpperCase();
}

function formatNumber(value) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 1,
  });
}

function compareSessionsAscending(a, b) {
  return compareSessionPosition(a, b);
}

function compareSessionsDescending(a, b) {
  return compareSessionPosition(b, a);
}

function compareSessionPosition(a, b) {
  const aTime = new Date(a.started_at || `${a.performed_on}T00:00:00`).getTime();
  const bTime = new Date(b.started_at || `${b.performed_on}T00:00:00`).getTime();
  if (aTime !== bTime) return aTime - bTime;
  return String(a.id).localeCompare(String(b.id));
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
