import { useCallback, useEffect, useRef, useState } from 'react';
import { userSettingsApi } from '../services/lifeosApi';

export const defaultPreferences = { language: 'en', workout_sharing: false, share_workout_notes: false };
export function useUserSettings(userId) {
  const empty = () => ({ userId, profile: null, preferences: defaultPreferences, status: 'loading', error: '' });
  const [state, setState] = useState(empty);
  const scope = useRef(userId);
  const revision = useRef(0);
  scope.current = userId;
  const reloadSettings = useCallback(async () => {
    const request = ++revision.current;
    if (!userId) { setState({ userId, profile: null, preferences: defaultPreferences, status: 'idle', error: '' }); return; }
    try {
      const result = await userSettingsApi.read(userId);
      if (scope.current === userId && request === revision.current) setState({ userId, ...result, status: 'ready', error: '' });
    } catch {
      if (scope.current === userId && request === revision.current) setState({ userId, profile: null, preferences: defaultPreferences, status: 'error', error: 'Settings unavailable. Your Training data is still accessible.' });
    }
  }, [userId]);
  useEffect(() => { void reloadSettings(); return () => { revision.current += 1; }; }, [reloadSettings]);
  const saveSettings = async (profile, preferences) => {
    if (!userId || state.userId !== userId || state.status !== 'ready') throw new Error('Reload settings before saving.');
    const request = ++revision.current;
    const result = await userSettingsApi.save(profile, preferences, userId);
    if (scope.current === userId && request === revision.current) setState({ userId, ...result, status: 'ready', error: '' });
    return result;
  };
  const updateLanguage = async (language) => {
    if (!userId || state.userId !== userId || state.status !== 'ready' || !['en','it'].includes(language)) throw new Error('Reload settings before saving.');
    const request=++revision.current;
    const previous=state.preferences;
    const next={...previous,language};
    setState(prev=>({...prev,preferences:next}));
    try { await userSettingsApi.savePreferences(next, userId); }
    catch(error) { if(scope.current===userId && revision.current===request)setState(prev=>({...prev,preferences:previous})); throw error; }
  };
  return { ...(state.userId === userId ? state : empty()), saveSettings, updateLanguage, reloadSettings };
}
