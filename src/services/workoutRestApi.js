import { supabase } from '../lib/supabaseClient';
import { validateRestPreference } from '../utils/workoutRest';
import { inspectPushDevice, pushManagerFor } from '../utils/workoutPushDevice';

const result = ({ data, error }) => { if (error) throw new Error('Training timer is unavailable. Your workout is still saved.'); return data; };
async function identity(expectedUserId) {
  if (!supabase) throw new Error('Sign in to use the rest timer.');
  const session = result(await supabase.auth.getSession())?.session;
  if (!session?.user?.id) throw new Error('Sign in to use the rest timer.');
  if (expectedUserId && session.user.id !== expectedUserId) throw new Error('Account changed. Reopen Training before changing the timer.');
  return session;
}
async function control(body, expectedUserId) {
  const session = await identity(expectedUserId);
  const response = await fetch('/api/ai/actions', { method: 'POST', headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'training_notifications', ...body }) });
  const json = await response.json();
  if (!response.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Notifications are unavailable.');
  return json.data;
}
export const workoutRestApi = {
  async read(workoutId) {
    const { user, access_token: token } = await identity();
    const preference = result(await supabase.from('workout_web_rest_preferences').select('enabled,seconds,notifications').eq('user_id', user.id).maybeSingle().setHeader('Authorization', `Bearer ${token}`));
    const timers = workoutId ? result(await supabase.from('workout_rest_timers').select('id,workout_id,scheduled_for,state').eq('user_id', user.id).eq('workout_id', workoutId)
      .in('state', ['queued', 'claimed', 'sent', 'failed']).order('created_at', { ascending: false }).limit(1).setHeader('Authorization', `Bearer ${token}`)) : [];
    const safe=validateRestPreference(preference||{});
    const device=safe.notifications?await inspectPushDevice({scope:window,lookup:endpoint=>control({operation:'device_status',endpoint},user.id)}):{status:'off'};
    return { preference:safe, timer: timers?.[0] || null,device };
  },
  async save(preference, expectedUserId) {
    const { user, access_token: token } = await identity(expectedUserId);
    const safe = validateRestPreference(preference);
    result(await supabase.from('workout_web_rest_preferences').upsert({ user_id: user.id, ...safe, updated_at: new Date().toISOString() }).setHeader('Authorization', `Bearer ${token}`));
    return safe;
  },
  async cancel(workoutId = null) { const session = await identity(); result(await supabase.rpc('cancel_workout_web_rest', { p_workout_id: workoutId }).setHeader('Authorization', `Bearer ${session.access_token}`)); },
  async enableNotifications(expectedUserId,{reconnect=false}={}) {
    if (!('Notification' in window) || (!('PushManager' in window)&&!window.pushManager)) throw new Error('Install LifeOS on your Home Screen to enable supported notifications.');
    // Request permission directly from this user gesture, before any awaited network request.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted.');
    const config = await control({ operation: 'config' }, expectedUserId);
    if (!config.configured || !config.publicKey) throw new Error('Background notifications need server configuration. The countdown still works.');
    const manager=await pushManagerFor(window);
    if (!manager) throw new Error('The LifeOS service worker is not ready. Reopen the installed app.');
    const key = Uint8Array.from(atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    let subscription=await manager.getSubscription();
    await identity(expectedUserId);
    if(subscription&&(reconnect||(subscription.expirationTime&&subscription.expirationTime<=Date.now()))) {
      await control({operation:'unsubscribe',endpoint:subscription.endpoint},expectedUserId);
      await subscription.unsubscribe();
      if(await manager.getSubscription())throw new Error('Device subscription could not be renewed. Reopen LifeOS and retry.');
      subscription=null;
    }
    await identity(expectedUserId);
    subscription=subscription||await manager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await control({ operation: 'subscribe', subscription: subscription.toJSON() }, expectedUserId);
  },
  async detachDevice() {
    const manager=await pushManagerFor(window);
    const subscription = await manager?.getSubscription();
    if (!subscription) return;
    try { await control({ operation: 'unsubscribe', endpoint: subscription.endpoint }); }
    finally { await subscription.unsubscribe(); }
  },
  async detachLocalDevice() {
    const registration = await navigator.serviceWorker?.getRegistration();
    const manager=await pushManagerFor(window);
    const subscription = await manager?.getSubscription();
    await subscription?.unsubscribe();
    for (const notification of await registration?.getNotifications?.({ tag: 'lifeos-workout-rest' }) || []) notification.close();
  },
};
