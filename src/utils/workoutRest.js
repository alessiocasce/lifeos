export function validateRestPreference(value = {}) {
  const seconds = Number(value.seconds ?? 120);
  if (!Number.isInteger(seconds) || seconds < 15 || seconds > 300) throw new Error('Rest duration must be 15-300 seconds.');
  return { enabled: value.enabled === true, notifications: value.notifications === true, seconds };
}

export function timerPresentation(deadline, now = Date.now()) {
  const remaining = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) || 0;
  return { remaining, label: `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`,
    tone: remaining === 0 ? 'ended' : remaining <= 10 ? 'urgent' : remaining <= 60 ? 'warning' : 'normal' };
}

export function validatePushSubscription(value) {
  try {
    const url = new URL(value?.endpoint);
    const host = url.hostname;
    const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com'
      || host === 'web.push.apple.com' || host.endsWith('.push.apple.com')
      || host.endsWith('.notify.windows.com');
    if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || value.endpoint.length > 2048
      || !/^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth) || !/^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh)) throw new Error();
    return { endpoint: url.href, keys: { auth: value.keys.auth, p256dh: value.keys.p256dh } };
  } catch { throw new Error('Invalid push subscription.'); }
}
