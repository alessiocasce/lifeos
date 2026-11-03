import { useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import { appUpdate } from '../utils/pwaUpdate';
import { t } from '../i18n';

export function useAppUpdate() { return useSyncExternalStore(appUpdate.subscribe,appUpdate.getSnapshot,appUpdate.getSnapshot); }
function UpdateMessage({state}) {
  const messages = { checking:'Checking for updates...',downloading:'Downloading the new version...',available:'New version available.',current:"You're running the latest LifeOS version.",offline:"Can't check for updates while offline.",error:"Couldn't check for updates. Try again.",activating:'Activating the update...',loading:'Loading the updated application...' };
  return <p role="status" className="text-sm text-zinc-400">{t(state.reason === 'active-workout' ? 'Update ready - finish your workout first.' : state.reason === 'loading-workouts' ? 'Wait for workout data before updating.' : state.reason === 'unsaved-work' ? 'Save your changes before updating.' : messages[state.status] || '')}</p>;
}
function UpdateNow({state}) {
  return state.available ? <button type="button" className="min-h-11 rounded-lg border border-white/20 px-3 text-sm" disabled={['activating','loading'].includes(state.status)} onClick={() => void appUpdate.apply()}>{t('Update now')}</button> : null;
}
export function ApplicationUpdates() {
  const state = useAppUpdate();
  return <section aria-label={t('Application')} className="grid gap-3 border-t border-white/10 pt-5">
    <h2 className="text-lg font-semibold">{t('Application')}</h2>
    <p className="text-sm text-zinc-400">{t('LifeOS version:')} <code>{state.buildId}</code></p>
    {state.confirmedVersion === state.buildId ? <p role="status" className="text-sm text-zinc-400">{t('The new LifeOS version is running.')}</p> : null}
    <div className="flex flex-wrap gap-2"><button type="button" className="flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm" disabled={['checking','downloading','activating','loading'].includes(state.status)} onClick={() => void appUpdate.check()}><RefreshCw size={16} />{t('Check for updates')}</button><UpdateNow state={state} /></div>
    <UpdateMessage state={state} />
  </section>;
}
export function AppUpdateNotice() {
  const state = useAppUpdate();
  if (!state.available || state.dismissedUntil > Date.now()) return null;
  return <aside aria-label={t('LifeOS update available')} className="app-update-notice">
    <strong className="text-sm">{t('LifeOS update available')}</strong><UpdateMessage state={state} />
    <div className="flex gap-2"><UpdateNow state={state} /><button type="button" className="min-h-11 px-3 text-sm text-zinc-400" onClick={appUpdate.dismiss}>{t('Later')}</button></div>
  </aside>;
}
