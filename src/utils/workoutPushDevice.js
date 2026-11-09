export async function pushManagerFor(scope) {
  // Declarative Push can survive removal of the worker on supported WebKit versions.
  if(scope.pushManager)return scope.pushManager;
  const registration=await scope.navigator?.serviceWorker?.getRegistration();
  return registration?.active?registration.pushManager:null;
}

export async function inspectPushDevice({scope=globalThis,lookup,now=Date.now()}) {
  if(!scope.Notification)return {status:'unsupported'};
  if(scope.Notification.permission==='denied')return {status:'blocked'};
  if(scope.Notification.permission!=='granted')return {status:'reconnect'};
  try {
    const manager=await pushManagerFor(scope);
    if(!manager)return {status:'reconnect'};
    const subscription=await manager.getSubscription();
    if(!subscription||(subscription.expirationTime&&subscription.expirationTime<=now))return {status:'reconnect'};
    const server=await lookup(subscription.endpoint);
    if(!server.configured||!server.publicKey)return {status:'unavailable'};
    if(!server.registered)return {status:'reconnect'};
    const key=subscription.options?.applicationServerKey;
    if(key){
      const expected=Uint8Array.from(atob(server.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
      const actual=new Uint8Array(key);
      if(actual.length!==expected.length||actual.some((v,i)=>v!==expected[i]))return {status:'reconnect'};
    }
    return {status:'ready'};
  }catch{return {status:'unverified'};}
}
