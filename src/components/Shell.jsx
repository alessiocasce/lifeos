import { getLocale } from '../i18n';
import { t } from '../i18n';
import { ArrowUpRight, Bell, CalendarDays, ChevronRight, Command, Dumbbell, HeartPulse, Hexagon, Landmark, LogOut, MessageSquare, MoreHorizontal, Settings, Target, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLifeOS } from '../context/LifeOSContext';
import { useLocalDay } from '../hooks/useLocalDay';
import { readWorkoutDraft } from '../utils/workoutContinuity';
import { LifeOSLogo } from './LifeOSLogo';
import { PullToRefresh } from './PullToRefresh';
import { AppUpdateNotice } from './AppUpdates';
import { appUpdate } from '../utils/pwaUpdate';
import { clearCommunitySession, invalidateCommunity } from '../utils/communityCache';
import '../styles/navigation.css';

const destinations = {
  community: { label: 'Community', icon: Users },
  settings: { label: 'Settings', icon: Settings },
  home: { label: 'Command', icon: Command },
  workout: { label: 'Training', icon: Dumbbell },
  projects: { label: 'Projects', icon: Target },
  assistant: { label: 'Companion', icon: MessageSquare },
  health: { label: 'Health', icon: HeartPulse },
  calendar: { label: 'Calendar', icon: CalendarDays },
  memos: { label: 'Memos', icon: Bell },
  finances: { label: 'Finances', icon: Landmark },
};
const primary = ['home', 'workout', 'community', 'projects', 'assistant'];
const utilities = ['health', 'calendar', 'memos', 'finances', 'settings'];
const moreDestinations = ['projects', ...utilities];
const mobile = ['home', 'community', 'workout', 'assistant', 'more'];

