// Design experiment only. Nothing in src/ or api/ imports this module.
export const VERSION = 'rankings-design-v1';
export const TIERS = [
  ['Bronze',1],['Silver',250],['Gold',450],['Platinum',650],['Diamond',800],['Apex',900],
];
export const clamp = x => Math.max(0, Math.min(1, x));
export const median = values => {
  const a = [...values].sort((a,b) => a-b);
  return a.length ? (a[Math.floor((a.length-1)/2)] + a[Math.ceil((a.length-1)/2)])/2 : null;
};
export const kernel = age => age < 0 || age >= 28 ? 0 : age <= 14 ? 1 : (28-age)/14;
export const levelStart = level => 100*(level-1) + 25*level*(level-1)/2;
export const levelAt = xp => Math.floor((Math.sqrt(81 + .32*Math.max(0,xp))-7)/2);
export const tierAt = score => score <= 0 ? 'Unranked' : [...TIERS].reverse().find(([,n]) => score>=n)[0];

// Synthetic day zero is Tuesday 2025-11-04. ISO weeks start Monday.
export const weekOf = day => Math.floor((day+1)/7);
export function dailyActivity(workouts, asOf, competitive = false) {
  const latest = new Map();
  for (const w of workouts) {
    if (w.receivedDay > asOf) continue;
    const previous = latest.get(w.id);
    if (!previous || (w.revision || 0) >= (previous.revision || 0)) latest.set(w.id,w);
  }
  const days = new Map();
  const seenSets = new Set();
  for (const w of latest.values()) {
    if (!w.completed || w.deleted || !Number.isInteger(w.day)) continue;
    // Production needs a server-owned frozen day/eligibility record. This field
    // is trusted synthetic input, NOT evidence that browser timestamps are safe.
    const day = competitive ? w.rankDay ?? w.day : w.day;
    if (day > asOf) continue;
    if (competitive && (w.rankEligible === false || w.receivedDay-day < 0 || w.receivedDay-day > 3)) continue;
    const row = days.get(day) || { day, byExercise:new Map(), sets:0 };
    for (const set of w.sets || []) {
      if (seenSets.has(set.id)) continue;
      seenSets.add(set.id);
      if (set.warmup || !Number.isInteger(set.reps) || set.reps < 1 || set.reps > 50 ||
        !Number.isFinite(set.weight) || set.weight < 0 || set.deleted) continue;
      const key = set.exerciseId || 'custom:'+String(set.exercise).trim().toLowerCase().replace(/\s+/g,' ');
      row.byExercise.set(key, (row.byExercise.get(key) || 0)+1);
    }
    days.set(day,row);
  }
  return [...days.values()].map(row => ({ day:row.day, n:Math.min(8,[...row.byExercise.values()].reduce((s,n)=>s+Math.min(4,n),0)) }))
    .filter(row => row.n >= 4).sort((a,b)=>a.day-b.day);
}

export function ratedDays(days) {
  const weeks = new Map();
  for (const day of days) {
    const week = weekOf(day.day);
    weeks.set(week,[...(weeks.get(week) || []),day]);
  }
  return [...weeks.values()].flatMap(rows => rows.sort((a,b)=>b.n-a.n || a.day-b.day).slice(0,4)).sort((a,b)=>a.day-b.day);
}
export function lifetimeXP(workouts,asOf) {
  const days = ratedDays(dailyActivity(workouts,asOf));
  const weeks = new Map();
  for (const d of days) weeks.set(weekOf(d.day),[...(weeks.get(weekOf(d.day)) || []),d]);
  return [...weeks.values()].reduce((xp,rows) => xp + rows.reduce((s,d)=>s+40+5*d.n,0)+[0,0,10,30,40][rows.length],0);
}

