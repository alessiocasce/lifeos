import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import * as api from '../services/lifeosApi';
import { t } from '../i18n';
import { avatarCache } from '../utils/avatarCache';

export function ProfileAvatar({ profile, className = 'h-10 w-10' }) {
  const { authUser } = useLifeOS();
  const userId = authUser?.id;
  const path = profile?.avatar_path;
  const legacy = profile?.avatar_url;
  const [photo, setPhoto] = useState(() => ({ url: avatarCache.peek(userId, profile), userId, path, legacy }));
  const [failed, setFailed] = useState('');
  useEffect(() => {
    let active = true;
    setFailed('');
    let timer;
    let failures = 0;
    const refresh = async () => {
      if (!userId || (!path && !legacy)) return;
      try {
        const url = await avatarCache.load(userId, profile, api.profilePhotoApi.signedUrl);
        if (active) {
          failures = 0;
          setPhoto({ url, userId, path, legacy }); setFailed('');
          window.clearTimeout(timer);
          timer = window.setTimeout(refresh, Math.max(1000, avatarCache.remaining(userId, profile) - 30000));
        }
      } catch (error) {
        if (!active) return;
        if ([401,403].includes(Number(error?.statusCode || error?.status))) setPhoto(null);
        else {
          // Keep a still-authorized image during transient network failures.
          if (failures++ < 2) timer = window.setTimeout(refresh, 15000);
        }
      }
    };
    void refresh();
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', resume);
    return () => { active = false; window.clearTimeout(timer); document.removeEventListener('visibilitychange', resume); };
  }, [userId, path, legacy]);
  const url = photo?.userId === userId && photo?.path === path && photo?.legacy === legacy ? photo.url : avatarCache.peek(userId, profile);
  const initial = Array.from(profile?.username?.trim() || '')[0]?.toUpperCase();
  return <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-zinc-200 ${className}`} role="img" aria-label={t('Profile photo')}>
    {url && failed !== url ? <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(url)} />
      : initial ? <span aria-hidden="true">{initial}</span> : <UserRound aria-hidden="true" className="h-1/2 w-1/2" />}
  </span>;
}

export default ProfileAvatar;
