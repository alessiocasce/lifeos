import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
let user='A',device=null,registered=false,offline=false,sequence=0;
const calls=[];
const preference={enabled:true,seconds:60,notifications:true};
globalThis.__pushClient={auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:'qa-token'}}})},from(name){
  const q={select(){return q;},eq(){return q;},in(){return q;},order(){return q;},limit(){return q;},setHeader(){return q;},
    maybeSingle(){return q;},then(resolve){return Promise.resolve({data:name==='workout_web_rest_preferences'?preference:[]}).then(resolve);}};return q;
}};
const key='AQID';
const make=()=>({endpoint:'https://fcm.googleapis.com/qa-'+(++sequence),expirationTime:null,
  options:{applicationServerKey:new Uint8Array([1,2,3]).buffer},
  toJSON(){return{endpoint:this.endpoint,keys:{auth:'fixture',p256dh:'fixture'}};},
  async unsubscribe(){calls.push('unsubscribe-device');device=null;return false;}});
const manager={getSubscription:async()=>device,subscribe:async()=>{calls.push('subscribe-device');return(device=make());}};
const oldWindow=globalThis.window,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldFetch=globalThis.fetch;
globalThis.window={Notification:{permission:'granted'},pushManager:manager};
globalThis.Notification={requestPermission:async()=>{calls.push('permission');return'granted';}};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{getRegistration:async()=>({active:{},pushManager:manager})}}});
globalThis.fetch=async(_url,options)=>{
 if(offline)throw new Error('Offline');
 const b=JSON.parse(options.body);calls.push(b.operation);
 if(b.operation==='subscribe')registered=true;if(b.operation==='unsubscribe')registered=false;
 return{ok:true,json:async()=>({ok:true,data:{configured:true,publicKey:key,registered,subscribed:registered}})};
};
try{
 const source=fs.readFileSync('src/services/workoutRestApi.js','utf8')
  .replace("import { supabase } from '../lib/supabaseClient';",'const supabase=globalThis.__pushClient;')
  .replace("'../utils/workoutRest'",JSON.stringify(pathToFileURL(process.cwd()+'/src/utils/workoutRest.js').href))
  .replace("'../utils/workoutPushDevice'",JSON.stringify(pathToFileURL(process.cwd()+'/src/utils/workoutPushDevice.js').href));
 const {workoutRestApi:api}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 assert.equal((await api.read('workout')).device.status,'reconnect');assert.equal(preference.notifications,true);
 await api.enableNotifications('A',{reconnect:true});assert.equal((await api.read('workout')).device.status,'ready');
 const first=device.endpoint;await api.enableNotifications('A',{reconnect:true});assert.notEqual(device.endpoint,first);
 assert.ok(calls.indexOf('permission')<calls.indexOf('config'),'permission requested directly from gesture before network');
 registered=false;assert.equal((await api.read('workout')).device.status,'reconnect');
 await api.enableNotifications('A',{reconnect:true});assert.equal((await api.read('workout')).device.status,'ready');
 offline=true;assert.equal((await api.read('workout')).device.status,'unverified');assert.equal(preference.notifications,true);offline=false;
 const before=calls.filter(x=>x==='unsubscribe-device').length;user='B';
 await assert.rejects(api.enableNotifications('A',{reconnect:true}),/Account changed/);
 assert.equal(calls.filter(x=>x==='unsubscribe-device').length,before,'account switch cannot mutate old device during stale reconnect');
 console.log('PASS real browser-service adapter: reopen, explicit fresh reconnect, false unsubscribe result with removed device, revoked server registration, offline verification and account-switch guard.');
}finally{
 globalThis.fetch=oldFetch;globalThis.window=oldWindow;delete globalThis.Notification;delete globalThis.__pushClient;
 if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;
}
