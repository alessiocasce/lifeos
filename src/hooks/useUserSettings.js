import { useCallback, useEffect, useRef, useState } from 'react';
import { userSettingsApi } from '../services/lifeosApi';
import { getLanguage, setLanguage } from '../i18n';

export const defaultPreferences = { language: 'it', workout_sharing: true, share_workout_notes: false };
const languageKey = id => `lifeos:language:v1:${id}`;
function initialPreferences(id) {
  let language;
  try { language = id && localStorage.getItem(languageKey(id)); } catch { /* Storage can be unavailable. */ }
  return { ...defaultPreferences, language: ['en', 'it'].includes(language) ? language : id ? getLanguage() : 'it' };
}
function rememberLanguage(id, language) {
  try { localStorage.setItem(languageKey(id), language); } catch { /* Server preferences remain authoritative. */ }
}

export function useUserSettings(userId) {
  const empty = () => ({ userId, profile: null, preferences: initialPreferences(userId), status: 'loading', error: '', saving: false });
  const [state, setState] = useState(empty);
  const scope = useRef(userId);
  const current = useRef(state);
  const revision = useRef(0);
  const mutation = useRef(null);
  scope.current = userId;
  current.current = state;
  const reloadSettings = useCallback(async () => {
    const request = ++revision.current;
    if (!userId) {
      setLanguage('it');
      setState({ userId, profile: null, preferences: defaultPreferences, status: 'idle', error: '', saving: false });
      return;
    }
    try {
      const result = await userSettingsApi.read(userId);
      if (scope.current === userId && request === revision.current && !mutation.current) {
        const preferences = { ...defaultPreferences, ...result.preferences };
        rememberLanguage(userId, preferences.language);
        setLanguage(preferences.language);
        setState({ userId, ...result, preferences, status: 'ready', error: '', saving: false });
      }
    } catch {
      if (scope.current === userId && request === revision.current) setState({ ...empty(), status: 'error', error: 'Settings unavailable. Your Training data is still accessible.' });
    }
  }, [userId]);
  useEffect(() => {
    scope.current = userId;
    mutation.current = null;
    void reloadSettings();
    return () => { scope.current = null; revision.current += 1; };
  }, [reloadSettings]);

  const mutate = async (write, apply, optimistic) => {
    const previous = current.current;
    if (!userId || previous.userId !== userId || previous.status !== 'ready' || mutation.current) throw new Error('Reload settings before saving.');
    const token = {};
    mutation.current = token;
    ++revision.current;
    setState(prev => ({ ...prev, ...optimistic, saving: true }));
    try {
      const result = await write(previous);
      if (scope.current === userId && mutation.current === token) {
        const patch = apply(result);
        setState(prev => ({ ...prev, ...patch, saving: false }));
        window.dispatchEvent(new Event('lifeos:profile-updated'));
      }
      return result;
    } catch (error) {
      if (scope.current === userId && mutation.current === token) {
        setLanguage(previous.preferences.language);
        setState(previous);
      }
      throw error;
    } finally {
      if (mutation.current === token) mutation.current = null;
    }
  };
  const updatePreferences = patch => {
    const next = { ...current.current.preferences, ...patch };
    if (!['en', 'it'].includes(next.language) || typeof next.workout_sharing !== 'boolean' || typeof next.share_workout_notes !== 'boolean') return Promise.reject(new Error('Invalid preferences.'));
    return mutate(() => userSettingsApi.savePreferences(patch, userId), result => {
      const preferences = { ...next, ...result };
      rememberLanguage(userId, preferences.language);
      setLanguage(preferences.language);
      return { preferences };
    }, { preferences: next });
  };
  const saveProfile = profile => mutate(() => userSettingsApi.saveProfile(profile, userId), result => ({ profile: result }));
  return { ...(state.userId === userId ? state : empty()), saveProfile, updatePreferences, updateLanguage: language => updatePreferences({ language }), reloadSettings };
}
