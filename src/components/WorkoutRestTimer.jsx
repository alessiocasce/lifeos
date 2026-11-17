import { useEffect, useRef, useState } from 'react';
import { Timer, X } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { TrainingSheet } from './TrainingSheet';
import { useWorkoutRestCoordinator } from '../hooks/useWorkoutRestCoordinator';
import { timerPresentation } from '../utils/workoutRest';
import { t, useLanguage } from '../i18n';
import '../styles/workoutRest.css';

export function WorkoutRestTimer({ session }) {
  const { authUser } = useLifeOS();
  useLanguage();
  const [open, setOpen] = useState(false), [now, setNow] = useState(Date.now());
  const trigger = useRef(null);
  const userId = authUser?.id, sessionId = session?.id;
  const { snapshot, refresh, updatePreferences, setNotifications, reconnectNotifications, cancelTimer } = useWorkoutRestCoordinator({
    userId, workoutId: sessionId, ended: Boolean(session?.ended_at),
  });
  const data = snapshot.preference ? snapshot : null;
  const busy = Boolean(snapshot.mutation);
  useEffect(() => { setOpen(false); }, [userId, sessionId, session?.ended_at]);
  const deadline = data?.preference.enabled && data?.timer?.scheduled_for;
  useEffect(() => { if (!deadline) return; setNow(Date.now()); const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, [deadline]);
  const time = timerPresentation(deadline, now);
  if (!session || session.ended_at) return null;
  const deviceStatus=data?.device?.status||(data?.preference.notifications?'checking':'off');
  const deviceMessages={ready:'This device is registered for notifications.',checking:'Checking this device...',
    reconnect:'Notifications need reconnecting on this device.',blocked:'Notifications are blocked. Allow LifeOS notifications in device settings, then reconnect.',
    unsupported:'Install LifeOS on your Home Screen to enable supported notifications.',
    unavailable:'Background notifications need server configuration. The countdown still works.',
    unverified:'Device connection could not be verified. Reconnect when online.'};
  return <>
    <button ref={trigger} type="button" className="workout-rest-trigger" data-tone={deadline ? time.tone : 'normal'} aria-label={t('Rest timer')} title={t('Rest timer')} onClick={() => setOpen(true)}>
      <Timer size={20} /><span>{!data ? '\u2014' : deadline ? time.label : data.preference.enabled ? `${Math.floor(data.preference.seconds / 60)}:${String(data.preference.seconds % 60).padStart(2, '0')}` : t('Off')}</span>
    </button>
    {open && <TrainingSheet title="Rest timer" onClose={() => setOpen(false)} triggerRef={trigger} busy={busy}>
      <div className="workout-rest-settings">
        {snapshot.refreshError && <p role="alert">{t(snapshot.refreshError.message)}</p>}
        {snapshot.mutationError && <p role="alert">{t(snapshot.mutationError.message)}</p>}
        {!data ? <button type="button" className="button-secondary" onClick={refresh}>{t('Retry')}</button> : <>
          <label className="workout-rest-option"><span>{t('Automatic rest timer')}</span><input type="checkbox" role="switch" checked={data.preference.enabled} disabled={busy} onChange={e => updatePreferences({ enabled: e.target.checked })} /></label>
          <label className="workout-rest-option"><span>{t('Default duration')}</span><select aria-label={t('Default duration')} value={data.preference.seconds} disabled={busy} onChange={e => updatePreferences({ seconds: Number(e.target.value) })}>
            {[15,30,45,60,90,120,150,180,240,300].map(seconds => <option key={seconds} value={seconds}>{timerPresentation(new Date(seconds * 1000).toISOString(), 0).label}</option>)}
          </select></label>
          <label className="workout-rest-option"><span>{t('Background notifications')}</span><input type="checkbox" role="switch" checked={data.preference.notifications&&deviceStatus==='ready'} disabled={busy||deviceStatus==='checking'} onChange={e => setNotifications(e.target.checked)} /></label>
          {data.preference.notifications&&<>
            <p role="status" className="workout-rest-help">{t(deviceMessages[deviceStatus]||deviceMessages.unverified)}</p>
            <button type="button" className="button-secondary" disabled={busy||deviceStatus==='checking'} onClick={reconnectNotifications}>{t('Reconnect notifications')}</button>
            {deviceStatus!=='ready'&&<button type="button" className="button-secondary" disabled={busy} onClick={()=>setNotifications(false)}>{t('Turn off notifications')}</button>}
          </>}
          <p className="workout-rest-help">{t('Notifications require permission and a supported installed app. Delivery depends on the network and device settings.')}</p>
          {deadline && <div className="workout-rest-countdown" data-tone={time.tone}><strong role="timer" aria-label={t('Rest remaining')}>{time.label}</strong><button type="button" className="button-secondary" disabled={busy} onClick={cancelTimer}><X size={16} />{t('Cancel timer')}</button></div>}
          {busy && <p role="status">{t('Saving…')}</p>}
        </>}
      </div>
    </TrainingSheet>}
  </>;
}
