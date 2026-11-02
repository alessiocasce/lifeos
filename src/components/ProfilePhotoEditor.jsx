import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Trash2, X } from 'lucide-react';
import * as api from '../services/lifeosApi';
import { t } from '../i18n';
import { ProfileAvatar } from './ProfileAvatar';
import { compressProfilePhoto, drawProfilePhoto, loadProfilePhoto } from '../utils/profilePhoto';

export function ProfilePhotoEditor({ profile, userId, disabled = false, onChange, onBusyChange }) {
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
    setError(''); setNotice(''); setImage(null); setConfirmRemove(false);
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
      if (request === generation.current) setError(failure.message || 'Photo could not be saved. Try again.');
    } finally {
      if (request === generation.current) { lock.current = false; setBusy(''); onBusyChange?.(false); }
    }
  };
  const buttonClass = 'flex min-h-11 items-center justify-center gap-2 rounded border border-white/20 px-3 text-sm disabled:opacity-50';
  return <section aria-label={t('Profile photo')} className="space-y-3" aria-busy={Boolean(busy)}>
    <div className="flex flex-wrap items-center gap-3">
      <ProfileAvatar profile={profile} className="h-16 w-16 text-xl" />
      <button ref={chooseButton} type="button" className={buttonClass} disabled={disabled || Boolean(busy)} onClick={() => fileInput.current?.click()}><ImagePlus size={17} />{t(profile?.avatar_path || profile?.avatar_url ? 'Replace photo' : 'Add photo')}</button>
      <button type="button" className="icon-button" title={t('Take photo')} aria-label={t('Take photo')} disabled={disabled || Boolean(busy)} onClick={() => cameraInput.current?.click()}><Camera size={18} /></button>
      {profile?.avatar_path || profile?.avatar_url ? <button type="button" className="icon-button" title={t('Remove photo')} aria-label={t('Remove photo')} disabled={disabled || Boolean(busy)} onClick={() => { setConfirmRemove(true); setImage(null); setError(''); }}><Trash2 size={18} /></button> : null}
    </div>
    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label={t('Choose profile photo')} onChange={select} disabled={disabled || Boolean(busy)} />
    <input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="hidden" aria-label={t('Camera photo')} onChange={select} disabled={disabled || Boolean(busy)} />
    {image ? <div className="max-w-xs space-y-3">
      <canvas ref={canvas} aria-label={t('Square crop preview')} role="img" className="aspect-square w-full max-w-[15rem] rounded border border-white/15 sm:max-w-none" />
      <fieldset disabled={disabled || Boolean(busy)} className="space-y-3">
        {[['zoom', 'Zoom', 1, 3, 0.01], ['x', 'Horizontal position', 0, 100, 1], ['y', 'Vertical position', 0, 100, 1]].map(([key, label, min, max, step]) => <label key={key} className="grid gap-1 text-sm">{t(label)}<input className="min-h-11 w-full" type="range" min={min} max={max} step={step} value={crop[key]} onChange={event => setCrop(previous => ({ ...previous, [key]: Number(event.target.value) }))} /></label>)}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => void mutate()}><Check size={17} />{t('Save photo')}</button>
          <button type="button" className={buttonClass} onClick={() => { setImage(null); setError(''); chooseButton.current?.focus(); }}><X size={17} />{t('Cancel')}</button>
        </div>
      </fieldset>
    </div> : null}
    {confirmRemove ? <div className="space-y-2"><p className="text-sm">{t('Remove profile photo?')}</p><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={disabled || Boolean(busy)} onClick={() => void mutate(true)}><Trash2 size={17} />{t('Remove photo')}</button><button type="button" className={buttonClass} disabled={Boolean(busy)} onClick={() => setConfirmRemove(false)}>{t('Cancel')}</button></div></div> : null}
    {busy ? <div role="status" className="space-y-1 text-sm text-zinc-300"><p>{t(busy)}</p><progress aria-label={t(busy)} className="h-1 w-full max-w-xs" /></div> : null}
    {error ? <p role="alert" className="text-sm text-amber-300">{t(error)}</p> : null}
    {notice ? <p role="status" className="text-sm text-zinc-300">{t(notice)}</p> : null}
  </section>;
}

export default ProfilePhotoEditor;
