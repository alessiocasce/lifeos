// Explicitly armed, disposable GoTrue account. Never sends an email or prints tokens.
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
if(process.env.LIFEOS_RUN_AUTH_CONFIRMATION_SMOKE!=='true')throw new Error('Explicit smoke opt-in required');
const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
if(new URL(url).hostname!=='wrqscqhclepwxxkazbnc.supabase.co')throw new Error('Wrong project');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const client=createClient(url,process.env.VITE_SUPABASE_ANON_KEY,options);
const email=`qa-confirm-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url');
let id;
try {
  const {data,error}=await admin.auth.admin.generateLink({type:'signup',email,password,options:{redirectTo:'https://lifeos-ruby-gamma.vercel.app/'}});
  if(error)throw new Error(`Link generation failed: ${error.status}`);
  id=data.user.id;
  assert.equal(Boolean(data.user.email_confirmed_at),false);
  const before=await client.auth.signInWithPassword({email,password});
  assert.equal(before.error?.code,'email_not_confirmed');
  const link=new URL(data.properties.action_link);
  assert.equal(link.origin,url);assert.equal(link.pathname,'/auth/v1/verify');
  assert.equal(new URL(link.searchParams.get('redirect_to')).origin,'https://lifeos-ruby-gamma.vercel.app');
  const response=await fetch(link,{redirect:'manual'});
  assert.equal(response.status,303);
  const destination=new URL(response.headers.get('location'));
  assert.equal(destination.origin,'https://lifeos-ruby-gamma.vercel.app');
  assert.equal(new URLSearchParams(destination.hash.slice(1)).has('access_token'),true);
  const confirmed=await admin.auth.admin.getUserById(id);
  assert.ok(confirmed.data.user.email_confirmed_at);
  const signedIn=await client.auth.signInWithPassword({email,password});
  assert.equal(signedIn.error,null);assert.ok(signedIn.data.session);
  assert.equal((await client.auth.signOut()).error,null);
  console.log('PASS live GoTrue: unconfirmed sign-in rejected, real one-use confirmation verified, production redirect/session token, confirmed state, password sign-in/logout');
  console.log('NOT TESTED: delivery of an actual signup email or an owner mailbox click');
} finally {
  if(id){const {error}=await admin.auth.admin.deleteUser(id);if(error)throw new Error('Disposable Auth cleanup failed');console.log('PASS disposable account cleanup (no workouts/profile/publications created)');}
}
