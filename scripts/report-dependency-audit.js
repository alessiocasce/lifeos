import fs from 'node:fs';
import { execSync } from 'node:child_process';

const label=process.argv[2] || 'current';
if(!/^[a-z-]+$/.test(label)) throw new Error('Use a simple report label');
let audit;
try { audit=JSON.parse(execSync('npm audit --json',{encoding:'utf8',stdio:['ignore','pipe','pipe']})); }
catch(error) { if(!error.stdout) throw error; audit=JSON.parse(error.stdout); }
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const report={capturedAt:new Date().toISOString(),totals:audit.metadata.vulnerabilities,packages:[]};
for(const vulnerability of Object.values(audit.vulnerabilities)) {
  let chains=[];
  try { chains=JSON.parse(execSync(`npm explain ${vulnerability.name} --json`,{encoding:'utf8',stdio:['ignore','pipe','pipe']})); } catch { /* missing optional package */ }
  report.packages.push({name:vulnerability.name,severity:vulnerability.severity,range:vulnerability.range,fixAvailable:vulnerability.fixAvailable,
    installed:vulnerability.nodes.map(path=>({path,version:lock.packages[path]?.version,dev:!!lock.packages[path]?.dev})),
    advisories:vulnerability.via.filter(item=>typeof item==='object'),via:vulnerability.via.filter(item=>typeof item==='string'),
    immediateParents:[...new Set(chains.flatMap(entry=>entry.dependents||[]).map(entry=>entry.from?.name||'lifeos'))]});
}
fs.mkdirSync('docs/audits/dependencies',{recursive:true});
fs.writeFileSync(`docs/audits/dependencies/${label}.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.totals));
console.log(report.packages.map(p=>`${p.name}: ${p.installed.map(i=>i.version).join(', ')}; ${p.severity}; ${p.range}; fix=${JSON.stringify(p.fixAvailable)}`).join('\n'));
