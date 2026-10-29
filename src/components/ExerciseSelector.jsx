import { useState } from 'react';
import { Search } from 'lucide-react';
import { exerciseCatalog, searchExercises, exerciseLabel, normalizeExerciseText, resolveExercise } from '../utils/exerciseCatalog';

export function ExerciseSelector({ value, onChange, onCommit, suggestions=[], language='en' }) {
  const [open,setOpen]=useState(false);
  const [custom,setCustom]=useState(false);
  const [category,setCategory]=useState('');
  const matches=searchExercises(value,category,20);
  const commit = exercise => { onCommit(exercise); setOpen(false); };
  return <div className="relative min-w-0">
    <div className="flex min-h-11 items-center gap-2"><Search size={16} className="shrink-0 text-zinc-400" /><input aria-label="Exercise" className="h-11 w-full min-w-0 bg-transparent text-base text-zinc-100 outline-none" value={value} placeholder={custom ? 'Enter exercise name' : 'Search exercises...'}
      onFocus={()=>setOpen(true)} onChange={e=>{onChange(e.target.value);setOpen(true);}}
      onKeyDown={e=>{if(e.key==='Escape')setOpen(false); if(e.key==='Enter'){e.preventDefault(); const found=resolveExercise(value); if(!custom && found)commit({exercise:found.name_en,exercise_id:found.id}); else if(custom && value.trim())commit({exercise:value.trim(),exercise_id:null});}}} />
    </div>
    {open ? <div className="mt-2 max-h-72 overflow-y-auto border-y border-white/15 bg-[#14171b] py-2" aria-label="Choose exercise">
      {!custom ? <>
        <select aria-label="Exercise category" className="mb-2 min-h-11 w-full bg-[#14171b] text-sm" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All muscle groups</option>{[...new Set(exerciseCatalog.map(e=>e.category))].map(c=><option key={c} value={c}>{c}</option>)}</select>
        {!value && !category && suggestions.length ? <p className="py-2 text-xs text-zinc-400">Recent</p> : null}
        {!category ? suggestions.filter(name=>!resolveExercise(name) && normalizeExerciseText(name).includes(normalizeExerciseText(value))).slice(0,5).map(name=><button type="button" className="min-h-11 w-full break-words py-2 text-left text-sm" key={name} onClick={()=>commit({exercise:name,exercise_id:null})}>{name}</button>) : null}
        {matches.map(e=><button type="button" key={e.id} aria-label={language==='it' ? e.name_it : e.name_en} className="min-h-11 w-full break-words border-t border-white/5 py-2 text-left text-sm text-zinc-200" onClick={()=>commit({exercise:e.name_en,exercise_id:e.id})}>{language==='it' ? e.name_it : e.name_en}<span aria-hidden="true" className="ml-2 text-xs text-zinc-500">{e.equipment}</span></button>)}
      </> : <button type="button" className="min-h-11 w-full text-left text-sm" disabled={!value.trim()} onClick={()=>commit({exercise:value.trim(),exercise_id:null})}>Use custom exercise</button>}
      <button type="button" className="mt-2 min-h-11 w-full border-t border-white/10 text-left text-sm text-zinc-300" onClick={()=>{setCustom(!custom);onChange('');}}>{custom ? 'Choose from catalog' : 'Other exercise'}</button>
      <button type="button" className="min-h-11 text-sm text-zinc-400" onClick={()=>setOpen(false)}>Close</button>
    </div> : null}
  </div>;
}
