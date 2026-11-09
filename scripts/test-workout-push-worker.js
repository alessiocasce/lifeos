import assert from 'node:assert/strict';
import { workerConfiguration, dispatchOnce } from './workout-push-worker.js';

assert.throws(()=>workerConfiguration({LIFEOS_PUSH_ORIGIN:'http://example.test',LIFEOS_PUSH_DISPATCH_SECRET:'secret'}),/HTTPS/);
assert.throws(()=>workerConfiguration({LIFEOS_PUSH_ORIGIN:'https://user:password@example.test',LIFEOS_PUSH_DISPATCH_SECRET:'secret'}),/origin/);
const configuration=workerConfiguration({LIFEOS_PUSH_ORIGIN:'https://lifeos.example.test',LIFEOS_PUSH_DISPATCH_SECRET:'server-only'});
let requests=0;
assert.deepEqual(await dispatchOnce(configuration,async (url,options)=>{
  requests++; assert.equal(url.href,'https://lifeos.example.test/api/ai/actions');
  assert.equal(options.redirect,'error'); assert.equal(options.headers.authorization,'Bearer server-only');
  assert.deepEqual(JSON.parse(options.body),{action:'training_push_dispatch'});
  return {ok:true,status:200,json:async()=>({data:{claimed:2,accepted:1,failed:1}})};
}),{http:200,claimed:2,accepted:1,failed:1});
assert.equal(requests,1);
await assert.rejects(dispatchOnce(configuration,async()=>({ok:false,status:503})),/HTTP 503/);
await assert.rejects(dispatchOnce(configuration,async()=>{throw new Error('private endpoint');}),/private endpoint/);
console.log('PASS worker configuration, HTTPS credential-free origin, redirect rejection, authenticated dispatch contract and operational counts/errors.');
