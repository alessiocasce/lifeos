import { Check, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { applyAppUpdate, checkForAppUpdate } from '../utils/pwaUpdate';

const PULL_THRESHOLD = 72;
const MAX_PULL = 112;

export function PullToRefresh({ children }) {
  const { meaningfulUnsavedWork, refreshLifeOS } = useLifeOS();
  const containerRef = useRef(null);
  const gestureRef = useRef(null);
  const pullDistanceRef = useRef(0);
  const refreshRunningRef = useRef(false);
  const resetTimerRef = useRef(null);
  const unsavedWorkRef = useRef(meaningfulUnsavedWork);
  const [state, setState] = useState('idle');
  const [pullDistance, setPullDistance] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    unsavedWorkRef.current = meaningfulUnsavedWork;
  }, [meaningfulUnsavedWork]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const handleTouchStart = (event) => {
      if (refreshRunningRef.current || !isTouchRefreshEnabled()) return;
      if (!isAtPageTop() || shouldIgnoreTouch(event.target)) return;
      const touch = event.touches[0];
      gestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        active: true,
      };
    };

    const handleTouchMove = (event) => {
      const gesture = gestureRef.current;
      if (!gesture?.active || refreshRunningRef.current) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        gesture.active = false;
        resetPull();
        return;
      }
      if (deltaY <= 0 || !isAtPageTop()) {
        resetPull();
        return;
      }

      event.preventDefault();
      const distance = Math.min(MAX_PULL, deltaY * 0.62);
      pullDistanceRef.current = distance;
      setPullDistance(distance);
      setState(distance >= PULL_THRESHOLD ? 'ready' : 'pulling');
      setMessage('');
    };

    const handleTouchEnd = () => {
      const shouldRefresh = gestureRef.current?.active && pullDistanceRef.current >= PULL_THRESHOLD;
      gestureRef.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
      if (shouldRefresh) runRefresh();
      else setState('idle');
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      window.clearTimeout(resetTimerRef.current);
    };
  }, [refreshLifeOS]);

  const resetPull = () => {
    gestureRef.current = null;
    pullDistanceRef.current = 0;
    setPullDistance(0);
    setState('idle');
  };

  const runRefresh = async () => {
    if (refreshRunningRef.current) return;
    refreshRunningRef.current = true;
    window.clearTimeout(resetTimerRef.current);
    setState('refreshing');
    setMessage('Refreshing...');
    let resetDelay = 1800;

    try {
      const [dataResult, updateResult] = await Promise.all([
        refreshLifeOS({ reason: 'pull-to-refresh' }),
        checkForAppUpdate(),
      ]);

      if (updateResult.available) {
        const blockingWork = unsavedWorkRef.current[0];
        if (blockingWork) {
          setState('update-ready');
          setMessage(`Update ready - ${blockingWork.label}.`);
          resetDelay = 4500;
        } else {
          setState('updating');
          setMessage('Updating LifeOS...');
          const applied = await applyAppUpdate(updateResult.registration);
          if (applied) return;
          setState('update-ready');
          setMessage('Update ready - pull again to apply.');
          resetDelay = 4500;
        }
      } else if (dataResult.ok) {
        setState('updated');
        setMessage('Updated');
      } else {
        setState('failed');
        setMessage('Refresh failed');
      }
    } catch {
      setState('failed');
      setMessage('Refresh failed');
    } finally {
      refreshRunningRef.current = false;
      resetTimerRef.current = window.setTimeout(() => {
        setState('idle');
        setMessage('');
      }, resetDelay);
    }
  };

  const visible = state !== 'idle';
  return (
    <div ref={containerRef} className="relative min-w-0">
      <div
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 z-[9] flex justify-center px-3 transition-opacity duration-150 md:hidden ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ top: 'calc(env(safe-area-inset-top) + 60px)' }}
      >
        <div
          className="flex min-h-9 max-w-[calc(100vw-24px)] items-center gap-2 rounded-md border border-cyan-400/20 bg-[#0a0a0a]/95 px-3 py-2 shadow-glow backdrop-blur"
          style={{ transform: `translateY(${state === 'pulling' || state === 'ready' ? Math.max(-36, pullDistance - 72) : 0}px)` }}
        >
          <RefreshIcon state={state} />
          <span className="data-text truncate text-[11px] text-zinc-200">{message || refreshLabel(state)}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function RefreshIcon({ state }) {
  if (state === 'refreshing' || state === 'updating') return <Loader2 size={14} className="animate-spin text-cyan-300" />;
  if (state === 'updated') return <Check size={14} className="text-emerald-300" />;
  if (state === 'failed' || state === 'update-ready') return <TriangleAlert size={14} className="text-amber-300" />;
  return <RefreshCw size={14} className={`text-cyan-300 transition-transform ${state === 'ready' ? 'rotate-180' : ''}`} />;
}

function refreshLabel(state) {
  if (state === 'ready') return 'Release to refresh';
  if (state === 'pulling') return 'Pull to refresh';
  return '';
}

function isTouchRefreshEnabled() {
  return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 768;
}

function isAtPageTop() {
  return window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
}

function shouldIgnoreTouch(target) {
  if (!(target instanceof Element)) return true;
  if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"], dialog, [data-pull-refresh-ignore]')) {
    return true;
  }
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]'));
}
