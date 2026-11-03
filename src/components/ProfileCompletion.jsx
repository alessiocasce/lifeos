import { useEffect, useRef, useState } from 'react';
import { identityApi } from '../services/lifeosApi';
import { useLifeOS } from '../context/LifeOSContext';
import { t } from '../i18n';

export function ProfileCompletion() {
  const { authUser, userSettings, signOut } = useLifeOS();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempted = useRef(null);
  const scope = useRef(authUser.id);
  scope.current = authUser.id;
  useEffect(() => { scope.current = authUser.id; return () => { scope.current = null; }; }, [authUser.id]);
  useEffect(() => {
    if (userSettings.status !== 'ready' || attempted.current === authUser.id || !authUser.user_metadata?.requested_username) return;
    attempted.current = authUser.id;
    const id = authUser.id;
    setBusy(true);
    identityApi.complete(null, id).then(() => { if (scope.current === id) return userSettings.reloadSettings(); })
      .catch(() => { if (scope.current === id) setError('Choose an available username to complete your profile.'); })
      .finally(() => { if (scope.current === id) setBusy(false); });
  }, [authUser.id, userSettings.status]);
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    const id = authUser.id;
    setBusy(true); setError('');
    try { await identityApi.complete(username, id); if (scope.current === id) await userSettings.reloadSettings(); }
    catch (failure) { if (scope.current === id) setError(failure.message || 'Username could not be saved.'); }
    finally { if (scope.current === id) setBusy(false); }
  };
  return <main className="grid min-h-dvh place-items-center bg-[#080b0e] p-6 text-zinc-100"><form className="grid w-full max-w-sm gap-4" onSubmit={submit}>
    <h1 className="text-2xl font-semibold">{t('Choose your username')}</h1><p className="text-sm text-zinc-400">{t('Your username is visible to other LifeOS members.')}</p>
    <label className="grid gap-2">{t('Username')}<input aria-label={t('Username')} required minLength={3} maxLength={24} pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}" autoCapitalize="none" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} className="min-h-12 rounded border border-white/20 bg-transparent px-3" /></label>
    <button className="primary-button min-h-12" disabled={busy || userSettings.status !== 'ready'}>{t(busy ? 'Saving' : 'Save username')}</button>
    {error ? <p role="alert" className="text-sm text-red-300">{t(error)}</p> : null}
    {userSettings.status === 'error' ? <button type="button" onClick={userSettings.reloadSettings}>{t('Retry')}</button> : null}
    <button type="button" className="min-h-11 text-sm text-zinc-400" disabled={busy} onClick={signOut}>{t('Sign out')}</button>
  </form></main>;
}
