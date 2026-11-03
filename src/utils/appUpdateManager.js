// Browser boundaries are injected so activation, failures and race guards are testable.
export function createAppUpdateManager({ serviceWorker, online, reload, storage, buildId, fetchVersion, now = Date.now }) {
  let registration;
  let inFlight;
  let applying;
  let activatedPendingReload = false;
  let guard = () => null;
  let state = { status: 'idle', available: false, buildId, targetVersion: null, reason: null, dismissedUntil: 0 };
  const listeners = new Set();
  const publish = patch => { state = { ...state,...patch }; listeners.forEach(fn => fn()); };
  serviceWorker?.addEventListener('controllerchange', () => {
    if (applying) activatedPendingReload = true;
    else void fetchVersion().then(version => {
      if (version !== buildId) { activatedPendingReload = true; publish({status:'available',available:true,targetVersion:version}); }
    }).catch(() => {});
  });
  const observe = new WeakSet();
  const registered = reg => {
    if (!reg) return;
    registration = reg;
    if (reg.waiting) publish({ status:'available',available:true,reason:null });
    if (observe.has(reg)) return;
    observe.add(reg);
    const installing = () => {
      const worker = reg.installing;
      if (!worker) return;
      publish({status:'downloading'});
      worker.addEventListener('statechange', () => {
        if (reg.waiting) publish({status:'available',available:true,reason:null});
        else if (worker.state === 'redundant') publish({status:'error',reason:'download-failed'});
        else if (worker.state === 'activated' && !state.available) publish({status:'current'});
      });
    };
    reg.addEventListener('updatefound',installing);
    installing();
  };
  async function runCheck() {
    if (!online()) { publish({status:'offline',reason:'offline'}); return {available:state.available,reason:'offline'}; }
    if (!serviceWorker) { publish({status:'error',reason:'unsupported'}); return {available:false,reason:'unsupported'}; }
    publish({status:'checking',reason:null});
    try {
      const reg = registration || await serviceWorker.getRegistration();
      if (!reg) throw new Error('unregistered');
      registered(reg);
      const version = await fetchVersion();
      publish({targetVersion:version});
      await reg.update();
      if (reg.installing && !reg.waiting) {
        publish({status:'downloading'});
        await new Promise(resolve => {
          const worker = reg.installing;
          const done = () => { if (reg.waiting || ['activated','redundant'].includes(worker.state)) finish(); };
          const finish = () => { clearTimeout(timeout); worker.removeEventListener('statechange',done); resolve(); };
          const timeout = setTimeout(finish,20000);
          worker.addEventListener('statechange',done); done();
        });
      }
      if (reg.waiting || (activatedPendingReload && version !== buildId)) {
        publish({status:'available',available:true,reason:null});
        return {available:true,registration:reg};
      }
      if (reg.installing) { publish({status:'downloading'}); return {available:false,reason:'downloading'}; }
      // Never call a cached old client "latest" if the network build differs.
      const status = version && version !== buildId ? 'error' : 'current';
      publish({status,available:false,reason:status === 'error' ? 'build-not-ready' : null});
      return {available:false,reason:status};
    } catch {
      publish({status:'error',reason:'update-check-failed'});
      return {available:state.available,reason:'update-check-failed'};
    }
  }
  const check = () => {
    if (applying) return Promise.resolve({available:state.available,reason:'activating'});
    if (!inFlight) inFlight = runCheck().finally(() => { inFlight = null; });
    return inFlight;
  };
  const apply = async reg => {
    const blocked = guard();
    if (blocked) { publish({reason:blocked}); return false; }
    if (applying) return applying;
    if (activatedPendingReload && state.available && !(reg || registration)?.waiting) {
      try { storage?.setItem('lifeos-pwa-update',JSON.stringify({from:buildId,to:state.targetVersion,at:now()})); } catch { /* Updating must still work without session storage. */ }
      publish({status:'loading'}); reload(); return true;
    }
    const target = reg || registration || await serviceWorker?.getRegistration();
    if (!target?.waiting) { publish({status:'error',reason:'worker-not-ready'}); return false; }
    if (guard()) { publish({reason:guard()}); return false; }
    applying = (async () => {
      publish({status:'activating',reason:null});
      try {
        // Record intent, never erase auth, drafts or application caches.
        try { storage?.setItem('lifeos-pwa-update',JSON.stringify({from:buildId,to:state.targetVersion,at:now()})); } catch { /* Private browsing may disable storage. */ }
        await new Promise((resolve,reject) => {
          const changed = () => { clearTimeout(timeout); serviceWorker.removeEventListener('controllerchange',changed); resolve(); };
          const timeout = setTimeout(() => { serviceWorker.removeEventListener('controllerchange',changed); reject(new Error('activation-timeout')); },10000);
          serviceWorker.addEventListener('controllerchange',changed);
          try { target.waiting.postMessage({type:'SKIP_WAITING'}); }
          catch (error) { clearTimeout(timeout); serviceWorker.removeEventListener('controllerchange',changed); reject(error); }
        });
        if (guard()) { publish({status:'available',reason:guard()}); return false; }
        publish({status:'loading'});
        reload();
        return true;
      } catch { publish({status:'error',reason:'activation-failed'}); return false; }
      finally { applying = null; }
    })();
    return applying;
  };
  const confirm = () => {
    try {
      const prior = JSON.parse(storage?.getItem('lifeos-pwa-update') || 'null');
      if (!prior) return;
      storage.removeItem('lifeos-pwa-update');
      if (prior.from !== buildId && (!prior.to || prior.to === buildId)) publish({status:'confirmed',confirmedVersion:buildId});
      else publish({status:'error',reason:'version-not-changed'});
    } catch { /* Storage can be unavailable in private browsing. */ }
  };
  return { check,apply,registered,confirm, getSnapshot:()=>state,
    subscribe:fn => { listeners.add(fn); return () => listeners.delete(fn); },
    setGuard:fn => { guard = fn; },
    dismiss:() => publish({dismissedUntil:now()+30*60*1000}),
    ready:() => publish({status:'available',available:true,reason:null}),
    failed:() => publish({status:'error',reason:'registration-failed'}),
  };
}
