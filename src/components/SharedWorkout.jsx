import { Dumbbell, UserRound } from 'lucide-react';
import { t, formatDate } from '../i18n';
import { exerciseIdentityKey, exerciseLabel } from '../utils/exerciseCatalog';

export function MemberIdentity({ profile, onOpen }) {
  if (!profile) return null;
  const content = <><span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-900">
    {profile.avatar_url ? <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <UserRound size={18} className="text-zinc-400" />}
  </span><span className="min-w-0 text-left"><strong className="block break-words text-sm text-zinc-100">{profile.display_name}</strong><span className="block break-all text-xs text-zinc-400">@{profile.username}</span></span></>;
  return onOpen ? <button type="button" className="flex min-h-11 min-w-0 items-center gap-3" onClick={onOpen}>{content}</button> : <div className="flex min-w-0 items-center gap-3">{content}</div>;
}

export function SharedWorkoutCard({ share, onOpen, onMember }) {
  return <article className="min-w-0 rounded-md border border-white/10 bg-[#111316] p-4">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><MemberIdentity profile={share.author} onOpen={onMember} /><time className="text-xs text-zinc-400" dateTime={share.performed_on}>{formatDate(share.performed_on)}</time></div>
    <button type="button" onClick={onOpen} className="block w-full text-left">
      <h2 className="break-words text-lg font-semibold text-zinc-100">{share.title}</h2>
      <p className="mt-1 text-xs text-zinc-400">{share.exercise_count}{t(' exercises · ')}{share.set_count}{t(' sets')}</p>
      <p className="mt-3 break-words text-sm leading-relaxed text-zinc-300">{(share.exercise_preview || []).map(e => exerciseLabel(e)).join(' · ')}</p>
      <span className="mt-4 flex min-h-11 items-center gap-2 text-sm text-zinc-100"><Dumbbell size={16} />{t('View workout')}</span>
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
        <span className="data-text">{Number(set.weight)}{t(' kg × ')}{set.reps}</span>
        <span className="data-text text-xs text-zinc-400">{set.rpe != null ? `RPE ${Number(set.rpe)}` : ''}</span>
        {set.notes ? <p className="col-span-2 col-start-2 whitespace-pre-wrap break-words text-xs text-zinc-400">{set.notes}</p> : null}
      </div>)}</div>
    </section>)}
  </div>;
}
