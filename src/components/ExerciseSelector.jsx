import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { getLanguage, t } from '../i18n';
import { exerciseCatalog, exerciseLabel, resolveExercise, searchExercises } from '../utils/exerciseCatalog';

const equipmentLabels = { barbell:'Barbell',dumbbell:'Dumbbell',smith:'Smith machine',machine:'Machine',cable:'Cable',
  bodyweight:'Bodyweight',assisted_machine:'Assisted machine',ez_bar:'EZ bar',landmine:'Landmine',plate:'Plate',
  kettlebell:'Kettlebell',trap_bar:'Trap bar',sled:'Sled',rope:'Rope',boxing_bag:'Boxing bag',unspecified:'Unspecified' };

export function ExerciseSelector({ value, exerciseId=null, onCommit, suggestions=[], language=getLanguage(), inputLabel=t('Exercise') }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [custom, setCustom] = useState(false);
  const trigger = useRef(null);
  const dialog = useRef(null);
  const search = useRef(null);
  const list = useRef(null);
  const categories = [...new Set(exerciseCatalog.filter(e => e.active).map(e => e.category))];
  const recent = [...new Map(suggestions.map(name => resolveExercise(name)).filter(e => e?.active).map(e => [e.id,e])).values()].slice(0,5);
  const matches = searchExercises(query,category,100);
  const showRecent = !query.trim() && !category && recent.length > 0;
  const recentIds = new Set(showRecent ? recent.map(e => e.id) : []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current.showModal();
    search.current.focus();
    return () => { document.body.style.overflow = previous; };
  },[open]);

  const close = () => {
    dialog.current?.close();
    setOpen(false);
    queueMicrotask(() => trigger.current?.focus());
  };
  const commit = exercise => { onCommit(exercise); close(); };
  const begin = () => { setQuery(''); setCategory(''); setCustom(false); setOpen(true); };
  const navigate = event => {
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    const buttons = [...list.current.querySelectorAll('[data-exercise-option]')];
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1
      : Math.max(0,Math.min(buttons.length-1,current+(event.key === 'ArrowDown' ? 1 : -1)));
    buttons[index]?.focus();
  };
  const row = exercise => <button key={exercise.id} type="button" data-exercise-option
    aria-label={exerciseLabel({exercise_id:exercise.id},language)} aria-pressed={exerciseId===exercise.id}
    className={`flex min-h-16 w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left outline-none focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 ${exerciseId===exercise.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
    onClick={() => commit({exercise:exercise.name_en,exercise_id:exercise.id})}>
    <span className="min-w-0 flex-1"><span className="block break-words text-base font-medium text-zinc-100">{exerciseLabel({exercise_id:exercise.id},language)}</span>
      <span className="mt-1 block text-xs text-zinc-400">{t(equipmentLabels[exercise.equipment] || exercise.equipment)}</span></span>
    {exerciseId===exercise.id ? <Check size={18} className="shrink-0 text-zinc-200" /> : null}
  </button>;

  return <div className="min-w-0">
    <div aria-hidden={open || undefined} className="flex min-h-12 min-w-0 items-center gap-2 border-b border-white/15">
      <Search size={17} className="shrink-0 text-zinc-400" />
      <input ref={trigger} readOnly aria-label={inputLabel} aria-haspopup="dialog" aria-expanded={open}
        value={exerciseLabel({exercise:value,exercise_id:exerciseId},language)} placeholder={t('Choose exercise')}
        className="h-12 min-w-0 flex-1 cursor-pointer bg-transparent text-base font-medium text-zinc-100 outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
        onClick={begin} onKeyDown={e => { if (['Enter',' ','ArrowDown'].includes(e.key)) { e.preventDefault(); begin(); } }} />
      <button type="button" onClick={begin} title={t('Choose exercise')} aria-label={t('Choose exercise')} className="icon-button"><ChevronDown size={18} /></button>
    </div>
    {open && createPortal(<dialog ref={dialog} aria-modal="true" aria-label={t('Choose exercise')}
      onCancel={e => {e.preventDefault();close();}}
      className="fixed inset-x-0 bottom-0 top-auto m-0 flex h-[85dvh] max-h-[85dvh] w-full max-w-none flex-col overflow-hidden rounded-t-lg border border-white/15 bg-[#111418] p-0 text-zinc-100 shadow-2xl backdrop:bg-black/70 sm:inset-0 sm:m-auto sm:h-[min(760px,85dvh)] sm:max-w-xl sm:rounded-lg">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-base font-semibold">{t('Choose exercise')}</h2>
        <button type="button" onClick={close} aria-label={t('Close')} title={t('Close')} className="icon-button"><X size={20} /></button>
      </header>
      <div className="shrink-0 space-y-3 border-b border-white/10 p-4">
        <label className="flex min-h-12 items-center gap-3 rounded border border-white/20 bg-black/20 px-3"><Search size={18} className="shrink-0 text-zinc-400" />
          <input ref={search} aria-label={inputLabel} value={query} onChange={e => setQuery(e.target.value)}
            placeholder={t(custom ? 'Enter exercise name' : 'Search exercises...')} className="h-12 min-w-0 w-full bg-transparent text-base outline-none"
            onKeyDown={e => { if (e.key==='ArrowDown') navigate(e); if(e.key==='Enter') {e.preventDefault();const found=resolveExercise(query);
              if(custom && query.trim())commit({exercise:query.trim(),exercise_id:null});
              else if(found?.active)commit({exercise:found.name_en,exercise_id:found.id});
            } }} />
        </label>
        {!custom ? <select aria-label={t('Exercise category')} value={category} onChange={e => setCategory(e.target.value)} className="min-h-11 w-full rounded border border-white/10 bg-[#111418] px-3 text-sm text-zinc-300">
          <option value="">{t('All muscle groups')}</option>{categories.map(c => <option key={c} value={c}>{t(`muscle.${c}`)}</option>)}
        </select> : null}
      </div>
      <div ref={list} role="group" aria-label={t('Exercise suggestions')} onKeyDown={navigate} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {custom ? <button type="button" data-exercise-option disabled={!query.trim()} onClick={() => commit({exercise:query.trim(),exercise_id:null})} className="min-h-16 w-full px-4 text-left font-medium disabled:text-zinc-500">{t('Use custom exercise')}</button>
          : <>{showRecent ? <><div role="group" aria-label={t('Recent')}><h3 className="px-4 pb-1 pt-4 text-xs text-zinc-400">{t('Recent')}</h3>{recent.map(row)}</div><h3 className="px-4 pb-1 pt-5 text-xs text-zinc-400">{t('All exercises')}</h3></> : null}
            {matches.filter(e => !recentIds.has(e.id)).map(row)}
            {!matches.length ? <p className="px-4 py-8 text-sm text-zinc-400">{t('No matching exercises')}</p> : null}</>}
      </div>
      <footer className="shrink-0 border-t border-white/10 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={() => {setCustom(!custom);setQuery('');search.current?.focus();}} className="min-h-12 w-full rounded border border-white/15 text-sm font-medium">{t(custom ? 'Choose from catalog' : 'Other exercise')}</button>
      </footer>
    </dialog>,document.body)}
  </div>;
}
