// Dedicated authenticated poller: no browser process or WhatsApp bridge required.
import { pathToFileURL } from 'node:url';
import { writeFile, rename } from 'node:fs/promises';

export function workerConfiguration(env=process.env) {
  let origin;
  try { origin=new URL(env.LIFEOS_PUSH_ORIGIN); } catch { throw new Error('Configure HTTPS LIFEOS_PUSH_ORIGIN.'); }
  if(origin.protocol!=='https:' || !env.LIFEOS_PUSH_DISPATCH_SECRET) throw new Error('Configure HTTPS origin and server-only dispatch secret.');
  if(origin.username || origin.password || origin.search || origin.hash || origin.pathname!=='/') throw new Error('Use a credential-free application origin without a path, query or fragment.');
  const intervalMs=Number(env.LIFEOS_PUSH_POLL_MS||10000);
  if(!Number.isInteger(intervalMs)||intervalMs<10000||intervalMs>300000) throw new Error('Use a polling interval between 10000 and 300000 milliseconds.');
  return {origin,secret:env.LIFEOS_PUSH_DISPATCH_SECRET,intervalMs};
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
  let failures=0,attempts=0,lastSuccess=null;
  process.on('SIGTERM',()=>{stopping=true;}); process.on('SIGINT',()=>{stopping=true;});
  while(!stopping) {
    const started=Date.now();
    let outcome;
    try {
      outcome=await dispatchOnce(configuration);lastSuccess=new Date().toISOString();
      if(failures||outcome.claimed||attempts%60===0) console.log(JSON.stringify({time:lastSuccess,...outcome}));
      failures=0;
    } catch {
      failures++;
      if(failures===1||failures%6===0) console.error(JSON.stringify({time:new Date().toISOString(),error:'Training push dispatch unavailable',failures}));
    }
    attempts++;
    if(process.env.LIFEOS_PUSH_HEALTH_FILE) {
      const file=process.env.LIFEOS_PUSH_HEALTH_FILE;
      try {
        await writeFile(file+'.tmp',JSON.stringify({attemptedAt:new Date().toISOString(),lastSuccess,failures,attempts,durationMs:Date.now()-started,intervalMs:configuration.intervalMs,...outcome}),{mode:0o600});
        await rename(file+'.tmp',file);
      } catch { console.error('Training push health file unavailable'); }
    }
    if(!stopping) await new Promise(resolve=>setTimeout(resolve,configuration.intervalMs));
  }
}
