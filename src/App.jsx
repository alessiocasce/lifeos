import { t } from './i18n';
import { Suspense, lazy } from 'react';
import { LifeOSProvider, useLifeOS } from './context/LifeOSContext';
import { AuthConfigScreen, AuthLoadingScreen, AuthScreen, PasswordRecoveryScreen } from './components/AuthScreen';
import { Shell } from './components/Shell';
import { HomeTab } from './tabs/HomeTab';
import { useLanguage } from './i18n';
import { ProfileCompletion } from './components/ProfileCompletion';
import { WorkspaceErrorBoundary } from './components/WorkspaceErrorBoundary';

const CalendarTab = lazy(() => import('./tabs/CalendarTab').then((module) => ({ default: module.CalendarTab })));
const MemosTab = lazy(() => import('./tabs/MemosTab').then((module) => ({ default: module.MemosTab })));
const ProjectsTab = lazy(() => import('./tabs/ProjectsTab').then((module) => ({ default: module.ProjectsTab })));
const HealthTab = lazy(() => import('./tabs/HealthTab').then((module) => ({ default: module.HealthTab })));
const WorkoutTab = lazy(() => import('./tabs/WorkoutTab').then((module) => ({ default: module.WorkoutTab })));
const FinancesTab = lazy(() => import('./tabs/FinancesTab').then((module) => ({ default: module.FinancesTab })));
const AIAssistantTab = lazy(() => import('./tabs/AIAssistantTab').then((module) => ({ default: module.AIAssistantTab })));
const SettingsTab = lazy(() => import('./tabs/SettingsTab').then((module) => ({ default: module.SettingsTab })));
const CommunityTab = lazy(() => import('./tabs/CommunityTab').then((module) => ({ default: module.CommunityTab })));

const tabViews = {
  community: CommunityTab,
  settings: SettingsTab,
  home: HomeTab,
  calendar: CalendarTab,
  memos: MemosTab,
  projects: ProjectsTab,
  health: HealthTab,
  workout: WorkoutTab,
  finances: FinancesTab,
  assistant: AIAssistantTab,
};

function LifeOSApp() {
  const { activeTab, authStatus, authUser, isSupabaseConfigured, userSettings, setActiveTab, passwordRecovery, finishPasswordRecovery } = useLifeOS();

  if (!isSupabaseConfigured) {
    return <AuthConfigScreen />;
  }

  if (authStatus === 'loading') {
    return <AuthLoadingScreen />;
  }

  if (!authUser) {
    return <AuthScreen />;
  }
  if (passwordRecovery) return <PasswordRecoveryScreen key={authUser.id} onDone={finishPasswordRecovery} />;
  if (userSettings.status === 'loading') return <AuthLoadingScreen />;
  if (!userSettings.profile?.username && (userSettings.status === 'ready' || activeTab === 'community')) return <ProfileCompletion key={authUser.id} />;

  const ActiveView = tabViews[activeTab] ?? HomeTab;
  return (
    <Shell>
      <WorkspaceErrorBoundary key={`${authUser.id}:${activeTab}`} onBack={() => setActiveTab('home')}>
        <Suspense fallback={<TabLoadingFallback />}>
          <ActiveView />
        </Suspense>
      </WorkspaceErrorBoundary>
    </Shell>
  );
}

function TabLoadingFallback() {
  return (
    <div role="status" className="border-t border-white/10 py-6">
      <p className="text-sm text-zinc-400">{t("Loading workspace...")}</p>
    </div>
  );
}

export default function App() {
  useLanguage();
  return (
    <LifeOSProvider>
      <LifeOSApp />
    </LifeOSProvider>
  );
}
