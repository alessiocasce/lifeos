import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { execFileSync } from 'node:child_process';

const root=path.dirname(fileURLToPath(import.meta.url));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const report=JSON.parse(read('simulations/results/revision-report.json'));
assert.equal(report.tests.length,38);
assert.ok(report.tests.every(t=>t.status==='passed'));
assert.equal(report.version,'rankings-final-proposal-v3');
assert.deepEqual([report.exploit.original.xp,report.exploit.original.rp],[360,378]);
assert.deepEqual([report.exploit.selected.xp,report.exploit.selected.publicEarnedXP,report.exploit.selected.rp],[360,80,63]);
assert.equal(report.exploit.selected.days.length,1);
assert.equal(report.examples.apexRegression.priorApex,'Diamond');
assert.equal(report.examples.apexRegression.newAccount,'Diamond');
assert.equal(report.visual.snapshot.rp,762);
assert.deepEqual(report.frequencies.slice(2).map(p=>p.weeklyXP),[360,360]);
const balanced=report.decay.find(d=>d.policy==='balanced');
assert.deepEqual([0,7,14,21,28,42].map(n=>balanced.trajectory[n].rp),[1000,843,618,379,161,0]);
const docs=['FINAL-APPROVAL.md','PRODUCT-SPEC.md','IMPLEMENTATION.md','README.md','DECISION-CHANGELOG.md','design-qa.md'];
for(const name of docs){
  const content=read(name);
  assert.ok(content.length>800,name);
  assert.ok(!/ +$/m.test(content),name+' trailing whitespace');
  for(const match of content.matchAll(/\]\(([^)]+)\)/g)){
    const link=match[1];
    if(/^(https?:|#)/.test(link))continue;
    assert.ok(fs.existsSync(path.join(root,decodeURIComponent(link.split(/[?#]/)[0]))),name+' broken link '+link);
  }
}
assert.equal(fs.readdirSync(root).filter(n=>/^[0-9][0-9]-/.test(n)).length,0,'obsolete current-looking draft');
for(const name of fs.readdirSync(path.join(root,'archive')).filter(n=>/^[0-9][0-9]-/.test(n)))assert.ok(read('archive/'+name).includes('ARCHIVED DESIGN HISTORY'));
assert.ok(read('PRODUCT-SPEC.md').includes('BEFORE ordinary point')||read('PRODUCT-SPEC.md').includes('hard gates first'));
assert.ok(read('PRODUCT-SPEC.md').includes('rankings_enrolled=false'));
for(const file of ['prototype.jsx','CompletionRevision.jsx']){
  const source=read('prototypes/'+file);
  parse(source,{sourceType:'module',plugins:['jsx']});
  for(const forbidden of ['fetch(','supabase','localStorage'])assert.ok(!source.includes(forbidden),file+' '+forbidden);
}
const completion=read('prototypes/CompletionRevision.jsx');
for(const text of ['Workout completed!','Back to training','Workout overview','Workout summary','View history','Rewards updating','Rewards temporarily unavailable','No live account data'])assert.ok(completion.includes(text),text);
assert.ok(!completion.includes('Back to Rankings'));
const states=JSON.parse(read('screenshots/completion-responsive.json'));
assert.equal(states.length,15);
assert.equal(new Set(states.map(s=>s.width+':'+s.scene)).size,15);
for(const s of states){
  assert.equal(s.overflow,false);
  assert.ok(Math.abs(s.dockBottom-844)<1);
  if(s.scene==='long-bottom')assert.ok(s.historyBottom<s.dockTop);
  else {assert.equal(s.shortButtons,0);assert.ok(s.hasOverview&&s.hasSummary&&s.hasHistory);}
  if(['loading','unavailable'].includes(s.scene))assert.ok(!/XP|RP/.test(s.rewardText));
}
for(const name of ['success','pending','unavailable','long','long-bottom']){
  const bytes=fs.readFileSync(path.join(root,'screenshots/completion-'+name+'-390.png'));
  assert.equal(bytes.subarray(1,4).toString(),'PNG');
  const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
  assert.ok(w>=375&&w<=390&&Math.abs(w/h-390/844)<.002,'mobile raster geometry');
  assert.ok(bytes.length>8000);
}
for(const name of ['revision-decay','revision-leagues','revision-recovery','revision-return']){
  assert.ok(read('simulations/results/'+name+'.svg').includes('SYNTHETIC'));
  assert.ok(fs.statSync(path.join(root,'simulations/results/'+name+'.png')).size>5000);
}
const coverage=JSON.parse(read('simulations/results/coverage-audit.json'));
assert.equal(coverage.candidate_sets,160);
assert.equal(coverage.valid_working_sets,489);
assert.ok(Math.abs(coverage.candidate_percent_working-100*160/489)<.0001);
const status=execFileSync('git',['status','--porcelain','-z','--untracked-files=all'],{encoding:'utf8'});
const preservedExports=new Set(['docs/plans/lifeos-rankings.zip','docs/plans/lifeos-rankings (2).zip']);
for(const line of status.split('\0').filter(Boolean)){
  const file=line.slice(3).replaceAll('\\','/');
  if(line.startsWith('?? ')&&preservedExports.has(file))continue;
  assert.ok(file.startsWith('docs/plans/lifeos-rankings/'),'out-of-scope change '+line);
}
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),'23a4b6256c9b86b8f8cf64bc458fc3f0429623ac');
console.log(JSON.stringify({currentAssertions:38,authoritativeSpec:1,currentDocuments:docs.length,completionCaptures:5,responsiveStates:15,comparisonCharts:4,productionUnchanged:true,commitsCreated:0},null,2));
