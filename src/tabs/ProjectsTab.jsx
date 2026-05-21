import {
  ArrowLeft,
  Briefcase,
  Check,
  Clock3,
  Loader2,
  Pencil,
  Play,
  Plus,
  Save,
  Square,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Tag } from '../components/ui';

const goalTypes = ['hours', 'units', 'tasks', 'content', 'custom'];
const statuses = ['active', 'paused', 'completed', 'archived'];

const emptyProjectForm = () => ({
  name: '',
  status: 'active',
  goal_type: 'hours',
  goal_label: 'Hours',
  target_value: '',
  current_value: '0',
  unit_label: 'hours',
  started_on: todayString(),
  notes: '',
});

const emptyMoneyForm = (type = 'expense') => ({
  type,
  amount: '',
  description: '',
  entry_date: todayString(),
});

export function ProjectsTab() {
  const {
    createProjectMoneyEntry,
    createProject,
    createProjectSession,
    deleteProject,
    deleteProjectMoneyEntry,
    deleteProjectSession,
    projectMoneyEntries,
    projectMoneyEntriesError,
    projectMoneyEntriesStatus,
    projectSessions,
    projectSessionsError,
    projectSessionsStatus,
    projects,
    projectsError,
    projectsStatus,
    updateProject,
    updateProjectMoneyEntry,
    updateProjectSession,
  } = useLifeOS();

  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [projectForm, setProjectForm] = useState(emptyProjectForm());
  const [projectFormError, setProjectFormError] = useState('');
  const [projectSaveStatus, setProjectSaveStatus] = useState('idle');
  const [moneyModalOpen, setMoneyModalOpen] = useState(false);
  const [editingMoneyEntryId, setEditingMoneyEntryId] = useState(null);
  const [moneyForm, setMoneyForm] = useState(emptyMoneyForm());
  const [moneyFormError, setMoneyFormError] = useState('');
  const [moneySaveStatus, setMoneySaveStatus] = useState('idle');
  const [sessionTarget, setSessionTarget] = useState('');
  const [sessionProof, setSessionProof] = useState('');
  const [sessionDelta, setSessionDelta] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [progressInput, setProgressInput] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedProjectMoneyEntries = useMemo(
    () => projectMoneyEntries.filter((entry) => entry.project_id === selectedProjectId),
    [projectMoneyEntries, selectedProjectId],
  );
  const activeSession = projectSessions.find((session) => !session.ended_at) ?? null;
  const activeSessionProject = activeSession ? projects.find((project) => project.id === activeSession.project_id) : null;
  const activeProjects = projects.filter((project) => project.status === 'active');
  const sessionsThisWeek = projectSessions.filter((session) => isThisWeek(session.started_at));
  const hoursThisWeek = sessionsThisWeek.reduce((sum, session) => sum + getSessionMinutes(session) / 60, 0);
  const totalSessions = projectSessions.length;
  const projectsLoading = isInitialLoading(projectsStatus, projects);

  useEffect(() => {
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(null);
    }
  }, [projects, selectedProjectId]);

  const openCreateProject = () => {
    setEditingProjectId(null);
    setProjectForm(emptyProjectForm());
    setProjectFormError('');
    setProjectSaveStatus('idle');
    setProjectModalOpen(true);
  };

  const openEditProject = (project) => {
    setEditingProjectId(project.id);
    setProjectForm({
      name: project.name ?? '',
      status: project.status ?? 'active',
      goal_type: project.goal_type ?? 'hours',
      goal_label: project.goal_label ?? defaultGoalLabel(project.goal_type),
      target_value: String(project.target_value ?? ''),
      current_value: String(project.current_value ?? 0),
      unit_label: project.unit_label ?? defaultUnitLabel(project.goal_type),
      started_on: project.started_on ?? todayString(),
      notes: project.notes ?? '',
    });
    setProjectFormError('');
    setProjectSaveStatus('idle');
    setProjectModalOpen(true);
  };

  const closeProjectModal = () => {
    setProjectModalOpen(false);
    setEditingProjectId(null);
    setProjectForm(emptyProjectForm());
    setProjectFormError('');
    setProjectSaveStatus('idle');
  };

  const updateProjectForm = (field, value) => {
    setProjectForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'goal_type') {
        next.goal_label = defaultGoalLabel(value);
        next.unit_label = defaultUnitLabel(value);
        if (value === 'hours') next.current_value = '0';
      }
      return next;
    });
    setProjectFormError('');
  };

  const submitProject = async (event) => {
    event.preventDefault();
    const validation = validateProjectForm(projectForm);
    if (validation) {
      setProjectFormError(validation);
      return;
    }

    setProjectSaveStatus('saving');
    try {
      const payload = {
        ...projectForm,
        current_value: projectForm.goal_type === 'hours' ? 0 : projectForm.current_value,
      };
      const saved = editingProjectId
        ? await updateProject(editingProjectId, payload)
        : await createProject(payload);
      setSelectedProjectId(saved.id);
      closeProjectModal();
    } catch (error) {
      setProjectFormError(error.message || 'Failed to save project.');
      setProjectSaveStatus('idle');
    }
  };

  const removeProject = async (project) => {
    if (!window.confirm(`Delete project "${project.name}" and its sessions?`)) return;
    setBusyId(`project:${project.id}:delete`);
    try {
      await deleteProject(project.id);
      if (selectedProjectId === project.id) setSelectedProjectId(null);
    } finally {
      setBusyId('');
    }
  };

  const startSession = async (project) => {
    if (!sessionTarget.trim()) {
      setSessionError('Set a target output before starting.');
      return;
    }
    setBusyId(`project:${project.id}:start`);
    setSessionError('');
    try {
      const session = await createProjectSession({
        project_id: project.id,
        started_at: new Date().toISOString(),
        target_output: sessionTarget,
        progress_delta: 0,
      });
      setSessionTarget('');
      setSelectedProjectId(session.project_id);
    } catch (error) {
      setSessionError(error.message || 'Failed to start session.');
    } finally {
      setBusyId('');
    }
  };

  const endSession = async (session) => {
    const endedAt = new Date();
    const durationMinutes = Math.max(0, Math.round((endedAt.getTime() - new Date(session.started_at).getTime()) / 60000));
    setBusyId(`session:${session.id}:end`);
    setSessionError('');
    try {
      await updateProjectSession(session.id, {
        ended_at: endedAt.toISOString(),
        duration_minutes: durationMinutes,
        proof_of_work: sessionProof,
        progress_delta: sessionDelta || 0,
      });
      setSessionProof('');
      setSessionDelta('');
    } catch (error) {
      setSessionError(error.message || 'Failed to end session.');
    } finally {
      setBusyId('');
    }
  };

  const removeSession = async (session) => {
    if (!window.confirm('Delete this project session?')) return;
    setBusyId(`session:${session.id}:delete`);
    try {
      await deleteProjectSession(session.id);
    } finally {
      setBusyId('');
    }
  };

  const addProgress = async (project) => {
    const delta = Number(String(progressInput).replace(',', '.'));
    if (!Number.isFinite(delta) || delta <= 0) {
      setSessionError('Enter a positive progress amount.');
      return;
    }
    setBusyId(`project:${project.id}:progress`);
    setSessionError('');
    try {
      await updateProject(project.id, { current_value: Number(project.current_value ?? 0) + delta });
      setProgressInput('');
    } catch (error) {
      setSessionError(error.message || 'Failed to update project progress.');
    } finally {
      setBusyId('');
    }
  };

  const openMoneyModal = (type, entry = null) => {
    setEditingMoneyEntryId(entry?.id ?? null);
    setMoneyForm(entry ? {
      type: entry.type ?? type,
      amount: String(entry.amount ?? ''),
      description: entry.description ?? '',
      entry_date: entry.entry_date ?? todayString(),
    } : emptyMoneyForm(type));
    setMoneyFormError('');
    setMoneySaveStatus('idle');
    setMoneyModalOpen(true);
  };

  const closeMoneyModal = () => {
    setMoneyModalOpen(false);
    setEditingMoneyEntryId(null);
    setMoneyForm(emptyMoneyForm());
    setMoneyFormError('');
    setMoneySaveStatus('idle');
  };

  const updateMoneyForm = (field, value) => {
    setMoneyForm((prev) => ({ ...prev, [field]: value }));
    setMoneyFormError('');
  };

  const submitMoneyEntry = async (event) => {
    event.preventDefault();
    if (!selectedProject) return;
    const amount = Number(String(moneyForm.amount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setMoneyFormError('Amount must be greater than 0.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(moneyForm.entry_date)) {
      setMoneyFormError('Choose a valid entry date.');
      return;
    }

    setMoneySaveStatus('saving');
    try {
      const payload = {
        ...moneyForm,
        project_id: selectedProject.id,
        amount,
      };
      if (editingMoneyEntryId) {
        await updateProjectMoneyEntry(editingMoneyEntryId, payload);
      } else {
        await createProjectMoneyEntry(payload);
      }
      closeMoneyModal();
    } catch (error) {
      setMoneyFormError(error.message || 'Failed to save project money entry.');
      setMoneySaveStatus('idle');
    }
  };

  const removeMoneyEntry = async (entry) => {
    if (!window.confirm('Delete this project money entry?')) return;
    setBusyId(`money:${entry.id}:delete`);
    try {
      await deleteProjectMoneyEntry(entry.id);
    } finally {
      setBusyId('');
    }
  };

  if (selectedProject) {
    return (
      <>
        <ProjectDetail
          activeSession={activeSession}
          busyId={busyId}
          onAddProgress={addProgress}
          onBack={() => setSelectedProjectId(null)}
          onDeleteProject={removeProject}
          onDeleteMoneyEntry={removeMoneyEntry}
          onDeleteSession={removeSession}
          onEditProject={openEditProject}
          onEditMoneyEntry={(entry) => openMoneyModal(entry.type, entry)}
          onEndSession={endSession}
          onOpenMoneyModal={openMoneyModal}
          onStartSession={startSession}
          progressInput={progressInput}
          project={selectedProject}
          projectMoneyEntries={selectedProjectMoneyEntries}
          projectMoneyEntriesError={projectMoneyEntriesError}
          projectMoneyEntriesStatus={projectMoneyEntriesStatus}
          projectSessions={projectSessions}
          projectsError={projectsError}
          sessionDelta={sessionDelta}
          sessionError={sessionError || projectSessionsError}
          sessionProof={sessionProof}
          sessionTarget={sessionTarget}
          setProgressInput={setProgressInput}
          setSessionDelta={setSessionDelta}
          setSessionProof={setSessionProof}
          setSessionTarget={setSessionTarget}
          tick={tick}
        />
        {projectModalOpen ? (
          <ProjectModal
            editing={Boolean(editingProjectId)}
            error={projectFormError}
            form={projectForm}
            onChange={updateProjectForm}
            onClose={closeProjectModal}
            onSubmit={submitProject}
            saveStatus={projectSaveStatus}
          />
        ) : null}
        {moneyModalOpen ? (
          <ProjectMoneyModal
            editing={Boolean(editingMoneyEntryId)}
            error={moneyFormError}
            form={moneyForm}
            onChange={updateMoneyForm}
            onClose={closeMoneyModal}
            onSubmit={submitMoneyEntry}
            saveStatus={moneySaveStatus}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="grid min-w-0 gap-3 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <Panel>
        <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="data-text text-[10px] uppercase tracking-wider text-cyan-300">Project Ops</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-100">Projects</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">
              Serious execution tracked through goals, effort sessions, and proof of work.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateProject}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-200"
          >
            <Plus size={17} />
            New Project
          </button>
        </div>
      </Panel>

      <div className="grid min-w-0 grid-cols-2 gap-2 xl:grid-cols-4">
        <MiniMetric label="Active Projects" value={activeProjects.length} tone="text-cyan-300" sub={`${projects.length} total`} />
        <MiniMetric label="Active Sessions" value={activeSession ? 1 : 0} tone={activeSession ? 'text-red-300' : 'text-zinc-100'} sub={activeSessionProject?.name ?? 'none'} />
        <MiniMetric label="Hours This Week" value={formatNumber(hoursThisWeek)} tone="text-emerald-300" sub="project work" />
        <MiniMetric label="Sessions" value={totalSessions} tone="text-violet-300" sub="proof logs" />
      </div>

      {(projectsError || projectSessionsError) ? (
        <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {projectsError || projectSessionsError}
        </div>
      ) : null}

      {projectsLoading ? (
        <LoadingState label="Loading projects..." />
      ) : projects.length ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              sessions={project.project_sessions ?? []}
              onOpen={() => setSelectedProjectId(project.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyProjects onCreate={openCreateProject} />
      )}

      {projectModalOpen ? (
        <ProjectModal
          editing={Boolean(editingProjectId)}
          error={projectFormError}
          form={projectForm}
          onChange={updateProjectForm}
          onClose={closeProjectModal}
          onSubmit={submitProject}
          saveStatus={projectSaveStatus}
        />
      ) : null}
    </div>
  );
}

function ProjectCard({ onOpen, project, sessions }) {
  const stats = getProjectStats(project, sessions);
  const lastSession = sessions[0] ?? null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="min-w-0 rounded-md border border-white/5 bg-black/25 p-3 text-left transition hover:border-cyan-400/25 hover:bg-cyan-400/[0.03]"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={statusTone(project.status)}>{project.status}</Tag>
            <span className="data-text text-[10px] uppercase text-zinc-500">{project.goal_type}</span>
          </div>
          <h3 className="mt-2 break-words text-base font-semibold text-zinc-100">{project.name}</h3>
        </div>
        <Target size={18} className="shrink-0 text-cyan-300" />
      </div>

      <ProgressBar value={stats.percent} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="data-text text-sm font-semibold text-zinc-100">
          {formatNumber(stats.completed)} / {formatNumber(stats.target)} {stats.unit}
        </span>
        <span className="data-text text-xs text-cyan-300">{Math.round(stats.percent)}%</span>
      </div>

      <div className="mt-3 grid gap-2">
        <MiniStat label="Sessions" value={sessions.length} />
      </div>
      <p className="mt-3 truncate text-xs text-zinc-500">
        {lastSession ? `Last: ${formatDateTime(lastSession.started_at)} · ${formatDuration(getSessionMinutes(lastSession))}` : 'No sessions logged yet'}
      </p>
    </button>
  );
}

function ProjectDetail({
  activeSession,
  busyId,
  onAddProgress,
  onBack,
  onDeleteMoneyEntry,
  onDeleteProject,
  onDeleteSession,
  onEditMoneyEntry,
  onEditProject,
  onEndSession,
  onOpenMoneyModal,
  onStartSession,
  progressInput,
  project,
  projectMoneyEntries,
  projectMoneyEntriesError,
  projectMoneyEntriesStatus,
  projectSessions,
  projectsError,
  sessionDelta,
  sessionError,
  sessionProof,
  sessionTarget,
  setProgressInput,
  setSessionDelta,
  setSessionProof,
  setSessionTarget,
  tick,
}) {
  const sessions = sortSessions(projectSessions.filter((session) => session.project_id === project.id));
  const stats = getProjectStats(project, sessions);
  const projectActiveSession = activeSession?.project_id === project.id ? activeSession : null;
  const otherActiveSession = activeSession && activeSession.project_id !== project.id ? activeSession : null;
  const activeMinutes = projectActiveSession ? getActiveSessionMinutes(projectActiveSession, tick) : 0;
  const balance = getProjectBalance(projectMoneyEntries);

  return (
    <div className="grid min-w-0 gap-3 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <Panel>
        <div className="grid gap-3 p-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm font-semibold text-zinc-300"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <div className="flex flex-wrap gap-2">
              <IconButton label="Edit project" onClick={() => onEditProject(project)}><Pencil size={15} /></IconButton>
              <IconButton label="Delete project" tone="red" busy={busyId === `project:${project.id}:delete`} onClick={() => onDeleteProject(project)}><Trash2 size={15} /></IconButton>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={statusTone(project.status)}>{project.status}</Tag>
              <span className="data-text text-[10px] uppercase tracking-wider text-zinc-500">{project.goal_type} goal</span>
            </div>
            <h2 className="mt-2 break-words text-2xl font-semibold text-zinc-100">{project.name}</h2>
            {project.notes ? <p className="mt-2 max-w-3xl whitespace-pre-wrap break-words text-sm leading-6 text-zinc-500">{project.notes}</p> : null}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 rounded-md border border-white/5 bg-black/25 p-3">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">Progress</p>
                  <p className="data-text mt-1 text-2xl font-black text-zinc-100">
                    {formatNumber(stats.completed)} / {formatNumber(stats.target)} {stats.unit}
                  </p>
                </div>
                <p className="data-text shrink-0 text-2xl font-black text-cyan-300">{Math.round(stats.percent)}%</p>
              </div>
              <ProgressBar value={stats.percent} />
              <p className="mt-2 text-xs text-zinc-500">
                {formatNumber(Math.max(0, stats.target - stats.completed))} {stats.unit} remaining
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniMetric label="Total Hours" value={formatNumber(stats.totalHours)} tone="text-cyan-300" sub="all sessions" />
              <MiniMetric label="This Week" value={formatNumber(stats.weekHours)} tone="text-emerald-300" sub="sessions" />
              <MiniMetric label="Sessions" value={sessions.length} tone="text-violet-300" sub="proof logs" />
              <MiniMetric label="Started" value={formatShortDate(project.started_on)} tone="text-zinc-100" sub="project date" />
            </div>
          </div>
        </div>
      </Panel>

      <ProjectBalancePanel
        balance={balance}
        busyId={busyId}
        entries={projectMoneyEntries}
        error={projectMoneyEntriesError}
        loading={isInitialLoading(projectMoneyEntriesStatus, projectMoneyEntries)}
        onAddExpense={() => onOpenMoneyModal('expense')}
        onAddRevenue={() => onOpenMoneyModal('revenue')}
        onDelete={onDeleteMoneyEntry}
        onEdit={onEditMoneyEntry}
      />

      {(sessionError || projectsError) ? (
        <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {sessionError || projectsError}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel>
          <PanelHeader eyebrow="Execution" title={projectActiveSession ? 'Active Session' : 'Start Session'} right={<Clock3 size={16} className="text-red-300" />} />
          <div className="grid gap-3 p-3">
            {projectActiveSession ? (
              <div className="grid gap-3">
                <div className="rounded-md border border-red-400/20 bg-red-400/[0.06] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Tag tone="red">active</Tag>
                    <span className="data-text text-xl font-black text-red-200">{formatDuration(activeMinutes)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-zinc-100">{projectActiveSession.target_output || 'Project work session'}</p>
                  <p className="data-text mt-1 text-[11px] text-zinc-500">Started {formatDateTime(projectActiveSession.started_at)}</p>
                </div>
                <TextAreaField label="Proof of Work" value={sessionProof} onChange={setSessionProof} placeholder="What did you actually produce, finish, ship, study, or document?" />
                {project.goal_type !== 'hours' ? (
                  <Field label={`Progress Added This Session (${stats.unit})`} type="number" value={sessionDelta} onChange={setSessionDelta} placeholder="1" />
                ) : null}
                <button
                  type="button"
                  onClick={() => onEndSession(projectActiveSession)}
                  disabled={busyId === `session:${projectActiveSession.id}:end`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-red-400/30 bg-red-400/10 px-4 text-sm font-semibold text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyId === `session:${projectActiveSession.id}:end` ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
                  End Session
                </button>
              </div>
            ) : otherActiveSession ? (
              <div className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] p-3">
                <p className="text-sm font-semibold text-amber-200">Another project session is active.</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">End it before starting a new one. V1 allows one active project session globally.</p>
              </div>
            ) : (
              <>
                <Field label="Target Output" value={sessionTarget} onChange={setSessionTarget} placeholder="Ship feature, study chapter 3, draft post..." />
                <button
                  type="button"
                  onClick={() => onStartSession(project)}
                  disabled={busyId === `project:${project.id}:start`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyId === `project:${project.id}:start` ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  Start Session
                </button>
              </>
            )}
          </div>
        </Panel>

        {project.goal_type !== 'hours' ? (
          <Panel>
            <PanelHeader eyebrow="Manual Progress" title="Add Progress" />
            <div className="grid gap-3 p-3">
              <Field label={`Add ${stats.unit}`} type="number" value={progressInput} onChange={setProgressInput} placeholder="1" />
              <button
                type="button"
                onClick={() => onAddProgress(project)}
                disabled={busyId === `project:${project.id}:progress`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyId === `project:${project.id}:progress` ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Add Progress
              </button>
              <p className="text-xs leading-5 text-zinc-500">Non-hour projects progress from current value. Sessions still track effort and proof.</p>
            </div>
          </Panel>
        ) : null}
      </div>

      <Panel>
        <PanelHeader eyebrow={`${sessions.length} logs`} title="Recent Sessions" />
        <div className="grid gap-2 p-3">
          {sessions.length ? (
            sessions.map((session) => (
              <SessionRow
                key={session.id}
                busyId={busyId}
                onDelete={onDeleteSession}
                project={project}
                session={session}
              />
            ))
          ) : (
            <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-3">
              <p className="text-sm font-semibold text-zinc-100">No sessions yet.</p>
              <p className="mt-1 text-xs text-zinc-500">Start a session to create proof of work.</p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function ProjectBalancePanel({ balance, busyId, entries, error, loading, onAddExpense, onAddRevenue, onDelete, onEdit }) {
  const netTone = balance.netBalance > 0
    ? 'text-emerald-300'
    : balance.netBalance < 0
      ? 'text-amber-300'
      : 'text-zinc-100';
  const subtitle = balance.netBalance > 0
    ? 'Profitable'
    : balance.netBalance < 0
      ? 'Investment phase'
      : 'No money entries yet';
  const recentEntries = entries.slice(0, 6);

  return (
    <Panel>
      <PanelHeader eyebrow="Project Money" title="Project Balance" />
      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-md border border-white/5 bg-black/25 p-4">
          <p className={`data-text text-3xl font-black ${netTone}`}>{formatSignedMoney(balance.netBalance)}</p>
          <p className="mt-1 text-sm font-semibold text-zinc-300">{subtitle}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniMetric label="Spent" value={`EUR ${formatMoney(balance.totalExpenses)}`} tone="text-red-300" sub="expenses" />
            <MiniMetric label="Revenue" value={`EUR ${formatMoney(balance.totalRevenue)}`} tone="text-emerald-300" sub="income" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onAddExpense}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-400/25 bg-red-400/10 px-3 text-sm font-semibold text-red-200"
            >
              <Plus size={16} />
              Add Expense
            </button>
            <button
              type="button"
              onClick={onAddRevenue}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-3 text-sm font-semibold text-emerald-200"
            >
              <Plus size={16} />
              Add Revenue
            </button>
          </div>
        </div>

        <div className="grid min-w-0 gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">Recent Money Entries</p>
            <span className="data-text text-[10px] text-zinc-600">{entries.length} total</span>
          </div>
          {error ? <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
          {loading ? (
            <LoadingState label="Loading project money..." />
          ) : recentEntries.length ? (
            recentEntries.map((entry) => (
              <MoneyEntryRow
                key={entry.id}
                busy={busyId === `money:${entry.id}:delete`}
                entry={entry}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            ))
          ) : (
            <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-3">
              <p className="text-sm font-semibold text-zinc-100">No money entries yet.</p>
              <p className="mt-1 text-xs text-zinc-500">Add project-level expenses or revenue when they happen.</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function MoneyEntryRow({ busy, entry, onDelete, onEdit }) {
  const revenue = entry.type === 'revenue';
  return (
    <article className="min-w-0 rounded-md border border-white/5 bg-black/25 p-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="data-text text-[11px] text-zinc-500">{formatShortDate(entry.entry_date)}</span>
            <Tag tone={revenue ? 'emerald' : 'red'}>{entry.type}</Tag>
            <span className={`data-text text-[11px] font-semibold ${revenue ? 'text-emerald-300' : 'text-red-300'}`}>
              {revenue ? '+' : '-'} EUR {formatMoney(entry.amount)}
            </span>
          </div>
          <p className="mt-1 break-words text-sm font-semibold text-zinc-100">{entry.description || 'No description'}</p>
        </div>
        <div className="flex gap-2">
          <IconButton label="Edit money entry" onClick={() => onEdit(entry)}><Pencil size={15} /></IconButton>
          <IconButton label="Delete money entry" tone="red" busy={busy} onClick={() => onDelete(entry)}><Trash2 size={15} /></IconButton>
        </div>
      </div>
    </article>
  );
}

function SessionRow({ busyId, onDelete, project, session }) {
  const active = !session.ended_at;
  return (
    <article className={`min-w-0 rounded-md border p-3 ${active ? 'border-red-400/20 bg-red-400/[0.06]' : 'border-white/5 bg-black/25'}`}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={active ? 'red' : 'emerald'}>{active ? 'active' : 'completed'}</Tag>
            <span className="data-text text-[11px] text-zinc-500">{formatDateTime(session.started_at)}</span>
            <span className="data-text text-[11px] text-cyan-300">{formatDuration(getSessionMinutes(session))}</span>
          </div>
          {session.target_output ? <p className="mt-2 break-words text-sm font-semibold text-zinc-100">{session.target_output}</p> : null}
          {session.proof_of_work ? <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-zinc-500">{session.proof_of_work}</p> : null}
          {project.goal_type !== 'hours' && Number(session.progress_delta ?? 0) > 0 ? (
            <p className="data-text mt-2 text-[11px] text-emerald-300">+{formatNumber(session.progress_delta)} {unitLabel(project)}</p>
          ) : null}
        </div>
        <IconButton label="Delete session" tone="red" busy={busyId === `session:${session.id}:delete`} onClick={() => onDelete(session)}><Trash2 size={15} /></IconButton>
      </div>
    </article>
  );
}

function ProjectModal({ editing, error, form, onChange, onClose, onSubmit, saveStatus }) {
  useEffect(() => {
    const bodyStyle = document.body.style;
    const rootStyle = document.documentElement.style;
    const previousBody = { overflow: bodyStyle.overflow, overscrollBehavior: bodyStyle.overscrollBehavior };
    const previousRoot = { overflow: rootStyle.overflow, overscrollBehavior: rootStyle.overscrollBehavior };
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
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex min-w-0 items-stretch justify-stretch overflow-hidden bg-[#0f0f0f] backdrop-blur sm:items-center sm:justify-center sm:bg-black/70 sm:p-4">
      <div
        className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-full flex-col overflow-hidden border-0 border-white/10 bg-[#0f0f0f] shadow-2xl sm:h-auto sm:max-h-[min(84dvh,680px)] sm:max-w-2xl sm:rounded-xl sm:border"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-editor-title"
      >
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-white/5 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] sm:px-3 sm:py-2.5">
          <div className="min-w-0">
            <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">{editing ? 'Edit Project' : 'Create Project'}</p>
            <h3 id="project-editor-title" className="truncate text-lg font-semibold text-zinc-100">{editing ? 'Update Ops Target' : 'New Ops Target'}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-white/10 bg-black/30 text-zinc-300"
            aria-label="Close project editor"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain sm:overflow-hidden">
          <div className="grid min-w-0 gap-3 p-4 sm:min-h-0 sm:flex-1 sm:grid-cols-2 sm:overflow-y-auto sm:p-3">
            <div className="sm:col-span-2">
              <Field label="Project Name" value={form.name} onChange={(value) => onChange('name', value)} placeholder="AI OFM Business, School Biology..." />
            </div>
            <SelectField label="Goal Type" value={form.goal_type} options={goalTypes} onChange={(value) => onChange('goal_type', value)} />
            <SelectField label="Status" value={form.status} options={statuses} onChange={(value) => onChange('status', value)} />
            <Field label="Target Value" type="number" value={form.target_value} onChange={(value) => onChange('target_value', value)} placeholder="400" />
            <Field label="Unit Label" value={form.unit_label} onChange={(value) => onChange('unit_label', value)} placeholder="hours, chapters, posts" />
            <Field label="Goal Label" value={form.goal_label} onChange={(value) => onChange('goal_label', value)} placeholder="Hours, Chapters, Features" />
            {form.goal_type !== 'hours' ? (
              <Field label="Current Value" type="number" value={form.current_value} onChange={(value) => onChange('current_value', value)} placeholder="0" />
            ) : (
              <div className="rounded-md border border-white/5 bg-black/25 p-3">
                <p className="data-text text-[10px] uppercase text-zinc-500">Current Value</p>
                <p className="mt-1 text-sm text-zinc-400">Hour goals calculate progress from sessions.</p>
              </div>
            )}
            <Field label="Started On" type="date" value={form.started_on} onChange={(value) => onChange('started_on', value)} />
            <div className="sm:col-span-2">
              <TextAreaField label="Notes" value={form.notes} onChange={(value) => onChange('notes', value)} placeholder="Scope, constraints, strategy..." />
            </div>
            {error ? <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200 sm:col-span-2">{error}</div> : null}
            <div className="grid min-w-0 gap-2 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:hidden">
              <ProjectFormActions editing={editing} onClose={onClose} saveStatus={saveStatus} />
            </div>
          </div>
          <div className="hidden min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-white/5 p-3 sm:grid">
            <ProjectFormActions editing={editing} onClose={onClose} saveStatus={saveStatus} />
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectMoneyModal({ editing, error, form, onChange, onClose, onSubmit, saveStatus }) {
  useEffect(() => {
    const bodyStyle = document.body.style;
    const rootStyle = document.documentElement.style;
    const previousBody = { overflow: bodyStyle.overflow, overscrollBehavior: bodyStyle.overscrollBehavior };
    const previousRoot = { overflow: rootStyle.overflow, overscrollBehavior: rootStyle.overscrollBehavior };
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
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const title = form.type === 'revenue' ? 'Revenue' : 'Expense';

  return (
    <div className="fixed inset-0 z-50 flex min-w-0 items-stretch justify-stretch overflow-hidden bg-[#0f0f0f] backdrop-blur sm:items-center sm:justify-center sm:bg-black/70 sm:p-4">
      <div
        className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-full flex-col overflow-hidden border-0 border-white/10 bg-[#0f0f0f] shadow-2xl sm:h-auto sm:max-h-[min(82dvh,520px)] sm:max-w-lg sm:rounded-xl sm:border"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-money-editor-title"
      >
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-white/5 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] sm:px-3 sm:py-2.5">
          <div className="min-w-0">
            <p className="data-text text-[10px] uppercase tracking-wider text-zinc-500">{editing ? 'Edit Money Entry' : `Add ${title}`}</p>
            <h3 id="project-money-editor-title" className="truncate text-lg font-semibold text-zinc-100">Project {title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-white/10 bg-black/30 text-zinc-300"
            aria-label="Close project money editor"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
          <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-2 sm:p-3">
            <SelectField label="Type" value={form.type} options={['expense', 'revenue']} onChange={(value) => onChange('type', value)} />
            <Field label="Date" type="date" value={form.entry_date} onChange={(value) => onChange('entry_date', value)} />
            <div className="sm:col-span-2">
              <Field label="Amount" type="number" value={form.amount} onChange={(value) => onChange('amount', value)} placeholder="25" />
            </div>
            <div className="sm:col-span-2">
              <Field label="Description" value={form.description} onChange={(value) => onChange('description', value)} placeholder="ChatGPT Plus, first payment..." />
            </div>
            {error ? <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200 sm:col-span-2">{error}</div> : null}
          </div>
          <div className="grid min-w-0 gap-2 border-t border-white/5 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:grid-cols-[minmax(0,1fr)_auto] sm:p-3">
            <button
              type="submit"
              disabled={saveStatus === 'saving'}
              className="flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveStatus === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saveStatus === 'saving' ? 'Saving Entry' : editing ? 'Update Entry' : `Add ${title}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 w-full min-w-0 rounded-md border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-zinc-300 sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectFormActions({ editing, onClose, saveStatus }) {
  return (
    <>
      <button
        type="submit"
        disabled={saveStatus === 'saving'}
        className="flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saveStatus === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saveStatus === 'saving' ? 'Saving Project' : editing ? 'Update Project' : 'Create Project'}
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

function Field({ label, onChange, placeholder = '', type = 'text', value }) {
  return (
    <label className="block min-w-0 space-y-1 overflow-hidden">
      <span className="data-text block text-[10px] uppercase text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full min-w-0 max-w-full rounded-md border border-white/10 bg-black/40 px-3 text-[16px] text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-400/50"
      />
    </label>
  );
}

function SelectField({ label, onChange, options, value }) {
  return (
    <label className="block min-w-0 space-y-1 overflow-hidden">
      <span className="data-text block text-[10px] uppercase text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full min-w-0 max-w-full appearance-none rounded-md border border-white/10 bg-black/40 px-3 text-[16px] capitalize text-zinc-100 outline-none focus:border-cyan-400/50"
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TextAreaField({ label, onChange, placeholder = '', value }) {
  return (
    <label className="block min-w-0 space-y-1 overflow-hidden">
      <span className="data-text block text-[10px] uppercase text-zinc-500">{label}</span>
      <textarea
        rows={4}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 w-full min-w-0 max-w-full resize-y rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[16px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-400/50"
      />
    </label>
  );
}

function IconButton({ busy, children, label, onClick, tone = 'zinc' }) {
  const toneClass = tone === 'red'
    ? 'border-red-400/20 bg-red-400/10 text-red-300 hover:border-red-300/45'
    : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-cyan-400/30 hover:text-cyan-200';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={busy}
      className={`grid h-10 w-10 place-items-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : children}
    </button>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
      <div className="h-full rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.3)]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="min-w-0 rounded-md border border-white/5 bg-black/25 px-2 py-1.5">
      <p className="truncate text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="data-text truncate text-sm font-bold text-zinc-100">{value}</p>
    </div>
  );
}

function LoadingState({ label }) {
  return (
    <div className="rounded-md border border-cyan-400/10 bg-cyan-400/[0.03] p-3">
      <p className="data-text text-sm font-medium text-cyan-300">{label}</p>
    </div>
  );
}

function EmptyProjects({ onCreate }) {
  return (
    <div className="rounded-md border border-dashed border-white/10 bg-black/20 p-5 text-center">
      <Briefcase size={28} className="mx-auto text-cyan-300" />
      <p className="mt-3 text-lg font-semibold text-zinc-100">No projects yet.</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-zinc-500">Create a serious goal, then log work sessions as proof of execution.</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-200"
      >
        <Plus size={16} />
        Create Project
      </button>
    </div>
  );
}

function getProjectStats(project, sessions = []) {
  const totalMinutes = sessions.reduce((sum, session) => sum + getSessionMinutes(session), 0);
  const totalHours = totalMinutes / 60;
  const weekHours = sessions.filter((session) => isThisWeek(session.started_at)).reduce((sum, session) => sum + getSessionMinutes(session) / 60, 0);
  const target = Number(project.target_value ?? 0);
  const completed = project.goal_type === 'hours' ? totalHours : Number(project.current_value ?? 0);
  const percent = target > 0 ? Math.min(100, (completed / target) * 100) : 0;
  return {
    completed,
    percent,
    target,
    totalHours,
    unit: unitLabel(project),
    weekHours,
  };
}

function getProjectBalance(entries = []) {
  const totalExpenses = entries
    .filter((entry) => entry.type === 'expense')
    .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const totalRevenue = entries
    .filter((entry) => entry.type === 'revenue')
    .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  return {
    netBalance: totalRevenue - totalExpenses,
    totalExpenses,
    totalRevenue,
  };
}

function getSessionMinutes(session) {
  if (session.duration_minutes !== null && session.duration_minutes !== undefined && Number.isFinite(Number(session.duration_minutes))) {
    return Number(session.duration_minutes);
  }
  if (!session.ended_at) return getActiveSessionMinutes(session);
  return Math.max(0, Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000));
}

function getActiveSessionMinutes(session) {
  return Math.max(0, Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000));
}

function sortSessions(sessions) {
  return sessions.slice().sort((a, b) => new Date(b.started_at ?? b.created_at ?? 0) - new Date(a.started_at ?? a.created_at ?? 0));
}

function validateProjectForm(form) {
  if (!form.name.trim()) return 'Project name is required.';
  const target = Number(String(form.target_value).replace(',', '.'));
  if (!Number.isFinite(target) || target <= 0) return 'Target value must be greater than 0.';
  if (!statuses.includes(form.status)) return 'Choose a valid status.';
  if (!goalTypes.includes(form.goal_type)) return 'Choose a valid goal type.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.started_on)) return 'Choose a valid start date.';
  return '';
}

function defaultGoalLabel(goalType) {
  if (goalType === 'hours') return 'Hours';
  if (goalType === 'tasks') return 'Tasks';
  if (goalType === 'content') return 'Posts';
  if (goalType === 'units') return 'Units';
  return 'Goal';
}

function defaultUnitLabel(goalType) {
  if (goalType === 'hours') return 'hours';
  if (goalType === 'tasks') return 'tasks';
  if (goalType === 'content') return 'posts';
  if (goalType === 'units') return 'units';
  return 'units';
}

function unitLabel(project) {
  return project.unit_label || project.goal_label || defaultUnitLabel(project.goal_type);
}

function statusTone(status) {
  if (status === 'active') return 'cyan';
  if (status === 'paused') return 'amber';
  if (status === 'completed') return 'emerald';
  return 'zinc';
}

function isInitialLoading(status, rows) {
  return (status === 'idle' || status === 'loading') && rows.length === 0;
}

function isThisWeek(value) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return date >= start && date < end;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatMoney(value) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSignedMoney(value) {
  const amount = Number(value ?? 0);
  const prefix = amount > 0 ? '+ ' : amount < 0 ? '- ' : '';
  return `${prefix}EUR ${formatMoney(Math.abs(amount))}`;
}

function formatDuration(minutes) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

function formatDateTime(value) {
  if (!value) return '--';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(value) {
  if (!value) return '--';
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
