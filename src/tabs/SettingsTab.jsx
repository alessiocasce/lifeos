import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { ProfilePhotoEditor } from '../components/ProfilePhotoEditor';

export function SettingsTab() {
  const { authUser, userSettings: settings } = useLifeOS();
  return <SettingsForm key={authUser?.id || 'guest'} authUser={authUser} settings={settings} />;
}

function SettingsForm({ authUser, settings }) {
  const [profile, setProfile] = useState({ username: '' });
  const [preferences, setPreferences] = useState(settings.preferences);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProfile, setPhotoProfile] = useState(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [notice, setNotice] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setProfile({ username: settings.profile?.username || '' });
    setNotice('');
  }, [authUser?.id, settings.profile?.username]);
  useEffect(() => setPhotoProfile(settings.profile), [settings.profile]);
  useEffect(()=>setPreferences(settings.preferences),[authUser?.id,settings.preferences.language,settings.preferences.workout_sharing,settings.preferences.share_workout_notes]);
  const changeLanguage = async (language) => {
    if (lock.current || photoBusy) return;
    lock.current = true;
    setBusy(true); setNotice('');
    try { await settings.updateLanguage(language); }
    catch { setNotice(t("Language could not be saved. Try again.")); }
    finally { lock.current = false; setBusy(false); }
  };
  const save = async (event) => {
    event.preventDefault(); if (lock.current || photoBusy) return;
    lock.current = true;
    setBusy(true); setNotice('');
    try {
      await settings.saveSettings({ username: profile.username }, preferences);
      if (mounted.current) { setNotice(t("Settings saved.")); window.dispatchEvent(new Event('lifeos:profile-updated')); }
    }
    catch (error) { setNotice(error.code === '23505' ? t("That username is already taken.") : error.message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="max-w-xl space-y-8">
    <ProfilePhotoEditor key={authUser?.id || 'guest'} profile={photoProfile} userId={authUser?.id} disabled={busy || settings.status !== 'ready' || !settings.profile} onBusyChange={setPhotoBusy} onChange={async next => { setPhotoProfile(next); await settings.reloadSettings(); }} />
    <form onSubmit={save} className="space-y-6">
      <fieldset disabled={busy || photoBusy || settings.status !== 'ready'} className="grid gap-5">
        <h2 className="text-lg font-semibold">{t("Public profile")}</h2>
        <p className="text-sm text-zinc-400">{t('Your public profile and shared completed workouts are visible to signed-in members. Your email and other personal records stay private.')}</p>
        <label className="grid gap-2 text-sm">{t("Username")}<input className="min-h-11 rounded border border-white/15 bg-black/30 px-3" autoCapitalize="none" autoComplete="off" minLength={3} maxLength={24} pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}" required value={profile.username} onChange={e => setProfile({ ...profile, username: e.target.value })} /></label>
        <h2 className="border-t border-white/10 pt-5 text-lg font-semibold">{t("Preferences")}</h2>
        <label className="grid gap-2 text-sm">{t("Language")}<select className="min-h-11 rounded border border-white/15 bg-[#14171b] px-3" value={preferences.language} onChange={e => void changeLanguage(e.target.value)}><option value="en">{t("English")}</option><option value="it">{t("Italiano")}</option></select></label>
        <h2 className="border-t border-white/10 pt-5 text-lg font-semibold">{t("Training privacy")}</h2>
        <p className="text-sm text-zinc-400">{t('When Workout Sharing is on, all completed workouts, including past workouts, are automatically visible to signed-in LifeOS members. Turn it off to hide them all. Turning it back on restores them. New accounts start with sharing on.')}</p>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={preferences.workout_sharing} onChange={e => setPreferences({ ...preferences, workout_sharing: e.target.checked })} />{t("Share completed workouts")}</label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={preferences.share_workout_notes} onChange={e => setPreferences({ ...preferences, share_workout_notes: e.target.checked })} />{t("Share set notes")}</label>
        <p className="text-xs leading-relaxed text-zinc-400">{t('Notes are private by default. Enabling notes shares workout and set notes, including past notes. Turning notes off removes them from Community immediately.')}</p>
        <button className="flex min-h-11 items-center justify-center gap-2 rounded border border-white/20 px-4" type="submit"><Save size={17} />{busy ? t("Saving") : t("Save settings")}</button>
      </fieldset>
    </form>
    {settings.error ? <div role="alert" className="text-sm text-amber-300">{t(settings.error)}<button className="icon-button" aria-label={t("Retry settings")} onClick={settings.reloadSettings}><RefreshCw size={18} /></button></div> : null}
    {notice ? <p role="status" className="text-sm text-zinc-300">{t(notice)}</p> : null}
  </div>;
}
