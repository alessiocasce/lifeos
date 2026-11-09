import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import '../styles/confirmation.css';

export function ConfirmationDialog({ title, message, confirmLabel, cancelLabel = t('Cancel'), busy, error, onConfirm, onCancel }) {
  const dialog = useRef(null);
  const cancel = useRef(null);
  const titleId = useId();
  const messageId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current.showModal();
    cancel.current.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<dialog ref={dialog} className="lifeos-confirm" aria-labelledby={titleId} aria-describedby={messageId}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id={titleId}>{title}</h2><p id={messageId}>{message}</p>
    {error ? <p role="alert" className="history-error">{error}</p> : null}
    <div className="lifeos-confirm-actions">
      <button ref={cancel} type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className="lifeos-confirm-destructive" disabled={busy} onClick={onConfirm}>{busy ? t('Saving...') : confirmLabel}</button>
    </div>
  </dialog>, document.body);
}
