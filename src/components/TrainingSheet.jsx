import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';
import { t } from '../i18n';

export function TrainingSheet({ title, ariaLabel = title, onBack, backRef, onClose, children, busy = false, className = '', triggerRef, requestCloseRef }) {
  const dialog = useRef(null);
  const closeAction = useRef(onClose);
  closeAction.current = onClose;
  const timer = useRef(null);
  const closingRef = useRef(false);
  const motion = useRef(null);
  const afterDismiss = useRef(null);
  const forcedDismiss = useRef(false);
  const fluid = className.split(' ').includes('training-picker-sheet');
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const focus = triggerRef?.current || document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.style.setProperty('--workout-accent', getComputedStyle(document.querySelector('.training-active') || document.body).getPropertyValue('--workout-accent') || '#94a3b8');
    const resize = () => {
      const viewport = window.visualViewport;
      element.style.setProperty('--sheet-viewport-height', `${viewport?.height || window.innerHeight}px`);
      element.style.setProperty('--sheet-viewport-top', `${viewport?.offsetTop || 0}px`);
    };
    resize();
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    element.showModal();
    element.focus({ preventScroll: true });
    if (fluid) {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      motion.current = element.animate([
        { opacity: reduced ? 1 : .5, transform: reduced ? 'translateY(var(--picker-anchor))' : 'translateY(calc(var(--picker-anchor) + 20px)) scale(.985)' },
        { opacity: 1, transform: 'translateY(var(--picker-anchor))' },
      ], { duration: reduced ? 1 : 240, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
      motion.current.onfinish = () => {
        if (closingRef.current && motion.current.playbackRate < 0 && motion.current.currentTime <= .5) {
          closeAction.current();
          if (typeof afterDismiss.current === 'function') afterDismiss.current();
        }
      };
    }
    return () => {
      clearTimeout(timer.current);
      motion.current?.cancel();
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize);
      document.body.style.overflow = overflow;
      element.close();
      if (closingRef.current && focus?.isConnected && focus.getClientRects().length && !focus.matches('input,textarea,select')) focus.focus({ preventScroll: true });
    };
  }, [triggerRef]);
  const close = (afterClose, force = false) => {
    if ((!force && busy) || closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    if (fluid && motion.current) {
      afterDismiss.current = afterClose;
      forcedDismiss.current = force;
      motion.current.updatePlaybackRate(-1); motion.current.play();
      return;
    }
    timer.current = setTimeout(() => { closeAction.current(); if (typeof afterClose === 'function') afterClose(); }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 210);
  };
  if (requestCloseRef) requestCloseRef.current = afterClose => close(afterClose,true);
  return createPortal(<dialog ref={dialog} tabIndex={-1} className={`training-sheet ${className}`} data-closing={closing} data-fluid={fluid} aria-label={t(ariaLabel)} aria-modal="true" onPointerDown={event => {
    if (!fluid || !closingRef.current || forcedDismiss.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    closingRef.current = false; setClosing(false);
    motion.current.updatePlaybackRate(1); motion.current.play();
  }} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === dialog.current) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } }}>
    <div className="training-sheet-handle" />
    <header>{onBack ? <button ref={backRef} type="button" className="training-picker-back" aria-label={t('Back')} disabled={busy || closing} onClick={onBack}><ArrowLeft size={19} /><span>{t('Back')}</span></button> : null}<h2>{t(title)}</h2><button type="button" className="icon-button" title={t('Close')} aria-label={t('Close')} disabled={busy || closing} onClick={close}><X size={22} /></button></header>
    <div className="training-sheet-content" inert={closing ? '' : undefined}>{children}</div>
  </dialog>, document.body);
}
