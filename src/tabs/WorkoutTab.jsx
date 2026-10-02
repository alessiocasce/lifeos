import {
  ArrowLeft,
  Check,
  ChevronDown,
  ClipboardList,
  Database,
  Dumbbell,
  History,
  Loader2,
  Pencil,
  Plus,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState, useRef } from 'react';
import { useLocalDay } from '../hooks/useLocalDay';
import { useWorkoutDraft } from '../hooks/useWorkoutDraft';
import { emptySetDraft, writeWorkoutDraft } from '../utils/workoutContinuity';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';

const WARMUP_SET_NUMBER_OFFSET = 1000;

export function WorkoutTab() {
  const today = useLocalDay();
  const priorDay = useRef(today);
  const {
    authUser,
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
    setUnsavedWork,
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
  useEffect(() => {
    const previous = priorDay.current;
    priorDay.current = today;
    if (!showCustomSession) setSessionForm((form) => form.performed_on === previous ? { ...form, performed_on: today } : form);
  }, [today, showCustomSession]);
  const [setForm, setSetForm, draftStorageUnavailable] = useWorkoutDraft(authUser?.id, activeWorkoutSession);
  const savingSetRef = useRef(false);
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
  const [formError, setFormError] = useState('');
  const [startingTemplateId, setStartingTemplateId] = useState(null);
  const [lastSavedSet, setLastSavedSet] = useState(null);
  const [trainingView, setTrainingView] = useState('live');
  const [historySessionId, setHistorySessionId] = useState(null);

  const todaysSessions = useMemo(() => workoutSessions.filter((session) => session.performed_on === today), [workoutSessions, today]);
  const previousPerformance = useMemo(
    () => getPreviousPerformance(workoutSessions, activeWorkoutSession, setForm.exercise),
    [activeWorkoutSession, setForm.exercise, workoutSessions],
  );
  const nextSetNumber = useMemo(
    () => getNextSetNumber(activeWorkoutSession, setForm.exercise),
    [activeWorkoutSession, setForm.exercise],
  );
  const visibleTemplatePlan = useMemo(
    () => buildPersistedTemplatePlan(activeWorkoutSession),
    [activeWorkoutSession],
  );
  const exerciseSuggestions = useMemo(
    () => buildExerciseSuggestions(activeWorkoutSession, workoutTemplates, workoutSessions),
    [activeWorkoutSession, workoutSessions, workoutTemplates],
  );

  useEffect(() => {
    setSetForm((prev) => ({
      ...prev,
      set_number: prev.is_warmup ? getNextWarmupSetNumber(activeWorkoutSession, prev.exercise) : nextSetNumber,
    }));
  }, [activeWorkoutSession, nextSetNumber, setForm.is_warmup, setSetForm]);

  useEffect(() => {
    if (!activeWorkoutSession || activeWorkoutSession.ended_at) {
      setEditingSetId(null);
      setEditForm(null);
    }
  }, [activeWorkoutSession]);

  useEffect(() => {
    setUnsavedWork(
      'workout-set',
      isMeaningfulSetDraft(setForm, activeWorkoutSession),
      'save current workout set first',
    );
    return () => setUnsavedWork('workout-set', false);
  }, [activeWorkoutSession, setForm, setUnsavedWork]);

  const startWorkout = async (event) => {
    event.preventDefault();
    if (savingSession || startingTemplateId) return;
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
        template_id: null,
        template_snapshot: [],
        notes: sessionForm.notes.trim(),
      });
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
        template_id: null,
        template_snapshot: [],
        notes: sessionForm.notes.trim(),
      });
    } catch (error) {
      setFormError(error.message || 'Failed to start today workout.');
    } finally {
      setSelectingToday(false);
    }
  };

  const fillLoggerFromTemplateExercise = (exercise, session = activeWorkoutSession) => {
    if (!exercise) return;
    if (session?.id !== activeWorkoutSession?.id) {
      writeWorkoutDraft(authUser?.id, session?.id, { ...emptySetDraft(), exercise: exercise.exercise });
      return;
    }
    setSetForm((prev) => ({
      ...prev,
      exercise: exercise.exercise,
      set_number: prev.is_warmup
        ? getNextWarmupSetNumber(session, exercise.exercise)
        : getNextSetNumber(session, exercise.exercise),
    }));
  };

  const startFromTemplate = async (templateId) => {
    if (startingTemplateId || savingSession) return;
    const template = workoutTemplates.find((item) => item.id === templateId);
    if (!template) return;

    setFormError('');
    setStartingTemplateId(templateId);
    try {
      const exercises = sortTemplateExercises(template.workout_template_exercises ?? []);
      const templateSnapshot = exercises.map((exercise, index) => ({
        exercise: exercise.exercise,
        exercise_order: Number(exercise.exercise_order) || index + 1,
        notes: exercise.notes ?? '',
      }));
      const created = await createWorkoutSession({
        name: getUniqueSessionName(template.name, todaysSessions),
        performed_on: today,
        started_at: new Date().toISOString(),
        template_id: template.id,
        template_snapshot: templateSnapshot,
        notes: '',
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
    if (savingSetRef.current) return;
    setFormError('');

    if (activeWorkoutSession?.ended_at) {
      setFormError('This workout is ended. Reopen it to add more sets.');
      return;
    }

    const resolvedSetNumber = setForm.is_warmup
      ? getNextWarmupSetNumber(activeWorkoutSession, setForm.exercise)
      : getNextSetNumber(activeWorkoutSession, setForm.exercise);
    const resolvedForm = { ...setForm, set_number: resolvedSetNumber };
    const validationError = validateSetForm(resolvedForm, activeWorkoutSession);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const weight = parseDecimal(setForm.weight);
    const reps = parseInteger(setForm.reps);
    const rpe = parseOptionalDecimal(setForm.rpe);
    savingSetRef.current = true;
    setSavingSet(true);
    try {
      const createdSet = await createWorkoutSet({
        workout_id: activeWorkoutSession.id,
        exercise: setForm.exercise.trim(),
        set_number: resolvedSetNumber >= WARMUP_SET_NUMBER_OFFSET && !setForm.is_warmup
          ? getNextSetNumber(activeWorkoutSession, setForm.exercise)
          : resolvedSetNumber,
        is_warmup: Boolean(setForm.is_warmup),
        weight,
        reps,
        rpe,
        performed_at: new Date().toISOString(),
        notes: setForm.notes.trim(),
      });
      const projectedSession = {
        ...activeWorkoutSession,
        workout_sets: [...(activeWorkoutSession.workout_sets ?? []), createdSet],
      };
      const nextDraft = {
        ...setForm,
        set_number: setForm.is_warmup
          ? getNextWarmupSetNumber(projectedSession, setForm.exercise)
          : getNextSetNumber(projectedSession, setForm.exercise),
        reps: '',
        notes: '',
      };
      writeWorkoutDraft(authUser?.id, activeWorkoutSession.id, nextDraft);
      setSetForm(nextDraft);
      setLastSavedSet(createdSet);
    } catch (error) {
      setFormError(error.message || 'Failed to save set.');
    } finally {
      savingSetRef.current = false;
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
      rpe: set.rpe === null || set.rpe === undefined ? '' : String(set.rpe),
      is_warmup: Boolean(set.is_warmup),
      notes: set.notes ?? '',
    });
  };

  const saveEdit = async (setId) => {
    setFormError('');

    if (activeWorkoutSession?.ended_at) {
      setFormError('This workout is ended. Reopen it to edit sets.');
      return;
    }

    const resolvedSetNumber = resolveEditSetNumber(editForm, activeWorkoutSession, setId);
    const resolvedEditForm = { ...editForm, set_number: resolvedSetNumber };
    const validationError = validateSetForm(resolvedEditForm, activeWorkoutSession);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSavingEditId(setId);
    try {
      await updateWorkoutSet(setId, {
        exercise: editForm.exercise.trim(),
        set_number: resolvedSetNumber,
        is_warmup: Boolean(editForm.is_warmup),
        weight: parseDecimal(editForm.weight),
        reps: parseInteger(editForm.reps),
        rpe: parseOptionalDecimal(editForm.rpe),
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
    <div className="grid min-w-0 grid-cols-12 gap-3 overflow-x-clip pb-4">
      <div role="group" aria-label="Training view" className="col-span-12 flex gap-1 border-b border-white/10 pb-3">
        {['live', 'history'].map((view) => (
          <button key={view} type="button" aria-pressed={trainingView === view} onClick={() => setTrainingView(view)} className={`min-h-11 px-5 text-sm font-medium ${trainingView === view ? 'border-b-2 border-zinc-200 text-zinc-100' : 'text-zinc-400'}`}>
            {view === 'live' ? 'Live' : 'History'}
          </button>
        ))}
      </div>
      {draftStorageUnavailable ? <p role="status" className="col-span-12 text-sm text-amber-300">Device storage is unavailable. Keep this screen open until your set is saved.</p> : null}
      {trainingView === 'history' ? (
        <WorkoutHistory
          sessions={workoutSessions}
          activeSession={activeWorkoutSession}
          selectedId={historySessionId}
          onSelect={setHistorySessionId}
          onResume={() => setTrainingView('live')}
          onEdit={(id) => { setActiveWorkoutId(id); setTrainingView('live'); }}
          status={workoutSessionsStatus}
          error={workoutSessionsError}
        />
      ) : activeWorkoutSession ? (
        <>
          <ActiveWorkoutHeader
            activeSession={activeWorkoutSession}
            ending={endingSessionId === activeWorkoutSession.id || savingSet}
            onEnd={() => endSession(activeWorkoutSession.id)}
            onReopen={() => reopenSession(activeWorkoutSession.id)}
            reopening={reopeningSessionId === activeWorkoutSession.id}
          />

          <div className="col-span-12 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="grid min-w-0 gap-6">
              <SetLogger
                key={activeWorkoutSession.id}
                activeSession={activeWorkoutSession}
                exerciseSuggestions={exerciseSuggestions}
                formError={formError}
                onSetSubmit={submitSet}
                previousPerformance={previousPerformance}
                savingSet={savingSet}
                lastSavedSet={lastSavedSet?.workout_id === activeWorkoutSession.id ? lastSavedSet : null}
                setFormValue={setForm}
                updateSetForm={(field, value) => setSetForm((prev) => {
                  if (field === 'exercise') {
                    return {
                      ...prev,
                      exercise: value,
                      set_number: prev.is_warmup
                        ? getNextWarmupSetNumber(activeWorkoutSession, value)
                        : getNextSetNumber(activeWorkoutSession, value),
                    };
                  }
                  if (field === 'is_warmup') {
                    return {
                      ...prev,
                      is_warmup: value,
                      set_number: value
                        ? getNextWarmupSetNumber(activeWorkoutSession, prev.exercise)
                        : getNextSetNumber(activeWorkoutSession, prev.exercise),
                    };
                  }
                  return { ...prev, [field]: value };
                })}
              />

              <TemplatePlanCard
                activeExercise={setForm.exercise}
                onSelectExercise={(exercise) => fillLoggerFromTemplateExercise(exercise)}
                plan={visibleTemplatePlan}
              />

              <TodaySetsLog
                activeSession={activeWorkoutSession}
                beginEdit={beginEdit}
                deletingSetId={deletingSetId}
                editForm={editForm}
                editingSetId={editingSetId}
                onDeleteSet={removeSet}
                onSaveEdit={saveEdit}
                savingEditId={savingEditId}
                setEditForm={setEditForm}
                setEditingSetId={setEditingSetId}
                workoutSessionsStatus={workoutSessionsStatus}
              />
            </div>

            <WorkoutSessionControl
              formError={activeWorkoutSession.ended_at ? formError : ''}
              activeSession={activeWorkoutSession}
              activeWorkoutId={activeWorkoutId}
              createWorkoutTemplate={createWorkoutTemplate}
              createWorkoutTemplateExercise={createWorkoutTemplateExercise}
              deleteConfirmId={deleteConfirmId}
              deleteWorkoutTemplate={deleteWorkoutTemplate}
              deleteWorkoutTemplateExercise={deleteWorkoutTemplateExercise}
              deletingSessionId={deletingSessionId}
              onDeleteSession={removeSession}
              onSelectToday={selectOrStartToday}
              onStartFromTemplate={startFromTemplate}
              onStartWorkout={startWorkout}
              reorderWorkoutTemplateExercise={reorderWorkoutTemplateExercise}
              savingSession={savingSession}
              selectingToday={selectingToday}
              sessionForm={sessionForm}
              setActiveWorkoutId={setActiveWorkoutId}
              setSessionForm={setSessionForm}
              setShowCustomSession={setShowCustomSession}
              showCustomSession={showCustomSession}
              startingTemplateId={startingTemplateId}
              today={today}
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
        </>
      ) : (
        <>
          <div className="col-span-12 grid gap-3 xl:grid-cols-[minmax(0,760px)_1fr]">
            <WorkoutSessionControl
              formError={formError}
              activeSession={activeWorkoutSession}
              activeWorkoutId={activeWorkoutId}
              createWorkoutTemplate={createWorkoutTemplate}
              createWorkoutTemplateExercise={createWorkoutTemplateExercise}
              deleteConfirmId={deleteConfirmId}
              deleteWorkoutTemplate={deleteWorkoutTemplate}
              deleteWorkoutTemplateExercise={deleteWorkoutTemplateExercise}
              deletingSessionId={deletingSessionId}
              onDeleteSession={removeSession}
              onSelectToday={selectOrStartToday}
              onStartFromTemplate={startFromTemplate}
              onStartWorkout={startWorkout}
              reorderWorkoutTemplateExercise={reorderWorkoutTemplateExercise}
              savingSession={savingSession}
              selectingToday={selectingToday}
              sessionForm={sessionForm}
              setActiveWorkoutId={setActiveWorkoutId}
              setSessionForm={setSessionForm}
              setShowCustomSession={setShowCustomSession}
              showCustomSession={showCustomSession}
              startingTemplateId={startingTemplateId}
              today={today}
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
        </>
      )}
    </div>
  );
}

function ActiveWorkoutHeader({ activeSession, ending, onEnd, onReopen, reopening }) {
  const ended = Boolean(activeSession.ended_at);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (ended) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [ended]);
  const elapsed = Math.max(0, Math.floor(((ended ? Date.parse(activeSession.ended_at) : now) - Date.parse(activeSession.started_at)) / 60000));

  return (
    <section className="col-span-12 mb-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-2 flex items-center gap-2 text-xs text-zinc-400"><span className={ended ? 'status-dot offline' : 'status-dot'} />{ended ? 'Session complete' : 'Session in progress'}{Number.isFinite(elapsed) ? ' · ' + elapsed + ' min' : ''}</p>
          <h2 className="break-words text-xl font-semibold text-zinc-100 md:text-2xl">{activeSession.name}</h2>
          <p className="mt-1 text-xs text-zinc-500">{activeSession.performed_on}</p>
        </div>
        <button
          type="button"
          onClick={ended ? onReopen : onEnd}
          disabled={ended ? reopening : ending}
          className="ml-auto flex min-h-11 shrink-0 items-center justify-center gap-2 rounded border border-white/15 px-3 text-xs font-semibold text-zinc-300 disabled:opacity-40"
        >
          {ending || reopening ? <Loader2 size={15} className="animate-spin" /> : ended ? <Plus size={15} /> : <Square size={15} />}
          {ended ? 'Reopen' : 'End Workout'}
        </button>
      </div>
    </section>
  );
}

function WorkoutSessionControl({
  formError,
  activeSession,
  activeWorkoutId,
  createWorkoutTemplate,
  createWorkoutTemplateExercise,
  deleteConfirmId,
  deleteWorkoutTemplate,
  deleteWorkoutTemplateExercise,
  deletingSessionId,
  onDeleteSession,
  onSelectToday,
  onStartFromTemplate,
  onStartWorkout,
  reorderWorkoutTemplateExercise,
  savingSession,
  selectingToday,
  sessionForm,
  startingTemplateId,
  today,
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
  const [templateBusy, setTemplateBusy] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const todaysSessions = workoutSessions.filter((session) => session.performed_on === today);
  const contentOpen = !activeSession || mobileOpen;

  return (
    <Panel className="h-fit">
      <PanelHeader
        eyebrow="Workout"
        title={activeSession ? 'Session Options' : 'Start Workout'}
        right={<SourceStatus status={workoutSessionsStatus} />}
      />
      {formError ? <p role="alert" className="px-3 py-2 text-sm text-red-300">{formError}</p> : null}
      <button
        type="button"
        onClick={() => setMobileOpen((value) => !value)}
        disabled={templateBusy}
        aria-expanded={contentOpen}
        className="flex min-h-11 w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-sm text-zinc-300 md:hidden"
      >
        <span>{activeSession ? 'Session options' : 'Start workout'}</span>
        <ChevronDown size={16} className={`text-zinc-500 transition ${contentOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`${contentOpen ? 'block' : 'hidden'} space-y-2 p-3 md:block`}>
        {activeSession ? <button disabled={templateBusy} className="flex min-h-11 w-full items-center gap-2 border-b border-white/10 text-sm text-zinc-200" onClick={() => setActiveWorkoutId(null)}><Plus size={16} />New session</button> : null}
        {!activeSession ? (
          <div className="space-y-2">
            <div className="py-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">Choose a template</p>
                </div>
                <ClipboardList size={15} className="shrink-0 text-cyan-300" />
              </div>
              {workoutTemplatesStatus === 'loading' && !workoutTemplates.length ? (
                <LoadingCard label="Loading workout templates" />
              ) : workoutTemplates.length ? (
                <div className="grid divide-y divide-white/10">
                  {workoutTemplates.map((template) => {
                    const count = template.workout_template_exercises?.length ?? 0;
                    return (
                      <div key={template.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium text-zinc-100">{template.name}</p>
                          <p className="mt-1 text-xs text-zinc-500">{count} exercises</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onStartFromTemplate(template.id)}
                          aria-label={`Start ${template.name}`}
                          disabled={Boolean(startingTemplateId) || savingSession}
                          className="primary-button flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-medium disabled:opacity-50"
                        >
                          {startingTemplateId === template.id ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                          Start
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-2 text-sm text-zinc-500">
                  No templates yet.
                </p>
              )}
              {workoutTemplatesError ? <p role="alert" className="mt-2 text-sm text-red-300">{workoutTemplatesError}</p> : null}
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
        ) : null}

        {!activeSession ? (
          <button
            type="button"
            onClick={() => setShowCustomSession((value) => !value)}
            disabled={savingSession || Boolean(startingTemplateId)}
            aria-expanded={showCustomSession}
            className="min-h-11 w-full border-y border-white/10 py-3 text-left text-sm font-medium text-zinc-300"
          >
            Start Empty Workout
          </button>
        ) : null}

        {!activeSession && showCustomSession ? (
          <form aria-label="Start empty workout" onSubmit={onStartWorkout} className="grid gap-3 py-3">
            <fieldset disabled={savingSession || Boolean(startingTemplateId)} className="grid min-w-0 gap-3">
            <CompactField label="Name" value={sessionForm.name} onChange={(value) => setSessionForm((prev) => ({ ...prev, name: value }))} />
            <CompactField label="Date" type="date" value={sessionForm.performed_on} onChange={(value) => setSessionForm((prev) => ({ ...prev, performed_on: value }))} />
            <CompactField label="Notes" value={sessionForm.notes} onChange={(value) => setSessionForm((prev) => ({ ...prev, notes: value }))} />
            <button
              type="submit"
              disabled={savingSession || Boolean(startingTemplateId)}
              className="primary-button flex min-h-11 items-center justify-center gap-2 text-sm font-medium disabled:opacity-50"
            >
              {savingSession ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {savingSession ? 'Starting' : 'Start Empty'}
            </button>
            </fieldset>
          </form>
        ) : null}

        <CollapsedSection
          open={manageTemplatesOpen}
          setOpen={setManageTemplatesOpen}
          title="Manage templates"
          disabled={templateBusy}
        >
          <TemplateManager
            onBusyChange={setTemplateBusy}
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
              className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-md border text-sm font-medium disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600 ${
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

function CollapsedSection({ children, disabled = false, open, setOpen, title }) {
  return (
    <div className="border-t border-white/10">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between py-3 text-left text-sm font-medium text-zinc-300"
      >
        <span>{title}</span>
        <ChevronDown size={15} className={`text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="space-y-3 pb-3">{children}</div> : null}
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
  onBusyChange,
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
  useEffect(() => {
    onBusyChange(Boolean(templateLoading));
    return () => onBusyChange(false);
  }, [onBusyChange, templateLoading]);

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
    if (!window.confirm('Delete this template and its exercises? Existing workout snapshots are kept.')) return;
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
    if (!window.confirm('Remove this exercise from the template? Existing workout snapshots are kept.')) return;
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
    <fieldset disabled={Boolean(templateLoading)} aria-label="Workout template management" className="grid min-w-0 gap-5">
      {templateError ? <p role="alert" className="text-sm text-red-300">{templateError}</p> : null}
      <form aria-label="Create workout template" onSubmit={createTemplate} className="grid min-w-0 gap-3">
        <CompactField label="Template name" value={templateForm.name} onChange={(value) => setTemplateForm((prev) => ({ ...prev, name: value }))} />
        <CompactField label="Notes" value={templateForm.notes} onChange={(value) => setTemplateForm((prev) => ({ ...prev, notes: value }))} />
        <button type="submit" disabled={Boolean(templateLoading)} className="primary-button flex min-h-11 items-center justify-center gap-2 text-sm font-medium disabled:opacity-50">
          {templateLoading === 'template-create' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Create template
        </button>
      </form>
      {workoutTemplatesStatus === 'loading' && !workoutTemplates.length ? <LoadingCard label="Loading templates" /> : null}
      <div className="grid min-w-0 divide-y divide-white/10">
        {workoutTemplates.map((template) => {
          const exercises = sortTemplateExercises(template.workout_template_exercises ?? []);
          const draft = exerciseDrafts[template.id] ?? { exercise: '', notes: '' };
          return (
            <article key={template.id} aria-label={'Template ' + template.name} className="grid min-w-0 gap-4 py-5">
              {editingTemplateId === template.id ? (
                <div role="group" aria-label="Edit template" className="grid gap-3">
                  <CompactField label="Template name" value={templateEditForm.name} onChange={(value) => setTemplateEditForm((prev) => ({ ...prev, name: value }))} />
                  <CompactField label="Notes" value={templateEditForm.notes} onChange={(value) => setTemplateEditForm((prev) => ({ ...prev, notes: value }))} />
                  <div className="flex gap-2">
                    <IconButton icon={Check} loading={templateLoading === 'template-' + template.id} onClick={() => saveTemplate(template.id)} title="Save template" tone="zinc" />
                    <IconButton icon={X} onClick={() => setEditingTemplateId(null)} title="Cancel template edit" tone="zinc" />
                  </div>
                </div>
              ) : (
                <header className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold text-zinc-100">{template.name}</h3>
                    <p className="mt-1 text-xs text-zinc-500">{exercises.length} exercises</p>
                    {template.notes ? <p className="mt-2 break-words text-sm text-zinc-400">{template.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <IconButton icon={Pencil} onClick={() => { setEditingTemplateId(template.id); setTemplateEditForm({ name: template.name, notes: template.notes ?? '' }); }} title="Edit template" />
                    <IconButton icon={Trash2} loading={templateLoading === 'template-delete-' + template.id} onClick={() => removeTemplate(template.id)} title="Delete template" tone="red" />
                  </div>
                </header>
              )}
              <div className="grid divide-y divide-white/10">
                {exercises.map((exercise, index) => (
                  <div key={exercise.id} role="group" aria-label={'Template exercise ' + exercise.exercise} className="min-w-0 py-3">
                    {editingExerciseId === exercise.id ? (
                      <div className="grid gap-3">
                        <CompactField label="Exercise" value={exerciseEditForm.exercise} onChange={(value) => setExerciseEditForm((prev) => ({ ...prev, exercise: value }))} />
                        <CompactField label="Notes" value={exerciseEditForm.notes} onChange={(value) => setExerciseEditForm((prev) => ({ ...prev, notes: value }))} />
                        <div className="flex gap-2">
                          <IconButton icon={Check} loading={templateLoading === 'exercise-' + exercise.id} onClick={() => saveExercise(exercise.id)} title="Save exercise" />
                          <IconButton icon={X} onClick={() => setEditingExerciseId(null)} title="Cancel exercise edit" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid min-w-0 gap-3">
                        <div className="flex min-w-0 gap-3">
                          <span className="data-text text-sm text-zinc-500">{index + 1}</span>
                          <div className="min-w-0">
                            <p className="break-words text-sm text-zinc-200">{exercise.exercise}</p>
                            {exercise.notes ? <p className="mt-1 break-words text-xs text-zinc-500">{exercise.notes}</p> : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <IconButton disabled={index === 0} icon={ChevronDown} className="rotate-180" loading={templateLoading === 'exercise-move-' + exercise.id} onClick={() => moveExercise(template.id, exercise.id, 'up')} title="Move up" />
                          <IconButton disabled={index === exercises.length - 1} icon={ChevronDown} loading={templateLoading === 'exercise-move-' + exercise.id} onClick={() => moveExercise(template.id, exercise.id, 'down')} title="Move down" />
                          <IconButton icon={Pencil} onClick={() => { setEditingExerciseId(exercise.id); setExerciseEditForm({ exercise: exercise.exercise, notes: exercise.notes ?? '' }); }} title="Edit exercise" />
                          <IconButton icon={Trash2} loading={templateLoading === 'exercise-delete-' + exercise.id} onClick={() => removeExercise(exercise.id)} title="Delete exercise" tone="red" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div role="group" aria-label="Add template exercise" className="grid min-w-0 gap-3 border-t border-white/10 pt-4">
                <CompactField label="Add exercise" value={draft.exercise} onChange={(value) => setExerciseDrafts((prev) => ({ ...prev, [template.id]: { ...draft, exercise: value } }))} />
                <CompactField label="Notes" value={draft.notes} onChange={(value) => setExerciseDrafts((prev) => ({ ...prev, [template.id]: { ...draft, notes: value } }))} />
                <button type="button" onClick={() => addExercise(template)} disabled={Boolean(templateLoading)} className="flex min-h-11 items-center justify-center gap-2 rounded border border-white/15 text-sm text-zinc-200 disabled:opacity-50">
                  {templateLoading === 'exercise-create-' + template.id ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Add exercise
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </fieldset>
  );
}

function TemplatePlanCard({ activeExercise, onSelectExercise, plan }) {
  if (!plan) return null;

  return (
    <Panel>
      <PanelHeader
        eyebrow="Template"
        title="Exercise Plan"
        right={<Tag tone="cyan">{plan.exercises.length} exercises</Tag>}
      />
      <div className="p-2">
        {plan.exercises.length ? (
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
            {plan.exercises.map((exercise, index) => {
              const selected = normalizeExercise(activeExercise) === normalizeExercise(exercise.exercise);
              return (
                <button
                  key={exercise.id}
                  type="button"
                  onClick={() => onSelectExercise(exercise)}
                  className={`flex min-h-11 min-w-[150px] max-w-[210px] items-center gap-2 rounded border px-2.5 py-2 text-left transition md:min-w-[170px] ${
                    selected ? 'border-cyan-400/30 bg-cyan-400/10 text-zinc-100' : 'border-white/5 bg-[#121212] text-zinc-300'
                  }`}
                >
                  <span className="data-text text-xs text-zinc-500">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{exercise.exercise}</span>
                  {selected ? <Check size={14} className="shrink-0 text-cyan-300" /> : null}
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
  exerciseSuggestions,
  formError,
  onSetSubmit,
  previousPerformance,
  savingSet,
  lastSavedSet,
  setFormValue,
  updateSetForm,
}) {
  const isEnded = Boolean(activeSession?.ended_at);
  const [detailsOpen, setDetailsOpen] = useState(() => Boolean(setFormValue.rpe || setFormValue.notes));

  return (
    <section className="training-logger" aria-label="Workout set logger">
      <div>
        {activeSession && isEnded ? (
          <div className="rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
            This workout is ended. Reopen it to add more sets.
          </div>
        ) : activeSession ? (
          <div className="grid gap-4">
            <form onSubmit={onSetSubmit} aria-label="Log workout set">
              <fieldset disabled={savingSet} className="grid min-w-0 gap-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-400">Current exercise</span>
                <span className="data-text text-sm text-zinc-100">{setFormValue.is_warmup ? 'Warmup' : 'Set ' + getSafeWorkingSetNumber(setFormValue.set_number)}</span>
              </div>
              <div className="logger-exercise">
                <ExerciseAutocomplete
                  suggestions={exerciseSuggestions}
                  value={setFormValue.exercise}
                  onChange={(value) => updateSetForm('exercise', value)}
                />
              </div>
              <PreviousPerformanceCard performance={previousPerformance} />
              <div className="training-values grid grid-cols-2 gap-3">
                <CompactField label="Weight" inputMode="decimal" value={setFormValue.weight} suffix="kg" onChange={(value) => updateSetForm('weight', value)} />
                <CompactField label="Reps" inputMode="numeric" value={setFormValue.reps} onChange={(value) => updateSetForm('reps', value)} />
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-zinc-300"><input type="checkbox" className="h-5 w-5 accent-zinc-300" checked={Boolean(setFormValue.is_warmup)} onChange={(event) => updateSetForm('is_warmup', event.target.checked)} />Warmup set</label>
              <details className="logger-details" open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
                <summary className="cursor-pointer py-2 text-sm text-zinc-400">RPE &amp; notes</summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-[140px_1fr]">
                  <CompactField label="RPE optional" inputMode="decimal" value={setFormValue.rpe} onChange={(value) => updateSetForm('rpe', value)} />
                  <CompactField label="Notes optional" value={setFormValue.notes} onChange={(value) => updateSetForm('notes', value)} />
                </div>
              </details>
              <button
                type="submit"
                disabled={savingSet || !activeSession}
                className="primary-button min-h-14 w-full text-base"
              >
                {savingSet ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {savingSet ? 'Saving Set' : setFormValue.is_warmup ? 'Save Warmup' : 'Save Set'}
              </button>
              <div role="status" aria-live="polite" className="min-h-5 text-sm">
                {formError ? <p className="text-red-300">{formError}</p> : lastSavedSet ? <p className="flex items-center gap-2 text-emerald-300"><Check size={16} />Saved: {lastSavedSet.exercise} · {lastSavedSet.weight} kg × {lastSavedSet.reps}</p> : null}
              </div>
              </fieldset>
            </form>
          </div>
        ) : (
          <div className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">
            Select or start a workout session.
          </div>
        )}
      </div>
    </section>
  );
}

function PreviousPerformanceCard({ performance }) {
  if (!performance) return null;

  return (
    <section aria-label="Last time" className="min-w-0 border-l-2 border-zinc-600 pl-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-zinc-400"><span>LAST TIME</span><time>{performance.date}</time></div>
      <p className="my-2 break-words text-zinc-300">{performance.sessionName}</p>
      <HistoricalSets sets={performance.sets} />
    </section>
  );
}

function HistoricalSets({ sets }) {
  return <div className="grid gap-2">{sortSetsForDisplay(sets).map((set) => (
    <div key={set.id} className={`grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] gap-x-2 text-sm ${isWarmupSet(set) ? 'text-zinc-400' : 'text-zinc-100'}`}>
      <span className="data-text">{formatSetLabel(set, sets)}</span>
      <span className="data-text">{formatNumber(set.weight)} kg × {set.reps}</span>
      {parseOptionalDecimal(set.rpe) !== null ? <span className="data-text text-xs text-zinc-400">RPE {formatRpe(set.rpe)}</span> : <span />}
      {set.notes?.trim() ? <p className="col-start-2 col-span-2 whitespace-pre-wrap break-words text-xs text-zinc-400">{set.notes}</p> : null}
    </div>
  ))}</div>;
}

function WorkoutHistory({ sessions, activeSession, selectedId, onSelect, onResume, onEdit, status, error }) {
  const selected = sessions.find((session) => session.id === selectedId);
  const history = sessions.filter((session) => session.id !== activeSession?.id || session.ended_at).slice().sort(compareSessionsDescending);
  return <section aria-label="Workout history" className="col-span-12 min-w-0 max-w-3xl">
    {activeSession && !activeSession.ended_at ? <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
      <div className="min-w-0"><p className="text-xs text-zinc-400">Training in progress</p><p className="break-words text-sm text-zinc-100">{activeSession.name}</p></div>
      <button type="button" className="min-h-11 px-3 text-sm text-zinc-200" onClick={onResume}>Resume</button>
    </div> : null}
    {error ? <p role="alert" className="mb-3 text-sm text-red-300">{error}</p> : null}
    {selected ? <>
      <button type="button" onClick={() => onSelect(null)} className="mb-4 flex min-h-11 items-center gap-2 text-sm text-zinc-300"><ArrowLeft size={16} />Back to History</button>
      <h2 className="break-words text-xl font-semibold text-zinc-100">{selected.name}</h2>
      <time className="text-sm text-zinc-400">{selected.performed_on}</time>
      <details className="mt-2 text-sm text-zinc-400"><summary className="min-h-11 cursor-pointer py-3">Session actions</summary>
        <button type="button" className="flex min-h-11 items-center gap-2 text-zinc-200" onClick={() => onEdit(selected.id)}><Pencil size={16} />{selected.ended_at ? 'Edit / reopen workout' : 'Select for logging'}</button>
      </details>
      <div className="mt-4 grid gap-6">{Object.entries(groupSetsByExercise(selected.workout_sets ?? [])).map(([exercise, sets]) => <section key={exercise} className="min-w-0 border-t border-white/10 pt-3"><h3 className="mb-3 break-words text-sm font-semibold text-zinc-200">{exercise}</h3><HistoricalSets sets={sets} /></section>)}</div>
      {!selected.workout_sets?.length ? <p className="py-4 text-sm text-zinc-400">No sets recorded.</p> : null}
    </> : <>
      <h2 className="mb-3 text-sm font-semibold text-zinc-200">Recent workouts</h2>
      {status === 'loading' && !history.length ? <LoadingCard label="Loading workout history" /> : null}
      {history.map((session) => <button type="button" key={session.id} onClick={() => onSelect(session.id)} className="grid min-h-20 w-full gap-1 border-b border-white/10 py-4 text-left">
        <time className="text-xs text-zinc-400">{session.performed_on}</time>
        <span className="break-words text-sm font-medium text-zinc-100">{session.name}</span>
        <span className="text-xs text-zinc-400">{Object.keys(groupSetsByExercise(session.workout_sets ?? [])).length} exercises · {session.workout_sets?.length ?? 0} sets</span>
      </button>)}
      {status !== 'loading' && !history.length ? <p className="py-4 text-sm text-zinc-400">No past workouts yet.</p> : null}
    </>}
  </section>;
}

function TodaySetsLog({
  activeSession,
  beginEdit,
  deletingSetId,
  editForm,
  editingSetId,
  onDeleteSet,
  onSaveEdit,
  savingEditId,
  setEditForm,
  setEditingSetId,
  workoutSessionsStatus,
}) {
  const activeSets = activeSession?.workout_sets ?? [];
  const groupedActiveSets = groupSetsByExercise(activeSets);
  const sessionsInitialLoading = workoutSessionsStatus === 'loading' && !activeSession;

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
              />
            ))
          ) : (
            <p className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">No sets logged in this session.</p>
          )
        ) : (
          <p className="rounded-md border border-white/5 bg-black/25 p-3 text-sm text-zinc-500">No active session selected.</p>
        )}

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
}) {
  const isEnded = Boolean(session?.ended_at);

  return (
    <div className="rounded-md border border-white/5 bg-black/25">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <p className="text-sm font-semibold text-zinc-100">{exercise}</p>
      </div>
      <div className="grid gap-1 p-2">
        {sets.map((set) => {
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
              className={`grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2 rounded border px-2 py-2 sm:grid-cols-[58px_minmax(0,1fr)_auto] ${
                isWarmupSet(set) ? 'border-amber-400/10 bg-amber-400/[0.04]' : 'border-white/5 bg-[#121212]'
              }`}
            >
              <span className={`data-text text-sm font-bold ${isWarmupSet(set) ? 'text-amber-300' : 'text-cyan-300'}`}>
                {formatSetLabel(set, sets)}
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <p className="truncate text-xs font-medium text-zinc-100">{formatNumber(set.weight)}kg x {set.reps}</p>
                </div>
                <p className="data-text text-[10px] text-zinc-500">RPE {formatRpe(set.rpe)}</p>
                {set.notes ? <p className="mt-0.5 break-words text-[11px] text-zinc-500">{set.notes}</p> : null}
              </div>
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
    <div role="group" aria-label="Edit workout set" className="grid grid-cols-2 gap-3 rounded border border-white/20 bg-white/[0.02] p-3 sm:grid-cols-3">
      <CompactField label="Exercise" value={editForm.exercise} onChange={(value) => update('exercise', value)} />
      <WarmupToggle checked={Boolean(editForm.is_warmup)} onChange={updateWarmup} compact />
      <CompactField label="Weight" inputMode="decimal" value={editForm.weight} suffix="kg" onChange={(value) => update('weight', value)} />
      <CompactField label="Reps" inputMode="numeric" value={editForm.reps} onChange={(value) => update('reps', value)} />
      <CompactField label="RPE optional" inputMode="decimal" value={editForm.rpe} onChange={(value) => update('rpe', value)} />
      <CompactField label="Notes" value={editForm.notes} onChange={(value) => update('notes', value)} />
      <div className="flex items-end gap-1">
        <IconButton icon={Check} loading={loading} onClick={onSave} title="Save edit" tone="emerald" size="sm" />
        <IconButton icon={X} onClick={onCancel} title="Cancel edit" tone="zinc" size="sm" />
      </div>
    </div>
  );
}

function ExerciseAutocomplete({ onChange, suggestions, value }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const suggestionsId = useId();
  const normalizedValue = normalizeExercise(value);
  const visibleSuggestions = suggestions
    .filter((exercise) => !normalizedValue || normalizeExercise(exercise).includes(normalizedValue))
    .filter((exercise) => normalizeExercise(exercise) !== normalizedValue)
    .slice(0, 8);

  const dismiss = () => {
    inputRef.current?.focus();
    setOpen(false);
  };
  const moveSuggestionFocus = (event, index) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = suggestionsRef.current?.querySelectorAll('button');
    if (!buttons?.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div className="relative min-w-0" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <label className="block rounded border border-white/15 bg-[#14171b] px-2 py-1.5 focus-within:border-zinc-400">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Exercise</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          aria-controls={open && visibleSuggestions.length ? suggestionsId : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
            } else if (open && visibleSuggestions.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
              moveSuggestionFocus(event, event.key === 'ArrowDown' ? -1 : 0);
            }
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          className="data-text mt-1 w-full min-w-0 bg-transparent text-base font-semibold text-zinc-100 outline-none"
        />
      </label>
      {open && visibleSuggestions.length ? (
        <div ref={suggestionsRef} id={suggestionsId} role="group" aria-label="Exercise suggestions" className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded border border-white/20 bg-[#14171b] p-1 shadow-xl">
          {visibleSuggestions.map((exercise, index) => (
            <button
              key={normalizeExercise(exercise)}
              type="button"
              onKeyDown={(event) => moveSuggestionFocus(event, index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(exercise);
                dismiss();
              }}
              className="block min-h-11 w-full rounded px-3 py-3 text-left text-sm text-zinc-200 hover:bg-white/5 focus-visible:bg-white/5"
            >
              {exercise}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WarmupToggle({ checked, compact = false, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
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
    <label className="grid min-w-0 gap-1 text-xs text-zinc-400">
      <span>{label}</span>
      <div className="flex min-h-11 min-w-0 items-center gap-1 rounded border border-white/10 bg-black/30 px-3">
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          className={`h-11 min-w-0 max-w-full flex-1 bg-transparent text-base text-zinc-100 outline-none ${readOnly ? 'data-text text-zinc-400' : ''}`}
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
  const dimensions = 'h-11 w-11 shrink-0';
  const DisplayIcon = loading ? Loader2 : Icon;
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={title}
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

function buildPersistedTemplatePlan(session) {
  const snapshot = Array.isArray(session?.template_snapshot) ? session.template_snapshot : [];
  if (!snapshot.length) return null;

  const exercises = sortTemplateExercises(snapshot).map((exercise, index) => ({
    ...exercise,
    id: `${session.id}-template-${Number(exercise.exercise_order) || index + 1}`,
    exercise_order: Number(exercise.exercise_order) || index + 1,
    notes: exercise.notes ?? '',
  }));

  return {
    templateId: session.template_id ?? null,
    templateName: session.name,
    sessionId: session.id,
    sessionName: session.name,
    exercises,
  };
}

function buildExerciseSuggestions(activeSession, templates, sessions) {
  const candidates = [
    ...(Array.isArray(activeSession?.template_snapshot)
      ? activeSession.template_snapshot.map((exercise) => exercise.exercise)
      : []),
    ...templates.flatMap((template) =>
      (template.workout_template_exercises ?? []).map((exercise) => exercise.exercise),
    ),
    ...sessions.flatMap((session) => (session.workout_sets ?? []).map((set) => set.exercise)),
  ];

  const seen = new Set();
  return candidates.filter((exercise) => {
    const key = normalizeExercise(exercise);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
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
  const workingSets = (session.workout_sets ?? []).filter(
    (set) => set.id !== excludeSetId && !isWarmupSet(set) && normalizeExercise(set.exercise) === normalizedExercise,
  );
  const validSetNumbers = workingSets
    .map((set) => parseInteger(set.set_number))
    .filter((setNumber) => Number.isInteger(setNumber) && setNumber > 0 && setNumber < WARMUP_SET_NUMBER_OFFSET);
  return Math.max(workingSets.length, 0, ...validSetNumbers) + 1;
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
    .find((session) => (session.workout_sets ?? []).some((set) => normalizeExercise(set.exercise) === key));

  if (!previousSession) return null;

  const sets = previousSession.workout_sets
    .filter((set) => normalizeExercise(set.exercise) === key)
    .map(normalizeSet)
    .sort(compareSetsForDisplay);
  return {
    sessionName: previousSession.name,
    date: previousSession.performed_on,
    sets,
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
    rpe: parseOptionalDecimal(set.rpe),
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

function parseOptionalDecimal(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return parseDecimal(value);
}

function parseInteger(value) {
  return Number(String(value ?? '').trim());
}

function isWarmupSet(set) {
  return Boolean(set?.is_warmup);
}

function formatSetLabel(set, siblingSets = []) {
  if (isWarmupSet(set)) return 'W';
  const parsed = parseInteger(set.set_number);
  if (Number.isInteger(parsed) && parsed > 0 && parsed < WARMUP_SET_NUMBER_OFFSET) {
    return `Set ${parsed}`;
  }

  const validNumbers = siblingSets
    .filter((item) => !isWarmupSet(item))
    .map((item) => parseInteger(item.set_number))
    .filter((setNumber) => Number.isInteger(setNumber) && setNumber > 0 && setNumber < WARMUP_SET_NUMBER_OFFSET);
  const malformedWorkingSets = siblingSets
    .filter((item) => !isWarmupSet(item))
    .filter((item) => {
      const setNumber = parseInteger(item.set_number);
      return !Number.isInteger(setNumber) || setNumber <= 0 || setNumber >= WARMUP_SET_NUMBER_OFFSET;
    })
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.performed_at ?? a.created_at ?? 0).getTime();
      const bTime = new Date(b.performed_at ?? b.created_at ?? 0).getTime();
      if (aTime !== bTime) return aTime - bTime;
      return String(a.id).localeCompare(String(b.id));
    });
  const repairedIndex = malformedWorkingSets.findIndex((item) => item.id === set.id);
  const repairedNumber = Math.max(0, ...validNumbers) + (repairedIndex >= 0 ? repairedIndex + 1 : 1);
  return `Set ${repairedNumber}`;
}

function getSafeWorkingSetNumber(value) {
  const parsed = parseInteger(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < WARMUP_SET_NUMBER_OFFSET ? parsed : 1;
}

function formatRpe(value) {
  const parsed = parseOptionalDecimal(value);
  return parsed === null || !Number.isFinite(parsed) ? '--' : formatNumber(parsed);
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
  const weight = parseDecimal(form.weight);
  const reps = parseInteger(form.reps);
  const rpe = parseOptionalDecimal(form.rpe);
  const setNumber = parseInteger(form.set_number);

  if (!activeWorkoutSession) return 'Select or start a workout session first.';
  if (!form.exercise.trim()) return 'Exercise is required.';
  if (typeof form.is_warmup !== 'boolean') return 'Warmup must be true or false.';
  if (!Number.isFinite(setNumber) || setNumber <= 0) return 'Set number must be greater than 0.';
  if (!form.is_warmup && setNumber >= WARMUP_SET_NUMBER_OFFSET) return 'Working set number is invalid.';
  if (!Number.isFinite(weight) || weight < 0) return 'Weight must be 0 or greater.';
  if (!Number.isInteger(reps) || reps <= 0) return 'Reps must be a positive whole number.';
  if (rpe !== null && (!Number.isFinite(rpe) || rpe < 0 || rpe > 10)) return 'RPE must be between 0 and 10.';
  return '';
}

function isMeaningfulSetDraft(form, activeWorkoutSession) {
  if (!activeWorkoutSession || activeWorkoutSession.ended_at || !form.exercise.trim()) return false;
  const weight = parseDecimal(form.weight);
  const reps = parseInteger(form.reps);
  const rpe = parseOptionalDecimal(form.rpe);
  return Number.isFinite(weight)
    && weight >= 0
    && Number.isInteger(reps)
    && reps > 0
    && (rpe === null || (Number.isFinite(rpe) && rpe >= 0 && rpe <= 10));
}

function isValidDate(value) {
  if (!value) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
}
