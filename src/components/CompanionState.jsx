import { Loader2, Pencil, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { companionAppApi } from '../services/lifeosApi';
import { useLifeOS } from '../context/LifeOSContext';
import { CompanionPermissionControls } from './ProjectWatch';

export function CompanionState({ onCorrect }) {
  const { authUser } = useLifeOS();
  return <CompanionStateContent key={authUser?.id} onCorrect={onCorrect} />;
}

function CompanionStateContent({ onCorrect }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const mutation = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    const controller = new AbortController();
    setData(null);
    setError('');
    companionAppApi.context(controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result);
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => { generation.current += 1; controller.abort(); };
  }, [revision]);
  const changePermission = async (permission, enabled) => {
    if (mutation.current) return;
    mutation.current = true;
    const started = generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await companionAppApi.setPermission(permission, enabled, crypto.randomUUID());
      if (started === generation.current) setData((previous) => ({ ...previous, permissions: result.permissions }));
    } catch (failure) { if (started === generation.current) setError(failure.message); }
    finally { mutation.current = false; if (started === generation.current) setBusy(false); }
  };
  return <section aria-label="Current Companion state" className="grid gap-5">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Current understanding</h3>
      <button type="button" className="icon-button" title="Refresh current understanding" aria-label="Refresh current understanding" disabled={busy} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} /></button>
    </div>
    {!data && !error ? <Loader2 size={18} className="animate-spin text-zinc-400" aria-label="Loading Companion state" /> : null}
    {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
    {data ? <>
      {data.assumptions.length ? <dl>{data.assumptions.map((item) => <div key={`${item.kind}:${item.label}`} className="flex items-start gap-3 border-b border-white/10 py-3">
        <div className="min-w-0 flex-1"><dt className="text-xs text-zinc-500">{item.label}{item.uncertain ? ' · Not certain' : ''}</dt><dd className="mt-1 break-words text-sm text-zinc-200">{item.text}</dd></div>
        <button type="button" className="icon-button" title={`Correct ${item.label}`} aria-label={`Correct ${item.label}`} onClick={() => onCorrect(item)}><Pencil size={15} /></button>
      </div>)}</dl> : <p className="text-sm text-zinc-500">No current assumptions recorded.</p>}
      <section aria-label="Project Watches"><h3 className="text-sm font-semibold">Project Watches</h3>
        {data.watches.length ? data.watches.map((watch, index) => <div key={`${watch.project_name}:${index}`} className="border-b border-white/10 py-3">
          <p className="break-words text-sm text-zinc-200">{watch.project_name}</p>
          <p className="mt-1 text-xs text-zinc-400">{watch.state === 'active' ? (data.permissions.monitor ? 'Watching' : 'Permission paused') : watch.state === 'suspended' ? 'Suspended' : 'Expired'}</p>
        </div>) : <p className="mt-2 text-sm text-zinc-500">No active project Watches.</p>}
      </section>
      <section aria-label="Companion permissions"><h3 className="text-sm font-semibold">Allowed without asking each time</h3>
        <CompanionPermissionControls permissions={data.permissions} disabled={busy} onChange={changePermission} />
      </section>
    </> : null}
  </section>;
}
