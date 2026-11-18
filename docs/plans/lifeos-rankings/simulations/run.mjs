import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VERSION,dailyActivity,ratedDays,lifetimeXP,corroborateProgress,score,displayTier,kernel,levelAt,levelStart,weekOf,tierAt } from './engine.mjs';
import assert from 'node:assert/strict';
const out=fileURLToPath(new URL('./results/',import.meta.url));
fs.mkdirSync(out,{recursive:true});
const anchor='2026-11-03';
const patterns={1:[0],2:[0,3],3:[0,2,5],4:[0,1,3,5],5:[0,1,2,3,5]};
const definitions=[
  ['beginner_1','Beginner / 1 day',1,'beginner'],['beginner_2','Beginner / 2 days',2,'beginner'],
  ['beginner_3','Beginner / 3 days',3,'beginner'],['experienced_3','Experienced / 3 days',3,'slow'],
  ['experienced_5','Experienced / 5 days',5,'slow'],['inconsistent','High volume / inconsistent',4,'flat'],
  ['plateau','Consistent plateau',3,'flat'],['rapid','Rapid beginner gains',3,'rapid'],
  ['advanced','Advanced slow progress',3,'slow'],['deload','Deload week',3,'slow'],
  ['recovery','Two-week recovery',3,'slow'],['inactive','One month inactive',3,'slow'],
  ['returning','Return after 3 months',3,'slow'],['bodyweight','Bodyweight rep progress',3,'bodyweight'],
  ['irregular','Irregular schedule',3,'slow'],['split','Multiple workouts per day',3,'slow'],
  ['farmer','100 sets per day',3,'slow'],['backdate','Late historical entries',3,'flat'],
  ['deletion','Previously rewarded deletion',3,'slow'],['years','Multi-year member',3,'slow'],
];
function generate(def,days=365) {
  const [id,,freq,growth]=def; const workouts=[],performances=[]; let sequence=0;
  for(let day=0;day<days;day++) {
    const weekday=(day+1)%7;
    const planned=id==='irregular' ? [0,2,5].includes((day+Math.floor(day/7))%7) : patterns[freq].includes(weekday);
    if(!planned)continue;
    if(id==='inconsistent' && Math.floor(day/14)%2)continue;
    if(id==='recovery' && day>=280 && day<294)continue;
    if(id==='inactive' && day>=days-30)continue;
    if(id==='returning' && day>=days-104 && day<days-14)continue;
    const setsPer=id==='farmer'?100:id==='inconsistent'?32:id==='deload' && day>=280 && day<287?4:8;
    const step=growth==='rapid'?5:growth==='beginner'?9:growth==='slow'?28:0;
    const start=growth==='slow'?150:20;
    const weight=growth==='bodyweight'?0:start+(step?Math.min(40,Math.floor(sequence/step))*2.5:0);
    const reps=growth==='bodyweight'?6+Math.min(8,Math.floor(sequence/12)):8;
    const workout={id:id+'-'+day,day,rankDay:day,receivedDay:id==='backdate'?day+7:day,completed:true,
      sets:Array.from({length:setsPer},(_,n)=>({id:id+'-'+day+'-'+n,exerciseId:'lift-'+(n%2),exercise:'Synthetic '+(n%2),weight,reps,warmup:false}))};
    if(id==='split')for(let part=0;part<2;part++)workouts.push({...workout,id:workout.id+'-'+part,sets:workout.sets.slice(part*4,part*4+4)});
    else workouts.push(workout);
    for(let n=0;n<2;n++)performances.push({id:id+'-p-'+day+'-'+n,day,exerciseId:'lift-'+n,context:growth==='bodyweight'?'bodyweight_standard':'standard_barbell',weight,reps,comparable:id!=='backdate',tick:2.5});
    sequence++;
  }
  if(id==='deletion') {
    for(const w of workouts.filter(w=>w.day>=days-14))workouts.push({...w,receivedDay:days-1,revision:1,deleted:true});
    const removed=new Set(workouts.filter(w=>w.deleted).map(w=>w.day));
    return {workouts,performances:performances.map(p=>removed.has(p.day)?{...p,deletedAt:days-1}:p)};
  }
  return {workouts,performances};
}
const profiles=[];
const trajectories={};
for(const def of definitions) {
  const data=generate(def); const events=corroborateProgress(data.performances);
  const line=[];let display={tier:'Unranked',below:0},promotions=0,demotions=0;
  const tierOrder=['Unranked','Bronze','Silver','Gold','Platinum','Diamond','Apex'];
  for(let day=0;day<365;day++) {
    const effectiveEvents=def[0]==='deletion' && day===364 ? corroborateProgress(data.performances.filter(p=>p.deletedAt!==364)) : events;
    const snapshots=Object.fromEntries(['A','B','C'].map(m=>[m,score(data.workouts,effectiveEvents,day,m)]));
    const next=displayTier(snapshots.B,ratedDays(dailyActivity(data.workouts,day,true)),day,display);
    if(tierOrder.indexOf(next.tier)>tierOrder.indexOf(display.tier))promotions++;
    if(tierOrder.indexOf(next.tier)<tierOrder.indexOf(display.tier))demotions++;
    display=next;
    const xp=lifetimeXP(data.workouts,day);
    line.push({day,xp,level:levelAt(xp),A:snapshots.A.rp,B:snapshots.B.rp,C:snapshots.C.rp,displayTier:display.tier});
  }
  const xp=line.at(-1).xp;
  const final=score(data.workouts,def[0]==='deletion'?corroborateProgress(data.performances.filter(p=>p.deletedAt!==364)):events,364);
  profiles.push({id:def[0],name:def[1],frequency:def[2],events:events.length,xp,level:levelAt(xp),lastWeekXP:xp-line[357].xp,
    rp:final.rp,rawTier:final.tier,displayTier:display.tier,components:final.breakdown,promotions,demotions,
    meanRP:lastMean(line,'B'),A:lastMean(line,'A'),C:lastMean(line,'C')});
  trajectories[def[0]]=line;
}
function lastMean(line,key) { const a=line.slice(-28);return Math.round(a.reduce((s,p)=>s+p[key],0)/a.length); }
const steady=[];
for(let frequency=1;frequency<=5;frequency++) {
  // Exactly 52 complete Monday-Sunday weeks, excluding partial boundary weeks.
  const data=generate(['steady','',frequency,'flat'],370);
  const xp=lifetimeXP(data.workouts.filter(w=>w.day>=6),369);
  steady.push({frequency,weeklyXP:xp/52,yearXP:xp,level:levelAt(xp),meanRP:Math.round(Array.from({length:28},(_,i)=>score(data.workouts,[],336+i).rp).reduce((a,b)=>a+b,0)/28)});
}
const stopped=generate(['stopped','',3,'slow'],84);
const stopEvents=corroborateProgress(stopped.performances);
const decay=[0,1,3,7,14,21,28,90].map(days=>({inactiveDays:days,rp:score(stopped.workouts,stopEvents,83+days).rp,
  xp:lifetimeXP(stopped.workouts,83+days),level:levelAt(lifetimeXP(stopped.workouts,83+days))}));
