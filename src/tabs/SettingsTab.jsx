import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Dumbbell, Info, Languages, NotebookPen, Pencil, RefreshCw } from 'lucide-react';
import { t } from '../i18n';
import { useLifeOS } from '../context/LifeOSContext';
import { ProfilePhotoEditor } from '../components/ProfilePhotoEditor';
import { SettingsDialog } from '../components/SettingsDialog';
import { SettingsLanguagePicker } from '../components/SettingsLanguagePicker';
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
  const [touched, setTouched] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProfile, setPhotoProfile] = useState(settings.profile);
  const [feedback, setFeedback] = useState({ target: '', pending: false, message: '', error: false });
  const [retrying, setRetrying] = useState(false);
  const mounted = useRef(true);
  const lock = useRef(false);
  const retryLock = useRef(false);
  const usernameInput = useRef(null);
  const editButton = useRef(null);
  const returnFocus = useRef(false);
  const profileCard = useRef(null);
  const identity = useRef(null);
  const previousHeight = useRef(null);
  const profileMotion = useRef(null);
  const identityMotion = useRef(null);
  useLayoutEffect(() => {
    const card = profileCard.current;
    if (!card) return;
    profileMotion.current?.cancel();
    const height = card.getBoundingClientRect().height;
    if (previousHeight.current !== null && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      profileMotion.current = card.animate([{ height: `${previousHeight.current}px` }, { height: `${height}px` }], { duration: 200, easing: 'cubic-bezier(.2,.75,.25,1)' });
      identityMotion.current?.cancel();
      identityMotion.current = identity.current?.animate([{ opacity: .25, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
    }
    previousHeight.current = height;

  }, [editing]);
  useEffect(() => () => { profileMotion.current?.cancel(); identityMotion.current?.cancel(); }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setPhotoProfile(settings.profile); }, [settings.profile]);
  useEffect(() => {
    if (editing) usernameInput.current?.focus();
    else if (returnFocus.current) { editButton.current?.focus({ preventScroll: true }); returnFocus.current = false; }
  }, [editing]);
  useEffect(() => {
    if (editing && feedback.target === 'username' && feedback.error && !settings.saving) usernameInput.current?.focus();
  }, [editing, feedback, settings.saving]);
  const ready = settings.status === 'ready';
  const disabled = settings.saving || photoBusy || !ready || retrying;
  const invalid = !/^[a-z][a-z0-9_]{2,23}$/.test(username);
  const usernameError = touched && invalid ? 'Use 3-24 characters: start with a letter, then letters, numbers or underscores.' : '';
  const run = async (target, operation, success) => {
    if (lock.current || disabled) return false;
    lock.current = true;
    setFeedback({ target, pending: true, message: 'Saving', error: false });
    try {
      await operation();
      if (mounted.current) { setFeedback({ target, pending: false, message: success, error: false }); return true; }
    } catch (failure) {
      if (mounted.current) setFeedback({ target, pending: false, message: failure.code === '23505' ? 'That username is already taken.' : failure.message || 'Changes could not be saved. Try again.', error: true });
    } finally { lock.current = false; }
    return false;
  };
  const closeEditor = () => { previousHeight.current = profileCard.current?.getBoundingClientRect().height ?? null; returnFocus.current = true; setEditing(false); setTouched(false); };
  const saveProfile = async event => {
    event.preventDefault();
    setTouched(true);
    if (invalid) { usernameInput.current?.focus(); return; }
    if (await run('username', () => settings.saveProfile({ username }), 'Username saved.')) closeEditor();
    else if (mounted.current) usernameInput.current?.focus();
  };
  const retry = async () => {
    if (retryLock.current) return;
    retryLock.current = true; setRetrying(true);
    try { await settings.reloadSettings(); }
    finally { retryLock.current = false; if (mounted.current) setRetrying(false); }
  };
  const localFeedback = target => feedback.target === target ? <p role={feedback.error ? 'alert' : undefined} id={`settings-${target}-feedback`} className={feedback.error ? 'settings-error' : 'settings-status'}>{t(feedback.message)}</p> : null;
  const unknown = <p className="settings-help">{t(retrying ? 'Loading settings...' : 'Saved values unavailable.')}</p>;
  const changePreference = (target, patch) => void run(target, () => settings.updatePreferences(patch), 'Preference saved.');
  const usernameActions = <div className="settings-profile-actions">
    {editing ? <>
      <button key="save-username" className="settings-primary" aria-label={t('Save username')} disabled={disabled} type="submit">{t(feedback.target === 'username' && feedback.pending ? 'Saving' : 'Save')}</button>
      <button className="settings-secondary" aria-label={t('Cancel username changes')} type="button" disabled={settings.saving || photoBusy} onClick={() => { closeEditor(); if (feedback.target === 'username') setFeedback({ target: '', message: '' }); }}>{t('Cancel')}</button>
    </> : <button ref={editButton} key="edit-username" aria-label={t('Edit username')} className="settings-edit-username" type="button" disabled={disabled} onClick={() => { previousHeight.current = profileCard.current?.getBoundingClientRect().height ?? null; setUsername(settings.profile?.username || ''); setEditing(true); setTouched(false); if (feedback.target === 'username') setFeedback({ target: '', message: '' }); }}><Pencil size={13} />{t('Edit')}</button>}
  </div>;
  return <div className="settings-page" aria-busy={settings.saving || photoBusy || retrying}>
    {!ready ? <div className="settings-unavailable"><p role="alert">{t(settings.error || 'Loading settings...')}</p><button type="button" className="settings-secondary" disabled={retrying || settings.status === 'loading'} onClick={() => void retry()}><RefreshCw size={18} />{t(retrying ? 'Loading settings...' : 'Retry settings')}</button></div> : null}
    <section className="settings-section settings-profile" aria-labelledby="settings-profile-title">
      <div className="settings-heading"><h2 id="settings-profile-title">{t('Public profile')}</h2></div>
      <div ref={profileCard} className="settings-profile-card">
        {ready ? <form onSubmit={saveProfile} noValidate>
          <div className="settings-profile-row">
            <ProfilePhotoEditor profile={photoProfile} userId={authUser?.id} disabled={disabled || !settings.profile} onBusyChange={setPhotoBusy} onChange={async next => { if (mounted.current) setPhotoProfile(next); await settings.reloadSettings(); }} />
            <div ref={identity} className="settings-profile-identity">
              {editing ? <>
                <label>{t('Username')}<input ref={usernameInput} name="username" aria-label={t('Username')} aria-describedby={`settings-username-help${usernameError ? ' settings-username-error' : ''}${feedback.target === 'username' ? ' settings-username-feedback' : ''}`} aria-invalid={Boolean(usernameError || (feedback.target === 'username' && feedback.error))} value={username} onChange={event => { setUsername(normalizeUsername(event.target.value)); if (feedback.target === 'username') setFeedback({ target: '', message: '' }); }} onBlur={() => setTouched(true)} minLength={3} maxLength={24} autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={disabled} /></label>
                <p id="settings-username-help" className="settings-help">{t('Use 3-24 characters: start with a letter, then letters, numbers or underscores.')}</p>
                {usernameError ? <p id="settings-username-error" className="settings-error">{t(usernameError)}</p> : null}
              </> : <div className="settings-username-line"><p className="sr-only">{t('Username')}</p><p className="settings-username">{settings.profile?.username ? `@${settings.profile.username}` : t('Choose your username')}</p>{usernameActions}</div>}
              {editing ? usernameActions : null}
              {localFeedback('username')}
            </div>
          </div>
        </form> : unknown}
      </div>
    </section>
    <section className="settings-section settings-preferences" aria-labelledby="settings-preferences-title">
      <div className="settings-heading"><h2 id="settings-preferences-title">{t('Preferences')}</h2></div>
      <div className="settings-group">
        {ready ? <><div className="settings-preference-row settings-language-row"><span className="settings-row-icon settings-language-icon" aria-hidden="true"><Languages size={20} /></span><span className="settings-row-title">{t('Language')}</span><SettingsLanguagePicker value={settings.preferences.language} disabled={disabled} onChange={language => changePreference('language', { language })} /></div>{localFeedback('language')}</> : unknown}
      </div>
    </section>
    <section className="settings-section settings-privacy" aria-labelledby="settings-privacy-title">
      <div className="settings-heading"><h2 id="settings-privacy-title">{t('Training privacy')}</h2></div>
      <div className="settings-group">
        <div className="settings-preference-row">
          <span className="settings-row-icon settings-sharing-icon" aria-hidden="true"><Dumbbell size={20} /></span>
          <div className="settings-control-copy"><div className="settings-control-label"><label htmlFor="settings-sharing">{t('Share completed workouts')}</label><Information title="Share completed workouts">{t('Completed workouts, including past workouts, are visible to signed-in LifeOS members while sharing is on. Turn it off to hide them all. Rankings enrollment is separate.')}</Information></div><p id="settings-sharing-help" className="settings-help">{t('While sharing is on, signed-in members can see your completed workouts, including past workouts. Rankings enrollment is separate.')}</p>{localFeedback('sharing')}</div>
          {ready ? <input id="settings-sharing" type="checkbox" role="switch" aria-label={t('Share completed workouts')} aria-describedby="settings-sharing-help" disabled={disabled} checked={settings.preferences.workout_sharing} onChange={event => changePreference('sharing', { workout_sharing: event.target.checked })} /> : <span className="settings-unknown">{t('Unavailable')}</span>}
        </div>
        <div className="settings-preference-row">
          <span className="settings-row-icon settings-notes-icon" aria-hidden="true"><NotebookPen size={20} /></span>
          <div className="settings-control-copy"><div className="settings-control-label"><label htmlFor="settings-notes">{t('Share set notes')}</label><Information title="Share set notes">{t('Notes stay private by default. Turning this on also shares past workout and set notes. Turning it off removes notes from Community immediately.')}</Information></div><p id="settings-notes-help" className="settings-help">{t('Includes past workout and set notes. Notes are visible only while workout sharing is on.')}</p>{ready && !settings.preferences.workout_sharing ? <p id="settings-notes-dependency" className="settings-help settings-dependency">{t(settings.preferences.share_workout_notes ? 'Notes are hidden now. Your saved notes choice will apply when you turn workout sharing back on.' : 'Notes are hidden. Turning workout sharing back on will keep notes private unless you enable this choice.')}</p> : null}{localFeedback('notes')}</div>
          {ready ? <input id="settings-notes" type="checkbox" role="switch" aria-label={t('Share set notes')} aria-describedby={`settings-notes-help${!settings.preferences.workout_sharing ? ' settings-notes-dependency' : ''}`} disabled={disabled} checked={settings.preferences.share_workout_notes} onChange={event => changePreference('notes', { share_workout_notes: event.target.checked })} /> : <span className="settings-unknown">{t('Unavailable')}</span>}
        </div>
      </div>
    </section>
    <p role="status" className="sr-only">{t(feedback.error ? '' : feedback.message || '')}</p>
  </div>;
}
