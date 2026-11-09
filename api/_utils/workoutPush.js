import { sendNotification } from 'web-push';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { HttpError } from './http.js';
import { validatePushSubscription } from '../../src/utils/workoutRest.js';

const check = ({ data, error }) => { if (error) throw new HttpError(503, 'Training notifications are unavailable.'); return data; };
export async function requireTrainingUser(token, client = getSupabaseAdmin()) {
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Sign in to manage Training notifications.');
  return data.user;
}

export async function manageWorkoutPush({ userId, body, client = getSupabaseAdmin() }) {
  const configuration={ publicKey: process.env.LIFEOS_PUSH_PUBLIC_KEY || null,
    configured: Boolean(process.env.LIFEOS_PUSH_PUBLIC_KEY && process.env.LIFEOS_PUSH_PRIVATE_KEY && process.env.LIFEOS_PUSH_SUBJECT && process.env.LIFEOS_PUSH_DISPATCH_SECRET && process.env.LIFEOS_PUSH_WORKER_ENABLED === 'true') };
  if (body.operation === 'config') return configuration;
  if(body.operation==='device_status') {
    if(typeof body.endpoint!=='string'||body.endpoint.length>2048)throw new HttpError(400,'Invalid subscription.');
    const row=check(await client.from('workout_push_subscriptions').select('id').eq('user_id',userId).eq('endpoint',body.endpoint).maybeSingle());
    return {...configuration,registered:Boolean(row)};
  }
  if (body.operation === 'subscribe') {
    let subscription;
    try { subscription = validatePushSubscription(body.subscription); } catch (e) { throw new HttpError(400, e.message); }
    // An endpoint can only belong to one signed-in account on this browser installation.
    const existing = check(await client.from('workout_push_subscriptions').select('user_id').eq('endpoint', subscription.endpoint).maybeSingle());
    if (existing && existing.user_id !== userId) throw new HttpError(409, 'Remove this device subscription from the previous account first.');
    check(await client.from('workout_push_subscriptions').upsert({ user_id: userId, endpoint: subscription.endpoint, subscription }, { onConflict: 'endpoint' }));
    return { subscribed: true };
  }
  if (body.operation === 'unsubscribe') {
    if (typeof body.endpoint !== 'string' || body.endpoint.length > 2048) throw new HttpError(400, 'Invalid subscription.');
    check(await client.from('workout_push_subscriptions').delete().eq('user_id', userId).eq('endpoint', body.endpoint));
    return { subscribed: false };
  }
  throw new HttpError(400, 'Unknown Training notification operation.');
}

export async function verifyWorkoutPush(token, client = getSupabaseAdmin(), now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return { current: false };
  const row = check(await client.from('workout_rest_timers').select('id,user_id,workout_id,state,scheduled_for,expires_at,delivery_enabled').eq('delivery_token', token).maybeSingle());
  if (!row || !row.delivery_enabled || !['claimed', 'sent'].includes(row.state) || Date.parse(row.scheduled_for) > now || Date.parse(row.expires_at) <= now) return { current: false };
  const preference = check(await client.from('workout_web_rest_preferences').select('enabled,notifications').eq('user_id', row.user_id).maybeSingle());
  const workout = check(await client.from('workouts').select('ended_at').eq('id', row.workout_id).eq('user_id', row.user_id).maybeSingle());
  return { current: Boolean(preference?.enabled && preference?.notifications && workout && !workout.ended_at) };
}

export async function dispatchWorkoutPush({ client = getSupabaseAdmin(), send = sendNotification } = {}) {
  const { LIFEOS_PUSH_PUBLIC_KEY: publicKey, LIFEOS_PUSH_PRIVATE_KEY: privateKey, LIFEOS_PUSH_SUBJECT: subject } = process.env;
  if (!publicKey || !privateKey || !subject || process.env.LIFEOS_PUSH_WORKER_ENABLED !== 'true') throw new HttpError(503, 'Web Push worker is not configured.');
  const rows = check(await client.rpc('claim_workout_web_rest')) || [];
  let accepted = 0, failed = 0,skipped=0;
  const providerStatuses={};
  const recordStatus=value=>{const key=Number.isInteger(value)&&value>=100&&value<=599?String(value):'network_or_validation';providerStatuses[key]=(providerStatuses[key]||0)+1;};
  await Promise.all(rows.map(async row => {
    if (!(await verifyWorkoutPush(row.delivery_token, client)).current) {skipped++;return;}
    const subscriptions = check(await client.from('workout_push_subscriptions').select('id,subscription').eq('user_id', row.user_id).limit(5));
    const preferences = check(await client.from('user_preferences').select('language').eq('user_id', row.user_id).maybeSingle());
    let delivered = false,attempted=false;
    await Promise.all((subscriptions || []).map(async target => {
      if (!(await verifyWorkoutPush(row.delivery_token, client)).current) return;
      attempted=true;
      try {
        const subscription = validatePushSubscription(target.subscription);
        const english=preferences?.language==='en';
        const expiresAt=new Date(Math.min(Date.parse(row.expires_at),Date.now()+60000)).toISOString();
        const response=await send(subscription, JSON.stringify({ web_push:8030,
          notification:{title:english?'LifeOS - Rest complete':'LifeOS - Recupero terminato',
            body:english?'You can start your next set.':'Puoi iniziare la prossima serie.',lang:english?'en':'it',
            navigate:'https://lifeos-ruby-gamma.vercel.app/workout',tag:'lifeos-workout-rest',mutable:false,silent:false,
            icon:'https://lifeos-ruby-gamma.vercel.app/pwa-192x192.png',badge:'https://lifeos-ruby-gamma.vercel.app/pwa-192x192.png'},
          // Legacy fields allow already-installed workers to transition without forced activation.
          type:'workout-rest',token:row.delivery_token,expiresAt,language:english?'en':'it' }), {
          vapidDetails: { subject, publicKey, privateKey }, TTL: Math.max(1, Math.min(60, Math.floor((Date.parse(row.expires_at) - Date.now()) / 1000))),
          urgency: 'high', timeout: 10000, topic:'lifeos-workout-rest',
        });
        recordStatus(response?.statusCode);
        delivered = true;
      } catch (error) {
        recordStatus(error.statusCode);
        if ([404, 410].includes(error.statusCode)) check(await client.from('workout_push_subscriptions').delete().eq('id', target.id).eq('user_id', row.user_id));
        // Never log capability URLs, encryption keys, payloads or raw provider errors.
      }
    }));
    if(!attempted&&subscriptions?.length){skipped++;return;}
    check(await client.from('workout_rest_timers').update({ state: delivered ? 'sent' : 'failed', finished_at: new Date().toISOString() }).eq('id', row.id).eq('state', 'claimed'));
    if (delivered) accepted++; else failed++;
  }));
  if(rows.length) console.log(JSON.stringify({event:'training_push_provider_result',claimed:rows.length,accepted,failed,skipped,providerStatuses}));
  return { claimed: rows.length, accepted, failed };
}
