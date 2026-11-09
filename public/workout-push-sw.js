/* Imported by the guarded generated worker. Never fetch before showing a push. */
self.addEventListener('push', event => {
  let data;
  try { data=event.data?.json(); } catch { /* Malformed input still gets a generic visible fallback. */ }
  const known=data?.type==='workout-rest'||data?.web_push===8030;
  const english=data?.language==='en'||(typeof data?.notification?.lang==='string'&&data.notification.lang.startsWith('en'));
  const late=typeof data?.expiresAt==='string'&&Date.parse(data.expiresAt)<=Date.now();
  const title=known?(english?'LifeOS - Rest complete':'LifeOS - Recupero terminato'):'LifeOS';
  const body=!known||late
    ?(english?'Open Training to check your latest rest timer.':'Apri Allenamento per controllare il timer di recupero.')
    :(english?'You can start your next set.':'Puoi iniziare la prossima serie.');
  // Cancellation is authoritative before send. An in-flight push cannot be recalled
  // safely by silently discarding it on userVisibleOnly platforms.
  event.waitUntil(self.registration.showNotification(title,{body,icon:'/pwa-192x192.png',badge:'/pwa-192x192.png',
    tag:'lifeos-workout-rest',renotify:true,data:{url:'/workout'}}));
});
self.addEventListener('pushsubscriptionchange',event=>{
  event.waitUntil((async()=>{
    for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))
      client.postMessage({type:'lifeos:push-subscription-changed'});
  })());
});
self.addEventListener('notificationclick', event => {
  if (event.notification.tag !== 'lifeos-workout-rest') return;
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (app) { await app.navigate('/workout'); await app.focus(); }
    else await self.clients.openWindow('/workout');
  })());
});
