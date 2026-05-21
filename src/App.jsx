import { LifeOSProvider, useLifeOS } from './context/LifeOSContext';
import { AuthConfigScreen, AuthLoadingScreen, AuthScreen } from './components/AuthScreen';
import { Shell } from './components/Shell';
import { AIAssistantTab } from './tabs/AIAssistantTab';
import { CalendarTab } from './tabs/CalendarTab';
import { FinancesTab } from './tabs/FinancesTab';
import { HealthTab } from './tabs/HealthTab';
import { HomeTab } from './tabs/HomeTab';
import { MemosTab } from './tabs/MemosTab';
import { ProjectsTab } from './tabs/ProjectsTab';
import { WorkoutTab } from './tabs/WorkoutTab';

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
      <ActiveView />
    </Shell>
  );
}

export default function App() {
  return (
    <LifeOSProvider>
      <LifeOSApp />
    </LifeOSProvider>
  );
}