const sensitivity=[];
for(const target of [8,9,10.5,12])for(const weights of [[.40,.40,.20],[.45,.40,.15],[.50,.40,.10]]) {
  const data=generate(['sensitivity','',3,'slow']);const events=corroborateProgress(data.performances);
  sensitivity.push({target,weights,mean:Math.round(Array.from({length:28},(_,i)=>score(data.workouts,events,337+i,'B',{target,weights}).rp).reduce((a,b)=>a+b,0)/28)});
}
const progressSensitivity=[.01,.02,.03,.05].map(threshold=>{
  const data=generate(['progress-sensitivity','',3,'slow']);const events=corroborateProgress(data.performances,threshold);
  return {threshold,events:events.length,meanRP:Math.round(Array.from({length:28},(_,i)=>score(data.workouts,events,337+i).rp).reduce((a,b)=>a+b,0)/28)};
});
const windowSensitivity=[14,28,42].map(window=>({window,interpretation:window===28?'chosen: 14 flat + 14 fading days':'comparison: simple box window',
  cliffInRPForOneFullDay:window===28?Math.round(850/9/14):Math.round(850/(window*3/7))}));
const thresholdSensitivity=[850,900,950].map(apex=>({apex,profilesAtOrAbove:profiles.filter(p=>p.rp>=apex).length}));
const distribution=Object.fromEntries(['A','B','C'].map(m=>[m,Object.fromEntries(['Unranked',...['Bronze','Silver','Gold','Platinum','Diamond','Apex']].map(tier=>[tier,profiles.filter(p=>tierAt(trajectories[p.id].at(-1)[m])===tier).length]))]));

