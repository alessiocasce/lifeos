import { useEffect, useRef, useState } from 'react';
import { Check, Info, Pencil, RefreshCw, X } from 'lucide-react';
import { t } from '../i18n';
import { useLifeOS } from '../context/LifeOSContext';
import { ProfilePhotoEditor } from '../components/ProfilePhotoEditor';
import { SettingsDialog } from '../components/SettingsDialog';
import { normalizeUsername } from '../utils/userSettingsIdentity';
import '../styles/settings.css';

export function SettingsTab() {
  const { authUser, userSettings } = useLifeOS();
  return <SettingsForm key={authUser?.id || 'guest'} authUser={authUser} settings={userSettings} />;
}

function Information({ title, children }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  return <><button ref={trigger} type="button" className="settings-info" aria-label={t('About {subject}', { subject: t(title) })} onClick={() => setOpen(true)}><Info size={18} /></button>{open ? <SettingsDialog triggerRef={trigger} title={title} onClose={() => setOpen(false)}><p className="settings-information">{children}</p></SettingsDialog> : null}</>;
}

function SettingsForm({ authUser, settings }) {
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProfile, setPhotoProfile] = useState(settings.profile);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const lock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);
  useEffect(() => { setPhotoProfile(settings.profile); }, [settings.profile]);
  const disabled = settings.saving || photoBusy || settings.status !== 'ready';
  const run = async (operation, success) => {
    if (lock.current || disabled) return;
    lock.current = true;
    setError(''); setNotice('');
    try {
      await operation();
      if (mounted.current) { setNotice(success); return true; }
    } catch (failure) {
      if (mounted.current) setError(failure.code === '23505' ? 'That username is already taken.' : failure.message || 'Changes could not be saved. Try again.');
    } finally { lock.current = false; }
    return false;
  };
  const saveProfile = async event => {
    event.preventDefault();
    if (await run(() => settings.saveProfile({ username }), 'Profile saved.')) setEditing(false);
  };
  const changePreference = patch => void run(() => settings.updatePreferences(patch), 'Preferences saved.');
  return <div className="settings-page" aria-busy={settings.saving}>
    <section className="settings-section" aria-labelledby="settings-profile-title">
      <div className="settings-heading"><h2 id="settings-profile-title">{t('Public profile')}</h2><Information title="Public profile">{t('Your profile is visible to signed-in members. Your email and private records stay private.')}</Information></div>
      <form onSubmit={saveProfile}>
        <div className="settings-profile-row">
          <ProfilePhotoEditor profile={photoProfile} userId={authUser?.id} editing={editing} disabled={disabled || !settings.profile} onBusyChange={setPhotoBusy} onChange={async next => { setPhotoProfile(next); await settings.reloadSettings(); }} />
          <div className="settings-profile-identity">{editing ? <label>{t('Username')}<input name="username" aria-label={t('Username')} value={username} onChange={event => setUsername(normalizeUsername(event.target.value))} minLength={3} maxLength={24} pattern="[a-z][a-z0-9_]{2,23}" autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={disabled} /></label> : <p className="settings-username">{settings.profile?.username ? `@${settings.profile.username}` : t('Choose your username')}</p>}</div>
        </div>
        <div className="settings-profile-actions">{editing ? <><button key="save-profile" className="settings-primary" disabled={disabled} type="submit"><Check size={17} />{t(settings.saving ? 'Saving' : 'Save profile')}</button><button className="settings-secondary" type="button" disabled={disabled} onClick={() => { setEditing(false); setError(''); }}><X size={17} />{t('Cancel')}</button></> : <button key="edit-profile" className="settings-secondary" type="button" disabled={disabled} onClick={event => { event.preventDefault(); setUsername(settings.profile?.username || ''); setEditing(true); setError(''); setNotice(''); }}><Pencil size={16} />{t('Edit profile')}</button>}</div>
      </form>
    </section>
    <section className="settings-section" aria-labelledby="settings-preferences-title">
      <h2 id="settings-preferences-title">{t('Preferences')}</h2>
      <label className="settings-preference-row"><span>{t('Language')}</span><select aria-label={t('Language')} disabled={disabled} value={settings.preferences.language} onChange={event => changePreference({ language: event.target.value })}><option value="it">Italiano</option><option value="en">English</option></select></label>
    </section>
    <section className="settings-section" aria-labelledby="settings-privacy-title">
      <h2 id="settings-privacy-title">{t('Training privacy')}</h2>
      <div className="settings-preference-row"><div className="settings-control-label"><label htmlFor="settings-sharing">{t('Share completed workouts')}</label><Information title="Share completed workouts">{t('Completed workouts, including past workouts, are visible to signed-in LifeOS members while sharing is on. Turn it off to hide them all. Rankings enrollment is separate.')}</Information></div><input id="settings-sharing" type="checkbox" role="switch" aria-label={t('Share completed workouts')} disabled={disabled} checked={settings.preferences.workout_sharing} onChange={event => changePreference({ workout_sharing: event.target.checked })} /></div>
      <div className="settings-preference-row"><div className="settings-control-label"><label htmlFor="settings-notes">{t('Share set notes')}</label><Information title="Share set notes">{t('Notes stay private by default. Turning this on also shares past workout and set notes. Turning it off removes notes from Community immediately.')}</Information></div><input id="settings-notes" type="checkbox" role="switch" aria-label={t('Share set notes')} disabled={disabled} checked={settings.preferences.share_workout_notes} onChange={event => changePreference({ share_workout_notes: event.target.checked })} /></div>
    </section>
    {settings.error ? <div role="alert" className="settings-error">{t(settings.error)}<button className="icon-button" aria-label={t('Retry settings')} onClick={settings.reloadSettings}><RefreshCw size={18} /></button></div> : null}
    {error ? <p role="alert" className="settings-error">{t(error)}</p> : null}
    <p role="status" className="settings-status">{settings.saving ? t('Saving') : notice ? t(notice) : ''}</p>
  </div>;
}
