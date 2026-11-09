import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '../i18n';

export function SettingsDialog({ title, onClose, children, className = '', busy = false, triggerRef }) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const element = dialog.current;
    const previous = triggerRef?.current || document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    element.focus({ preventScroll: true });
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [triggerRef]);
  return createPortal(<dialog ref={dialog} tabIndex={-1} className={`settings-dialog ${className}`} aria-label={t(title)} aria-modal="true" onCancel={event => { event.preventDefault(); if (!busy) close.current(); }} onClick={event => {
    if (event.target !== event.currentTarget || busy) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close.current();
  }}><header><h2>{t(title)}</h2><button type="button" className="icon-button" aria-label={t('Close')} disabled={busy} onClick={onClose}><X size={22} /></button></header>{children}</dialog>, document.body);
}
