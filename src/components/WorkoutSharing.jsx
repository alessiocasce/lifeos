import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { communityApi } from '../services/lifeosApi';
import { t } from '../i18n';

// Read-only link. Global settings and database synchronization own visibility.
export function WorkoutSharing({ workout }) {
  const { authUser, userSettings, setActiveTab } = useLifeOS();
  const [result, setResult] = useState(null);
  const sharing = userSettings?.preferences?.workout_sharing;
  useEffect(() => {
    let current = true;
    setResult(null);
    if (authUser && workout.ended_at && sharing) {
      communityApi.status(authUser.id, workout.id).then(id => {
        if (current) setResult({ userId: authUser.id, workoutId: workout.id, id });
      }).catch(() => {});
    }
    return () => { current = false; };
  }, [authUser?.id, workout.id, workout.ended_at, workout.updated_at, workout.workout_sets, sharing]);
  if (!sharing || !workout.ended_at || result?.userId !== authUser?.id || result?.workoutId !== workout.id || !result?.id) return null;
  return <button type="button" onClick={() => { setActiveTab('community'); window.location.hash = `share=${result.id}`; }} className="my-3 flex min-h-11 items-center gap-2 text-sm text-zinc-300"><ExternalLink size={16} />{t('View in Community')}</button>;
}
