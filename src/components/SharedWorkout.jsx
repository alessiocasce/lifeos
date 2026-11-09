import { ArrowUpRight } from 'lucide-react';
import { ProfileAvatar } from './ProfileAvatar';
import { t, formatDate } from '../i18n';
import { exerciseIdentityKey, exerciseLabel } from '../utils/exerciseCatalog';

export function MemberIdentity({ profile, onOpen }) {
  if (!profile?.username) return null;
  const username = profile.username.replace(/^@+/, '');
  const content = <><ProfileAvatar profile={profile} className="h-11 w-11 shrink-0" /><span className="community-identity-copy"><strong>{profile.display_name || `@${username}`}</strong>{profile.display_name ? <small>@{username}</small> : null}</span></>;
  return onOpen ? <button type="button" aria-label={`@${username}`} className="community-identity" onClick={onOpen}>{content}</button> : <div className="community-identity">{content}</div>;
}

export function SharedWorkoutCard({ share, onOpen, onMember }) {
  return <article className="community-card">
    <div className="community-card-header"><MemberIdentity profile={share.author} onOpen={onMember} /><time dateTime={share.performed_on}>{formatDate(share.performed_on)}</time></div>
    <button type="button" onClick={onOpen} className="community-card-open">
      <h2>{share.title}</h2>
      <p className="community-card-counts"><span>{share.exercise_count} {t(share.exercise_count === 1 ? 'exercise' : 'exercises')}</span><span>{share.set_count} {t(share.set_count === 1 ? 'set' : 'sets')}</span></p>
      <p className="community-card-preview">{(share.exercise_preview || []).map(e => exerciseLabel(e)).join(' · ')}</p>
      <span className="community-card-action">{t('View workout')}<ArrowUpRight size={18} aria-hidden="true" /></span>
    </button>
  </article>;
}

export function SharedWorkoutSets({ share }) {
  const groups = new Map();
  for (const set of share.sets || []) {
    const key = exerciseIdentityKey(set);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(set);
  }
  return <div className="mt-5 grid gap-6">
    {share.notes ? <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">{share.notes}</p> : null}
    {[...groups.entries()].map(([key, sets]) => <section key={key} className="min-w-0 border-t border-white/10 pt-4">
      <h3 className="mb-3 break-words text-sm font-semibold">{exerciseLabel(sets[0])}</h3>
      <div className="grid gap-3">{sets.map((set, i) => <div key={i} className={`grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-2 text-sm ${set.is_warmup || set.set_number >= 1000 ? 'text-zinc-400' : 'text-zinc-100'}`}>
        <span className="data-text">{set.is_warmup || set.set_number >= 1000 ? 'W' : set.set_number}</span>
        <span className="data-text">{set.weight != null ? `${Number(set.weight)}${t(' kg × ')}` : ''}{set.reps}</span>
        <span className="data-text text-xs text-zinc-400">{set.rpe != null ? `RPE ${Number(set.rpe)}` : ''}</span>
        {set.notes ? <p className="community-set-note">{set.notes}</p> : null}
      </div>)}</div>
    </section>)}
  </div>;
}
