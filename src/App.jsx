import { Suspense, lazy } from 'react';
import { LifeOSProvider, useLifeOS } from './context/LifeOSContext';
import { AuthConfigScreen, AuthLoadingScreen, AuthScreen } from './components/AuthScreen';
import { Shell } from './components/Shell';
import { HomeTab } from './tabs/HomeTab';

const CalendarTab = lazy(() => import('./tabs/CalendarTab').then((module) => ({ default: module.CalendarTab })));
const MemosTab = lazy(() => import('./tabs/MemosTab').then((module) => ({ default: module.MemosTab })));
const ProjectsTab = lazy(() => import('./tabs/ProjectsTab').then((module) => ({ default: module.ProjectsTab })));
const HealthTab = lazy(() => import('./tabs/HealthTab').then((module) => ({ default: module.HealthTab })));
const WorkoutTab = lazy(() => import('./tabs/WorkoutTab').then((module) => ({ default: module.WorkoutTab })));
const FinancesTab = lazy(() => import('./tabs/FinancesTab').then((module) => ({ default: module.FinancesTab })));
const AIAssistantTab = lazy(() => import('./tabs/AIAssistantTab').then((module) => ({ default: module.AIAssistantTab })));

const tabViews = {
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
  const { activeTab, authStatus, authUser, isSupabaseConfigured } = useLifeOS();

  if (!isSupabaseConfigured) {
    return <AuthConfigScreen />;
  }

  if (authStatus === 'loading') {
    return <AuthLoadingScreen />;
  }

  if (!authUser) {
    return <AuthScreen />;
  }

  const ActiveView = tabViews[activeTab] ?? HomeTab;
  return (
    <Shell>
      <Suspense fallback={<TabLoadingFallback />}>
        <ActiveView />
      </Suspense>
    </Shell>
  );
}

function TabLoadingFallback() {
  return (
    <div className="rounded-md border border-cyan-400/10 bg-cyan-400/[0.03] p-4">
      <p className="data-text text-sm font-semibold text-cyan-300">Loading module...</p>
    </div>
  );
}

export default function App() {
  return (
    <LifeOSProvider>
      <LifeOSApp />
    </LifeOSProvider>
  );
}
