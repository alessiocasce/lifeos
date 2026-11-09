import { useCallback, useEffect, useRef, useState } from 'react';
import { Timer, X } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { TrainingSheet } from './TrainingSheet';
import { workoutRestApi } from '../services/workoutRestApi';
import { timerPresentation } from '../utils/workoutRest';
import { t, useLanguage } from '../i18n';
import '../styles/workoutRest.css';

export function WorkoutRestTimer({ session }) {
  const { authUser } = useLifeOS();
  useLanguage();
  const [data, setData] = useState(null), [error, setError] = useState(''), [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now());
  const generation = useRef(0), saving = useRef(false), trigger = useRef(null);
  const userId = authUser?.id, sessionId = session?.id;
  const scope = useRef('');
  scope.current = `${userId}:${sessionId}`;
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!userId || !sessionId) return;
    try { const next = await workoutRestApi.read(sessionId); if (request === generation.current) { setData(next); setError(''); } }
    catch (e) { if (request === generation.current) setError(e.message); }
  }, [userId, sessionId]);
  useEffect(() => {
    setData(null); setError(''); setOpen(false); setBusy(false); saving.current = false; refresh();
    const saved = event => { if (event.detail?.userId === userId && event.detail?.sessionId === sessionId) refresh(); };
    const resumed = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('lifeos:workout-set-saved', saved);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', resumed);
    return () => { generation.current++; window.removeEventListener('lifeos:workout-set-saved', saved); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', resumed); };
  }, [refresh, userId, sessionId]);
  const deadline = data?.preference.enabled && data?.timer?.scheduled_for;
  useEffect(() => { if (!deadline) return; setNow(Date.now()); const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, [deadline]);
  const time = timerPresentation(deadline, now);
  const save = async patch => {
    if (!data || saving.current) return;
    saving.current = true; setBusy(true); setError('');
    const request = scope.current;
    try {
      if (patch.notifications === true) await workoutRestApi.enableNotifications(userId);
      const preference = await workoutRestApi.save({ ...data.preference, ...patch }, userId);
      if (request === scope.current) { setData(previous => ({ ...previous, preference, timer: preference.enabled ? previous.timer : null })); }
    } catch (e) { if (request === scope.current) setError(e.message); }
    finally { if (request === scope.current) { saving.current = false; setBusy(false); } }
  };
  if (!session || session.ended_at) return null;
  return <>
    <button ref={trigger} type="button" className="workout-rest-trigger" data-tone={deadline ? time.tone : 'normal'} aria-label={t('Rest timer')} title={t('Rest timer')} onClick={() => setOpen(true)}>
      <Timer size={20} /><span>{deadline ? time.label : data?.preference.enabled ? `${Math.floor(data.preference.seconds / 60)}:${String(data.preference.seconds % 60).padStart(2, '0')}` : t('Off')}</span>
    </button>
    {open && <TrainingSheet title="Rest timer" onClose={() => setOpen(false)} triggerRef={trigger} busy={busy}>
      <div className="workout-rest-settings">
        {error && <p role="alert">{t(error)}</p>}
        {!data ? <button type="button" className="button-secondary" onClick={refresh}>{t('Retry')}</button> : <>
          <label className="workout-rest-option"><span>{t('Automatic rest timer')}</span><input type="checkbox" role="switch" checked={data.preference.enabled} disabled={busy} onChange={e => save({ enabled: e.target.checked })} /></label>
          <label className="workout-rest-option"><span>{t('Default duration')}</span><select aria-label={t('Default duration')} value={data.preference.seconds} disabled={busy} onChange={e => save({ seconds: Number(e.target.value) })}>
            {[15,30,45,60,90,120,150,180,240,300].map(seconds => <option key={seconds} value={seconds}>{timerPresentation(new Date(seconds * 1000).toISOString(), 0).label}</option>)}
          </select></label>
          <label className="workout-rest-option"><span>{t('Background notifications')}</span><input type="checkbox" role="switch" checked={data.preference.notifications} disabled={busy} onChange={e => save({ notifications: e.target.checked })} /></label>
          <p className="workout-rest-help">{t('Notifications require permission and a supported installed app. Delivery depends on the network and device settings.')}</p>
          {deadline && <div className="workout-rest-countdown" data-tone={time.tone}><strong role="timer" aria-label={t('Rest remaining')}>{time.label}</strong><button type="button" className="button-secondary" disabled={busy} onClick={async () => {
            if (saving.current) return; saving.current = true; setBusy(true);
            try { await workoutRestApi.cancel(sessionId); await refresh(); } catch (e) { setError(e.message); } finally { saving.current = false; setBusy(false); }
          }}><X size={16} />{t('Cancel timer')}</button></div>}
          {busy && <p role="status">{t('Saving…')}</p>}
        </>}
      </div>
    </TrainingSheet>}
  </>;
}
