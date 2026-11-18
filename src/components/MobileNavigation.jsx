import { useLayoutEffect, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { t } from '../i18n';

const mobileDestinations = ['home', 'community', 'workout', 'assistant', 'more'];

export function MobileNavigation({ destinations, activeTab, moreDestinations, keyboardOpen, moreOpen, hasResume, onNavigate, onMore }) {
  const nav = useRef(null);
  const indicator = useRef(null);
  const spring = useRef({ x: null, velocity: 0, target: 0, width: 0 });
  useLayoutEffect(() => {
    const previous = document.documentElement.style.getPropertyValue('--lifeos-mobile-dock-height');
    const previousResume = document.documentElement.style.getPropertyValue('--lifeos-resume-dock-height');
    return () => {
      if (previous) document.documentElement.style.setProperty('--lifeos-mobile-dock-height', previous);
      else document.documentElement.style.removeProperty('--lifeos-mobile-dock-height');
      if (previousResume) document.documentElement.style.setProperty('--lifeos-resume-dock-height', previousResume);
      else document.documentElement.style.removeProperty('--lifeos-resume-dock-height');
    };
  }, []);
  useLayoutEffect(() => {
    const element = nav.current;
    const pill = indicator.current;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame;
    let lastTime;
    const paint = () => {
      pill.style.transform = `translate3d(${spring.current.x}px, 0, 0)`;
      pill.style.width = `${spring.current.width}px`;
    };
    const tick = time => {
      const state = spring.current;
      const dt = Math.min((time - (lastTime ?? time - 16)) / 1000, .032);
      lastTime = time;
      // Critical damping: retarget the current position and velocity, never restart.
      const omega = 28;
      const displacement = state.x - state.target;
      const decay = Math.exp(-omega * dt);
      const step = state.velocity + omega * displacement;
      state.x = state.target + (displacement + step * dt) * decay;
      state.velocity = (state.velocity - omega * step * dt) * decay;
      if (Math.abs(state.x - state.target) < .05 && Math.abs(state.velocity) < .1) {
        state.x = state.target; state.velocity = 0; frame = null; paint(); return;
      }
      paint(); frame = requestAnimationFrame(tick);
    };
    const measure = () => {
      const selected = element.querySelector('[aria-current="page"]');
      const height = element.getBoundingClientRect().height;
      const resumeHeight = element.parentElement.querySelector('.training-dock')?.getBoundingClientRect().height;
      if (resumeHeight) document.documentElement.style.setProperty('--lifeos-resume-dock-height', `${resumeHeight}px`);
      if (height) document.documentElement.style.setProperty('--lifeos-mobile-dock-height', `${height}px`);
      if (!selected || !element.offsetWidth) return;
      const state = spring.current;
      state.target = selected.offsetLeft;
      state.width = selected.offsetWidth;
      pill.style.width = `${state.width}px`;
      pill.dataset.ready = 'true';
      if (state.x === null || reduced.matches) {
        cancelAnimationFrame(frame); frame = null;
        state.x = state.target; state.velocity = 0; paint();
      } else if (!frame) { lastTime = null; frame = requestAnimationFrame(tick); }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const resume = element.parentElement.querySelector('.training-dock');
    if (resume) observer.observe(resume);
    reduced.addEventListener('change', measure);
    measure();
    return () => { observer.disconnect(); reduced.removeEventListener('change', measure); cancelAnimationFrame(frame); };
  }, [activeTab, hasResume]);
  return <nav ref={nav} className="mobile-dock" aria-label={t('Mobile navigation')} data-keyboard-open={keyboardOpen}>
    <span ref={indicator} className="mobile-dock-selection" aria-hidden="true" />
    {mobileDestinations.map(id => {
      const item = destinations[id] || { label: 'More', icon: MoreHorizontal };
      const Icon = item.icon;
      const active = id === 'more' ? moreDestinations.includes(activeTab) : activeTab === id;
      return <button key={id} type="button" className="mobile-destination" aria-current={active ? 'page' : undefined} aria-haspopup={id === 'more' ? 'dialog' : undefined} aria-expanded={id === 'more' ? moreOpen : undefined} onClick={event => id === 'more' ? onMore(event.currentTarget) : onNavigate(id)}>
        <span className="mobile-destination-icon"><Icon size={22} strokeWidth={active ? 2 : 1.75} aria-hidden="true" /></span><span className="mobile-destination-label">{t(item.label)}</span>
      </button>;
    })}
  </nav>;
}
