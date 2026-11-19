import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '../i18n';

export function SettingsDialog({ title, onClose, children, className = '', busy = false, triggerRef, showHeader = true }) {
  const photoViewer = className.split(' ').includes('settings-photo-viewer');
  const dialog = useRef(null);
  const close = useRef(onClose);
  const motion = useRef(null);
  const closing = useRef(false);
  const photoReturnFrames = useRef(null);
  close.current = onClose;
  useEffect(() => {
    const element = dialog.current;
    const previous = triggerRef?.current || document.activeElement;
    const source = previous?.getBoundingClientRect?.();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    // The photo overlay's first control spans the stable viewport. Let native
    // modal focus land there; never focus the small animated photo container.
    if (!photoViewer) element.focus({ preventScroll: true });
    const target = element.getBoundingClientRect();
    if (source) element.style.transformOrigin = `${Math.max(0, Math.min(target.width, source.x + source.width / 2 - target.x))}px ${Math.max(0, Math.min(target.height, source.y + source.height / 2 - target.y))}px`;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const previousVisibility = previous?.style?.visibility;
    const photoFrames = (origin = previous?.getBoundingClientRect?.()) => {
      const destination = element.querySelector('.settings-photo-circle')?.getBoundingClientRect() || element.getBoundingClientRect();
      const transform = !reduced && origin?.width && destination.width
        ? `translate(${origin.left - destination.left}px, ${origin.top - destination.top}px) scale(${origin.width / destination.width})`
        : 'none';
      return [{ opacity: 1, transform }, { opacity: 1, transform: 'none' }];
    };
    if (photoViewer) {
      element.style.transformOrigin = '0 0';
      photoReturnFrames.current = photoFrames;
      if (previous?.style) previous.style.visibility = 'hidden';
    }
    const animatedElement = photoViewer ? element.querySelector('.settings-photo-circle') : element;
    if (photoViewer) animatedElement.style.transformOrigin = '0 0';
    const animation = animatedElement.animate(photoViewer ? photoFrames(source) : [
      { opacity: 0, transform: reduced ? 'none' : 'translateY(10px) scale(.94)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], { duration: reduced ? (photoViewer ? 1 : 100) : 240, easing: photoViewer ? 'cubic-bezier(.22,1,.36,1)' : 'cubic-bezier(.2,.75,.25,1)', fill: 'both' });
    motion.current = animation;
    animation.onfinish = () => { if (closing.current) close.current(); };
    return () => {
      animation.cancel();
      photoReturnFrames.current = null;
      if (photoViewer && previous?.style) previous.style.visibility = previousVisibility;
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [triggerRef]);
  const dismiss = () => {
    if (busy || closing.current) return;
    // Re-measure after edits, confirmation panels or a viewport change. While
    // opening, reverse the current animation directly to avoid a position jump.
    if (motion.current.playState === 'finished' && photoReturnFrames.current) {
      motion.current.effect.setKeyframes(photoReturnFrames.current());
    }
    closing.current = true;
    motion.current.reverse();
  };
  return createPortal(<dialog ref={dialog} tabIndex={photoViewer ? undefined : -1} className={`settings-dialog ${className}`} aria-label={t(title)} aria-modal="true" onPointerDown={() => {
    // A new interaction can reverse an in-progress dismissal without a jump.
    if (closing.current) { closing.current = false; motion.current.updatePlaybackRate(1); motion.current.play(); }
  }} onCancel={event => { event.preventDefault(); dismiss(); }} onClick={event => {
    if (event.target !== event.currentTarget || busy) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismiss();
  }}>{photoViewer ? <>
    <button type="button" className="settings-photo-dismiss" aria-label={t('Close profile photo')} disabled={busy} onClick={dismiss} />
    <div className="settings-photo-content">{children}</div>
  </> : <>{showHeader && <header><h2>{t(title)}</h2><button type="button" className="icon-button" aria-label={t('Close')} disabled={busy} onClick={dismiss}><X size={22} /></button></header>}{children}</>}</dialog>, document.body);
}
