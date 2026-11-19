import { useLayoutEffect, useState } from 'react';

// iOS keeps the layout viewport tall while its keyboard shrinks/pans the visual
// viewport. Publish both dimensions so sheets and chat share one coordinate space.
export function useMobileViewport() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let baseline = window.innerHeight;
    const update = event => {
      const focused = event?.type === 'focusout' ? event.relatedTarget : document.activeElement;
      const editing = focused?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select, [contenteditable="true"]');
      const height = viewport?.height || window.innerHeight;
      const scale = viewport?.scale || 1;
      if (!editing) baseline = window.innerHeight;
      const open = Boolean(editing && scale === 1 && Math.max(baseline, window.innerHeight) - height > 120);
      root.style.setProperty('--lifeos-viewport-height', `${height}px`);
      root.style.setProperty('--lifeos-viewport-top', `${viewport?.offsetTop || 0}px`);
      root.style.setProperty('--lifeos-dock-viewport-gap', `${scale === 1 ? Math.max(0, window.innerHeight - height - (viewport?.offsetTop || 0)) : 0}px`);
      root.dataset.keyboardOpen = String(open);
      setKeyboardOpen(open);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      root.style.removeProperty('--lifeos-viewport-height');
      root.style.removeProperty('--lifeos-viewport-top');
      root.style.removeProperty('--lifeos-dock-viewport-gap');
      delete root.dataset.keyboardOpen;
    };
  }, []);
  return keyboardOpen;
}
