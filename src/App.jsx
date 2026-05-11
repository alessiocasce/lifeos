import { LifeOSProvider, useLifeOS } from './context/LifeOSContext';
import { Shell } from './components/Shell';
import { AIAssistantTab } from './tabs/AIAssistantTab';
import { CalendarTab } from './tabs/CalendarTab';
import { FinancesTab } from './tabs/FinancesTab';
import { HealthTab } from './tabs/HealthTab';
import { HomeTab } from './tabs/HomeTab';
import { WorkoutTab } from './tabs/WorkoutTab';

const tabViews = {
  home: HomeTab,
  calendar: CalendarTab,
  health: HealthTab,
  workout: WorkoutTab,
  finances: FinancesTab,
  assistant: AIAssistantTab,
};

function LifeOSApp() {
  const { activeTab } = useLifeOS();
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
