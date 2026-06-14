import { registerSW } from 'virtual:pwa-register';

let registeredServiceWorker;
let updateReady = false;

export function initializePwaUpdate() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true;
    },
    onRegisteredSW(_scriptUrl, registration) {
      registeredServiceWorker = registration;
      if (registration?.waiting) updateReady = true;
    },
    onRegisterError(error) {
      console.error('[LifeOS PWA registration failed]', error);
    },
  });
}

export async function checkForAppUpdate() {
  if (!('serviceWorker' in navigator)) {
    return { available: false, reason: 'unsupported' };
  }

  const registration = registeredServiceWorker
    ?? await navigator.serviceWorker.getRegistration();
  if (!registration) return { available: false, reason: 'unregistered' };
  registeredServiceWorker = registration;

  if (registration.waiting) {
    updateReady = true;
    return { available: true, registration };
  }

  try {
    await registration.update();
  } catch (error) {
    return { available: false, reason: 'update-check-failed', error };
  }

  const waiting = await waitForWaitingWorker(registration);
  updateReady = Boolean(waiting || registration.waiting);
  return updateReady
    ? { available: true, registration }
    : { available: false, reason: 'current' };
}

export async function applyAppUpdate(registration = registeredServiceWorker) {
  if (!('serviceWorker' in navigator)) return false;
  const targetRegistration = registration ?? await navigator.serviceWorker.getRegistration();
  const waitingWorker = targetRegistration?.waiting;
  if (!waitingWorker) return false;

  sessionStorage.setItem('lifeos-pwa-update-started', String(Date.now()));
  await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('The app update did not activate in time.'));
    }, 8000);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });

    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });

  updateReady = false;
  window.location.reload();
  return true;
}

function waitForWaitingWorker(registration, timeoutMs = 2500) {
  if (registration.waiting) return Promise.resolve(registration.waiting);

  return new Promise((resolve) => {
    let finished = false;
    let installing = registration.installing;

    const finish = (worker = null) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      registration.removeEventListener('updatefound', handleUpdateFound);
      installing?.removeEventListener('statechange', handleStateChange);
      resolve(worker);
    };
    const handleStateChange = () => {
      if (registration.waiting) finish(registration.waiting);
      if (installing?.state === 'redundant') finish(null);
    };
    const handleUpdateFound = () => {
      installing?.removeEventListener('statechange', handleStateChange);
      installing = registration.installing;
      installing?.addEventListener('statechange', handleStateChange);
      handleStateChange();
    };
    const timeout = window.setTimeout(() => finish(registration.waiting), timeoutMs);

    registration.addEventListener('updatefound', handleUpdateFound);
    if (installing) installing.addEventListener('statechange', handleStateChange);
    handleStateChange();
  });
}
