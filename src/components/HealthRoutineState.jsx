import { ArrowUpRight, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { companionAppApi } from '../services/lifeosApi';
import { formatRoutineState, routineStateLabels } from '../utils/routineState';

export function HealthRoutineState() {
  const { authUser, setActiveTab } = useLifeOS();
  if (!authUser) return null;
  return <RoutineStateContent key={authUser.id} onOpenCompanion={() => setActiveTab('assistant')} />;
}

function RoutineStateContent({ onOpenCompanion }) {
  const [routines, setRoutines] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    companionAppApi.context(controller.signal).then((data) => {
      if (!controller.signal.aborted) setRoutines((data.assumptions || []).filter((item) => item.kind === 'routine' && Object.hasOwn(routineStateLabels, item.text)));
    }).catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setRevision((value) => value + 1); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);
  if (!loading && !error && !routines?.length) return null;
  return <section aria-label="Current routines" className="border-t border-white/10 pt-4">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-zinc-200">Current routines</h3>
      <button type="button" className="icon-button" disabled={loading} aria-label="Refresh routines" title="Refresh routines" onClick={() => setRevision((value) => value + 1)}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
      </button>
    </div>
    {error ? <p role="alert" className="mt-2 text-sm text-amber-300">Routine state is unavailable.</p> : <dl className="mt-1 divide-y divide-white/10">
      {(routines || []).map((item) => <div key={item.label} className="flex min-w-0 items-start justify-between gap-4 py-3">
        <dt className="break-words text-sm text-zinc-300">{item.label}</dt>
        <dd className="text-right text-sm text-zinc-400">{formatRoutineState(item.text, item.uncertain)}</dd>
      </div>)}
    </dl>}
    {!error && routines?.length ? <button type="button" onClick={onOpenCompanion} className="mt-1 flex min-h-11 items-center gap-2 text-sm text-zinc-300">Companion<ArrowUpRight size={16} /></button> : null}
  </section>;
}