// Executable assertions test transformations of the SAME activity, not just
// narrative assumptions that a profile called "farmer" is safe.
const tests=[];
function check(name,test) { test();tests.push({name,status:'passed'}); }
const base=generate(['control','',3,'slow']);const ev=corroborateProgress(base.performances);
check('duplicate workout payload does not change XP or RP',()=>{
  assert.equal(lifetimeXP([...base.workouts,...base.workouts],364),lifetimeXP(base.workouts,364));
  assert.equal(score([...base.workouts,...base.workouts],ev,364).rp,score(base.workouts,ev,364).rp);
});
check('splitting sessions on same day does not mint base XP',()=>{
  const split=base.workouts.flatMap(w=>[0,1].map(i=>({...w,id:w.id+'split'+i,sets:w.sets.slice(i*4,i*4+4)})));
  assert.equal(lifetimeXP(split,364),lifetimeXP(base.workouts,364));
  assert.equal(score(split,ev,364).rp,score(base.workouts,ev,364).rp);
});
check('100 sets has no advantage over eight matching sets',()=>{
  const inflated=base.workouts.map(w=>({...w,sets:Array.from({length:100},(_,i)=>({...w.sets[i%8],id:w.id+'inflated'+i}))}));
  assert.equal(lifetimeXP(inflated,364),lifetimeXP(base.workouts,364));
  assert.equal(score(inflated,ev,364).rp,score(base.workouts,ev,364).rp);
});
check('changing load alone cannot increase activity points',()=>{
  const heavy=base.workouts.map(w=>({...w,sets:w.sets.map(s=>({...s,weight:99999}))}));
  assert.equal(score(heavy,[],364).rp,score(base.workouts,[],364).rp);
});
check('warmups alone and trivial three-set day receive no points',()=>{
  assert.equal(lifetimeXP(base.workouts.map(w=>({...w,sets:w.sets.map(s=>({...s,warmup:true}))})),364),0);
  assert.equal(lifetimeXP(base.workouts.map(w=>({...w,sets:w.sets.slice(0,3)})),364),0);
});
check('seven-day late entry never earns competitive credit',()=>assert.equal(score(generate(definitions[17]).workouts,[],364).rp,0));
check('workout revisions replace rewards rather than duplicate them',()=>{
  const changed=base.workouts.map(w=>({...w,revision:2}));
  assert.equal(lifetimeXP([...base.workouts,...changed],364),lifetimeXP(base.workouts,364));
});
check('deletion reverses XP and cannot leave an active rank after 28 days',()=>{
  const removed=base.workouts.map(w=>({...w,revision:3,deleted:true,receivedDay:364}));
  assert.equal(lifetimeXP([...base.workouts,...removed],364),0);
  assert.equal(score([...base.workouts,...removed],[],364).rp,0);
});
check('no lifetime decay and complete competitive expiry',()=>{
  assert.equal(decay.at(-1).xp,decay[0].xp);assert.equal(decay.find(d=>d.inactiveDays===28).rp,0);
});
check('all scores stay in [0,1000]',()=>Object.values(trajectories).flat().forEach(p=>['A','B','C'].forEach(k=>assert.ok(p[k]>=0&&p[k]<=1000))));
check('level thresholds invert exactly for first 10000 levels',()=>{for(let l=1;l<=10000;l++){assert.equal(levelAt(levelStart(l)),l);assert.equal(levelAt(levelStart(l+1)-1),l);}});
check('progress is corroborated, context-separated and cooldown-bound',()=>{
  const fixture=[0,7,14,21,28,35,42,49].map((day,i)=>({id:''+i,day,exerciseId:'lift',context:'a',comparable:true,weight:i<3?50:i<6?52.5:50,reps:8}));
  const awards=corroborateProgress(fixture);assert.equal(awards.length,1);assert.equal(awards[0].day,28);
  assert.equal(corroborateProgress(fixture.map((r,i)=>({...r,context:'different-'+i}))).length,0);
  assert.equal(corroborateProgress(fixture.slice(0,4)).length,0);
});
check('three-day sustainable program can reach Apex without five-day training',()=>assert.ok(trajectories.beginner_3.some(p=>p.displayTier==='Apex')));
check('52 full weeks obey 80/170/270/360/360 XP and four-day cap',()=>assert.deepEqual(steady.map(p=>p.weeklyXP),[80,170,270,360,360]));
check('historical date corrections cannot move frozen competitive dates',()=>{
  const moved=base.workouts.map(w=>({...w,day:w.day-70}));
  assert.equal(score(moved,ev,364).rp,score(base.workouts,ev,364).rp);
});
check('distinct rep ranges use a Pareto frontier without e1RM conversion',()=>{
  const points=[[0,50,8],[7,50,8],[14,50,8],[21,52.5,8],[28,52.5,8],[35,65,5],[42,65,5],[49,65,5],[56,67.5,5],[63,67.5,5]];
  const sessions=points.map(([day,weight,reps],i)=>({id:''+i,day,weight,reps,exerciseId:'lift',context:'barbell',comparable:true}));
  assert.equal(corroborateProgress(sessions).length,2);
});

