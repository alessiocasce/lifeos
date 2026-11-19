import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ListFilter } from 'lucide-react';
import { t } from '../i18n';

// Kept inside the sheet's native dialog so the choices remain in its top layer.
export function ExerciseCategoryPicker({ value, categories, onChange }) {
  const choices = [{ value: '', label: t('All muscle groups') }, ...categories.map(category => ({ value: category, label: t(`muscle.${category}`) }))];
  const selected = Math.max(0, choices.findIndex(choice => choice.value === value));
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [active, setActive] = useState(selected);
  const [placement, setPlacement] = useState({ above: false, height: 280 });
  const trigger = useRef(null), menu = useRef(null), motion = useRef(null), closing = useRef(false);
  const id = useId();
  const dismiss = () => setOpen(false);
  const choose = index => {
    const searchFocused = trigger.current?.closest('.exercise-catalog-controls')?.querySelector('input') === document.activeElement;
    onChange(choices[index].value); dismiss();
    if (!searchFocused) trigger.current?.focus({ preventScroll: true });
  };
  const reveal = () => { setActive(selected); setOpen(true); };
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    closing.current = !open;
    if (open) {
      setPresent(true);
      const place = () => {
        const rect = trigger.current.getBoundingClientRect();
        const bounds = trigger.current.closest('.training-picker-viewport').getBoundingClientRect();
        const below = bounds.bottom - rect.bottom - 8, above = rect.top - bounds.top - 8;
        const upwards = below < 180 && above > below;
        setPlacement({ above: upwards, height: Math.max(44, Math.min(300, upwards ? above : below)) });
      };
      place();
      if (motion.current?.effect?.target !== element) {
        motion.current = element.animate([
          { opacity: 0, transform: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'scale(.97)' },
          { opacity: 1, transform: 'none' },
        ], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 160, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
        motion.current.onfinish = () => { if (closing.current && motion.current.playbackRate < 0 && motion.current.currentTime <= .5) setPresent(false); };
      } else { motion.current.updatePlaybackRate(1); motion.current.play(); }
      window.addEventListener('resize', place);
      window.visualViewport?.addEventListener('resize', place);
      return () => { window.removeEventListener('resize', place); window.visualViewport?.removeEventListener('resize', place); };
    }
    motion.current?.updatePlaybackRate(-1);
    motion.current?.play();
  }, [open]);
  useEffect(() => () => motion.current?.cancel(), []);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) dismiss(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    const option = menu.current?.querySelector(`[data-index='${active}']`);
    if (!open || !option) return;
    const top = option.offsetTop, bottom = top + option.offsetHeight;
    if (top < menu.current.scrollTop) menu.current.scrollTop = top;
    else if (bottom > menu.current.scrollTop + menu.current.clientHeight) menu.current.scrollTop = bottom - menu.current.clientHeight;
  }, [active, open]);
  return <div className="exercise-category-control">
    <button ref={trigger} type="button" role="combobox" aria-label={t('Exercise category')} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined} className="exercise-category-trigger" onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()} onClick={() => open ? dismiss() : reveal()} onKeyDown={event => {
      const key = event.key;
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
        event.preventDefault(); event.stopPropagation();
        if (!open) { reveal(); return; }
        if (key === 'Enter' || key === ' ') choose(active);
        else if (key === 'Home' || key === 'End') setActive(key === 'Home' ? 0 : choices.length - 1);
        else setActive(index => (index + (key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length);
      } else if (key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); dismiss(); }
      else if (key === 'Tab') dismiss();
      else if (open && key.length === 1) {
        const index = choices.findIndex(choice => choice.label.toLocaleLowerCase().startsWith(key.toLocaleLowerCase()));
        if (index >= 0) { event.preventDefault(); setActive(index); }
      }
    }}><ListFilter size={18} className="exercise-category-compact-icon" /><span>{choices[selected].label}</span><ChevronDown size={16} /></button>
    {(open || present) && <div ref={menu} id={id} role="listbox" aria-label={t('Exercise category')} aria-hidden={!open} inert={!open ? '' : undefined} className="exercise-category-menu" data-above={placement.above} style={{ maxHeight: placement.height }}>
      {choices.map((choice, index) => <button key={choice.value} id={`${id}-${index}`} data-index={index} type="button" role="option" tabIndex={-1} aria-selected={choice.value === value} data-active={active === index} onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()} onPointerMove={() => setActive(index)} onClick={() => choose(index)}><span>{choice.label}</span>{choice.value === value && <Check size={16} />}</button>)}
    </div>}
  </div>;
}
