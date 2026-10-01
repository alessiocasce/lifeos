import { ArrowUpRight, Bell, CalendarDays, ChevronRight, Command, Dumbbell, HeartPulse, Landmark, LogOut, MessageSquare, MoreHorizontal, Target, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { useLocalDay } from '../hooks/useLocalDay';
import { readWorkoutDraft } from '../utils/workoutContinuity';
import { LifeOSLogo } from './LifeOSLogo';
import { PullToRefresh } from './PullToRefresh';

const destinations = {
  home: { label: 'Command', icon: Command },
  workout: { label: 'Training', icon: Dumbbell },
  projects: { label: 'Projects', icon: Target },
  assistant: { label: 'Companion', icon: MessageSquare },
  health: { label: 'Health', icon: HeartPulse },
  calendar: { label: 'Calendar', icon: CalendarDays },
  memos: { label: 'Memos', icon: Bell },
  finances: { label: 'Finances', icon: Landmark },
};
const primary = ['home', 'workout', 'projects', 'assistant'];
const utilities = ['health', 'calendar', 'memos', 'finances'];
const mobile = ['home', 'projects', 'workout', 'assistant', 'more'];

export function Shell({ children }) {
  const { activeTab, activeWorkoutSession, authUser, setActiveTab, setActiveWorkoutId, signOut, workoutSessions } = useLifeOS();
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const sheetRef = useRef(null);
  const today = useLocalDay();
  const destination = destinations[activeTab] || destinations.home;
  const liveSession = activeWorkoutSession && !activeWorkoutSession.ended_at
    ? activeWorkoutSession : workoutSessions.find((session) => !session.ended_at);
  const currentDraft = liveSession ? readWorkoutDraft(authUser?.id, liveSession.id) : null;

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    const updateKeyboard = (event) => {
      const focusedElement = event?.type === 'focusout' ? event.relatedTarget : document.activeElement;
      const inputFocused = /INPUT|TEXTAREA|SELECT/.test(focusedElement?.tagName || '');
      setKeyboardOpen(inputFocused && Boolean(window.visualViewport) && window.innerHeight - window.visualViewport.height > 120);
    };
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    window.visualViewport?.addEventListener('resize', updateKeyboard);
    document.addEventListener('focusin', updateKeyboard);
    document.addEventListener('focusout', updateKeyboard);
    updateKeyboard();
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      window.visualViewport?.removeEventListener('resize', updateKeyboard);
      document.removeEventListener('focusin', updateKeyboard);
      document.removeEventListener('focusout', updateKeyboard);
    };
  }, []);

  useEffect(() => {
    if (moreOpen) sheetRef.current?.showModal();
    else sheetRef.current?.close();
  }, [moreOpen]);

  const navigate = (tab) => {
    setMoreOpen(false);
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
  };
  const handleSignOut = async () => {
    setSigningOut(true);
    setAccountError('');
    try { await signOut(); } catch { setAccountError('Could not sign out. Try again.'); }
    finally { setSigningOut(false); }
  };
  const resume = () => {
    setActiveWorkoutId(liveSession.id);
    navigate('workout');
  };

  return (
    <div className="lifeos-shell">
      <aside className="desktop-rail">
        <div className="rail-brand"><LifeOSLogo size={26} /><span>LifeOS<span className="brand-detail">PERSONAL SYSTEM</span></span></div>
        <nav aria-label="Primary navigation" className="rail-navigation">
          {primary.map((id) => <NavigationButton key={id} id={id} active={activeTab === id} onClick={() => navigate(id)} />)}
          <span className="rail-section-label">Records</span>
          {utilities.map((id) => <NavigationButton key={id} id={id} active={activeTab === id} onClick={() => navigate(id)} />)}
        </nav>
        <div className="rail-account">
          <span className="connection-label"><span className={online ? 'status-dot' : 'status-dot offline'} />{online ? 'Connected' : 'Offline'}</span>
          <button className="rail-link" onClick={handleSignOut} disabled={signingOut} aria-label="Sign out"><LogOut size={18} /><span>Sign out</span></button>
          {accountError ? <p role="alert" className="text-xs text-red-300">{accountError}</p> : null}
        </div>
      </aside>
      <main className="workspace">
        <header className="workspace-header">
          <div className="flex min-w-0 items-center gap-3">
            <span className="mobile-brand"><LifeOSLogo size={23} /></span>
            <h1>{destination.label}</h1>
          </div>
          <div className="flex items-center gap-3">
            {!online ? <span className="connection-label text-amber-300">Offline</span> : null}
            <time className="header-date" dateTime={today}>{new Date(today + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</time>
            {activeTab !== 'assistant' ? <button className="icon-button hidden md:inline-flex" title="Open Companion" aria-label="Open Companion" onClick={() => navigate('assistant')}><MessageSquare size={18} /></button> : null}
          </div>
        </header>
        <PullToRefresh>
          <div className={'workspace-content ' + (liveSession && activeTab !== 'workout' ? 'has-training-dock' : '')}>{children}</div>
        </PullToRefresh>
      </main>
      {liveSession && activeTab !== 'workout' ? (
        <button className="training-dock" data-keyboard-open={keyboardOpen} onClick={resume}>
          <span className="training-dock-icon"><Dumbbell size={20} /></span>
          <span className="min-w-0 flex-1 text-left"><span className="block text-xs text-zinc-400">Training in progress</span><strong className="block truncate text-sm">{currentDraft?.exercise || liveSession.name}</strong></span>
          <span className="flex items-center gap-2 text-sm font-semibold">Resume<ArrowUpRight size={18} /></span>
        </button>
      ) : null}
      <nav className="mobile-dock" aria-label="Mobile navigation" data-keyboard-open={keyboardOpen}>
        {mobile.map((id) => {
          const item = destinations[id] || { label: 'More', icon: MoreHorizontal };
          const Icon = item.icon;
          const active = id === 'more' ? utilities.includes(activeTab) : activeTab === id;
          return <button key={id} className={'mobile-destination ' + (id === 'workout' ? 'training-destination' : '')} aria-current={active ? 'page' : undefined} onClick={() => id === 'more' ? setMoreOpen(true) : navigate(id)}>
            <span className="mobile-destination-icon"><Icon size={21} strokeWidth={active ? 2 : 1.65} /></span><span>{item.label}</span>
          </button>;
        })}
      </nav>
      <dialog ref={sheetRef} className="utility-sheet" aria-labelledby="utility-title" onClose={() => setMoreOpen(false)} onClick={(event) => { if (event.target === sheetRef.current) setMoreOpen(false); }}>
        <div className="utility-sheet-content">
          <div className="flex items-center justify-between pb-4"><h2 id="utility-title" className="text-lg font-semibold">Your system</h2><button className="icon-button" onClick={() => setMoreOpen(false)} aria-label="Close utilities"><X size={20} /></button></div>
          <nav aria-label="Utilities">{utilities.map((id) => {
            const Icon = destinations[id].icon;
            return <button key={id} className="utility-link" aria-current={activeTab === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={20} /><span>{destinations[id].label}</span><ChevronRight size={16} /></button>;
          })}</nav>
          <div className="mt-5 border-t border-white/10 pt-4">
            <button className="utility-link" disabled={signingOut} onClick={handleSignOut}><LogOut size={20} /><span>Sign out</span></button>
            {accountError ? <p role="alert" className="text-sm text-red-300">{accountError}</p> : null}
          </div>
        </div>
      </dialog>
    </div>
  );
}

function NavigationButton({ id, active, onClick }) {
  const { label, icon: Icon } = destinations[id];
  return <button className={'rail-link ' + (id === 'workout' ? 'rail-training' : '')} aria-current={active ? 'page' : undefined} title={label} onClick={onClick}><Icon size={19} /><span>{label}</span></button>;
}
