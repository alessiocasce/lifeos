import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Pencil, Trash2, X } from 'lucide-react';
import * as api from '../services/lifeosApi';
import { t } from '../i18n';
import { ProfileAvatar } from './ProfileAvatar';
import { SettingsDialog } from './SettingsDialog';
import { compressProfilePhoto, drawProfilePhoto, loadProfilePhoto, profilePhotoError } from '../utils/profilePhoto';
import '../styles/settings.css';

export function ProfilePhotoEditor({ profile, userId, editing = false, disabled = false, onChange, onBusyChange }) {
  const [view, setView] = useState(null);
  const [image, setImage] = useState(null);
  const [crop, setCrop] = useState({ zoom: 1, x: 50, y: 50 });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const canvas = useRef(null);
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const chooseButton = useRef(null);
  const sourceButton = useRef(null);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, [userId]);
  useEffect(() => {
    if (!image || !canvas.current) return;
    try { drawProfilePhoto(canvas.current, image, crop); }
    catch (failure) { setError(failure.message); }
  }, [image, crop]);
  const select = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || lock.current || disabled) return;
    const request = ++generation.current;
    setView('edit'); setError(''); setNotice(''); setImage(null); setConfirmRemove(false);
    lock.current = true; setBusy('Opening photo'); onBusyChange?.(true);
    try {
      const next = await loadProfilePhoto(file);
      if (request === generation.current) { setCrop({ zoom: 1, x: 50, y: 50 }); setImage(next); }
    } catch (failure) { if (request === generation.current) setError(failure.message); }
    finally {
      if (request === generation.current) { lock.current = false; setBusy(''); onBusyChange?.(false); }
    }
  };
  const mutate = async (remove = false) => {
    if (lock.current || disabled || !userId) return;
    const request = ++generation.current;
    lock.current = true; setBusy(remove ? 'Removing photo' : 'Saving photo'); onBusyChange?.(true); setError(''); setNotice('');
    try {
      const service = api.profilePhotoApi;
      if (!service) throw new Error('Photo updates are unavailable. Try again later.');
      const blob = remove ? null : await compressProfilePhoto(image, crop);
      if (request !== generation.current) return;
      const next = remove ? await service.remove(userId) : await service.upload(blob, userId);
      if (request !== generation.current) return;
      setImage(null); setConfirmRemove(false);
      await onChange?.(next);
      if (request !== generation.current) return;
      window.dispatchEvent(new Event('lifeos:profile-updated'));
      setNotice(remove ? 'Photo removed.' : 'Photo saved.');
    } catch (failure) {
      if (request === generation.current) setError(profilePhotoError(failure));
    } finally {
      if (request === generation.current) { lock.current = false; setBusy(''); onBusyChange?.(false); }
    }
  };
  const buttonClass = 'settings-secondary';
  return <section aria-label={t('Profile photo')} className="space-y-3" aria-busy={Boolean(busy)}>
    <button ref={chooseButton} type="button" className="settings-avatar-button" disabled={disabled || Boolean(busy)} aria-label={t(editing ? 'Edit profile photo' : 'View profile photo')} onClick={() => { setView(editing ? 'edit' : 'viewer'); setNotice(''); setError(''); }}>
      <ProfileAvatar profile={profile} />
      {editing ? <span className="settings-avatar-camera"><Camera size={25} /></span> : null}
    </button>
    <input ref={fileInput} type="file" accept="image/*,.heic,.heif,.avif" className="hidden" aria-label={t('Choose profile photo')} onChange={select} disabled={disabled || Boolean(busy)} />
    <input ref={cameraInput} type="file" accept="image/*,.heic,.heif,.avif" capture="user" className="hidden" aria-label={t('Camera photo')} onChange={select} disabled={disabled || Boolean(busy)} />
    {view ? <SettingsDialog triggerRef={chooseButton} title={view === 'viewer' ? 'Profile photo' : 'Edit profile photo'} className={view === 'viewer' ? 'settings-photo-viewer' : ''} busy={Boolean(busy)} onClose={() => { setView(null); setImage(null); setConfirmRemove(false); setError(''); }}>
    {view === 'viewer' ? <div className="settings-photo-circle"><ProfileAvatar profile={profile} /><button type="button" className="settings-photo-edit" aria-label={t('Edit profile photo')} onClick={() => setView('edit')}><Pencil size={21} /></button></div> : <>
    <div className="settings-photo-tools">
      <button ref={sourceButton} type="button" className={buttonClass} disabled={disabled || Boolean(busy)} onClick={() => fileInput.current?.click()}><ImagePlus size={17} />{t(profile?.avatar_path || profile?.avatar_url ? 'Replace photo' : 'Add photo')}</button>
      <button type="button" className="icon-button" title={t('Take photo')} aria-label={t('Take photo')} disabled={disabled || Boolean(busy)} onClick={() => cameraInput.current?.click()}><Camera size={18} /></button>
      {profile?.avatar_path || profile?.avatar_url ? <button type="button" className="icon-button" title={t('Remove photo')} aria-label={t('Remove photo')} disabled={disabled || Boolean(busy)} onClick={() => { setConfirmRemove(true); setImage(null); setError(''); }}><Trash2 size={18} /></button> : null}
    </div>
    {image ? <div className="settings-crop space-y-3 mt-5">
      <canvas ref={canvas} aria-label={t('Square crop preview')} role="img" className="aspect-square w-full max-w-[15rem] rounded border border-white/15 sm:max-w-none" />
      <fieldset disabled={disabled || Boolean(busy)} className="space-y-3">
        {[['zoom', 'Zoom', 1, 3, 0.01], ['x', 'Horizontal position', 0, 100, 1], ['y', 'Vertical position', 0, 100, 1]].map(([key, label, min, max, step]) => <label key={key} className="grid gap-1 text-sm">{t(label)}<input className="min-h-11 w-full" type="range" min={min} max={max} step={step} value={crop[key]} onChange={event => setCrop(previous => ({ ...previous, [key]: Number(event.target.value) }))} /></label>)}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="settings-primary" onClick={() => void mutate()}><Check size={17} />{t('Use photo')}</button>
          <button type="button" className={buttonClass} onClick={() => { setImage(null); setError(''); sourceButton.current?.focus({ preventScroll: true }); }}><X size={17} />{t('Cancel')}</button>
        </div>
      </fieldset>
    </div> : null}
    {confirmRemove ? <div className="space-y-2"><p className="text-sm">{t('Remove profile photo?')}</p><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={disabled || Boolean(busy)} onClick={() => void mutate(true)}><Trash2 size={17} />{t('Remove photo')}</button><button type="button" className={buttonClass} disabled={Boolean(busy)} onClick={() => setConfirmRemove(false)}>{t('Cancel')}</button></div></div> : null}
    {busy ? <div role="status" className="space-y-1 text-sm text-zinc-300"><p>{t(busy)}</p><progress aria-label={t(busy)} className="h-1 w-full max-w-xs" /></div> : null}
    {error ? <p role="alert" className="text-sm text-amber-300">{t(error)}</p> : null}
    {notice ? <p role="status" className="text-sm text-zinc-300">{t(notice)}</p> : null}
    </>}
    </SettingsDialog> : null}
  </section>;
}

export default ProfilePhotoEditor;
