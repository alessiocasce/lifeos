import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function workerHealthy(health,now=Date.now()) {
  const last=Date.parse(health?.lastSuccess),attempt=Date.parse(health?.attemptedAt);
  return Number.isFinite(last)&&Number.isFinite(attempt)&&now-last<120000&&now-attempt<120000&&health.failures<6;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  let healthy=false;
  try{healthy=workerHealthy(JSON.parse(readFileSync('/var/lib/lifeos-push/health.json','utf8')));}catch{}
  if(!healthy){console.error('LifeOS push unhealthy: inspect pm2-lifeos-push.service, worker logs and Vercel dispatch configuration. Foreground countdown remains independent.');process.exitCode=1;}
}