const report={version:VERSION,anchor,seed:'patterns-v1-no-randomness',days:365,synthetic:true,profiles,steady,decay,sensitivity,progressSensitivity,windowSensitivity,thresholdSensitivity,distribution,tests};
const visualWorkouts=[0,3,5,7,10,12,14,17,19,21].map((age,i)=>({id:'visual-'+i,day:364-age,rankDay:364-age,receivedDay:364-age,completed:true,
  sets:Array.from({length:[8,6,4,4,4,4,4,5,4,5][i]},(_,n)=>({id:'visual-'+i+'-'+n,exerciseId:'lift-'+n%2,exercise:'Synthetic',weight:50,reps:8,warmup:false}))}));
const visualEvents=[{day:364,exerciseId:'lift-0',gain:.05}];
const visualSnapshot=score(visualWorkouts,visualEvents,364);
assert.equal(visualSnapshot.rp,760);
assert.deepEqual(visualSnapshot.breakdown,[446,239,75]);
fs.writeFileSync(out+'visual-fixture.json',JSON.stringify({workouts:visualWorkouts,events:visualEvents,snapshot:visualSnapshot,xp:6420,level:levelAt(6420),nextLevelAt:levelStart(20)},null,2)+'\n');
fs.writeFileSync(out+'report.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(out+'trajectories.json',JSON.stringify(trajectories)+'\n');
fs.writeFileSync(out+'summary.csv','profile,weekly_xp_last_week,lifetime_xp,level,rp,raw_tier,display_tier,promotions,demotions\n'+profiles.map(p=>[p.id,p.lastWeekXP,p.xp,p.level,p.rp,p.rawTier,p.displayTier,p.promotions,p.demotions].join(',')).join('\n')+'\n');
const multi=generate(['years','',3,'slow'],365*5);
report.multiYear={years:5,xp:lifetimeXP(multi.workouts,365*5-1),level:levelAt(lifetimeXP(multi.workouts,365*5-1)),
  rp:score(multi.workouts,corroborateProgress(multi.performances),365*5-1).rp};
fs.writeFileSync(out+'report.json',JSON.stringify(report,null,2)+'\n');

function chart(name,title,series,max=1000,label='RP') {
  const width=920,height=430,x=60,y=50,w=820,h=300;
  const lines=series.map((s,i)=>{
    const color=['#77d4c8','#e8bd66','#af9cf0','#c2cbd5'][i%4];
    const points=s.values.map((v,n)=>`${x+n*w/(s.values.length-1)},${y+h-v/max*h}`).join(' ');
    return `<polyline fill="none" stroke="${color}" stroke-width="2" points="${points}"/><text x="${70+i*210}" y="405" fill="${color}" font-size="12">${s.name}</text>`;
  }).join('');
  const grid=[0,.25,.5,.75,1].map(t=>`<line x1="${x}" x2="${x+w}" y1="${y+h-t*h}" y2="${y+h-t*h}" stroke="#303640"/><text x="12" y="${y+h-t*h+4}" fill="#abb5c3" font-size="12">${Math.round(t*max)}</text>`).join('');
  const ticks=[0,.25,.5,.75,1].map(t=>`<text x="${x+t*w}" y="368" text-anchor="middle" fill="#abb5c3" font-size="11">${name==='xp-levels'?'Week ':'Day '}${Math.round(t*(series[0].values.length-1))+(name==='xp-levels'?1:0)}</text>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#0b0d0f"/><g font-family="Arial,sans-serif"><text x="60" y="28" fill="#f1f3f5" font-size="18">${title} - SYNTHETIC</text>${grid}${lines}${ticks}<text x="60" y="385" fill="#abb5c3" font-size="11">${label}; chronological simulation samples, not population estimates</text></g></svg>`;
  fs.writeFileSync(out+name+'.svg',svg);
}
chart('model-comparison','Same experienced 3-day user, three models',['A','B','C'].map(m=>({name:'Model '+m,values:trajectories.experienced_3.map(p=>p[m])})));
chart('frequency','Training frequency, flat performance',[1,2,3,5].map(n=>({name:n+' day(s)/week',values:generateLine(n)})));
function generateLine(n){const data=generate(['steady','',n,'flat']);return Array.from({length:84},(_,d)=>score(data.workouts,[],d).rp);}
chart('recovery','Plateau, deload, recovery and return',['plateau','deload','recovery','returning'].map(id=>({name:id,values:trajectories[id].slice(-120).map(p=>p.B)})));
chart('xp-levels','Lifetime level over 52 weeks',[1,2,3,5].map(n=>{const data=generate(['steady','',n,'flat']);return{name:n+' day(s)/week',values:Array.from({length:52},(_,w)=>levelAt(lifetimeXP(data.workouts,w*7+6)))};}),40,'Level');
chart('decay','Inactivity after established training',[{name:'Competitive RP',values:Array.from({length:35},(_,d)=>score(stopped.workouts,stopEvents,83+d).rp)}]);
console.log(JSON.stringify({profiles:profiles.length,tests:tests.length,steady,decay,multiYear:report.multiYear},null,2));
