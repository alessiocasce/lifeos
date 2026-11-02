import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import * as api from '../services/lifeosApi';
import { t } from '../i18n';

export function ProfileAvatar({ profile, className = 'h-10 w-10' }) {
  const { authUser } = useLifeOS();
  const userId = authUser?.id;
  const path = profile?.avatar_path;
  const legacy = profile?.avatar_url;
  const [photo, setPhoto] = useState(null);
  const [failed, setFailed] = useState('');
  useEffect(() => {
    let active = true;
    setPhoto(null);
    setFailed('');
    const refresh = async () => {
      if (!userId || (!path && !legacy)) return;
      try {
        const url = await api.profilePhotoApi?.signedUrl(profile, userId);
        if (active) { setPhoto({ url, userId, path, legacy }); setFailed(''); }
      } catch { if (active) setPhoto(null); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 4 * 60 * 1000);
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', resume);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [userId, path, legacy]);
  const url = photo?.userId === userId && photo?.path === path && photo?.legacy === legacy ? photo.url : null;
  const initial = Array.from(profile?.username?.trim() || '')[0]?.toUpperCase();
  return <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-zinc-200 ${className}`} role="img" aria-label={t('Profile photo')}>
    {url && failed !== url ? <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(url)} />
      : initial ? <span aria-hidden="true">{initial}</span> : <UserRound aria-hidden="true" className="h-1/2 w-1/2" />}
  </span>;
}

export default ProfileAvatar;
