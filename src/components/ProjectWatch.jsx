import { Eye, Loader2, Pause, Play, RefreshCw, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { companionAppApi } from '../services/lifeosApi';
import { useLifeOS } from '../context/LifeOSContext';

export function ProjectWatch({ project }) {
  const { authUser } = useLifeOS();
  return <ProjectWatchState key={`${authUser?.id}:${project.id}`} project={project} />;
}

function ProjectWatchState({ project }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [revision, setRevision] = useState(0);
  const [retireConfirm, setRetireConfirm] = useState(false);
  const generation = useRef(0);
  const mutation = useRef(false);
  useEffect(() => {
    generation.current += 1;
    const controller = new AbortController();
    setData(null);
    setError('');
    companionAppApi.watch(project.id, controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result);
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => { generation.current += 1; controller.abort(); };
  }, [project.id, project.status, revision]);

  const change = async (operation, permission, enabled) => {
    if (mutation.current) return;
    mutation.current = true;
    const started = generation.current;
    setBusy(operation);
    setError('');
    try {
      const result = operation === 'permission'
        ? await companionAppApi.setPermission(permission, enabled, crypto.randomUUID())
        : await companionAppApi.setWatch(project.id, operation, data?.watch?.id);
      if (generation.current === started) {
        setData((previous) => operation === 'permission' ? { ...previous, permissions: result.permissions } : result);
        setRetireConfirm(false);
      }
    } catch (failure) { if (generation.current === started) setError(failure.message); }
    finally { mutation.current = false; setBusy(''); }
  };
  const state = data?.watch?.state || 'off';
  const terminal = ['retired', 'expired'].includes(state);
  const watching = state === 'active' && data?.permissions.monitor;
  const label = state === 'active' ? (watching ? 'Watching' : 'Permission paused') : ({ off: 'Off', suspended: 'Suspended', retired: 'Retired', expired: 'Expired' }[state] || 'Unavailable');
  const canEnable = data && !terminal && state !== 'active' && project.status === 'active' && data.permissions.monitor;
  const labels = { priority_state: 'Priority', current_focus: 'Current focus', next_action: 'Next action', context_summary: 'Context' };

  return <section aria-label="LifeOS Watch" className="border-t border-white/10 py-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-base font-semibold"><Eye size={18} />LifeOS Watch</h3>
      <span className={watching ? 'text-sm text-emerald-300' : 'text-sm text-zinc-400'}>{data ? label : error ? 'Unavailable' : 'Loading'}</span>
    </div>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Checks for lost momentum on this project. A check does not guarantee a message.</p>
    {data ? <>
      {data.context?.length ? <dl className="mt-4 grid gap-3 sm:grid-cols-2">{data.context.map((item) => <div key={item.field}>
        <dt className="text-xs text-zinc-500">{labels[item.field]}</dt><dd className="mt-1 break-words text-sm text-zinc-200">{item.field === 'priority_state' ? item.text.replaceAll('_', ' ') : item.text}</dd>
      </div>)}</dl> : null}
      {data.watch ? <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-400">
        <span>Last checked: {formatTime(data.watch.last_checked_at)}</span>
        <span>Last intervention queued: {formatTime(data.watch.last_triggered_at)}</span>
      </div> : null}
      {!data.permissions.message ? <p className="mt-3 text-sm text-zinc-400">WhatsApp outreach is off. Watch can check silently.</p> : null}
      {!data.permissions.monitor ? <p className="mt-3 text-sm text-amber-200">Project monitoring is off in Companion permissions.</p> : null}
      {terminal ? <p className="mt-3 text-sm text-zinc-400">This Watch has ended and cannot be resumed.</p> : null}
      {project.status !== 'active' ? <p className="mt-3 text-sm text-zinc-400">Watch can only be enabled for an active project.</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {canEnable ? <button className="primary-button" disabled={Boolean(busy)} onClick={() => change('enable')}><Play size={16} />{state === 'suspended' ? 'Resume Watch' : 'Enable Watch'}</button> : null}
        {state === 'active' ? <button className="flex min-h-11 items-center gap-2 rounded border border-white/20 px-4 text-sm" disabled={Boolean(busy)} onClick={() => change('suspend')}><Pause size={16} />Suspend Watch</button> : null}
        {data.watch && !terminal ? <button className="flex min-h-11 items-center gap-2 rounded border border-white/20 px-4 text-sm" disabled={Boolean(busy)} onClick={() => retireConfirm ? change('retire') : setRetireConfirm(true)}><Square size={16} />{retireConfirm ? 'Confirm retirement' : 'Retire Watch'}</button> : null}
        {retireConfirm ? <button className="min-h-11 px-3 text-sm text-zinc-400" onClick={() => setRetireConfirm(false)}>Keep Watch</button> : null}
        {busy ? <Loader2 size={18} className="my-3 animate-spin" aria-label="Saving Watch" /> : null}
      </div>
      <details className="mt-4 border-t border-white/10 pt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm text-zinc-400">Companion permissions</summary>
        <CompanionPermissionControls permissions={data.permissions} disabled={Boolean(busy)} onChange={(permission, enabled) => change('permission', permission, enabled)} />
      </details>
    </> : null}
    {error ? <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-red-300"><span>{error}</span><button className="icon-button" aria-label="Reload Watch" title="Reload Watch" disabled={Boolean(busy)} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} /></button></div> : null}
  </section>;
}

export function CompanionPermissionControls({ permissions, disabled, onChange }) {
  return <div className="grid gap-4 py-2">{[
    ['monitor', 'Allow project monitoring', 'Let LifeOS check supported projects for lost momentum.'],
    ['message', 'Allow proactive messages', 'Let approved Companion interventions reach WhatsApp. Quiet hours and attention limits still apply.'],
  ].map(([key, label, description]) => <label key={key} className="flex min-h-12 cursor-pointer items-start gap-3">
    <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-zinc-300" checked={Boolean(permissions?.[key])} disabled={disabled} onChange={(event) => onChange(key, event.target.checked)} />
    <span><span className="block text-sm text-zinc-100">{label}</span><span className="mt-1 block max-w-xl text-xs leading-5 text-zinc-400">{description}</span></span>
  </label>)}</div>;
}

function formatTime(value) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString('en-GB', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
