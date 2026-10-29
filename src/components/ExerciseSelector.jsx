import { t } from '../i18n';
import { useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { getLanguage } from '../i18n';
import { exerciseCatalog, searchExercises, exerciseLabel, normalizeExerciseText, resolveExercise } from '../utils/exerciseCatalog';

export function ExerciseSelector({ value, exerciseId=null, onChange, onCommit, suggestions=[], language=getLanguage(), inputLabel=t('Exercise') }) {
  const [open,setOpen]=useState(false);
  const [custom,setCustom]=useState(false);
  const [category,setCategory]=useState('');
  const [typing,setTyping]=useState(false);
  const menu=useRef(null);
  const input=useRef(null);
  const returningFocus=useRef(false);
  const recent = !category ? suggestions.filter(name=>normalizeExerciseText(name).includes(normalizeExerciseText(value))).slice(0,5) : [];
  const recentIds=new Set(recent.map(name=>resolveExercise(name)?.id).filter(Boolean));
  const canonicalRecent=[...new Map(recent.map(name=>resolveExercise(name)).filter(Boolean).map(exercise=>[exercise.id,exercise])).values()];
  const matches=searchExercises(value,category,20).filter(e=>!recentIds.has(e.id));
  const closeMenu = () => { if(document.activeElement!==input.current){returningFocus.current=true;input.current?.focus();} setOpen(false); };
  const commit = exercise => { onCommit(exercise); closeMenu(); setTyping(false); };
  return <div className="relative min-w-0" onKeyDown={event=>{
    if(event.target.tagName!=='BUTTON' || !['ArrowDown','ArrowUp','Home','End','Escape'].includes(event.key))return;
    event.preventDefault();
    if(event.key==='Escape'){closeMenu();return;}
    const buttons=[...menu.current.querySelectorAll('button')].filter(b=>!b.disabled);
    const index=buttons.indexOf(event.target);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(event.key==='ArrowDown'?1:-1)));
    buttons[next]?.focus();
  }}>
    <div className="flex min-h-11 items-center gap-2"><Search size={16} className="shrink-0 text-zinc-400" /><input ref={input} aria-label={inputLabel} className="h-11 w-full min-w-0 bg-transparent text-base text-zinc-100 outline-none" value={exerciseId && !typing ? exerciseLabel({exercise:value,exercise_id:exerciseId},language) : value} placeholder={custom ? t("Enter exercise name") : t("Search exercises...")}
      onFocus={()=>{if(returningFocus.current){returningFocus.current=false;return;}setOpen(true);}} onChange={e=>{onChange(e.target.value);setOpen(true);setTyping(true);}}
      onKeyDown={e=>{if(e.key==='Escape')setOpen(false); if(e.key==='ArrowDown' && open){e.preventDefault();menu.current?.querySelector('button')?.focus();} if(e.key==='Enter' || e.key==='Tab'){if(e.key==='Enter')e.preventDefault(); const found=resolveExercise(value); if(!custom && found)commit({exercise:found.name_en,exercise_id:found.id}); else if(value.trim() && (custom || recent.some(name=>normalizeExerciseText(name)===normalizeExerciseText(value))))commit({exercise:value.trim(),exercise_id:null});}}} />
    </div>
    {open ? <div ref={menu} role="group" className="mt-2 max-h-72 overflow-y-auto border-y border-white/15 bg-[#14171b] py-2" aria-label={t("Exercise suggestions")}>
      {!custom ? <>
        <select aria-label={t("Exercise category")} className="mb-2 min-h-11 w-full bg-[#14171b] text-sm" value={category} onChange={e=>setCategory(e.target.value)}><option value="">{t("All muscle groups")}</option>{[...new Set(exerciseCatalog.map(e=>e.category))].map(c=><option key={c} value={c}>{t(`muscle.${c}`)}</option>)}</select>
        {!value && !category && suggestions.length ? <p className="py-2 text-xs text-zinc-400">{t("Recent")}</p> : null}
        {canonicalRecent.map(found=><button type="button" className="min-h-11 w-full break-words py-2 text-left text-sm" key={found.id} onClick={()=>commit({exercise:found.name_en,exercise_id:found.id})}>{exerciseLabel(found.name_en,language)}</button>)}
        {!category ? suggestions.filter(name=>!resolveExercise(name) && normalizeExerciseText(name).includes(normalizeExerciseText(value))).slice(0,5).map(name=><button type="button" className="min-h-11 w-full break-words py-2 text-left text-sm" key={name} onClick={()=>commit({exercise:name,exercise_id:null})}>{name}</button>) : null}
        {matches.map(e=><button type="button" key={e.id} aria-label={language==='it' ? e.name_it : e.name_en} className="min-h-11 w-full break-words border-t border-white/5 py-2 text-left text-sm text-zinc-200" onClick={()=>commit({exercise:e.name_en,exercise_id:e.id})}>{language==='it' ? e.name_it : e.name_en}<span aria-hidden="true" className="ml-2 text-xs text-zinc-500">{t(e.equipment)}</span></button>)}
      </> : <button type="button" className="min-h-11 w-full text-left text-sm" disabled={!value.trim()} onClick={()=>commit({exercise:value.trim(),exercise_id:null})}>{t("Use custom exercise")}</button>}
      <button type="button" className="mt-2 min-h-11 w-full border-t border-white/10 text-left text-sm text-zinc-300" onClick={()=>{setCustom(!custom);onChange('');}}>{custom ? t("Choose from catalog") : t("Other exercise")}</button>
      <button type="button" className="min-h-11 text-sm text-zinc-400" onClick={()=>setOpen(false)}>{t("Close")}</button>
    </div> : null}
  </div>;
}
