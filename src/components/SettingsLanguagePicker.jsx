import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { t } from '../i18n';

const languages = [{ value: 'it', label: 'Italiano' }, { value: 'en', label: 'English' }];

export function SettingsLanguagePicker({ value, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef(null);
  const menu = useRef(null);
  const motion = useRef(null);
  const closing = useRef(false);
  const restoreFocus = useRef(false);
  const id = useId();
  const selected = languages.findIndex(language => language.value === value);
  const dismiss = (restore = false) => { restoreFocus.current = restore; setOpen(false); };
  const choose = index => {
    dismiss(true);
    if (languages[index].value !== value) onChange(languages[index].value);
  };
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    closing.current = !open;
    if (open) {
      setPresent(true);
      const place = () => {
        const rect = trigger.current.getBoundingClientRect();
        const width = Math.min(element.offsetWidth, innerWidth - 24);
        const height = element.offsetHeight;
        const below = rect.bottom + 8;
        element.style.transformOrigin = below + height <= innerHeight - 12 ? 'top right' : 'bottom right';
        setPosition({ left: Math.max(12, Math.min(rect.right - width, innerWidth - width - 12)), top: below + height <= innerHeight - 12 ? below : Math.max(12, rect.top - height - 8) });
      };
      place();
      if (motion.current?.effect?.target !== element) {
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        motion.current = element.animate([{ opacity: 0, transform: reduced ? 'none' : 'translateY(-4px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: reduced ? 80 : 160, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' });
        motion.current.onfinish = () => { if (closing.current) setPresent(false); };
      } else { motion.current.updatePlaybackRate(1); motion.current.play(); }
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);
      return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    }
    if (motion.current) { motion.current.updatePlaybackRate(-1); motion.current.play(); }
  }, [open]);
  useEffect(() => () => motion.current?.cancel(), []);
  useEffect(() => {
    if (!present && !open && restoreFocus.current && !disabled) { trigger.current?.focus({ preventScroll: true }); restoreFocus.current = false; }
  }, [present, open, disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) dismiss(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const reveal = () => { setActive(selected); setOpen(true); };
  return <>
    <button ref={trigger} type="button" role="combobox" aria-label={t('Language')} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined} aria-describedby={`${id}-value`} className="settings-language-trigger" disabled={disabled} onClick={() => open ? dismiss() : reveal()} onKeyDown={event => {
      const key = event.key;
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
        event.preventDefault();
        if (!open) { reveal(); return; }
        if (key === 'Enter' || key === ' ') choose(active);
        else if (key === 'Home' || key === 'End') setActive(key === 'Home' ? 0 : languages.length - 1);
        else setActive(index => (index + (key === 'ArrowDown' ? 1 : -1) + languages.length) % languages.length);
      } else if (key === 'Escape' && open) { event.preventDefault(); dismiss(true); }
      else if (key === 'Tab') dismiss();
      else if (open && /^[ie]$/i.test(key)) { event.preventDefault(); setActive(key.toLowerCase() === 'i' ? 0 : 1); }
    }}><span id={`${id}-value`}>{languages[selected]?.label}</span><ChevronDown size={15} aria-hidden="true" /></button>
    {open || present ? createPortal(<div ref={menu} id={id} role="listbox" aria-label={t('Language')} aria-hidden={!open} className="settings-language-menu" style={position}>
      {languages.map((language, index) => <button id={`${id}-${index}`} key={language.value} type="button" role="option" tabIndex={-1} aria-selected={value === language.value} data-active={active === index} onPointerMove={() => setActive(index)} onClick={() => choose(index)}><span>{language.label}</span>{value === language.value ? <Check size={16} aria-hidden="true" /> : null}</button>)}
    </div>, document.body) : null}
  </>;
}
