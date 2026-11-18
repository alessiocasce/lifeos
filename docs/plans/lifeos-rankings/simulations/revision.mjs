import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { activity, xp, snapshot, league as configuredLeague, mechanisms, consistencyKey } from './revision-engine.mjs';
import { lifetimeXP, score, corroborateProgress } from './engine.mjs';
const out = fileURLToPath(new URL('./results/', import.meta.url));
const tests = [];
// Compare the eventual full league model; the actual launch default remains OFF.
const league=(s,asOf,previous,flags={apexEnabled:true})=>configuredLeague(s,asOf,previous,flags);
const check = (name, run) => { run(); tests.push({ name, status: 'passed' }); };
const workout = (day, n = 8, extra = {}) => ({ id: 'w-' + day, day, initialDay: day, receivedDay: day, firstReceivedDay: day, completed: true,
  sets: Array.from({ length: n }, (_, i) => ({ id: day + '-s-' + i, exerciseId: 'lift-' + i % 2, exercise: 'Synthetic', weight: 50, reps: 8 })), ...extra });
const forged = [20, 21, 22, 23].map(day => workout(day, 8, { receivedDay: 23, firstReceivedDay: 23 }));
const exploit = { original: { xp: lifetimeXP(forged, 23), rp: score(forged, [], 23).rp, competitiveDates: activity(forged, 23, { competitive: true, receiptPolicy: 'legacy' }).length },
  selected: { xp: xp(forged, 23), publicEarnedXP: xp(forged, 23, {competitive:true}), ...snapshot(forged, [], 23), physicalExecutionProven: false } };
