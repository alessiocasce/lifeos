import {
  Check,
  ChevronDown,
  ClipboardList,
  Database,
  Dumbbell,
  History,
  Loader2,
  Medal,
  Pencil,
  Plus,
  Square,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';

const today = new Date().toISOString().slice(0, 10);
const WARMUP_SET_NUMBER_OFFSET = 1000;

export function WorkoutTab() {
  const {
    activeWorkoutId,
    activeWorkoutSession,
    createWorkoutTemplate,
    createWorkoutTemplateExercise,
    createWorkoutSession,
    createWorkoutSet,
    deleteWorkoutTemplate,
    deleteWorkoutTemplateExercise,
    deleteWorkoutSession,
    deleteWorkoutSet,
    endWorkoutSession,
    reorderWorkoutTemplateExercise,
    setActiveWorkoutId,
    updateWorkoutTemplate,
    updateWorkoutTemplateExercise,
    updateWorkoutSession,
    updateWorkoutSet,
    workoutSessions,
    workoutSessionsError,
    workoutSessionsStatus,
    workoutTemplates,
    workoutTemplatesError,
    workoutTemplatesStatus,
  } = useLifeOS();

  const [sessionForm, setSessionForm] = useState({ name: 'Today Workout', performed_on: today, notes: '' });
  const [showCustomSession, setShowCustomSession] = useState(false);
  const [setForm, setSetForm] = useState({
    exercise: '',
    set_number: 1,
    weight: '',
    reps: '',
    rpe: '',
    is_warmup: false,
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
  const [reopeningSessionId, setReopeningSessionId] = useState(null);
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [collapsedSessions, setCollapsedSessions] = useState({});
  const [formError, setFormError] = useState('');
  const [restElapsedSeconds, setRestElapsedSeconds] = useState(0);
  const [isRestTimerRunning, setIsRestTimerRunning] = useState(false);
  const [templatePlan, setTemplatePlan] = useState(null);
  const [startingTemplateId, setStartingTemplateId] = useState(null);

  const activeSetCounts = getSessionSetCounts(activeWorkoutSession);
  const activeVolume = getSessionVolume(activeWorkoutSession);
  const todaysSessions = useMemo(() => workoutSessions.filter((session) => session.performed_on === today), [workoutSessions]);
  const exerciseAnalytics = useMemo(() => buildExerciseAnalytics(workoutSessions), [workoutSessions]);
  const selectedExerciseAnalytics = useMemo(
    () => getExerciseAnalyticsBeforeSession(workoutSessions, activeWorkoutSession, setForm.exercise),
    [activeWorkoutSession, setForm.exercise, workoutSessions],
  );
  const previousPerformance = useMemo(
    () => getPreviousPerformance(workoutSessions, activeWorkoutSession, setForm.exercise),
    [activeWorkoutSession, setForm.exercise, workoutSessions],
  );
  const nextSetNumber = useMemo(
    () => getNextSetNumber(activeWorkoutSession, setForm.exercise),
    [activeWorkoutSession, setForm.exercise],
  );
  const visibleTemplatePlan = templatePlan?.sessionId === activeWorkoutSession?.id ? templatePlan : null;
  const draftPrs = useMemo(() => {
    if (setForm.is_warmup) {
      return { setVolume: false, sessionVolume: false, weight: false, reps: false };
    }
    const weight = parseDecimal(setForm.weight);
    const reps = parseInteger(setForm.reps);
    return detectPrs(
      { exercise: setForm.exercise, weight, reps, is_warmup: false },
      selectedExerciseAnalytics,
      activeWorkoutSession ? getSessionExerciseVolume(activeWorkoutSession, setForm.exercise) + weight * reps : 0,
      true,
    );
  }, [activeWorkoutSession, selectedExerciseAnalytics, setForm.exercise, setForm.is_warmup, setForm.reps, setForm.weight]);

  useEffect(() => {
    setSetForm((prev) => ({
      ...prev,
      set_number: prev.is_warmup ? getNextWarmupSetNumber(activeWorkoutSession, prev.exercise) : nextSetNumber,
    }));
  }, [activeWorkoutSession, nextSetNumber]);

  useEffect(() => {
    if (!activeWorkoutSession || activeWorkoutSession.ended_at) {
      setIsRestTimerRunning(false);
      setRestElapsedSeconds(0);
      setEditingSetId(null);
      setEditForm(null);
    }
  }, [activeWorkoutSession]);

  useEffect(() => {
    if (!activeWorkoutSession || activeWorkoutSession.ended_at || !isRestTimerRunning) return undefined;
    const interval = window.setInterval(() => {
      setRestElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeWorkoutSession, isRestTimerRunning]);

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
      setTemplatePlan(null);
      setShowCustomSession(false);
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
      setTemplatePlan(null);
    } catch (error) {
      setFormError(error.message || 'Failed to start today workout.');
    } finally {
      setSelectingToday(false);
    }
  };

  const fillLoggerFromTemplateExercise = (exercise, session = activeWorkoutSession) => {
    if (!exercise) return;
    setSetForm((prev) => ({
      ...prev,
      exercise: exercise.exercise,
      set_number: prev.is_warmup
        ? getNextWarmupSetNumber(session, exercise.exercise)
        : getNextSetNumber(session, exercise.exercise),
      date: today,
    }));
  };

  const startFromTemplate = async (templateId) => {
    const template = workoutTemplates.find((item) => item.id === templateId);
    if (!template) return;

    setFormError('');
    setStartingTemplateId(templateId);
    try {
      const created = await createWorkoutSession({
        name: getUniqueSessionName(template.name, todaysSessions),
        performed_on: today,
        started_at: new Date().toISOString(),
        notes: '',
      });
      const exercises = sortTemplateExercises(template.workout_template_exercises ?? []);
      setTemplatePlan({
        templateId: template.id,
        templateName: template.name,
        sessionId: created.id,
        sessionName: created.name,
        exercises,
      });
      if (exercises[0]) fillLoggerFromTemplateExercise(exercises[0], created);
    } catch (error) {
      setFormError(error.message || 'Failed to start from template.');
    } finally {
      setStartingTemplateId(null);
    }
  };

  const submitSet = async (event) => {
    event.preventDefault();
    setFormError('');

    if (activeWorkoutSession?.ended_at) {
      setFormError('This workout is ended. Reopen it to add more sets.');
      return;
    }

    const validationError = validateSetForm(setForm, activeWorkoutSession);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const weight = parseDecimal(setForm.weight);
    const reps = parseInteger(setForm.reps);
    const rpe = parseDecimal(setForm.rpe);

    setSavingSet(true);
    try {
      const createdSet = await createWorkoutSet({
        workout_id: activeWorkoutSession.id,
        exercise: setForm.exercise.trim(),
        set_number: setForm.is_warmup
          ? getNextWarmupSetNumber(activeWorkoutSession, setForm.exercise)
          : nextSetNumber,
        is_warmup: Boolean(setForm.is_warmup),
        weight,
        reps,
        rpe,
        performed_at: dateToPerformedAt(setForm.date),
        notes: setForm.notes.trim(),
      });
      const projectedSession = {
        ...activeWorkoutSession,
        workout_sets: [...(activeWorkoutSession.workout_sets ?? []), createdSet],
      };
      setSetForm((prev) => ({
        ...prev,
        set_number: prev.is_warmup
          ? getNextWarmupSetNumber(projectedSession, prev.exercise)
          : getNextSetNumber(projectedSession, prev.exercise),
        reps: '',
        notes: '',
      }));
      setRestElapsedSeconds(0);
      setIsRestTimerRunning(true);
    } catch (error) {
      setFormError(error.message || 'Failed to save set.');
    } finally {
      setSavingSet(false);
    }
  };

  const beginEdit = (set) => {
    if (activeWorkoutSession?.ended_at) {
      setFormError('This workout is ended. Reopen it to edit sets.');
      return;
    }

    setEditingSetId(set.id);
    setEditForm({
      id: set.id,
      exercise: set.exercise,
      set_number: set.set_number,
      weight: String(set.weight),
      reps: String(set.reps),
      rpe: String(set.rpe),
      is_warmup: Boolean(set.is_warmup),
      date: new Date(set.performed_at).toISOString().slice(0, 10),
      notes: set.notes ?? '',
    });
  };

  const saveEdit = async (setId) => {
    setFormError('');

    if (activeWorkoutSession?.ended_at) {
      setFormError('This workout is ended. Reopen it to edit sets.');
      return;
    }

    const validationError = validateSetForm(editForm, activeWorkoutSession);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSavingEditId(setId);
    try {
      await updateWorkoutSet(setId, {
        exercise: editForm.exercise.trim(),
        set_number: resolveEditSetNumber(editForm, activeWorkoutSession, setId),
        is_warmup: Boolean(editForm.is_warmup),
        weight: parseDecimal(editForm.weight),
        reps: parseInteger(editForm.reps),
        rpe: parseDecimal(editForm.rpe),
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
      setIsRestTimerRunning(false);
      setRestElapsedSeconds(0);
    } catch (error) {
      setFormError(error.message || 'Failed to end workout.');
    } finally {
      setEndingSessionId(null);
    }
  };

  const reopenSession = async (sessionId) => {
    setReopeningSessionId(sessionId);
    setFormError('');
    try {
      await updateWorkoutSession(sessionId, { ended_at: null });
    } catch (error) {
      setFormError(error.message || 'Failed to reopen workout.');
    } finally {
      setReopeningSessionId(null);
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
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+16px)]">
      {activeWorkoutSession ? (
        <>
          <ActiveWorkoutHeader
            activeSession={activeWorkoutSession}
            activeVolume={activeVolume}
            isRestTimerRunning={isRestTimerRunning}
            onPauseRestTimer={() => setIsRestTimerRunning(false)}
            onResetRestTimer={() => {
              setIsRestTimerRunning(false);
              setRestElapsedSeconds(0);
            }}
            onStartRestTimer={() => activeWorkoutSession && !activeWorkoutSession.ended_at && setIsRestTimerRunning(true)}
            restElapsedSeconds={restElapsedSeconds}
            setCounts={activeSetCounts}
          />

          <div className="col-span-12 grid gap-3 xl:grid-cols-[1fr_340px]">
            <div className="grid gap-3">
              <TemplatePlanCard
                activeExercise={setForm.exercise}
                onSelectExercise={(exercise) => fillLoggerFromTemplateExercise(exercise)}
                plan={visibleTemplatePlan}
              />

              <SetLogger
                activeSession={activeWorkoutSession}
                draftPrs={draftPrs}
                formError={formError}
                onSetSubmit={submitSet}
                previousPerformance={previousPerformance}
                savingSet={savingSet}
                setFormValue={setForm}
                updateSetForm={(field, value) => setSetForm((prev) => ({ ...prev, [field]: value }))}
              />

              <TodaySetsLog
                activeSession={activeWorkoutSession}
                beginEdit={beginEdit}
                collapsedSessions={collapsedSessions}
                deletingSetId={deletingSetId}
                editForm={editForm}
                editingSetId={editingSetId}
                onDeleteSet={removeSet}
                onSaveEdit={saveEdit}
                savingEditId={savingEditId}
                setActiveWorkoutId={setActiveWorkoutId}
                setCollapsedSessions={setCollapsedSessions}
                setEditForm={setEditForm}
                setEditingSetId={setEditingSetId}
                workoutSessions={workoutSessions}
                workoutSessionsStatus={workoutSessionsStatus}
              />
            </div>

            <WorkoutSessionControl
              activeSession={activeWorkoutSession}
              activeWorkoutId={activeWorkoutId}
              createWorkoutTemplate={createWorkoutTemplate}
              createWorkoutTemplateExercise={createWorkoutTemplateExercise}
              deleteConfirmId={deleteConfirmId}
              deleteWorkoutTemplate={deleteWorkoutTemplate}
              deleteWorkoutTemplateExercise={deleteWorkoutTemplateExercise}
              deletingSessionId={deletingSessionId}
              endingSessionId={endingSessionId}
              onDeleteSession={removeSession}
              onEndSession={endSession}
              onReopenSession={reopenSession}
              onSelectToday={selectOrStartToday}
              onStartFromTemplate={startFromTemplate}
              onStartWorkout={startWorkout}
              reorderWorkoutTemplateExercise={reorderWorkoutTemplateExercise}
              reopeningSessionId={reopeningSessionId}
              savingSession={savingSession}
              selectingToday={selectingToday}
              sessionForm={sessionForm}
              setActiveWorkoutId={setActiveWorkoutId}
              setSessionForm={setSessionForm}
              setShowCustomSession={setShowCustomSession}
              showCustomSession={showCustomSession}
              startingTemplateId={startingTemplateId}
              updateWorkoutTemplate={updateWorkoutTemplate}
              updateWorkoutTemplateExercise={updateWorkoutTemplateExercise}
              workoutSessions={workoutSessions}
              workoutSessionsError={workoutSessionsError}
              workoutSessionsStatus={workoutSessionsStatus}
              workoutTemplates={workoutTemplates}
              workoutTemplatesError={workoutTemplatesError}
              workoutTemplatesStatus={workoutTemplatesStatus}
            />
          </div>

          <ExerciseHistoryPanel exerciseAnalytics={exerciseAnalytics} />
        </>
      ) : (
        <>
          <div className="col-span-12 grid gap-3 xl:grid-cols-[minmax(0,760px)_1fr]">
            <WorkoutSessionControl
              activeSession={activeWorkoutSession}
              activeWorkoutId={activeWorkoutId}
              createWorkoutTemplate={createWorkoutTemplate}
              createWorkoutTemplateExercise={createWorkoutTemplateExercise}
              deleteConfirmId={deleteConfirmId}
              deleteWorkoutTemplate={deleteWorkoutTemplate}
              deleteWorkoutTemplateExercise={deleteWorkoutTemplateExercise}
              deletingSessionId={deletingSessionId}
              endingSessionId={endingSessionId}
              onDeleteSession={removeSession}
              onEndSession={endSession}
              onReopenSession={reopenSession}
              onSelectToday={selectOrStartToday}
              onStartFromTemplate={startFromTemplate}
              onStartWorkout={startWorkout}
              reorderWorkoutTemplateExercise={reorderWorkoutTemplateExercise}
              reopeningSessionId={reopeningSessionId}
              savingSession={savingSession}
              selectingToday={selectingToday}
              sessionForm={sessionForm}
              setActiveWorkoutId={setActiveWorkoutId}
              setSessionForm={setSessionForm}
              setShowCustomSession={setShowCustomSession}
              showCustomSession={showCustomSession}
              startingTemplateId={startingTemplateId}
              updateWorkoutTemplate={updateWorkoutTemplate}
              updateWorkoutTemplateExercise={updateWorkoutTemplateExercise}
              workoutSessions={workoutSessions}
              workoutSessionsError={workoutSessionsError}
              workoutSessionsStatus={workoutSessionsStatus}
              workoutTemplates={workoutTemplates}
              workoutTemplatesError={workoutTemplatesError}
              workoutTemplatesStatus={workoutTemplatesStatus}
            />
          </div>

          <ExerciseHistoryPanel exerciseAnalytics={exerciseAnalytics} />
        </>
      )}
    </div>
  );
}

function ActiveWorkoutHeader({
  activeSession,
  activeVolume,
  isRestTimerRunning,
  onPauseRestTimer,
  onResetRestTimer,
  onStartRestTimer,
  restElapsedSeconds,
  setCounts,
}) {
  const ended = Boolean(activeSession.ended_at);
  const status = ended ? 'ENDED' : 'LIVE';
  const tone = ended ? 'zinc' : 'emerald';
  const timerInactive = ended;

  return (
    <Panel className="sticky top-[calc(env(safe-area-inset-top)+56px)] z-20 col-span-12 md:static md:z-auto">
      <div className="grid items-center gap-2 p-2 md:gap-3 md:p-3 lg:grid-cols-[1fr_190px]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Dumbbell size={18} className="text-cyan-300" />
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-zinc-100 md:text-lg">{activeSession.name}</h2>
            <Tag tone={tone}>{status}</Tag>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="hidden md:block">
              <MiniMetric label="Date" value={activeSession?.performed_on ?? today} tone="text-zinc-100" sub="active day" />
            </div>
            <MiniMetric label="Sets" value={`${setCounts.working} / ${setCounts.warmup}`} tone="text-cyan-300" sub="working / warmup" />
            <MiniMetric label="Volume" value={Math.round(activeVolume).toLocaleString()} tone="text-emerald-300" sub="kg x reps" />
            <div className="hidden md:block">
              <MiniMetric label="Started" value={formatTime(activeSession?.started_at)} tone="text-amber-300" sub="local" />
            </div>
          </div>
        </div>
        <div
          className={`rounded-md border px-2 py-2 md:px-3 ${
            timerInactive ? 'border-white/10 bg-white/[0.03]' : 'border-red-400/20 bg-red-400/10'
          }`}
        >
          <div className={`flex items-center justify-center gap-1 ${timerInactive ? 'text-zinc-500' : 'text-red-300'}`}>
            <Timer size={14} />
            <span className="data-text text-[10px] uppercase tracking-wider">Rest</span>
          </div>
          <p className={`data-text text-center text-xl font-black md:text-2xl ${timerInactive ? 'text-zinc-600' : 'text-red-300'}`}>
            {formatElapsed(restElapsedSeconds)}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={onStartRestTimer}
              disabled={timerInactive || isRestTimerRunning}
              className="min-h-9 rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 data-text text-[10px] text-emerald-300 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            >
              START
            </button>
            <button
              type="button"
              onClick={onPauseRestTimer}
              disabled={timerInactive || !isRestTimerRunning}
              className="min-h-9 rounded border border-amber-400/20 bg-amber-400/10 px-2 py-1 data-text text-[10px] text-amber-300 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            >
              PAUSE
            </button>
            <button
              type="button"
              onClick={onResetRestTimer}
              disabled={timerInactive || (!isRestTimerRunning && restElapsedSeconds === 0)}
              className="min-h-9 rounded border border-white/10 bg-white/[0.03] px-2 py-1 data-text text-[10px] text-zinc-300 disabled:text-zinc-600"
            >
              RESET
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function WorkoutSessionControl({
  activeSession,
  activeWorkoutId,
  createWorkoutTemplate,
  createWorkoutTemplateExercise,
  deleteConfirmId,
  deleteWorkoutTemplate,
  deleteWorkoutTemplateExercise,
  deletingSessionId,
  endingSessionId,
  onDeleteSession,
  onEndSession,
  onReopenSession,
  onSelectToday,
  onStartFromTemplate,
  onStartWorkout,
  reorderWorkoutTemplateExercise,
  reopeningSessionId,
  savingSession,
  selectingToday,
  sessionForm,
  startingTemplateId,
  setActiveWorkoutId,
  setSessionForm,
  setShowCustomSession,
  showCustomSession,
  updateWorkoutTemplate,
  updateWorkoutTemplateExercise,
  workoutSessions,
  workoutSessionsError,
  workoutSessionsStatus,
  workoutTemplates,
  workoutTemplatesError,
  workoutTemplatesStatus,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const todaysSessions = workoutSessions.filter((session) => session.performed_on === today);
  const activeCounts = getSessionSetCounts(activeSession);
  const activeVolume = getSessionVolume(activeSession);
  const contentOpen = !activeSession || mobileOpen;

  return (
    <Panel className="h-fit">
      <PanelHeader
        eyebrow="Workout"
        title={activeSession ? 'Current Workout' : 'Start Workout'}
        right={<SourceStatus status={workoutSessionsStatus} />}
      />
      <button
        type="button"
        onClick={() => setMobileOpen((value) => !value)}
        className="flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-sm text-zinc-300 md:hidden"
      >
        <span>{activeSession ? 'Current workout' : 'Start workout'}</span>
        <ChevronDown size={16} className={`text-zinc-500 transition ${contentOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`${contentOpen ? 'block' : 'hidden'} space-y-2 p-3 md:block`}>
        {activeSession ? (
          <div className="rounded-md border border-white/5 bg-black/25 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">{activeSession.name}</p>
                <p className="data-text text-[10px] text-zinc-500">
                  {activeSession.performed_on} / {activeCounts.working} working / {activeCounts.warmup} warmup
                </p>
              </div>
              <Tag tone={activeSession.ended_at ? 'zinc' : 'emerald'}>{activeSession.ended_at ? 'ENDED' : 'LIVE'}</Tag>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <MiniMetric label="Volume" value={Math.round(activeVolume).toLocaleString()} tone="text-emerald-300" sub="kg x reps" />
              <MiniMetric label="Sets" value={`${activeCounts.working}/${activeCounts.warmup}`} tone="text-cyan-300" sub="work / warmup" />
            </div>
            {activeSession.ended_at ? (
              <button
                type="button"
                onClick={() => onReopenSession(activeSession.id)}
                disabled={reopeningSessionId === activeSession.id}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 text-xs font-medium text-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
              >
                {reopeningSessionId === activeSession.id ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Reopen Workout
              </button>
            ) : (
            <button
              type="button"
              onClick={() => onEndSession(activeSession.id)}
              disabled={endingSessionId === activeSession.id}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-amber-400/20 bg-amber-400/10 text-xs font-medium text-amber-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            >
              {endingSessionId === activeSession.id ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
              End Workout
            </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded-md border border-cyan-400/10 bg-cyan-400/[0.04] p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200">What are you training today?</p>
                  <p className="text-[11px] text-zinc-500">Start from template or start empty.</p>
                </div>
                <ClipboardList size={15} className="shrink-0 text-cyan-300" />
              </div>
              {workoutTemplatesStatus === 'loading' && !workoutTemplates.length ? (
                <LoadingCard label="Loading workout templates" />
              ) : workoutTemplates.length ? (
                <div className="grid gap-1.5">
                  {workoutTemplates.map((template) => {
                    const count = template.workout_template_exercises?.length ?? 0;
                    return (
                      <div key={template.id} className="grid gap-2 rounded border border-white/5 bg-[#121212] p-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-100">{template.name}</p>
                          <p className="data-text text-[10px] text-zinc-500">{count} exercises</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onStartFromTemplate(template.id)}
                          disabled={Boolean(startingTemplateId)}
                          className="flex min-h-10 items-center justify-center gap-2 rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
                        >
                          {startingTemplateId === template.id ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                          Start
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded border border-white/5 bg-[#121212] px-2 py-2 text-xs text-zinc-500">
                  No templates yet. Create your first template or start empty.
                </p>
              )}
              {workoutTemplatesError ? <p className="mt-2 data-text text-[11px] text-red-300">{workoutTemplatesError}</p> : null}
            </div>

            {todaysSessions.length ? (
              <button
                type="button"
                onClick={onSelectToday}
                disabled={selectingToday}
                className="flex w-full items-center justify-between rounded-md border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-left text-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
              >
                <span>
                  <span className="block text-sm font-semibold">{selectingToday ? 'Syncing' : "Continue Today's Workout"}</span>
                  <span className="data-text text-[10px] text-cyan-300/70">{todaysSessions.length} today</span>
                </span>
                {selectingToday ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              </button>
            ) : null}
          </div>
        )}

        {!activeSession ? (
          <button
            type="button"
            onClick={() => setShowCustomSession((value) => !value)}
            className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs font-medium text-zinc-300"
          >
            Start Empty Workout
          </button>
        ) : null}

        {!activeSession && showCustomSession ? (
          <form onSubmit={onStartWorkout} className="grid gap-2 rounded-md border border-white/5 bg-black/25 p-2">
            <p className="text-xs text-zinc-500">
              Start empty. You can keep the default name or set a custom one.
            </p>
            <CompactField label="Name" value={sessionForm.name} onChange={(value) => setSessionForm((prev) => ({ ...prev, name: value }))} />
            <CompactField label="Date" type="date" value={sessionForm.performed_on} onChange={(value) => setSessionForm((prev) => ({ ...prev, performed_on: value }))} />
            <CompactField label="Notes" value={sessionForm.notes} onChange={(value) => setSessionForm((prev) => ({ ...prev, notes: value }))} />
            <button
              type="submit"
              disabled={savingSession}
              className="flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 text-xs font-medium text-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            >
              {savingSession ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {savingSession ? 'Starting' : 'Start Empty'}
            </button>
          </form>
        ) : null}

        <CollapsedSection
          open={manageTemplatesOpen}
          setOpen={setManageTemplatesOpen}
          title="Manage templates"
        >
          <TemplateManager
            createWorkoutTemplate={createWorkoutTemplate}
            createWorkoutTemplateExercise={createWorkoutTemplateExercise}
            deleteWorkoutTemplate={deleteWorkoutTemplate}
            deleteWorkoutTemplateExercise={deleteWorkoutTemplateExercise}
            reorderWorkoutTemplateExercise={reorderWorkoutTemplateExercise}
            updateWorkoutTemplate={updateWorkoutTemplate}
            updateWorkoutTemplateExercise={updateWorkoutTemplateExercise}
            workoutTemplates={workoutTemplates}
            workoutTemplatesStatus={workoutTemplatesStatus}
          />
        </CollapsedSection>

        <CollapsedSection
          open={advancedOpen}
          setOpen={setAdvancedOpen}
          title="Advanced"
        >
          <label className="block rounded-md border border-white/5 bg-black/25 p-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Switch session</span>
            <select
              value={activeWorkoutId ?? ''}
              onChange={(event) => setActiveWorkoutId(event.target.value || null)}
              disabled={!workoutSessions.length}
              className="mt-1 w-full rounded border border-white/10 bg-black px-2 py-2 text-base text-zinc-100 outline-none focus:border-cyan-400/40 disabled:text-zinc-600 md:text-xs"
            >
              <option value="">No session selected</option>
              {workoutSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.performed_on} / {session.name}
                </option>
              ))}
            </select>
          </label>
        </CollapsedSection>

        {activeSession ? (
          <CollapsedSection
            open={dangerOpen}
            setOpen={setDangerOpen}
            title="Danger"
          >
            <button
              type="button"
              onClick={() => onDeleteSession(activeSession.id)}
              disabled={deletingSessionId === activeSession.id}
              className={`flex h-10 w-full items-center justify-center gap-2 rounded-md border text-xs font-medium disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600 ${
                deleteConfirmId === activeSession.id
                  ? 'border-red-400/40 bg-red-400/20 text-red-200'
                  : 'border-red-400/20 bg-red-400/10 text-red-300'
              }`}
            >
              {deletingSessionId === activeSession.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {deleteConfirmId === activeSession.id ? 'Confirm Delete Session' : 'Delete Session'}
            </button>
          </CollapsedSection>
        ) : null}

        {workoutSessionsError ? <p className="data-text text-[11px] text-red-300">{workoutSessionsError}</p> : null}
      </div>
    </Panel>
  );
}

function CollapsedSection({ children, open, setOpen, title }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-zinc-300"
      >
        <span>{title}</span>
        <ChevronDown size={15} className={`text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="space-y-2 border-t border-white/5 p-2">{children}</div> : null}
    </div>
  );
}

function formatTemplateManagerError(error, fallback) {
  const message = String(error?.message ?? '');
  const normalized = message.toLowerCase();
  if (error?.code === '23505' || normalized.includes('duplicate key') || normalized.includes('unique constraint')) {
    if (message.includes('workout_templates_user_id_name_key')) {
      return 'A template with this name already exists.';
    }
    if (message.includes('workout_template_exercises_template_id_exercise_order_key')) {
      return 'Exercise order changed. Try moving it again.';
    }
    return 'This template item already exists.';
  }
  if (normalized.includes('row-level security')) {
    return 'You can only change your own templates.';
  }
  return message || fallback;
}

function TemplateManager({
  createWorkoutTemplate,
  createWorkoutTemplateExercise,
  deleteWorkoutTemplate,
  deleteWorkoutTemplateExercise,
  reorderWorkoutTemplateExercise,
  updateWorkoutTemplate,
  updateWorkoutTemplateExercise,
  workoutTemplates,
  workoutTemplatesStatus,
}) {
  const [templateForm, setTemplateForm] = useState({ name: '', notes: '' });
  const [templateLoading, setTemplateLoading] = useState('');
  const [templateError, setTemplateError] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateEditForm, setTemplateEditForm] = useState({ name: '', notes: '' });
  const [exerciseDrafts, setExerciseDrafts] = useState({});
  const [editingExerciseId, setEditingExerciseId] = useState(null);
  const [exerciseEditForm, setExerciseEditForm] = useState({ exercise: '', notes: '' });

  const createTemplate = async (event) => {
    event.preventDefault();
    setTemplateError('');
    if (!templateForm.name.trim()) {
      setTemplateError('Template name is required.');
      return;
    }
    setTemplateLoading('template-create');
    try {
      await createWorkoutTemplate(templateForm);
      setTemplateForm({ name: '', notes: '' });
    } catch (error) {
      setTemplateError(formatTemplateManagerError(error, 'Failed to create template.'));
    } finally {
      setTemplateLoading('');
    }
  };

  const saveTemplate = async (templateId) => {
    setTemplateError('');
    if (!templateEditForm.name.trim()) {
      setTemplateError('Template name is required.');
      return;
    }
    setTemplateLoading(`template-${templateId}`);
    try {
      await updateWorkoutTemplate(templateId, templateEditForm);
      setEditingTemplateId(null);
    } catch (error) {
      setTemplateError(formatTemplateManagerError(error, 'Failed to update template.'));
    } finally {
      setTemplateLoading('');
    }
  };

  const addExercise = async (template) => {
    const draft = exerciseDrafts[template.id] ?? { exercise: '', notes: '' };
    setTemplateError('');
    if (!draft.exercise.trim()) {
      setTemplateError('Exercise name is required.');
      return;
    }
    const nextOrder = Math.max(0, ...(template.workout_template_exercises ?? []).map((exercise) => Number(exercise.exercise_order) || 0)) + 1;
    setTemplateLoading(`exercise-create-${template.id}`);
    try {
      await createWorkoutTemplateExercise({
        template_id: template.id,
        exercise: draft.exercise,
        exercise_order: nextOrder,
        notes: draft.notes,
      });
      setExerciseDrafts((prev) => ({ ...prev, [template.id]: { exercise: '', notes: '' } }));
    } catch (error) {
      setTemplateError(formatTemplateManagerError(error, 'Failed to add exercise.'));
    } finally {
      setTemplateLoading('');
    }
  };

  const saveExercise = async (exerciseId) => {
    setTemplateError('');
    if (!exerciseEditForm.exercise.trim()) {
      setTemplateError('Exercise name is required.');
      return;
    }
    setTemplateLoading(`exercise-${exerciseId}`);
    try {
      await updateWorkoutTemplateExercise(exerciseId, exerciseEditForm);
      setEditingExerciseId(null);
    } catch (error) {
      setTemplateError(formatTemplateManagerError(error, 'Failed to update exercise.'));
    } finally {
      setTemplateLoading('');
    }
  };

  const removeTemplate = async (templateId) => {
    setTemplateError('');
    setTemplateLoading(`template-delete-${templateId}`);
    try {
      await deleteWorkoutTemplate(templateId);
    } catch (error) {
      setTemplateError(formatTemplateManagerError(error, 'Failed to delete template.'));
    } finally {
      setTemplateLoading('');
    }
  };

  const removeExercise = async (exerciseId) => {
    setTemplateError('');
    setTemplateLoading(`exercise-delete-${exerciseId}`);
    try {
      await deleteWorkoutTemplateExercise(exerciseId);
    } catch (error) {
      setTemplateError(formatTemplateManagerError(error, 'Failed to delete exercise.'));
    } finally {
      setTemplateLoading('');
    }
  };

  const moveExercise = async (templateId, exerciseId, direction) => {
    setTemplateError('');
    setTemplateLoading(`exercise-move-${exerciseId}`);
    try {
      await reorderWorkoutTemplateExercise(templateId, exerciseId, direction);
    } catch (error) {
      setTemplateError(formatTemplateManagerError(error, 'Failed to reorder exercise.'));
    } finally {
      setTemplateLoading('');
    }
  };

  return (
    <div className="space-y-2">
      <form onSubmit={createTemplate} className="grid gap-2 rounded-md border border-white/5 bg-[#121212] p-2">
        <CompactField label="Template name" value={templateForm.name} onChange={(value) => setTemplateForm((prev) => ({ ...prev, name: value }))} />
        <CompactField label="Notes" value={templateForm.notes} onChange={(value) => setTemplateForm((prev) => ({ ...prev, notes: value }))} />
        <button
          type="submit"
          disabled={templateLoading === 'template-create'}
          className="flex h-9 items-center justify-center gap-2 rounded border border-emerald-400/20 bg-emerald-400/10 text-xs font-medium text-emerald-300 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
        >
          {templateLoading === 'template-create' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Create template
        </button>
      </form>

      {workoutTemplatesStatus === 'loading' && !workoutTemplates.length ? <LoadingCard label="Loading templates" /> : null}

      <div className="grid gap-2">
        {workoutTemplates.map((template) => {
          const exercises = sortTemplateExercises(template.workout_template_exercises ?? []);
          const draft = exerciseDrafts[template.id] ?? { exercise: '', notes: '' };
          return (
            <div key={template.id} className="rounded-md border border-white/5 bg-black/25 p-2">
              {editingTemplateId === template.id ? (
                <div className="grid gap-2">
                  <CompactField label="Template name" value={templateEditForm.name} onChange={(value) => setTemplateEditForm((prev) => ({ ...prev, name: value }))} />
                  <CompactField label="Notes" value={templateEditForm.notes} onChange={(value) => setTemplateEditForm((prev) => ({ ...prev, notes: value }))} />
                  <div className="flex gap-1">
                    <IconButton icon={Check} loading={templateLoading === `template-${template.id}`} onClick={() => saveTemplate(template.id)} title="Save template" tone="emerald" size="sm" />
                    <IconButton icon={X} onClick={() => setEditingTemplateId(null)} title="Cancel" tone="zinc" size="sm" />
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">{template.name}</p>
                    <p className="data-text text-[10px] text-zinc-500">{exercises.length} exercises</p>
                  </div>
                  <div className="flex gap-1">
                    <IconButton
                      icon={Pencil}
                      onClick={() => {
                        setEditingTemplateId(template.id);
                        setTemplateEditForm({ name: template.name, notes: template.notes ?? '' });
                      }}
                      title="Edit template"
                      tone="zinc"
                      size="sm"
                    />
                    <IconButton icon={Trash2} loading={templateLoading === `template-delete-${template.id}`} onClick={() => removeTemplate(template.id)} title="Delete template" tone="red" size="sm" />
                  </div>
                </div>
              )}

              <div className="mt-2 grid gap-1">
                {exercises.map((exercise, index) => (
                  <div key={exercise.id} className="rounded border border-white/5 bg-[#121212] p-2">
                    {editingExerciseId === exercise.id ? (
                      <div className="grid gap-2">
                        <CompactField label="Exercise" value={exerciseEditForm.exercise} onChange={(value) => setExerciseEditForm((prev) => ({ ...prev, exercise: value }))} />
                        <CompactField label="Notes" value={exerciseEditForm.notes} onChange={(value) => setExerciseEditForm((prev) => ({ ...prev, notes: value }))} />
                        <div className="flex gap-1">
                          <IconButton icon={Check} loading={templateLoading === `exercise-${exercise.id}`} onClick={() => saveExercise(exercise.id)} title="Save exercise" tone="emerald" size="sm" />
                          <IconButton icon={X} onClick={() => setEditingExerciseId(null)} title="Cancel" tone="zinc" size="sm" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2">
                        <span className="data-text text-xs text-zinc-500">{index + 1}</span>
                        <span className="truncate text-xs text-zinc-200">{exercise.exercise}</span>
                        <div className="flex gap-1">
                          <IconButton disabled={index === 0} icon={ChevronDown} className={index === 0 ? '' : 'rotate-180'} loading={templateLoading === `exercise-move-${exercise.id}`} onClick={() => moveExercise(template.id, exercise.id, 'up')} title="Move up" tone="zinc" size="sm" />
                          <IconButton disabled={index === exercises.length - 1} icon={ChevronDown} loading={templateLoading === `exercise-move-${exercise.id}`} onClick={() => moveExercise(template.id, exercise.id, 'down')} title="Move down" tone="zinc" size="sm" />
                          <IconButton
                            icon={Pencil}
                            onClick={() => {
                              setEditingExerciseId(exercise.id);
                              setExerciseEditForm({ exercise: exercise.exercise, notes: exercise.notes ?? '' });
                            }}
                            title="Edit exercise"
                            tone="zinc"
                            size="sm"
                          />
                          <IconButton icon={Trash2} loading={templateLoading === `exercise-delete-${exercise.id}`} onClick={() => removeExercise(exercise.id)} title="Delete exercise" tone="red" size="sm" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-2 grid gap-2 rounded border border-white/5 bg-[#121212] p-2">
                <CompactField label="Add exercise" value={draft.exercise} onChange={(value) => setExerciseDrafts((prev) => ({ ...prev, [template.id]: { ...draft, exercise: value } }))} />
                <CompactField label="Notes" value={draft.notes} onChange={(value) => setExerciseDrafts((prev) => ({ ...prev, [template.id]: { ...draft, notes: value } }))} />
                <button
                  type="button"
                  onClick={() => addExercise(template)}
                  disabled={templateLoading === `exercise-create-${template.id}`}
                  className="flex h-9 items-center justify-center gap-2 rounded border border-cyan-400/20 bg-cyan-400/10 text-xs font-medium text-cyan-300 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
                >
                  {templateLoading === `exercise-create-${template.id}` ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Add exercise
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {templateError ? <p className="data-text text-[11px] text-red-300">{templateError}</p> : null}
    </div>
  );
}

function TemplatePlanCard({ activeExercise, onSelectExercise, plan }) {
  const [mobileOpen, setMobileOpen] = useState(true);

  if (!plan) return null;

  return (
    <Panel>
      <PanelHeader
        eyebrow="Template"
        title="Exercise Plan"
        right={<Tag tone="cyan">{plan.exercises.length} exercises</Tag>}
      />
      <button
        type="button"
        onClick={() => setMobileOpen((value) => !value)}
        className="flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-sm text-zinc-300 md:hidden"
      >
        <span>{plan.templateName}</span>
        <ChevronDown size={16} className={`text-zinc-500 transition ${mobileOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`${mobileOpen ? 'block' : 'hidden'} space-y-2 p-3 md:block`}>
        <p className="text-xs text-zinc-500">
          Tap an exercise to load it into the logger. The plan does not affect analytics until sets are saved.
        </p>
        {plan.exercises.length ? (
          <div className="grid gap-1">
            {plan.exercises.map((exercise, index) => {
              const selected = normalizeExercise(activeExercise) === normalizeExercise(exercise.exercise);
              return (
                <button
                  key={exercise.id}
                  type="button"
                  onClick={() => onSelectExercise(exercise)}
                  className={`grid min-h-10 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 rounded border px-2 py-1.5 text-left transition ${
                    selected ? 'border-cyan-400/30 bg-cyan-400/10 text-zinc-100' : 'border-white/5 bg-[#121212] text-zinc-300'
                  }`}
                >
                  <span className="data-text text-xs text-zinc-500">{index + 1}</span>
                  <span className="truncate text-sm font-medium">{exercise.exercise}</span>
                  <span className={`data-text text-[10px] ${selected ? 'text-cyan-300' : 'text-zinc-600'}`}>
                    {selected ? 'ACTIVE' : 'LOAD'}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">
            This template has no exercises yet.
          </p>
        )}
      </div>
    </Panel>
  );
}

function SetLogger({
  activeSession,
  draftPrs,
  formError,
  onSetSubmit,
  previousPerformance,
  savingSet,
  setFormValue,
  updateSetForm,
}) {
  const isEnded = Boolean(activeSession?.ended_at);

  return (
    <Panel>
      <PanelHeader eyebrow="Active Logging" title="Set Logger" />
      <div className="p-3">
        {activeSession && isEnded ? (
          <div className="rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
            This workout is ended. Reopen it to add more sets.
          </div>
        ) : activeSession ? (
          <div className="grid gap-3">
            <PreviousPerformanceCard performance={previousPerformance} prs={draftPrs} />
            <form onSubmit={onSetSubmit} className="grid gap-2">
              <div className="grid gap-2 md:grid-cols-[1fr_132px]">
                <CompactField label="Exercise" value={setFormValue.exercise} onChange={(value) => updateSetForm('exercise', value)} />
                <WarmupToggle checked={Boolean(setFormValue.is_warmup)} onChange={(value) => updateSetForm('is_warmup', value)} />
              </div>
              <div className="grid grid-cols-[72px_repeat(3,minmax(0,1fr))] gap-2">
                <CompactField label="Set" value={setFormValue.is_warmup ? 'W' : setFormValue.set_number} onChange={() => {}} readOnly />
                <CompactField label="Weight" inputMode="decimal" value={setFormValue.weight} suffix="kg" onChange={(value) => updateSetForm('weight', value)} />
                <CompactField label="Reps" inputMode="numeric" value={setFormValue.reps} onChange={(value) => updateSetForm('reps', value)} />
                <CompactField label="RPE" inputMode="decimal" value={setFormValue.rpe} onChange={(value) => updateSetForm('rpe', value)} />
              </div>
              <div className="grid gap-2 md:grid-cols-[180px_1fr]">
                <CompactField label="Date" type="date" value={setFormValue.date} onChange={(value) => updateSetForm('date', value)} />
                <CompactField label="Notes" value={setFormValue.notes} onChange={(value) => updateSetForm('notes', value)} />
              </div>
              <button
                type="submit"
                disabled={savingSet || !activeSession}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 text-base font-semibold text-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
              >
                {savingSet ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {savingSet ? 'Saving Set' : setFormValue.is_warmup ? 'Save Warmup' : 'Save Set'}
              </button>
              {formError ? <p className="data-text text-[11px] text-red-300">{formError}</p> : null}
            </form>
          </div>
        ) : (
          <div className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">
            Select or start a workout session.
          </div>
        )}
      </div>
    </Panel>
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
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MiniMetric label="Heaviest" value={`${performance.heaviestSet.weight}kg`} tone="text-cyan-300" sub={`${performance.heaviestSet.reps} reps @ ${performance.heaviestSet.rpe}`} />
        <MiniMetric label="Best Volume" value={performance.bestVolumeSet.volume.toLocaleString()} tone="text-emerald-300" sub={`${performance.bestVolumeSet.weight}kg x ${performance.bestVolumeSet.reps}`} />
        <MiniMetric label="Est 1RM" value={`${formatNumber(performance.bestEstimated1Rm.estimated1Rm)}kg`} tone="text-violet-300" sub="Epley best" />
        <MiniMetric label="Exercise Vol" value={performance.totalVolume.toLocaleString()} tone="text-amber-300" sub="prior session" />
      </div>
    </div>
  );
}

function TodaySetsLog({
  activeSession,
  beginEdit,
  collapsedSessions,
  deletingSetId,
  editForm,
  editingSetId,
  onDeleteSet,
  onSaveEdit,
  savingEditId,
  setActiveWorkoutId,
  setCollapsedSessions,
  setEditForm,
  setEditingSetId,
  workoutSessions,
  workoutSessionsStatus,
}) {
  const activeSets = activeSession?.workout_sets ?? [];
  const groupedActiveSets = groupSetsByExercise(activeSets);
  const otherSessions = workoutSessions.filter((session) => session.id !== activeSession?.id);
  const sessionsInitialLoading = workoutSessionsStatus === 'loading' && workoutSessions.length === 0;

  return (
    <Panel>
      <PanelHeader eyebrow="Today" title="Logged Sets" right={<History size={16} className="text-cyan-300" />} />
      <div className="space-y-3 p-3">
        {sessionsInitialLoading ? (
          <LoadingCard label="Loading workout sessions" />
        ) : activeSession ? (
          Object.keys(groupedActiveSets).length ? (
            Object.entries(groupedActiveSets).map(([exercise, sets]) => (
              <ExerciseSetGroup
                key={exercise}
                beginEdit={beginEdit}
                deletingSetId={deletingSetId}
                editForm={editForm}
                editingSetId={editingSetId}
                exercise={exercise}
                onDeleteSet={onDeleteSet}
                onSaveEdit={onSaveEdit}
                savingEditId={savingEditId}
                session={activeSession}
                setEditForm={setEditForm}
                setEditingSetId={setEditingSetId}
                sets={sets}
                workoutSessions={workoutSessions}
              />
            ))
          ) : (
            <p className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">No sets logged in this session.</p>
          )
        ) : (
          <p className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">No active session selected.</p>
        )}

        {otherSessions.length ? (
          <div className="border-t border-white/5 pt-3">
            <p className="mb-2 data-text text-[10px] uppercase tracking-wider text-zinc-500">Other Sessions</p>
            <div className="space-y-2">
              {otherSessions.map((session) => {
                const collapsed = collapsedSessions[session.id] ?? true;
                const volume = getSessionVolume(session);
                const counts = getSessionSetCounts(session);
                return (
                  <div key={session.id} className="rounded-md border border-white/5 bg-black/25">
                    <div className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-200">{session.name}</p>
                        <p className="data-text text-[10px] text-zinc-500">
                          {session.performed_on} / {counts.working} working / {counts.warmup} warmup / {Math.round(volume).toLocaleString()} volume
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveWorkoutId(session.id)}
                          className="rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 data-text text-[10px] text-cyan-300"
                        >
                          SELECT
                        </button>
                        <button
                          type="button"
                          onClick={() => setCollapsedSessions((prev) => ({ ...prev, [session.id]: !collapsed }))}
                          className="grid h-7 w-7 place-items-center rounded border border-white/10 bg-white/[0.03] text-zinc-500"
                          title={collapsed ? 'Expand session' : 'Collapse session'}
                        >
                          <ChevronDown size={15} className={`transition ${collapsed ? '' : 'rotate-180'}`} />
                        </button>
                      </div>
                    </div>
                    {!collapsed ? (
                      <SessionSetArchive session={session} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function ExerciseSetGroup({
  beginEdit,
  deletingSetId,
  editForm,
  editingSetId,
  exercise,
  onDeleteSet,
  onSaveEdit,
  savingEditId,
  session,
  setEditForm,
  setEditingSetId,
  sets,
  workoutSessions,
}) {
  const workingSets = sets.filter((set) => !isWarmupSet(set));
  const warmupSets = sets.filter(isWarmupSet);
  const volume = workingSets.reduce((total, set) => total + parseDecimal(set.weight) * parseInteger(set.reps), 0);
  const isEnded = Boolean(session?.ended_at);

  return (
    <div className="rounded-md border border-white/5 bg-black/25">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-zinc-100">{exercise}</p>
          <p className="data-text text-[10px] text-zinc-500">
            {workingSets.length} working / {warmupSets.length} warmup / {Math.round(volume).toLocaleString()} volume
          </p>
        </div>
      </div>
      <div className="grid gap-1 p-2">
        {sets.map((set) => {
          const priorAnalytics = getExerciseAnalyticsBeforeSession(workoutSessions, session, set.exercise);
          const sessionExercise = getSessionExerciseSummary(session, set.exercise);
          const isLastSet = sessionExercise.lastSet?.id === set.id;
          const prs = detectPrs(set, priorAnalytics, sessionExercise.totalVolume, isLastSet);

          if (editingSetId === set.id) {
            return (
              <EditSetRow
                key={set.id}
                session={session}
                editForm={editForm}
                loading={savingEditId === set.id}
                onCancel={() => {
                  setEditingSetId(null);
                  setEditForm(null);
                }}
                onSave={() => onSaveEdit(set.id)}
                setEditForm={setEditForm}
              />
            );
          }

          return (
            <div
              key={set.id}
              className={`grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2 rounded border px-2 py-2 sm:grid-cols-[58px_minmax(0,1fr)_auto_72px] ${
                isWarmupSet(set) ? 'border-amber-400/10 bg-amber-400/[0.04]' : 'border-white/5 bg-[#121212]'
              }`}
            >
              <span className={`data-text text-sm font-bold ${isWarmupSet(set) ? 'text-amber-300' : 'text-cyan-300'}`}>
                {formatSetLabel(set)}
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <p className="truncate text-xs font-medium text-zinc-100">{formatNumber(set.weight)}kg x {set.reps}</p>
                  {isWarmupSet(set) ? <Tag tone="amber">WARMUP</Tag> : null}
                  <PrTags prs={prs} />
                </div>
                <p className="data-text text-[10px] text-zinc-500">
                  RPE {formatNumber(set.rpe)} / {formatDate(set.performed_at)}
                </p>
              </div>
              <span className="hidden data-text text-xs text-zinc-400 sm:block">
                {isWarmupSet(set) ? 'warmup' : `${Math.round(parseDecimal(set.weight) * parseInteger(set.reps))} vol`}
              </span>
              <div className="flex gap-1">
                <IconButton disabled={isEnded} icon={Pencil} onClick={() => beginEdit(set)} title={isEnded ? 'Reopen workout to edit' : 'Edit set'} tone="zinc" size="sm" />
                <IconButton icon={Trash2} loading={deletingSetId === set.id} onClick={() => onDeleteSet(set.id)} title="Delete set" tone="red" size="sm" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionSetArchive({ session }) {
  const groupedSets = groupSetsByExercise(session.workout_sets ?? []);

  return (
    <div className="grid gap-2 border-t border-white/5 p-2">
      {Object.entries(groupedSets).map(([exercise, sets]) => {
        const working = sets.filter((set) => !isWarmupSet(set)).length;
        const warmups = sets.filter(isWarmupSet).length;
        return (
          <div key={exercise} className="rounded border border-white/5 bg-black/20 p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium text-zinc-200">{exercise}</p>
              <span className="data-text shrink-0 text-[10px] text-zinc-500">{working} work / {warmups} W</span>
            </div>
            <div className="grid gap-1">
              {sets.map((set) => (
                <div
                  key={set.id}
                  className={`grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2 rounded border px-2 py-1.5 sm:grid-cols-[58px_minmax(0,1fr)_auto] ${
                    isWarmupSet(set) ? 'border-amber-400/10 bg-amber-400/[0.04]' : 'border-white/5 bg-[#121212]'
                  }`}
                >
                  <span className={`data-text text-xs font-bold ${isWarmupSet(set) ? 'text-amber-300' : 'text-cyan-300'}`}>
                    {formatSetLabel(set)}
                  </span>
                  <span className="truncate text-xs text-zinc-200">{formatNumber(set.weight)}kg x {set.reps}</span>
                  <span className="data-text text-xs text-zinc-400">RPE {formatNumber(set.rpe)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExerciseHistoryPanel({ exerciseAnalytics }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Panel className="col-span-12">
      <PanelHeader eyebrow="Exercise History" title="Progression" right={<Medal size={16} className="text-amber-300" />} />
      <button
        type="button"
        onClick={() => setMobileOpen((value) => !value)}
        className="flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-sm text-zinc-300 md:hidden"
      >
        <span>Show exercise history</span>
        <ChevronDown size={16} className={`text-zinc-500 transition ${mobileOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`${mobileOpen ? 'grid' : 'hidden'} gap-2 p-3 md:grid xl:grid-cols-2`}>
        {exerciseAnalytics.exercises.length ? (
          exerciseAnalytics.exercises.map((exercise) => <ExerciseHistoryCard key={exercise.key} exercise={exercise} />)
        ) : (
          <div className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">
            Log persisted sets to build exercise progression.
          </div>
        )}
      </div>
    </Panel>
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
    <span className="flex flex-wrap gap-1">
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
        <TrendBars color="emerald" max={exercise.peakSessionVolume} sessions={exercise.sessions} title="Session Volume" valueKey="totalVolume" />
        <TrendBars color="cyan" max={exercise.peakEstimated1Rm} sessions={exercise.sessions} title="Best Est 1RM" valueKey="bestEstimated1Rm" />
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
              <div className={`w-full rounded-sm border ${barColor}`} style={{ height }} title={`${session.date}: ${formatNumber(value)}`} />
              <span className="data-text text-[8px] text-zinc-600">{session.date.slice(5)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditSetRow({ editForm, loading, onCancel, onSave, session, setEditForm }) {
  const update = (field, value) => setEditForm((prev) => ({ ...prev, [field]: value }));
  const updateWarmup = (value) =>
    setEditForm((prev) => ({
      ...prev,
      is_warmup: value,
      set_number: value
        ? getNextWarmupSetNumber(session, prev.exercise, prev.id)
        : getNextSetNumber(session, prev.exercise, prev.id),
    }));
  return (
    <div className="grid grid-cols-2 gap-2 rounded border border-cyan-400/20 bg-cyan-400/[0.04] p-2 xl:grid-cols-[1.2fr_0.6fr_0.4fr_0.55fr_0.45fr_0.45fr_0.7fr_1fr_72px]">
      <CompactField label="Exercise" value={editForm.exercise} onChange={(value) => update('exercise', value)} />
      <WarmupToggle checked={Boolean(editForm.is_warmup)} onChange={updateWarmup} compact />
      <CompactField
        label="Set"
        type={editForm.is_warmup ? 'text' : 'number'}
        inputMode={editForm.is_warmup ? undefined : 'numeric'}
        value={editForm.is_warmup ? 'W' : editForm.set_number}
        onChange={(value) => update('set_number', value)}
        readOnly={Boolean(editForm.is_warmup)}
      />
      <CompactField label="Weight" inputMode="decimal" value={editForm.weight} suffix="kg" onChange={(value) => update('weight', value)} />
      <CompactField label="Reps" inputMode="numeric" value={editForm.reps} onChange={(value) => update('reps', value)} />
      <CompactField label="RPE" inputMode="decimal" value={editForm.rpe} onChange={(value) => update('rpe', value)} />
      <CompactField label="Date" type="date" value={editForm.date} onChange={(value) => update('date', value)} />
      <CompactField label="Notes" value={editForm.notes} onChange={(value) => update('notes', value)} />
      <div className="flex items-end gap-1">
        <IconButton icon={Check} loading={loading} onClick={onSave} title="Save edit" tone="emerald" size="sm" />
        <IconButton icon={X} onClick={onCancel} title="Cancel edit" tone="zinc" size="sm" />
      </div>
    </div>
  );
}

function WarmupToggle({ checked, compact = false, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left transition ${
        checked
          ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
          : 'border-white/5 bg-[#121212] text-zinc-400'
      }`}
    >
      <span>
        <span className="block text-[10px] uppercase tracking-wider text-zinc-500">Warmup</span>
        <span className={`data-text text-sm font-bold ${checked ? 'text-amber-300' : 'text-zinc-500'}`}>
          {checked ? 'WARMUP' : compact ? 'WORK' : 'WORKING'}
        </span>
      </span>
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded border data-text text-xs ${
        checked ? 'border-amber-400/30 bg-amber-400/20 text-amber-200' : 'border-white/10 bg-black/30 text-zinc-600'
      }`}>
        W
      </span>
    </button>
  );
}

function CompactField({ inputMode, label, value, onChange, type = 'text', suffix, readOnly = false }) {
  return (
    <label className="rounded-md border border-white/5 bg-[#121212] px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          className={`data-text min-w-0 flex-1 bg-transparent text-base font-semibold text-zinc-100 outline-none ${readOnly ? 'text-cyan-300' : ''}`}
        />
        {suffix ? <span className="data-text text-xs text-zinc-500">{suffix}</span> : null}
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

function SourceStatus({ status }) {
  const label = status === 'loading' ? 'SYNCING' : status === 'error' ? 'ERROR' : 'LIVE';
  const tone = status === 'error'
    ? 'border-red-400/20 bg-red-400/10 text-red-300'
    : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';

  return (
    <span className={`data-text inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${tone}`}>
      <Database size={12} />
      {label}
    </span>
  );
}

function sortSetsForExerciseOrder(sets = []) {
  return sets.slice().sort((a, b) => {
    const aTime = new Date(a.performed_at ?? a.created_at ?? 0).getTime();
    const bTime = new Date(b.performed_at ?? b.created_at ?? 0).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return compareSetsForDisplay(a, b);
  });
}

function sortSetsForDisplay(sets = []) {
  return sets.slice().sort(compareSetsForDisplay);
}

function compareSetsForDisplay(a, b) {
  if (isWarmupSet(a) !== isWarmupSet(b)) return isWarmupSet(a) ? -1 : 1;
  const aNumber = parseInteger(a.set_number);
  const bNumber = parseInteger(b.set_number);
  if (aNumber !== bNumber) return aNumber - bNumber;
  const aTime = new Date(a.performed_at ?? a.created_at ?? 0).getTime();
  const bTime = new Date(b.performed_at ?? b.created_at ?? 0).getTime();
  if (aTime !== bTime) return aTime - bTime;
  return String(a.id).localeCompare(String(b.id));
}

function groupSetsByExercise(sets) {
  return sortSetsForExerciseOrder(sets).reduce((groups, set) => {
    const key = set.exercise || 'Unknown Exercise';
    groups[key] = groups[key] ?? [];
    groups[key].push(set);
    groups[key].sort(compareSetsForDisplay);
    return groups;
  }, {});
}

function sortTemplateExercises(exercises = []) {
  return exercises.slice().sort((a, b) => {
    if (Number(a.exercise_order) !== Number(b.exercise_order)) return Number(a.exercise_order) - Number(b.exercise_order);
    return String(a.id).localeCompare(String(b.id));
  });
}

function getUniqueSessionName(sourceName, todaysSessions) {
  const baseName = sourceName?.trim() || 'Today Workout';
  const existingNames = new Set(todaysSessions.map((session) => session.name));
  if (!existingNames.has(baseName)) return baseName;

  let suffix = 2;
  while (existingNames.has(`${baseName} #${suffix}`)) {
    suffix += 1;
  }
  return `${baseName} #${suffix}`;
}

function resolveEditSetNumber(form, session, setId) {
  if (Boolean(form.is_warmup)) {
    const parsed = parseInteger(form.set_number);
    return Number.isFinite(parsed)
      && parsed > WARMUP_SET_NUMBER_OFFSET
      && !hasSetNumberConflict(session, form.exercise, parsed, true, setId)
      ? parsed
      : getNextWarmupSetNumber(session, form.exercise, setId);
  }

  const parsed = parseInteger(form.set_number);
  return Number.isFinite(parsed)
    && parsed > 0
    && parsed < WARMUP_SET_NUMBER_OFFSET
    && !hasSetNumberConflict(session, form.exercise, parsed, false, setId)
    ? parsed
    : getNextSetNumber(session, form.exercise, setId);
}

function getNextSetNumber(session, exercise, excludeSetId = null) {
  if (!session || !exercise.trim()) return 1;
  const normalizedExercise = normalizeExercise(exercise);
  const matchingSets = (session.workout_sets ?? []).filter(
    (set) => set.id !== excludeSetId && !isWarmupSet(set) && normalizeExercise(set.exercise) === normalizedExercise,
  );
  return matchingSets.length ? Math.max(...matchingSets.map((set) => parseInteger(set.set_number))) + 1 : 1;
}

function getNextWarmupSetNumber(session, exercise, excludeSetId = null) {
  if (!session || !exercise.trim()) return WARMUP_SET_NUMBER_OFFSET + 1;
  const normalizedExercise = normalizeExercise(exercise);
  const warmupSets = (session.workout_sets ?? []).filter(
    (set) => set.id !== excludeSetId && isWarmupSet(set) && normalizeExercise(set.exercise) === normalizedExercise,
  );
  const maxWarmupNumber = warmupSets.length
    ? Math.max(...warmupSets.map((set) => parseInteger(set.set_number)).filter(Number.isFinite))
    : WARMUP_SET_NUMBER_OFFSET;
  return Math.max(WARMUP_SET_NUMBER_OFFSET, maxWarmupNumber) + 1;
}

function hasSetNumberConflict(session, exercise, setNumber, isWarmup, excludeSetId = null) {
  const normalizedExercise = normalizeExercise(exercise);
  return (session?.workout_sets ?? []).some(
    (set) =>
      set.id !== excludeSetId
      && isWarmupSet(set) === Boolean(isWarmup)
      && normalizeExercise(set.exercise) === normalizedExercise
      && parseInteger(set.set_number) === parseInteger(setNumber),
  );
}

function getSessionExerciseSummary(session, exercise) {
  const key = normalizeExercise(exercise);
  const sets = (session?.workout_sets ?? [])
    .filter((set) => !isWarmupSet(set) && normalizeExercise(set.exercise) === key)
    .map(normalizeSet)
    .sort((a, b) => parseInteger(a.set_number) - parseInteger(b.set_number));
  return {
    sets,
    totalVolume: sets.reduce((total, set) => total + set.volume, 0),
    lastSet: sets[sets.length - 1] ?? null,
  };
}

function getSessionExerciseVolume(session, exercise) {
  return getSessionExerciseSummary(session, exercise).totalVolume;
}

function getSessionVolume(session) {
  return (session?.workout_sets ?? [])
    .filter((set) => !isWarmupSet(set))
    .reduce((total, set) => total + parseDecimal(set.weight) * parseInteger(set.reps), 0);
}

function getSessionSetCounts(session) {
  const sets = session?.workout_sets ?? [];
  return {
    working: sets.filter((set) => !isWarmupSet(set)).length,
    warmup: sets.filter(isWarmupSet).length,
  };
}

function buildExerciseAnalytics(sessions) {
  const map = {};

  sessions
    .slice()
    .sort(compareSessionsAscending)
    .forEach((session) => {
      const groupedSets = {};
      (session.workout_sets ?? []).filter((set) => !isWarmupSet(set)).forEach((set) => {
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
    .find((session) => (session.workout_sets ?? []).some((set) => !isWarmupSet(set) && normalizeExercise(set.exercise) === key));

  if (!previousSession) return null;

  const sets = previousSession.workout_sets
    .filter((set) => !isWarmupSet(set) && normalizeExercise(set.exercise) === key)
    .map(normalizeSet)
    .sort((a, b) => parseInteger(a.set_number) - parseInteger(b.set_number));
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
      workout_sets: (session.workout_sets ?? []).filter((set) => !isWarmupSet(set) && normalizeExercise(set.exercise) === key),
    }));
  return buildExerciseAnalytics(priorSessions).byExercise[key] ?? null;
}

function detectPrs(set, analytics, sessionExerciseVolume = 0, includeSessionVolume = false) {
  const weight = parseDecimal(set.weight);
  const reps = parseInteger(set.reps);
  if (isWarmupSet(set) || !analytics || !set.exercise || !Number.isFinite(weight) || !Number.isFinite(reps)) {
    return { setVolume: false, sessionVolume: false, weight: false, reps: false };
  }

  const volume = weight * reps;
  return {
    setVolume: volume > analytics.maxSetVolume,
    sessionVolume: includeSessionVolume && Number(sessionExerciseVolume) > analytics.maxSessionVolume,
    weight: weight > analytics.maxWeight,
    reps: reps > analytics.maxReps,
  };
}

function normalizeSet(set) {
  const weight = parseDecimal(set.weight);
  const reps = parseInteger(set.reps);
  const estimated1Rm = weight * (1 + reps / 30);
  return {
    ...set,
    is_warmup: isWarmupSet(set),
    weight,
    reps,
    rpe: parseDecimal(set.rpe),
    volume: weight * reps,
    estimated1Rm,
  };
}

function normalizeExercise(exercise) {
  return String(exercise ?? '').trim().toLowerCase();
}

function parseDecimal(value) {
  if (typeof value === 'number') return value;
  return Number(String(value ?? '').trim().replace(',', '.'));
}

function parseInteger(value) {
  return Number(String(value ?? '').trim());
}

function isWarmupSet(set) {
  return Boolean(set?.is_warmup);
}

function formatSetLabel(set) {
  return isWarmupSet(set) ? 'W' : `Set ${parseInteger(set.set_number)}`;
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

function formatTime(value) {
  if (!value) return '--:--';
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatElapsed(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
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
  const weight = parseDecimal(form.weight);
  const reps = parseInteger(form.reps);
  const rpe = parseDecimal(form.rpe);
  const setNumber = parseInteger(form.set_number);

  if (!activeWorkoutSession) return 'Select or start a workout session first.';
  if (!form.exercise.trim()) return 'Exercise is required.';
  if (typeof form.is_warmup !== 'boolean') return 'Warmup must be true or false.';
  if (!Number.isFinite(setNumber) || setNumber <= 0) return 'Set number must be greater than 0.';
  if (!form.is_warmup && setNumber >= WARMUP_SET_NUMBER_OFFSET) return 'Working set number is invalid.';
  if (!Number.isFinite(weight) || weight < 0) return 'Weight must be 0 or greater.';
  if (!Number.isInteger(reps) || reps <= 0) return 'Reps must be a positive whole number.';
  if (!Number.isFinite(rpe) || rpe < 0 || rpe > 10) return 'RPE must be between 0 and 10.';
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
