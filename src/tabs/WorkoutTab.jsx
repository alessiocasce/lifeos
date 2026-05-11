import { ChevronDown, Dumbbell, Flame, History, Timer } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { MiniMetric, Panel, PanelHeader, Sparkline, Tag } from '../components/ui';

export function WorkoutTab() {
  const { expandedWorkout, setExpandedWorkout, workout } = useLifeOS();
  const minutes = Math.floor(workout.restTimerSeconds / 60);
  const seconds = String(workout.restTimerSeconds % 60).padStart(2, '0');

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

            <div className="grid grid-cols-3 gap-2">
              <SetInput label="Weight" value={workout.current.inputs.weight} suffix="kg" />
              <SetInput label="Reps" value={workout.current.inputs.reps} suffix="" />
              <SetInput label="RPE" value={workout.current.inputs.rpe} suffix="" />
            </div>
          </div>
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

function SetInput({ label, value, suffix }) {
  return (
    <label className="rounded-md border border-white/5 bg-[#121212] p-3">
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="mt-2 flex items-end gap-1">
        <input
          type="number"
          defaultValue={value}
          className="data-text min-w-0 flex-1 bg-transparent text-4xl font-black text-zinc-100 outline-none"
        />
        {suffix ? <span className="data-text pb-1 text-sm text-zinc-500">{suffix}</span> : null}
      </div>
    </label>
  );
}
