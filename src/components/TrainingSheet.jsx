import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '../i18n';

export function TrainingSheet({ title, onClose, children, busy = false }) {
  const dialog = useRef(null);
  useEffect(() => {
    const focus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current.showModal();
    dialog.current.style.setProperty('--workout-accent', getComputedStyle(document.querySelector('.training-active') || document.body).getPropertyValue('--workout-accent') || '#94a3b8');
    return () => { document.body.style.overflow = overflow; focus?.focus?.(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="training-sheet" aria-label={t(title)} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="training-sheet-handle" />
    <header><h2>{t(title)}</h2><button type="button" className="icon-button" title={t('Close')} aria-label={t('Close')} disabled={busy} onClick={onClose}><X size={22} /></button></header>
    {children}
  </dialog>, document.body);
}
