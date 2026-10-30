import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Share2, ShieldOff, X } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { communityApi } from '../services/lifeosApi';
import { t, formatDate } from '../i18n';
import { SharedWorkoutSets } from './SharedWorkout';

export function WorkoutSharing({ workout }) {
  const { authUser } = useLifeOS();
  return authUser && workout.ended_at && workout.workout_sets?.length ? <SharingControls key={`${authUser.id}:${workout.id}`} userId={authUser.id} workout={workout} /> : null;
}

function SharingControls({ userId, workout }) {
  const { userSettings, setActiveTab } = useLifeOS();
  const [shareId, setShareId] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(false);
  const [rpe, setRpe] = useState(true);
  const [preview, setPreview] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const alive = useRef(true);
  const dialog = useRef(null);
  const preferences = userSettings?.preferences;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let current = true; setReady(false); setError(false);
    communityApi.status(userId, workout.id).then(id => { if (current) { setShareId(id); setReady(true); } }).catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [userId, workout.id, workout.updated_at, refresh]);
  useEffect(() => {
    if (!open) return;
    let current = true; setPreview(null); setError(false);
    communityApi.preview(userId, workout.id, notes, rpe).then(value => { if (current) setPreview(value); }).catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [open, notes, rpe, userId, workout.id]);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  const withdraw = async () => {
    if (busy) return; setBusy(true); setError(false);
    try { await communityApi.withdraw(userId, workout.id); if (alive.current) setShareId(null); }
    catch { if (alive.current) setError(true); }
    finally { if (alive.current) setBusy(false); }
  };
  const publish = async () => {
    if (busy || !preview) return; setBusy(true); setError(false);
    try { const value = await communityApi.publish(userId, workout.id, notes, rpe); if (alive.current) { setShareId(value.id); setOpen(false); } }
    catch { if (alive.current) setError(true); }
    finally { if (alive.current) setBusy(false); }
  };
  const view = () => { setActiveTab('community'); window.location.hash = `share=${shareId}`; };
  const allowed = userSettings?.status === 'ready' && preferences?.workout_sharing && userSettings.profile;
  return <div className="my-4 border-y border-white/10 py-3 text-sm">
    {shareId ? <div className="flex flex-wrap gap-x-5 gap-y-1">
      <button type="button" onClick={view} className="flex min-h-11 items-center gap-2"><ExternalLink size={16} />{t('View in Community')}</button>
      <button type="button" disabled={busy} onClick={withdraw} className="flex min-h-11 items-center gap-2 text-zinc-400"><ShieldOff size={16} />{t('Stop sharing')}</button>
    </div> : allowed ? <button type="button" disabled={!ready} onClick={() => { setNotes(false); setRpe(true); setOpen(true); }} className="flex min-h-11 items-center gap-2"><Share2 size={16} />{t('Share with Community')}</button> : <>
      <p className="text-zinc-400">{t('Workout sharing is off or your public profile is incomplete.')}</p>
      <button type="button" className="min-h-11 underline underline-offset-4" onClick={() => setActiveTab('settings')}>{t('Open Training privacy settings')}</button>
    </>}
    {error && !open ? <p role="alert" className="text-amber-200">{t('Sharing failed. Refresh and try again.')}<button type="button" className="ml-3 min-h-11 underline" onClick={() => setRefresh(n => n + 1)}>{t('Retry')}</button></p> : null}
    {open ? createPortal(<dialog ref={dialog} aria-labelledby="share-preview-title" className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-md border border-white/15 bg-[#111316] p-5 text-zinc-100 backdrop:bg-black/75" onCancel={e => { if (busy) e.preventDefault(); else setOpen(false); }}>
      <div className="flex items-center justify-between gap-3"><h2 id="share-preview-title" className="text-lg font-semibold">{t('Share preview')}</h2><button type="button" disabled={busy} className="icon-button" aria-label={t('Close share preview')} onClick={() => setOpen(false)}><X size={20} /></button></div>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">{t('Other signed-in LifeOS members can see this workout. You can stop sharing at any time.')}</p>
      <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={busy || !preferences?.share_workout_notes} checked={notes} onChange={e => setNotes(e.target.checked)} />{t('Include workout and set notes')}</label>
      {!preferences?.share_workout_notes ? <p className="text-xs text-zinc-400">{t('Notes are private. Enable notes sharing in Settings to include them.')}</p> : null}
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={busy} checked={rpe} onChange={e => setRpe(e.target.checked)} />{t('Include RPE')}</label>
      {preview ? <><h3 className="mt-5 break-words font-semibold">{preview.title}</h3><p className="text-xs text-zinc-400">{formatDate(preview.performed_on)}</p><SharedWorkoutSets share={preview} /></> : !error ? <p role="status" className="py-5">{t('Loading preview...')}</p> : null}
      {error ? <p role="alert" className="py-3 text-sm text-amber-200">{t('Sharing failed. Refresh and try again.')}</p> : null}
      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4"><button type="button" disabled={busy} className="min-h-11 px-3 text-sm text-zinc-400" onClick={() => setOpen(false)}>{t('Cancel')}</button><button type="button" disabled={busy || !preview} onClick={publish} className="flex min-h-11 items-center gap-2 rounded border border-white/20 px-4 text-sm disabled:opacity-40"><Share2 size={16} />{busy ? t('Publishing...') : t('Confirm sharing')}</button></div>
    </dialog>, document.body) : null}
  </div>;
}
