import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Real Workbox A -> B activation on one stable local origin. No production data.
const root=path.resolve('test-results/pwa-upgrade');
for(const version of ['A','B']) {
  const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','tests/pwa/vite.config.js','--outDir',`${root}/${version}`],{env:{...process.env,LIFEOS_BUILD_ID:`qa-build-${version}`},encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr+'\n'+result.stdout);
}
let version='A';
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.includes('..')){res.writeHead(400).end();return;}
    const file=path.join(root,version,pathname==='/'?'index.html':pathname);
    let bytes;let ext=path.extname(file);
    try {bytes=await readFile(file);}catch{bytes=await readFile(path.join(root,version,'index.html'));ext='.html';}
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
  }catch{res.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(4189,'127.0.0.1',resolve));
const browser=await chromium.launch();
try {
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(()=>{
    if(localStorage.getItem('pwa-seeded'))return;
    localStorage.setItem('pwa-seeded','true');localStorage.setItem('qa-workouts','[]');localStorage.setItem('qa-templates','[]');
    localStorage.setItem('preserve-draft-sentinel','do not erase');
  });
  await page.goto('http://127.0.0.1:4189/settings');
  await page.getByRole('region',{name:'Application',exact:true}).getByText('qa-build-A',{exact:true}).waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();
  version='B';
  // The update is available during a live session, but must not activate it.
  await page.evaluate(()=>localStorage.setItem('qa-workouts',JSON.stringify([{id:'pwa-active',user_id:'qa-user-a',name:'Update guard QA',performed_on:'2026-11-03',started_at:new Date().toISOString(),workout_sets:[]}])));
  await page.reload();
  const observer=await context.newPage();
  await observer.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await observer.goto('http://127.0.0.1:4189/settings');
  await observer.getByText('qa-build-A',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Check for updates',exact:true}).click();
  await page.getByRole('complementary',{name:'LifeOS update available'}).waitFor({timeout:30000});
  await mkdir(root,{recursive:true});await page.screenshot({path:root+'/desktop-update-ready.png'});
  await page.getByRole('region',{name:'Application',exact:true}).getByRole('button',{name:'Update now',exact:true}).click();
  await page.getByRole('region',{name:'Application',exact:true}).getByText('Update ready - finish your workout first.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),true);
  await page.getByRole('button',{name:'Training',exact:true}).click();
  await page.getByRole('button',{name:'End Workout',exact:true}).click();
  await page.getByText('Session complete',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Later',exact:true}).click();
  assert.equal(await page.getByRole('complementary',{name:'LifeOS update available'}).count(),0);
  await page.getByRole('region',{name:'Application',exact:true}).getByRole('button',{name:'Update now',exact:true}).click();
  await page.getByRole('region',{name:'Application',exact:true}).getByText('qa-build-B',{exact:true}).waitFor({timeout:30000});
  // Workbox must not reload a different tab when this tab activates the worker.
  await observer.getByText('qa-build-A',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('preserve-draft-sentinel')),'do not erase');
  await page.getByText('The new LifeOS version is running.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Check for updates',exact:true}).click();await page.getByText("You're running the latest LifeOS version.",{exact:true}).waitFor();
  await context.setOffline(true);await page.getByRole('button',{name:'Check for updates',exact:true}).click();await page.getByText("Can't check for updates while offline.",{exact:true}).waitFor();await context.setOffline(false);
  await page.screenshot({path:root+'/desktop-updated-B.png'});
  console.log('PASS real production-mode Workbox A -> B: prompt, active-workout block, end then update, Later, activation/controllerchange, no other-tab reload, changed build, preserved storage, current/offline states');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
