import React, { useState } from 'react';
import { ArrowLeft, Check, ChevronRight, History, LoaderCircle, RefreshCw, Star } from 'lucide-react';

// Isolated synthetic data. Layout follows the actual WorkoutCompleted component.
const baseGroups = [
  { name: 'Barbell Bench Press', weight: 55, rpe: 8 },
  { name: 'Barbell Romanian Deadlift', weight: 80, rpe: null },
];
export function CompletionRevision({ go }) {
  const params = new URLSearchParams(location.search);
  const long = params.get('long') === '1';
  const groups = (long ? [...baseGroups,{name:'Barbell Overhead Press',weight:35,rpe:8},{name:'Barbell Back Squat',weight:65,rpe:9}] : baseGroups)
    .map((group,index)=>({...group,sets:Array.from({length:long?8:4},(_,i)=>({number:long&&index===0?i:i+1,warmup:long&&index===0&&i===0,weight:long&&index===0&&i===0?20:group.weight,reps:long&&index===0&&i===0?10:8,rpe:i===1?group.rpe:null,notes:long&&index===0&&i===2?'Controlled tempo. Keep shoulders comfortable.':null}))}));
  const count = groups.reduce((n,g)=>n+g.sets.length,0);
  const volume = groups.reduce((n,g)=>n+g.sets.reduce((s,set)=>s+set.weight*set.reps,0),0);
  const [state, setState] = useState(() => ['success','loading','unavailable'].includes(params.get('rewards')) ? params.get('rewards') : 'success');
  const [landing, setLanding] = useState(false);
  const [history, setHistory] = useState(false);
  if (landing) return <section className="completion-return"><h2>Start your workout</h2><p className="muted">Choose a saved template or start from scratch.</p><button className="secondary full" onClick={() => setLanding(false)}>Return to completion example</button></section>;
  const setRows = group => <div className="completion-sets">{group.sets.map((set,i)=><div className={set.warmup?'warmup-row':''} key={i}><span>{set.warmup?'W1':'Set '+set.number}</span><strong>{set.weight} kg × {set.reps}</strong>{set.rpe?<small>RPE {set.rpe}</small>:null}{set.notes?<p className="completion-set-note">{set.notes}</p>:null}</div>)}</div>;
  if (history) return <section className="completion-return"><button className="back" onClick={()=>setHistory(false)}><ArrowLeft size={18}/>Back to completed workout</button><h2>Strength session</h2><p className="muted">3 Nov 2026 · {count} recorded sets · Design example</p>{groups.map(group=><section className="completion-exercise" key={group.name}><h4>{group.name}</h4>{setRows(group)}</section>)}</section>;
  return <>
    <div className="training-tabs"><span>Live</span><span>History</span><span>Manage</span></div>
    <section className="completion-revision" aria-label="Completed workout">
      <header className="completion-hero"><span className="completion-success"><Check size={26}/></span><h2>Workout completed!</h2><p>Your workout has been saved.</p></header>
      <button className="completion-back" onClick={() => setLanding(true)}>Back to training<ArrowLeft size={19}/></button>
      <section className="completion-rewards" aria-label="Workout rewards" aria-live="polite" aria-busy={state === 'loading'}>
        {state === 'success' ? <><div><Star size={20}/><strong>+80 lifetime XP</strong></div><p>6,420 XP · Level 19</p><div className="completion-rp"><span>Platinum</span><strong>762 RP</strong></div><button onClick={() => go('rank')}>View score breakdown<ChevronRight size={16}/></button></> : state === 'loading' ? <><div><LoaderCircle size={19}/><strong>Rewards updating</strong></div><p>Your workout is saved. Points are being calculated.</p></> : <><strong>Rewards temporarily unavailable</strong><p>Your workout is saved. No need to log it again.</p><button onClick={() => setState('loading')}><RefreshCw size={16}/>Retry rewards</button></>}
        <p className="completion-example">Design example · No live account data</p>
      </section>
      <section className="completion-overview" aria-label="Workout overview"><h3>{long?'Strength and accessories - full training session':'Strength session'}</h3><time>3 Nov 2026</time><dl><div><dt>Exercises</dt><dd>{groups.length}</dd></div><div><dt>Recorded sets</dt><dd>{count}</dd></div><div><dt>Load-volume</dt><dd>{volume.toLocaleString('en-GB')} <small>kg</small></dd></div><div><dt>Duration</dt><dd>{long?75:45} <small>min</small></dd></div></dl></section>
      <div className="completion-summary"><h3>Workout summary</h3>{groups.map((group,index)=><section className="completion-exercise" key={group.name}><header><span>{String(index+1).padStart(2,'0')}</span><h4>{group.name}</h4><small>{group.sets.length} sets</small></header>{setRows(group)}</section>)}</div>
      <button className="completion-history" onClick={()=>setHistory(true)}><History size={18}/>View history<ChevronRight size={18}/></button>
    </section>
  </>;
}