export function Shell({ children }) {
  const { activeTab, activeWorkoutSession, authUser, userSettings, setActiveTab, setActiveWorkoutId, signOut, workoutSessions, workoutSessionsStatus, meaningfulUnsavedWork } = useLifeOS();
  const updateGuard = useRef(null);
  updateGuard.current = workoutSessionsStatus !== 'ready' ? 'loading-workouts' : workoutSessions.some(session => !session.ended_at) ? 'active-workout' : meaningfulUnsavedWork?.length ? 'unsaved-work' : null;
  useEffect(() => { appUpdate.setGuard(() => updateGuard.current); return () => appUpdate.setGuard(() => null); }, []);
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const sheetRef = useRef(null);
  const moreTrigger = useRef(null);
  const today = useLocalDay();
  const destination = destinations[activeTab] || destinations.home;
  const liveSession = activeWorkoutSession && !activeWorkoutSession.ended_at
    ? activeWorkoutSession : workoutSessions.find((session) => !session.ended_at);
  const currentDraft = liveSession ? readWorkoutDraft(authUser?.id, liveSession.id) : null;
  useEffect(() => { setMoreOpen(false); }, [activeTab]);

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
    window.addEventListener('lifeos:profile-updated', invalidateCommunity);
    window.addEventListener('lifeos:community-updated', invalidateCommunity);
    return () => {
      window.removeEventListener('lifeos:profile-updated', invalidateCommunity);
      window.removeEventListener('lifeos:community-updated', invalidateCommunity);
      clearCommunitySession();
    };
  }, [authUser?.id]);
  useEffect(() => {
    const dialog = sheetRef.current;
    if (!dialog) return;
    if (moreOpen) {
      if (!dialog.open) {
        dialog.showModal();
        dialog.querySelector('button')?.focus({ preventScroll: true });
      }
      const overflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = overflow; };
    }
    if (!dialog.open) return;
    // Keep the native modal and its focus trap alive until the exit finishes.
    const close = () => dialog.close();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) close();
    else {
      const fallback = setTimeout(close, 250);
      return () => clearTimeout(fallback);
    }
  }, [moreOpen]);

  const navigate = (tab) => {
    if (setActiveTab(tab) === false) return;
    setMoreOpen(false);
    window.scrollTo({ top: 0 });
  };
  const handleSignOut = async () => {
    setSigningOut(true);
    setAccountError('');
    try { await signOut(); } catch { setAccountError(t("Could not sign out. Try again.")); }
    finally { setSigningOut(false); }
  };
  const resume = () => {
    setActiveWorkoutId(liveSession.id);
    navigate('workout');
  };

  return (
    <div className="lifeos-shell" data-workspace={activeTab}>
      <aside className="desktop-rail">
        <div className="rail-brand"><LifeOSLogo size={26} /><span>{t("LifeOS")}<span className="brand-detail">{t("PERSONAL SYSTEM")}</span></span></div>
        <nav aria-label={t("Primary navigation")} className="rail-navigation">
          {primary.map((id) => <NavigationButton key={id} id={id} active={activeTab === id} onClick={() => navigate(id)} />)}
          <span className="rail-section-label">{t("Records")}</span>
          {utilities.map((id) => <NavigationButton key={id} id={id} active={activeTab === id} onClick={() => navigate(id)} />)}
        </nav>
        <div className="rail-account">
          <span className="connection-label"><span className={online ? 'status-dot' : 'status-dot offline'} />{online ? t("Connected") : t("Offline")}</span>
          <button className="rail-link" onClick={handleSignOut} disabled={signingOut} aria-label={t("Sign out")}><LogOut size={18} /><span>{t("Sign out")}</span></button>
          {accountError ? <p role="alert" className="text-xs text-red-300">{t(accountError)}</p> : null}
        </div>
      </aside>
      <main className="workspace">
      <AppUpdateNotice hasResume={Boolean(liveSession && activeTab !== 'workout')} />
        <header className="workspace-header">
          <div className="flex min-w-0 items-center gap-3">
            <span className="mobile-brand">{activeTab === 'workout' ? <span className="training-brand"><Hexagon size={26} strokeWidth={1.3} /><Dumbbell size={15} strokeWidth={1.8} /></span> : <LifeOSLogo size={23} />}</span>
            <h1>{t(destination.label)}</h1>
          </div>
          <div className="flex items-center gap-3">
            {!online ? <span className="connection-label text-amber-300">{t("Offline")}</span> : null}
            <time className="header-date" dateTime={today}>{new Date(today + 'T12:00:00').toLocaleDateString(getLocale(), { day: '2-digit', month: 'short' })}</time>
            {activeTab !== 'assistant' ? <button className="icon-button hidden md:inline-flex" title={t("Open Companion")} aria-label={t("Open Companion")} onClick={() => navigate('assistant')}><MessageSquare size={18} /></button> : null}
          </div>
        </header>
        <PullToRefresh>
          <div className={'workspace-content ' + (liveSession && activeTab !== 'workout' ? 'has-training-dock' : '')}>
            {userSettings?.status === 'ready' && !userSettings.profile && activeTab !== 'settings' ? <button className="mb-5 min-h-11 border-b border-white/10 text-sm text-zinc-300" onClick={() => navigate('settings')}>{t("Set up your profile and language")}</button> : null}
            {children}
          </div>
        </PullToRefresh>
      </main>
      {/* Keep fixed docks outside app ancestors that can establish containing blocks. */}
      {createPortal(<div className="shell-docks" data-workspace={activeTab}>
      {liveSession && activeTab !== 'workout' ? (
        <button className="training-dock" data-keyboard-open={keyboardOpen} onClick={resume}>
          <span className="training-dock-icon"><Dumbbell size={20} /></span>
          <span className="min-w-0 flex-1 text-left"><span className="block text-xs text-zinc-400">{t("Training in progress")}</span><strong className="block truncate text-sm">{currentDraft?.exercise || liveSession.name}</strong></span>
          <span className="flex items-center gap-2 text-sm font-semibold">{t("Resume")}<ArrowUpRight size={18} /></span>
        </button>
      ) : null}
      <nav className="mobile-dock" aria-label={t("Mobile navigation")} data-keyboard-open={keyboardOpen}>
        {mobile.map((id) => {
          const item = destinations[id] || { label: 'More', icon: MoreHorizontal };
          const Icon = item.icon;
          const active = id === 'more' ? moreDestinations.includes(activeTab) : activeTab === id;
          return <button key={id} className={'mobile-destination ' + (id === 'workout' ? 'training-destination' : '')} aria-current={active ? 'page' : undefined} onClick={event => { if (id === 'more') { moreTrigger.current = event.currentTarget; setMoreOpen(true); } else navigate(id); }}>
            <span className="mobile-destination-icon"><Icon size={21} strokeWidth={active ? 2 : 1.65} /></span><span>{t(item.label)}</span>
          </button>;
        })}
      </nav>
      </div>, document.body)}
      <dialog ref={sheetRef} className="utility-sheet" data-closing={!moreOpen} aria-labelledby="utility-title"
        onCancel={event => { event.preventDefault(); setMoreOpen(false); }}
        onAnimationEnd={event => { if (event.target === sheetRef.current && event.animationName === 'utility-exit' && !moreOpen) sheetRef.current?.close(); }}
        onClose={() => { setMoreOpen(false); if (moreTrigger.current?.isConnected) moreTrigger.current.focus({ preventScroll: true }); }}
        onClick={event => { if (event.target !== sheetRef.current) return; const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setMoreOpen(false); }}>
        <div className="utility-sheet-content">
          <div className="flex items-center justify-between pb-4"><h2 id="utility-title" className="text-lg font-semibold">{t("Your system")}</h2><button className="icon-button" onClick={() => setMoreOpen(false)} aria-label={t("Close utilities")}><X size={20} /></button></div>
          <nav aria-label={t("Utilities")}>{moreDestinations.map((id) => {
            const Icon = destinations[id].icon;
            return <button key={id} className="utility-link" aria-current={activeTab === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={20} /><span>{t(destinations[id].label)}</span><ChevronRight size={16} /></button>;
          })}</nav>
          <div className="mt-5 border-t border-white/10 pt-4">
            <button className="utility-link" disabled={signingOut} onClick={handleSignOut}><LogOut size={20} /><span>{t("Sign out")}</span></button>
            {accountError ? <p role="alert" className="text-sm text-red-300">{t(accountError)}</p> : null}
          </div>
        </div>
      </dialog>
    </div>
  );
}

function NavigationButton({ id, active, onClick }) {
  const { label, icon: Icon } = destinations[id];
  return <button className={'rail-link ' + (id === 'workout' ? 'rail-training' : '')} aria-current={active ? 'page' : undefined} title={label} onClick={onClick}><Icon size={19} /><span>{t(label)}</span></button>;
}
