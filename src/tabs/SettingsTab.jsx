import { useEffect, useState } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';

export function SettingsTab() {
  const { authUser, userSettings: settings } = useLifeOS();
  const [profile, setProfile] = useState({ username: '', display_name: '' });
  const [preferences, setPreferences] = useState(settings.preferences);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setProfile(settings.profile || { username: '', display_name: '' });
    setPreferences(settings.preferences); setNotice('');
  }, [authUser?.id, settings.profile, settings.preferences]);
  const save = async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setNotice('');
    try { await settings.saveSettings(profile, preferences); setNotice('Settings saved.'); }
    catch (error) { setNotice(error.code === '23505' ? 'That username is already taken.' : error.message); }
    finally { setBusy(false); }
  };
  return <div className="max-w-xl space-y-8">
    <form onSubmit={save} className="space-y-6">
      <fieldset disabled={busy || settings.status !== 'ready'} className="grid gap-5">
        <h2 className="text-lg font-semibold">Public profile</h2>
        <p className="text-sm text-zinc-400">Only the profile you save is visible to other members. Your email and personal records stay private.</p>
        <label className="grid gap-2 text-sm">Username<input className="min-h-11 rounded border border-white/15 bg-black/30 px-3" autoCapitalize="none" autoComplete="off" minLength={3} maxLength={24} pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}" required value={profile.username} onChange={e => setProfile({ ...profile, username: e.target.value })} /></label>
        <label className="grid gap-2 text-sm">Display name<input className="min-h-11 rounded border border-white/15 bg-black/30 px-3" maxLength={60} required value={profile.display_name} onChange={e => setProfile({ ...profile, display_name: e.target.value })} /></label>
        <h2 className="border-t border-white/10 pt-5 text-lg font-semibold">Preferences</h2>
        <label className="grid gap-2 text-sm">Language<select className="min-h-11 rounded border border-white/15 bg-[#14171b] px-3" value={preferences.language} onChange={e => setPreferences({ ...preferences, language: e.target.value })}><option value="en">English</option><option value="it">Italiano</option></select></label>
        <h2 className="border-t border-white/10 pt-5 text-lg font-semibold">Training privacy</h2>
        <p className="text-sm text-zinc-400">Sharing is not live yet. These choices do not publish your workout history.</p>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={preferences.workout_sharing} onChange={e => setPreferences({ ...preferences, workout_sharing: e.target.checked })} />Share completed workouts</label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={preferences.share_workout_notes} onChange={e => setPreferences({ ...preferences, share_workout_notes: e.target.checked })} />Share set notes</label>
        <button className="flex min-h-11 items-center justify-center gap-2 rounded border border-white/20 px-4" type="submit"><Save size={17} />{busy ? 'Saving' : 'Save settings'}</button>
      </fieldset>
    </form>
    {settings.error ? <div role="alert" className="text-sm text-amber-300">{settings.error}<button className="icon-button" aria-label="Retry settings" onClick={settings.reloadSettings}><RefreshCw size={18} /></button></div> : null}
    {notice ? <p role="status" className="text-sm text-zinc-300">{notice}</p> : null}
  </div>;
}
