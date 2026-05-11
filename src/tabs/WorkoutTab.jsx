import { ChevronDown, Database, Dumbbell, Flame, History, Plus, Timer, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Sparkline, Tag } from '../components/ui';

const today = new Date().toISOString().slice(0, 10);

export function WorkoutTab() {
  const {
    createWorkoutSet,
    deleteWorkoutSet,
    expandedWorkout,
    isSupabaseConfigured,
    setExpandedWorkout,
    workout,
    workoutSets,
    workoutSetsError,
    workoutSetsStatus,
  } = useLifeOS();
  const [form, setForm] = useState({
    exercise: workout.current.name,
    weight: workout.current.inputs.weight,
    reps: workout.current.inputs.reps,
    rpe: workout.current.inputs.rpe,
    date: today,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const minutes = Math.floor(workout.restTimerSeconds / 60);
  const seconds = String(workout.restTimerSeconds % 60).padStart(2, '0');
  const recentVolume = useMemo(
    () => workoutSets.reduce((total, set) => total + Number(set.weight) * Number(set.reps), 0),
    [workoutSets],
  );

  const updateForm = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const submitSet = async (event) => {
    event.preventDefault();
    setFormError('');

    if (!form.exercise.trim()) {
      setFormError('Exercise is required.');
      return;
    }

    setSaving(true);
    try {
      await createWorkoutSet(form);
      setForm((prev) => ({ ...prev, reps: '', rpe: prev.rpe || 8 }));
    } catch (error) {
      setFormError(error.message || 'Failed to save set.');
    } finally {
      setSaving(false);
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

          <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <div className="flex items-center gap-2">
                <Dumbbell size={18} className="text-cyan-300" />
                <p className="text-lg font-semibold text-zinc-100">{workout.current.name}</p>
              </div>
              <p className="data-text mt-1 text-xs text-zinc-500">
                {workout.current.block} / set {workout.current.set} of {workout.current.totalSets} / {workout.current.target}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniMetric label="Previous" value={`${workout.current.previous.weight}kg`} tone="text-zinc-100" sub={`${workout.current.previous.reps} reps`} />
                <MiniMetric label="Target RPE" value="8.0" tone="text-amber-300" sub="controlled" />
                <MiniMetric label="Volume Pace" value="+4%" tone="text-emerald-300" sub="vs last" />
              </div>
            </div>

            <form onSubmit={submitSet} className="grid grid-cols-2 gap-2 xl:grid-cols-[1.2fr_0.7fr_0.55fr_0.55fr_0.7fr_44px]">
              <SetField label="Exercise" value={form.exercise} onChange={(value) => updateForm('exercise', value)} />
              <SetField label="Weight" type="number" value={form.weight} suffix="kg" onChange={(value) => updateForm('weight', value)} />
              <SetField label="Reps" type="number" value={form.reps} onChange={(value) => updateForm('reps', value)} />
              <SetField label="RPE" type="number" step="0.5" value={form.rpe} onChange={(value) => updateForm('rpe', value)} />
              <SetField label="Date" type="date" value={form.date} onChange={(value) => updateForm('date', value)} />
              <button
                type="submit"
                disabled={saving || !isSupabaseConfigured}
                className="mt-5 grid h-[54px] place-items-center rounded-md border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
                title="Save set"
              >
                <Plus size={20} />
              </button>
              {formError ? <p className="col-span-full data-text text-[11px] text-red-300">{formError}</p> : null}
            </form>
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 xl:col-span-5">
        <PanelHeader
          eyebrow="Supabase Log"
          title="Persisted Sets"
          right={<SourceStatus status={workoutSetsStatus} configured={isSupabaseConfigured} />}
        />
        <div className="grid grid-cols-3 gap-2 border-b border-white/5 p-3">
          <MiniMetric label="Rows" value={workoutSets.length} tone="text-cyan-300" sub="loaded" />
          <MiniMetric label="Volume" value={Math.round(recentVolume).toLocaleString()} tone="text-emerald-300" sub="kg x reps" />
          <MiniMetric label="Source" value={isSupabaseConfigured ? 'DB' : 'MOCK'} tone={isSupabaseConfigured ? 'text-emerald-300' : 'text-amber-300'} sub="workout sets" />
        </div>
        {workoutSetsError ? <p className="border-b border-white/5 px-3 py-2 data-text text-[11px] text-red-300">{workoutSetsError}</p> : null}
        {!isSupabaseConfigured ? (
          <div className="p-3">
            <div className="rounded-md border border-amber-400/20 bg-amber-400/10 p-3">
              <p className="text-sm font-medium text-amber-200">Supabase env missing</p>
              <p className="mt-1 text-xs leading-5 text-amber-100/70">
                Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env.local`, run `supabase/schema.sql`,
                then restart the dev server.
              </p>
            </div>
          </div>
        ) : (
          <div className="thin-scrollbar max-h-[370px] divide-y divide-white/5 overflow-y-auto">
            {workoutSets.length ? (
              workoutSets.map((set) => (
                <div key={set.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-100">{set.exercise}</p>
                    <p className="data-text mt-1 text-[11px] text-zinc-500">
                      {formatDate(set.performed_at)} / {Number(set.weight)}kg x {set.reps} / RPE {Number(set.rpe)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteWorkoutSet(set.id)}
                    className="grid h-8 w-8 place-items-center rounded-md border border-red-400/20 bg-red-400/10 text-red-300"
                    title="Delete set"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            ) : (
              <div className="p-3 text-sm text-zinc-500">No persisted sets yet.</div>
            )}
          </div>
        )}
      </Panel>

      <Panel className="col-span-12 xl:col-span-7">
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

      <Panel className="col-span-12">
        <PanelHeader eyebrow="History" title="Collapsed Workout Log" right={<History size={16} className="text-cyan-300" />} />
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
          className="data-text min-w-0 flex-1 bg-transparent text-lg font-black text-zinc-100 outline-none md:text-2xl"
        />
        {suffix ? <span className="data-text pb-1 text-sm text-zinc-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

function SourceStatus({ status, configured }) {
  const label = !configured ? 'OFFLINE' : status === 'loading' ? 'SYNCING' : status === 'error' ? 'ERROR' : 'LIVE';
  const tone = !configured
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

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}
