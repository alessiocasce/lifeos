// Controlled production Storage/RLS smoke; no real user's profile is modified.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
if(process.env.LIFEOS_RUN_PROFILE_STORAGE_SMOKE!=='true')throw new Error('Explicit smoke opt-in required');
const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
if(new URL(url).hostname!=='wrqscqhclepwxxkazbnc.supabase.co')throw new Error('Wrong project');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const fixture=[];
let browser;
const ok=result=>{if(result.error)throw new Error(`QA API failed (${result.error.code||result.error.statusCode||'unknown'})`);return result.data;};
try {
  browser=await chromium.launch();const page=await browser.newPage();
  const bytes=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');x.fillStyle='#64748b';x.fillRect(0,0,32,32);return c.toDataURL('image/webp').split(',')[1];}),'base64');
  await browser.close();browser=null;
  for(let i=0;i<2;i++) {
    const email=`qa-photo-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url');
    const generated=ok(await admin.auth.admin.generateLink({type:'signup',email,password,options:{redirectTo:'https://lifeos-ruby-gamma.vercel.app/'}}));
    const entry={id:generated.user.id,client:createClient(url,process.env.VITE_SUPABASE_ANON_KEY,options),paths:[]};fixture.push(entry);
    ok(await entry.client.auth.verifyOtp({token_hash:generated.properties.hashed_token,type:'signup'}));
    ok(await entry.client.rpc('save_user_settings',{p_username:`qa_${randomBytes(7).toString('hex')}`,p_language:'en',p_workout_sharing:false,p_share_notes:false}));
  }
  const [a,b]=fixture,storage=a.client.storage.from('profile-avatars'),other=b.client.storage.from('profile-avatars');
  const path=`${a.id}/${randomUUID()}.webp`,replacement=`${a.id}/${randomUUID()}.webp`;a.paths.push(path,replacement);
  ok(await storage.upload(path,bytes,{contentType:'image/webp',upsert:false}));
  assert.ok((await other.createSignedUrl(path,60)).error,'Unreferenced staging photo must be private');
  ok(await a.client.rpc('set_profile_avatar',{p_path:path}));
  const signed=ok(await other.createSignedUrl(path,60));
  assert.equal((await fetch(signed.signedUrl)).status,200);
  assert.ok((await other.upload(path,bytes,{contentType:'image/webp',upsert:true})).error,'Cross-user replacement must fail');
  const removed=await other.remove([path]);assert.equal(removed.data?.length||0,0);
  assert.ok((await b.client.rpc('set_profile_avatar',{p_path:path})).error);
  const foreignUpdate=ok(await b.client.from('user_profiles').update({username:'forbidden_qa'}).eq('user_id',a.id).select('user_id'));
  assert.equal(foreignUpdate.length,0);
  const anon=createClient(url,process.env.VITE_SUPABASE_ANON_KEY,options);
  assert.ok((await anon.storage.from('profile-avatars').createSignedUrl(path,60)).error);
  ok(await storage.upload(replacement,bytes,{contentType:'image/webp',upsert:false}));
  ok(await a.client.rpc('set_profile_avatar',{p_path:replacement}));
  ok(await storage.remove([path]));
  assert.ok((await other.createSignedUrl(path,60)).error);
  ok(await a.client.rpc('set_profile_avatar',{p_path:null}));
  assert.ok((await other.createSignedUrl(replacement,60)).error);
  ok(await storage.remove([replacement]));
  console.log('PASS live authenticated Storage: WebP upload/member signed read/replace/remove; cross-user overwrite/delete/profile writes and anonymous reads rejected');
} finally {
  if(browser)await browser.close();
  let failed=false;
  for(const f of fixture){
    if(f.paths.length){const {error}=await f.client.storage.from('profile-avatars').remove(f.paths);if(error)failed=true;}
    const {error}=await admin.auth.admin.deleteUser(f.id);if(error)failed=true;
  }
  if(failed)throw new Error('Disposable Storage/Auth cleanup requires review');
  console.log('PASS disposable profile/account/object cleanup; no workout records created');
}
