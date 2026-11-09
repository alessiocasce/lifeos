/* Imported by the existing generated service worker; does not activate updates. */
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data;
    try { data = event.data?.json(); } catch { return; }
    if (data?.type !== 'workout-rest' || !/^[a-f0-9]{64}$/.test(data.token || '') || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()) return;
    try {
      const response = await fetch('/api/ai/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ action: 'training_push_verify', token: data.token }) });
      const result = await response.json();
      if (!response.ok || !result.data?.current) return;
      const english = data.language === 'en';
      await self.registration.showNotification(english ? 'LifeOS - Rest complete' : 'LifeOS - Recupero terminato', { body: english ? 'You can start your next set.' : 'Puoi iniziare la prossima serie.',
        icon: '/pwa-192x192.png', badge: '/pwa-192x192.png', tag: 'lifeos-workout-rest', renotify: true, data: { url: '/workout' } });
    } catch { /* Fail closed when cancellation cannot be checked. */ }
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
