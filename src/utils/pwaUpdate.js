import { registerSW } from 'virtual:pwa-register';
import { createAppUpdateManager } from './appUpdateManager';

export const BUILD_ID = typeof __LIFEOS_BUILD_ID__ === 'string' ? __LIFEOS_BUILD_ID__ : 'development';
let sessionStorageSafe;
try { sessionStorageSafe = window.sessionStorage; } catch { /* Private browsing. */ }
export const appUpdate = createAppUpdateManager({
  serviceWorker: typeof navigator !== 'undefined' ? navigator.serviceWorker : null,
  online: () => navigator.onLine,
  reload: () => window.location.reload(),
  storage: sessionStorageSafe,
  buildId: BUILD_ID,
  fetchVersion: async () => {
    const response = await fetch('/build-version.json',{cache:'no-store',credentials:'same-origin'});
    if (!response.ok) throw new Error('version-unavailable');
    const version = await response.json();
    if (typeof version.version !== 'string') throw new Error('invalid-version');
    return version.version;
  },
});
let initialized = false;
export function initializePwaUpdate() {
  if (initialized || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  initialized = true;
  appUpdate.confirm();
  let lastCheck = 0;
  const check = () => {
    if (document.visibilityState !== 'visible' || Date.now()-lastCheck < 60000) return;
    lastCheck = Date.now();
    void appUpdate.check();
  };
  registerSW({
    immediate:true,
    onNeedRefresh:appUpdate.ready,
    // Workbox otherwise reloads ALL controlled tabs, including active workouts.
    onNeedReload:() => {},
    onRegisteredSW:(_url,registration) => { appUpdate.registered(registration); check(); },
    onRegisterError:appUpdate.failed,
  });
  document.addEventListener('visibilitychange',check);
  window.addEventListener('focus',check);
  window.addEventListener('online',check);
  setInterval(check,15*60*1000);
}
export const checkForAppUpdate = () => appUpdate.check();
export const applyAppUpdate = registration => appUpdate.apply(registration);