// Pareto improvement: one extra rep at no lower load, or >=2% load at no
// fewer reps. No e1RM, RPE multiplier, global kilograms or percentage races.
export function dominates(a,b,threshold=.02,tick=2.5) {
  return a.weight >= b.weight && a.reps >= b.reps &&
    (a.reps >= b.reps+1 || b.weight>0 && a.weight-b.weight >= Math.min(b.weight*threshold,tick)-1e-9);
}
export function corroborateProgress(sessions, threshold=.02) {
  const events=[];
  const contexts=new Map();
  for (const row of sessions.map(row=>({...row,candidate:false,gain:0})).sort((a,b)=>a.day-b.day || a.id.localeCompare(b.id))) {
    if (!row.comparable || !row.exerciseId || row.reps<3 || row.reps>15 || !Number.isFinite(row.weight) || row.weight<0) continue;
    const key=row.exerciseId+':'+row.context;
    const history=contexts.get(key) || [];
    const baselineRows=history.filter(h=>h.day<row.day && row.day-h.day<=90);
    if (baselineRows.length>=3) {
      // Only compare EXACT common rep or load bands; no synthetic conversion.
      const sameLoad=baselineRows.filter(h=>h.weight===row.weight).slice(-3);
      const sameReps=baselineRows.filter(h=>h.reps===row.reps).slice(-3);
      const baseline=sameLoad.length>=3 ? {weight:row.weight,reps:median(sameLoad.map(h=>h.reps))}
        : sameReps.length>=3 ? {weight:median(sameReps.map(h=>h.weight)),reps:row.reps} : null;
      const previous=history.find(h=>h.day<row.day && row.day-h.day<=21 && row.day-h.day>=3 &&
        h.candidate && row.weight>=h.weight && row.reps>=h.reps);
      const previousEvents=events.filter(e=>e.exerciseId===row.exerciseId);
      const highWater=previousEvents.filter(e=>e.context===row.context).map(e=>e.performance);
      // Confirmation must repeat the original candidate; its baseline stays
      // frozen even if the candidate has subsequently shifted a rolling median.
      const novel=point=>highWater.every(h=>!(h.weight>=point.weight && h.reps>=point.reps));
      if (previous && novel(previous) && (!previousEvents.length || row.day-previousEvents.at(-1).day>=28)) {
        events.push({day:row.day,exerciseId:row.exerciseId,context:row.context,performance:{weight:previous.weight,reps:previous.reps},gain:previous.gain});
      }
      row.candidate=Boolean(baseline && dominates(row,baseline,threshold,row.tick || 2.5) && novel(row) &&
        (baseline.weight===0 || row.weight/baseline.weight<=1.2) && row.reps-baseline.reps<=5);
      row.gain=baseline ? Math.max((row.weight/(baseline.weight || 1)-1),(row.reps/baseline.reps-1)) : 0;
    }
    // A session representative is the lower performance of two supporting
    // working sets with identical load/reps in synthetic data (see generator).
    history.push({...row}); contexts.set(key,history);
  }
  return events;
}

export function score(workouts, events, asOf, model='B', options={}) {
  const days=ratedDays(dailyActivity(workouts,asOf,true));
  const target=options.target || 9;
  const c=clamp(days.reduce((s,d)=>s+kernel(asOf-d.day),0)/target);
  const w=clamp(days.reduce((s,d)=>s+kernel(asOf-d.day)*d.n/8,0)/target);
  // Two strongest decayed events, distinct exercises, at most one per
  // exercise/28 days. Corroboration filtering is upstream, not a client flag.
  const best=new Map();
  for (const event of events) {
    if (!days.some(d=>d.day===event.day)) continue;
    const value=kernel(asOf-event.day);
    if (value>(best.get(event.exerciseId)?.value || 0)) best.set(event.exerciseId,{value,event});
  }
  const selected=[...best.values()].sort((a,b)=>b.value-a.value).slice(0,2);
  const p=clamp(selected.reduce((s,e)=>s+e.value,0)/2);
  const normalized=clamp(selected.reduce((s,e)=>s+e.value*clamp(e.event.gain/.1),0)/2);
  const weights=options.weights || (model==='A' ? [.55,.45,0] : model==='B' ? [.45,.40,.15] : [.40,.35,.25]);
  const progress=model==='C' ? normalized : p;
  const points=weights.map((weight,i)=>1000*weight*[c,w,progress][i]);
  const rp=Math.round(points.reduce((a,b)=>a+b,0));
  return {rp,tier:tierAt(rp),c,w,p:progress,breakdown:points.map(n=>Math.round(n)),qualifyingDays:days.filter(d=>asOf-d.day<28).length};
}

export function displayTier(snapshot,days,asOf,previous={tier:'Unranked',below:0}) {
  const recent=days.filter(d=>d.day<=asOf && asOf-d.day<28);
  const placed=recent.length>=4 && recent.at(-1).day-recent[0].day>=14;
  if (!snapshot.rp || !placed) return {tier:'Unranked',below:0};
  let target=snapshot.tier;
  if (target==='Apex' && (recent.length<10 || recent.at(-1).day-recent[0].day<21)) target='Diamond';
  const current=TIERS.findIndex(([name])=>name===previous.tier);
  const next=TIERS.findIndex(([name])=>name===target);
  if (current>next) {
    const below=snapshot.rp < TIERS[current][1]-20 ? previous.below+1 : 0;
    if (below<2) return {tier:previous.tier,below};
  }
  return {tier:target,below:0};
}