check('reproduces same-server-date four-day exploit: 360XP and 378RP', () => { assert.equal(exploit.original.xp, 360); assert.equal(exploit.original.rp, 378); });
check('same-server-date batch produces only one competitive date, never placement', () => { assert.equal(exploit.selected.days.length, 1); assert.equal(league(exploit.selected, 23).tier, 'Unranked'); });
check('client rankDay cannot create extra competitive dates', () => { assert.equal(snapshot(forged.map(w => ({ ...w, rankDay: w.day - 1 })), [], 23).rp, exploit.selected.rp); });
check('all same-day sessions aggregate and retain daily caps', () => { const batch = forged.map((w, i) => ({ ...w, day: 23, initialDay: 23, id: 'batch-' + i })); assert.equal(snapshot(batch, [], 23).rp, exploit.selected.rp); assert.equal(xp(batch, 23), 80); });
check('late logging remains saved history/XP but earns no RP', () => { const w = workout(10, 8, { receivedDay: 17, firstReceivedDay: 17 }); assert.equal(xp([w], 17), 80); assert.equal(snapshot([w], [], 17).rp, 0); });
check('editing a historical date to today cannot rehabilitate an old receipt', () => { const w = workout(10, 8, { day: 17, initialDay: 10, receivedDay: 17, firstReceivedDay: 17, revision: 1 }); assert.equal(snapshot([w], [], 17).rp, 0); });
check('online corrections keep frozen competitive date and do not mint another', () => { const w = workout(10), edit = { ...w, day: 9, receivedDay: 17, revision: 1 }; assert.deepEqual(activity([w, edit], 17, { competitive: true }).map(d => d.day), [10]); });
check('late added sets cannot top up a past competitive date', () => { const w = workout(10,2); const edit = {...w,receivedDay:17,revision:1,sets:[...w.sets,...workout(17,6).sets.map(s=>({...s,firstReceivedDay:17}))]}; assert.equal(snapshot([w,edit],[],17).rp,snapshot([w],[],17).rp); });
check('public All-time earned XP excludes retroactive batch while private XP preserves history', () => {assert.equal(exploit.selected.publicEarnedXP,80);assert.equal(exploit.selected.xp,360);});
check('pre-enrollment receipts cannot become public earned XP or public RP',()=>{assert.equal(xp([workout(10)],23,{competitive:true,sinceDay:20}),0);assert.equal(xp([workout(20)],23,{competitive:true,sinceDay:20}),80);assert.equal(snapshot([workout(10)],[],23,{sinceDay:20}).rp,0);});
check('initially invalid sets cannot be rehabilitated for past competition',()=>{const w=workout(10,8);assert.equal(snapshot([{...w,receivedDay:17,revision:1,sets:w.sets.map(s=>({...s,initialEligible:false}))}],[],17).rp,0);});
check('future claims and unsynced data earn no competitive points', () => { const future=workout(30,8,{receivedDay:23,firstReceivedDay:23}); assert.equal(snapshot([future],[],23).rp,0);assert.equal(snapshot([future],[],30).rp,0);assert.equal(xp([future],23),0);assert.equal(xp([future],30),80);assert.equal(snapshot([workout(30)], [], 23).rp, 0); });
check('retry, split and 100 sets cannot bypass XP/RP caps', () => { const w = workout(23); assert.equal(xp([w, w], 23), 80); const many = { ...w, sets: Array.from({ length: 100 }, (_, i) => ({ ...w.sets[i % 8], id: 'many-' + i })) }; assert.equal(xp([many], 23), 80); assert.equal(snapshot([many], [], 23).rp, snapshot([w], [], 23).rp); });
const thresholds = [2, 3, 4].map(minimum => ({ minimum, dailyXP: [1, 2, 3, 4, 8, 12].map(n => ({ n, oldAward: xp([workout(23, n)], 23, { minimum, legacyAwards: true }), proportionalAward: xp([workout(23, n)], 23, { minimum }) })) }));
check('two-set proportional XP removes the 3-to-4 cliff', () => { assert.equal(xp([workout(23, 2)], 23), 20); assert.equal(xp([workout(23, 3)], 23), 30); assert.equal(xp([workout(23, 4)], 23), 40); });
check('one set and warmup-only sessions save without reward', () => { assert.equal(xp([workout(23, 1)], 23), 0); const w = workout(23); assert.equal(xp([{ ...w, sets: w.sets.map(s => ({ ...s, warmup: true })) }], 23), 0); });
check('short-day consistency credit is proportional rather than full', () => { assert.equal(snapshot([workout(23, 2)], [], 23).c, snapshot([workout(23, 4)], [], 23).c / 2); });
const pattern = frequency => frequency === 2 ? [0, 3] : frequency === 3 ? [0, 2, 5] : frequency === 4 ? [0, 1, 3, 5] : [0, 1, 2, 3, 5];
const program = (frequency, until = 167, skip = () => false) => Array.from({ length: until + 1 }, (_, day) => day).filter(day => pattern(frequency).includes((day + 1) % 7) && !skip(day)).map(day => workout(day));
const established = program(3, 83);
const progress = corroborateProgress(established.flatMap((w,i)=>[0,1].map(n=>({id:w.id+'-performance-'+n,day:w.day,exerciseId:'lift-'+n,context:'standard_barbell',weight:150+Math.floor(i/28)*2.5,reps:8,comparable:true}))));
const decay = Object.keys(mechanisms).map(policy => {
  let previous = { tier: 'Unranked', below: 0 };
  const trajectory = [];
  for (let day = 0; day <= 173; day++) {
    const s = snapshot(established, progress, day, { policy }); previous = league(s, day, previous);
    if (day >= 83) trajectory.push({ inactiveDays: day - 83, rp: s.rp, league: previous.tier });
  }
  return { policy, trajectory };
});
const scenarios = Object.keys(mechanisms).map(policy => {
  const full = program(3, 210), recovery = program(3, 210, day => day >= 84 && day < 98), returning = program(3, 210, day => day >= 84 && day < 174);
  const line = data => { let previous; return Array.from({ length: 211 }, (_, day) => { const s = snapshot(data, [], day, { policy }); previous = league(s, day, previous); return { day, rp: s.rp, league: previous.tier }; }); };
  return { policy, active: line(full), recovery: line(recovery), returning: line(returning) };
});
check('all mechanisms expire fully, preserve lifetime XP and stay bounded', () => { for (const d of decay) { assert.equal(d.trajectory.at(-1).rp, 0); assert.ok(d.trajectory.every(p => p.rp >= 0 && p.rp <= 1000)); } assert.equal(xp(established, 83), xp(established, 173)); });
check('alternative kernels are more forgiving after seven and fourteen days', () => { for (const alternative of decay.slice(1)) for (const day of [7, 14]) assert.ok(alternative.trajectory[day].rp > decay[0].trajectory[day].rp); });
const frequencies = [2, 3, 4, 5].map(frequency => { const data = program(frequency, 370); return { frequency, weeklyXP: xp(data.filter(w => w.day >= 6), 369) / 52, plateauMeanRP: Math.round(Array.from({ length: 28 }, (_, i) => snapshot(data, [], 337 + i).rp).reduce((a, b) => a + b, 0) / 28), peakWithTwoRecentEvents: snapshot(data, [{ day: data.at(-1).day, exerciseId: 'lift-0' }, { day: data.at(-2).day, exerciseId: 'lift-1' }], 370).rp }; });
check('four/five weekly dates retain 360XP cap and no fifth-day score advantage', () => { assert.deepEqual(frequencies.slice(2).map(f => f.weeklyXP), [360, 360]); assert.deepEqual(frequencies.slice(2).map(f => f.plateauMeanRP), [850, 850]); });
check('three-day schedule can reach Apex after corroborated progress', () => { const data = program(3); const events = data.slice(-2).map((w, i) => ({ day: w.day, exerciseId: 'lift-' + i })); const s = snapshot(data, events, 167); assert.equal(s.rp, 1000); assert.equal(league(s, 167).tier, 'Apex'); });
const rankFixture=(ages,rp=906)=>({rp,window:42,days:ages.map(age=>({day:100-age,n:8}))});
const narrow=rankFixture([0,1,2,3,4,5,6,7,8,10,14,17]);
const eligible=rankFixture([0,2,4,6,8,10,12,14,16,18,20,21]);
check('previous Apex loses hard minimum-span eligibility immediately',()=>assert.equal(league(narrow,100,{tier:'Apex',below:0,asOf:99}).tier,'Diamond'));
check('new and prior accounts share the same hard Apex ceiling',()=>assert.equal(league(narrow,100).tier,league(narrow,100,{tier:'Apex',below:0}).tier));
check('previous Apex with nine dates cannot retain Apex',()=>assert.equal(league(rankFixture([0,3,6,9,12,15,18,21,24]),100,{tier:'Apex',below:0}).tier,'Diamond'));
check('eligible Apex keeps ordinary point hysteresis at 899 and 880',()=>{for(const rp of [899,880])assert.equal(league({...eligible,rp},100,{tier:'Apex',below:0,asOf:99}).tier,'Apex');});
check('eligible Apex below 880 demotes only on two consecutive daily snapshots',()=>{const first=league({...eligible,rp:879},100,{tier:'Apex',below:0,asOf:99});assert.equal(first.tier,'Apex');assert.equal(league({...eligible,rp:879},101,first).tier,'Diamond');});
check('retrying the same daily snapshot cannot advance demotion',()=>{const first=league({...eligible,rp:879},100,{tier:'Apex',below:0,asOf:99});assert.equal(league({...eligible,rp:879},100,first).below,1);});
check('a missed daily snapshot breaks the consecutive breach sequence',()=>{const first=league({...eligible,rp:879},100,{tier:'Apex',below:0,asOf:99});assert.equal(league({...eligible,rp:879},102,first).tier,'Apex');});
check('previous Apex regains eligibility at exact 900 with ten dates spanning 21',()=>{const exact=rankFixture([0,2,4,6,8,10,12,14,18,21],900);assert.equal(league(exact,100,{tier:'Diamond',below:0}).tier,'Apex');});
check('twenty-day span is ineligible even at 1000',()=>assert.equal(league(rankFixture([0,2,4,6,8,10,12,14,18,20],1000),100,{tier:'Apex',below:0}).tier,'Diamond'));
check('loss of general placement overrides all hysteresis',()=>{assert.equal(league(rankFixture([0,3,7],906),100,{tier:'Apex',below:0}).tier,'Unranked');assert.equal(league(rankFixture([0,3,7,13],906),100,{tier:'Diamond',below:0}).tier,'Unranked');});
check('exact general placement and score threshold boundaries are respected',()=>{for(const [rp,tier] of [[1,'Bronze'],[250,'Silver'],[450,'Gold'],[650,'Platinum'],[800,'Diamond'],[900,'Apex']])assert.equal(league({...eligible,rp},100).tier,tier);assert.equal(league(rankFixture([0,4,8,14],800),100).tier,'Diamond');});
check('launch Apex gate overrides eligibility and hysteresis for all accounts',()=>{assert.equal(configuredLeague(eligible,100).tier,'Diamond');assert.equal(league(eligible,100,{tier:'Apex',below:0},{apexEnabled:false}).tier,'Diamond');assert.equal(league(eligible,100,undefined,{apexEnabled:false}).tier,'Diamond');assert.equal(league(eligible,100,{tier:'Diamond',below:0},{apexEnabled:true}).tier,'Apex');});
const consistency = [2, 3, 4, 5].map(frequency => ({ frequency, key: consistencyKey(activity(program(frequency), 167, { competitive: true }), 167) }));
check('consistency ordering intentionally ties three/four/five days, not two', () => { assert.deepEqual(consistency.slice(1).map(c => c.key), [[8, 24], [8, 24], [8, 24]]); assert.deepEqual(consistency[0].key, [8, 16]); });
check('corroboration still rejects single-session improvement', () => { const sessions = [0,7,14,21].map((day,i) => ({ id:''+i,day,exerciseId:'lift',context:'barbell',comparable:true,weight:i<3?50:52.5,reps:8 })); assert.equal(corroborateProgress(sessions).length,0); });
check('public consent defaults independent of workout sharing', () => { const enrollment = sharing => ({ enrolled:false, rankingsVisible:false, sharing }); assert.equal(enrollment(true).rankingsVisible,false); assert.equal(enrollment(false).rankingsVisible,false); });
check('eligibility restrictions never mutate stored workout input', () => { const before = JSON.stringify(forged); snapshot(forged, [], 23); xp(forged,23); assert.equal(JSON.stringify(forged), before); });
// Calibrate a fully reproducible 760RP illustrative state under the NEW kernel.
const visualWorkouts = Array.from({length:18},(_,i)=>workout(364-[0,2,5,7,9,12,14,16,19,21,23,26,28,30,33,35,37,40][i],4));
const visualEvents = [{day:364,exerciseId:'lift-0'}];
let visual = snapshot(visualWorkouts,visualEvents,364);
for (const w of visualWorkouts) { while (w.sets.length<8 && visual.rp<760) { const i=w.sets.length; w.sets.push({id:w.id+'-s-'+i,exerciseId:'lift-'+i%2,weight:50,reps:8}); visual=snapshot(visualWorkouts,visualEvents,364); } }
check('revised illustration reproduces 762RP and its component labels', () => {assert.equal(visual.rp,762); assert.deepEqual(visual.breakdown,[450,237,75]);});
const summarize=(data,asOf)=>({privateXP:xp(data,asOf),publicEarnedXP:xp(data,asOf,{competitive:true}),rp:snapshot(data,[],asOf).rp,competitiveDates:snapshot(data,[],asOf).days.length});
const week3=[20,22,25].map(day=>workout(day));
const examples={
  twoSets:summarize([workout(23,2)],23),threeSets:summarize([workout(23,3)],23),eightSets:summarize([workout(23)],23),
  splitDay:summarize([workout(23,4),workout(23,4,{id:'second',sets:workout(23,4).sets.map(s=>({...s,id:s.id+'-second',exerciseId:'other-'+s.exerciseId}))})],23),
  threeDayWeek:summarize(week3,26),fourDayWeek:summarize([20,21,23,25].map(day=>workout(day)),26),
  late:summarize([workout(20,8,{receivedDay:23,firstReceivedDay:23})],23),
  corrected:summarize([...week3,{...week3[0],receivedDay:26,revision:1,sets:week3[0].sets.slice(0,4)}],26),
  deleted:summarize([...week3,{...week3[0],receivedDay:26,revision:1,deleted:true}],26),
  apexRegression:{rp:906,recentDates:12,span:17,newAccount:league(narrow,100).tier,priorApex:league(narrow,100,{tier:'Apex',below:0,asOf:99}).tier},
};
check('worked examples agree with the executable scoring model',()=>{
  assert.deepEqual([examples.twoSets.privateXP,examples.threeSets.privateXP,examples.eightSets.privateXP],[20,30,80]);
  assert.deepEqual([examples.threeDayWeek.privateXP,examples.fourDayWeek.privateXP,examples.corrected.privateXP,examples.deleted.privateXP],[270,360,230,170]);
  assert.equal(examples.splitDay.privateXP,80);assert.equal(examples.late.rp,0);
});
const report = { version:'rankings-final-proposal-v3', synthetic:true, tests, examples, exploit, thresholds, decay, scenarios, frequencies, consistency, visual:{workouts:visualWorkouts,events:visualEvents,snapshot:visual}, approvalsRequired:['receipt-day eligibility','two-set proportional XP','21+21 decay','specialized board staging','explicit public enrollment','progress-coverage launch gate'] };
fs.writeFileSync(out+'revision-report.json',JSON.stringify(report,null,2)+'\n');
const csvRows = scenarios.flatMap(s=>['active','recovery','returning'].flatMap(kind=>s[kind].map(p=>[s.policy,kind,p.day,p.rp,p.league].join(','))));
fs.writeFileSync(out+'revision-trajectories.csv','mechanism,scenario,day,rp,league\n'+csvRows.join('\n')+'\n');
function chart(name,title,lines,max=1000,offset=0) {
  const colors=['#a2adb9','#78c5c0','#e5c58d'];
  const body=lines.map((line,i)=>`<polyline fill="none" stroke="${colors[i]}" stroke-width="2" points="${line.values.map((v,d)=>`${60+d*820/(line.values.length-1)},${350-v*300/max}`).join(' ')}"/><text x="${65+i*280}" y="405" fill="${colors[i]}" font-size="12">${line.name}</text>`).join('');
  const grid=(max===6?Array.from({length:7},(_,i)=>i/6):[0,.25,.5,.75,1]).map(t=>`<line x1="60" x2="880" y1="${350-300*t}" y2="${350-300*t}" stroke="#303640"/><text x="12" y="${354-300*t}" fill="#abb5c3" font-size="12">${Math.round(max*t)}</text>`).join('');
  const ticks=[0,.25,.5,.75,1].map(t=>`<text x="${60+820*t}" y="373" text-anchor="middle" fill="#abb5c3" font-size="12">Day ${offset+Math.round((lines[0].values.length-1)*t)}</text>`).join('');
  fs.writeFileSync(out+name+'.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="940" height="430" viewBox="0 0 940 430"><rect width="100%" height="100%" fill="#0b0d0f"/><g font-family="Arial,sans-serif"><text x="60" y="28" font-size="18" fill="#f1f3f5">${title} - SYNTHETIC</text>${grid}${body}${ticks}</g></svg>`);
}
chart('revision-decay','Inactivity: calibrated mechanism comparison',decay.map(d=>({name:d.policy,values:d.trajectory.slice(0,50).map(p=>p.rp)})));
chart('revision-leagues','Displayed league after stopping (0=unranked, 6=Apex)',decay.map(d=>({name:d.policy,values:d.trajectory.slice(0,50).map(p=>['Unranked','Bronze','Silver','Gold','Platinum','Diamond','Apex'].indexOf(p.league))})),6);
chart('revision-recovery','Two-week recovery: score trajectory',scenarios.map(s=>({name:s.policy,values:s.recovery.slice(70,140).map(p=>p.rp)})),1000,70);
chart('revision-return','Ninety-day break and returning: score trajectory',scenarios.map(s=>({name:s.policy,values:s.returning.slice(70).map(p=>p.rp)})),1000,70);
console.log(JSON.stringify({tests:tests.length,exploit:{before:exploit.original,after:{xp:exploit.selected.xp,rp:exploit.selected.rp,dates:exploit.selected.days.length}},decay:decay.map(d=>({policy:d.policy,points:[0,7,14,21,28,42].map(n=>d.trajectory[n])})),frequencies,visual:{rp:visual.rp,components:visual.breakdown}},null,2));
