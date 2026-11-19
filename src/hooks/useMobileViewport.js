import { useLayoutEffect, useState } from 'react';

// iOS keeps the layout viewport tall while its keyboard shrinks/pans the visual
// viewport. Publish both dimensions so sheets and chat share one coordinate space.
export function useMobileViewport() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let baseline = window.innerHeight;
    let keyboardVisible = false;
    let layoutWidth = window.innerWidth;
    let previousHeight = viewport?.height || window.innerHeight;
    let motionTimer;
    const update = event => {
      const focused = event?.type === 'focusout' ? event.relatedTarget : document.activeElement;
      const editing = focused?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select, [contenteditable="true"]');
      const height = viewport?.height || window.innerHeight;
      const scale = viewport?.scale || 1;
      if (window.innerWidth !== layoutWidth) { layoutWidth = window.innerWidth; baseline = window.innerHeight; }
      if (!editing && !keyboardVisible) baseline = window.innerHeight;
      const inset = Math.max(0, Math.max(baseline, window.innerHeight) - height);
      // Blur precedes dismissal. Keep geometry until the keyboard actually
      // leaves, including between pointerdown and click on the Send button.
      const open = Boolean(scale === 1 && (keyboardVisible ? inset > 2 : editing && inset > 120));
      if (height > previousHeight + 1 && keyboardVisible) {
        root.dataset.keyboardMotion = 'closing';
        clearTimeout(motionTimer);
        motionTimer = setTimeout(() => { delete root.dataset.keyboardMotion; }, 240);
      } else if (height < previousHeight - 1 && open) {
        clearTimeout(motionTimer);
        delete root.dataset.keyboardMotion;
      }
      previousHeight = height;
      keyboardVisible = open;
      root.style.setProperty('--lifeos-viewport-height', `${height}px`);
      root.style.setProperty('--lifeos-viewport-top', `${viewport?.offsetTop || 0}px`);
      root.style.setProperty('--lifeos-keyboard-inset', `${scale === 1 && (editing || open) ? inset : 0}px`);
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
      root.style.removeProperty('--lifeos-keyboard-inset');
      clearTimeout(motionTimer);
      delete root.dataset.keyboardMotion;
      delete root.dataset.keyboardOpen;
    };
  }, []);
  return keyboardOpen;
}
