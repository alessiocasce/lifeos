import assert from 'node:assert/strict';
import { workerConfiguration, dispatchOnce } from './workout-push-worker.js';
import { workerHealthy } from '../ops/workout-push/healthcheck.mjs';
import supervisor from '../ops/workout-push/ecosystem.config.cjs';
assert.equal(supervisor.apps[0].interpreter,'none','PM2 must supervise Node directly, not wrap the ESM entrypoint');
assert.equal(supervisor.apps[0].script,process.execPath);

assert.throws(()=>workerConfiguration({LIFEOS_PUSH_ORIGIN:'http://example.test',LIFEOS_PUSH_DISPATCH_SECRET:'secret'}),/HTTPS/);
assert.throws(()=>workerConfiguration({LIFEOS_PUSH_ORIGIN:'https://user:password@example.test',LIFEOS_PUSH_DISPATCH_SECRET:'secret'}),/origin/);
const configuration=workerConfiguration({LIFEOS_PUSH_ORIGIN:'https://lifeos.example.test',LIFEOS_PUSH_DISPATCH_SECRET:'server-only'});
assert.equal(configuration.intervalMs,10000,'production polling defaults to ten seconds');
assert.throws(()=>workerConfiguration({LIFEOS_PUSH_ORIGIN:'https://example.test',LIFEOS_PUSH_DISPATCH_SECRET:'secret',LIFEOS_PUSH_POLL_MS:'5000'}),/interval/);
let requests=0;
assert.deepEqual(await dispatchOnce(configuration,async (url,options)=>{
  requests++; assert.equal(url.href,'https://lifeos.example.test/api/ai/actions');
  assert.equal(options.redirect,'error'); assert.equal(options.headers.authorization,'Bearer server-only');
  assert.deepEqual(JSON.parse(options.body),{action:'training_push_dispatch'});
  return {ok:true,status:200,json:async()=>({data:{claimed:2,accepted:1,failed:1}})};
}),{http:200,claimed:2,accepted:1,failed:1});
assert.equal(requests,1);
assert.equal(workerHealthy({lastSuccess:'2026-11-09T10:00:00Z',attemptedAt:'2026-11-09T10:00:00Z',failures:0},Date.parse('2026-11-09T10:00:10Z')),true);
assert.equal(workerHealthy({lastSuccess:'2026-11-09T10:00:00Z',attemptedAt:'2026-11-09T10:00:00Z',failures:0},Date.parse('2026-11-09T10:03:00Z')),false);
await assert.rejects(dispatchOnce(configuration,async()=>({ok:false,status:503})),/HTTP 503/);
await assert.rejects(dispatchOnce(configuration,async()=>{throw new Error('private endpoint');}),/private endpoint/);
console.log('PASS worker configuration, HTTPS credential-free origin, redirect rejection, authenticated dispatch contract and operational counts/errors.');
