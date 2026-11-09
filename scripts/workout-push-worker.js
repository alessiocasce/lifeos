// Dedicated authenticated poller: no browser process or WhatsApp bridge required.
import { pathToFileURL } from 'node:url';

export function workerConfiguration(env=process.env) {
  let origin;
  try { origin=new URL(env.LIFEOS_PUSH_ORIGIN); } catch { throw new Error('Configure HTTPS LIFEOS_PUSH_ORIGIN.'); }
  if(origin.protocol!=='https:' || !env.LIFEOS_PUSH_DISPATCH_SECRET) throw new Error('Configure HTTPS origin and server-only dispatch secret.');
  if(origin.username || origin.password || origin.search || origin.hash || origin.pathname!=='/') throw new Error('Use a credential-free application origin without a path, query or fragment.');
  return {origin,secret:env.LIFEOS_PUSH_DISPATCH_SECRET};
}

export async function dispatchOnce({origin,secret},fetcher=fetch) {
  const response=await fetcher(new URL('/api/ai/actions',origin),{method:'POST',redirect:'error',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},
    body:JSON.stringify({action:'training_push_dispatch'}),signal:AbortSignal.timeout(45000)});
  if(!response.ok) throw new Error(`Dispatch HTTP ${response.status}`);
  const {data}=await response.json();
  if(!data || !['claimed','accepted','failed'].every(key=>Number.isInteger(data[key]) && data[key]>=0)) throw new Error('Invalid dispatch response.');
  return {http:response.status,claimed:data.claimed,accepted:data.accepted,failed:data.failed};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const configuration=workerConfiguration();
  let stopping=false;
  process.on('SIGTERM',()=>{stopping=true;}); process.on('SIGINT',()=>{stopping=true;});
  while(!stopping) {
    try { console.log(JSON.stringify({time:new Date().toISOString(),...await dispatchOnce(configuration)})); }
    catch { console.error(JSON.stringify({time:new Date().toISOString(),error:'Training push dispatch unavailable'})); }
    if(!stopping) await new Promise(resolve=>setTimeout(resolve,5000));
  }
}
