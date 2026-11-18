import { ProfileAvatar } from './ProfileAvatar';
import { t, formatDate, getLanguage } from '../i18n';
import { exerciseIdentityKey, exerciseLabel } from '../utils/exerciseCatalog';

export const usernameOf = profile => (profile?.username || '').replace(/^@+/, '');

const romeToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dayNumber = value => Date.UTC(+value.slice(0, 4), +value.slice(5, 7) - 1, +value.slice(8, 10)) / 864e5;

// Days ago in the user's Europe/Rome calendar; null for unparseable or future dates.
function daysAgo(performedOn) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(performedOn || '')) return null;
  const diff = dayNumber(romeToday()) - dayNumber(performedOn);
  return diff >= 0 ? diff : null;
}

// Today and Yesterday read faster than a date; anything older carries its own day.
export function workoutDate(performedOn) {
  const diff = daysAgo(performedOn);
  if (diff === 0) return t('Today');
  if (diff === 1) return t('Yesterday');
  const sameYear = String(performedOn || '').slice(0, 4) === romeToday().slice(0, 4);
  return formatDate(performedOn, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

export const longDate = performedOn => formatDate(performedOn, { day: 'numeric', month: 'short', year: 'numeric' });
export const countLabel = (count, one, many) => `${count} ${t(count === 1 ? one : many)}`;

export function AuthorButton({ profile, onOpen, size = 'card', focusKey }) {
  const username = usernameOf(profile);
  if (!username) return null;
  return <button type="button" aria-label={`@${username}`} data-focus-key={focusKey} className={`community-author community-author-${size}`} onClick={onOpen}>
    <ProfileAvatar profile={profile} className="community-author-avatar" />
    <span className="community-author-name">@{username}</span>
  </button>;
}

export function SharedWorkoutPost({ share, onOpen, onMember }) {
  const id = `post-${share.id}`;
  const exercises = new Map();
  for (const set of share.sets || []) {
    const key = exerciseIdentityKey(set);
    const entry = exercises.get(key) || { ...set, set_count: 0 };
    entry.set_count++;
    exercises.set(key, entry);
  }
  const summary = share.exercise_summary || [...exercises.values()];
  // The open button covers the title line; a tap anywhere else on the card (outside the author) opens it too.
  return <article className="community-post" onClick={event => { if (!event.target.closest('button')) onOpen(); }}>
    <header className="community-post-head">
      <AuthorButton profile={share.author} onOpen={onMember} focusKey={`author:${share.id}`} />
      <time className="community-post-date" dateTime={share.performed_on}>{workoutDate(share.performed_on)}</time>
    </header>
    <div className="community-post-line">
      <h3 className="community-post-title" id={`${id}-title`}>{share.title}</h3>
      <p className="community-post-meta" id={`${id}-meta`}>
        {countLabel(share.exercise_count ?? 0, 'exercise', 'exercises')}
      </p>
      <button type="button" className="community-post-open" data-focus-key={`share:${share.id}`} aria-labelledby={`${id}-title ${id}-action`} aria-describedby={`${id}-meta`} onClick={onOpen}>
        <span className="sr-only" id={`${id}-action`}>{t('View workout')}</span>
      </button>
    </div>
    {summary.length > 0 && <ul className="community-post-exercises">
      {summary.map(exercise => <li key={exerciseIdentityKey(exercise)}>
        <span>{exerciseLabel(exercise)}</span>
        <span className="community-post-meta">{countLabel(exercise.set_count, 'set', 'sets')}</span>
      </li>)}
    </ul>}
  </article>;
}

// Italian "Ripetizioni" cannot fit a narrow numeric column; use the gym-standard abbreviation.
const repsHeader = () => (getLanguage() === 'it' ? 'Rip.' : t('Reps'));

const isWarmup = set => Boolean(set.is_warmup) || Number(set.set_number) >= 1000;
const value = (input, suffix = '') => input === null || input === undefined || input === '' ? '—' : `${Number(input)}${suffix}`;

// RPE effort bands: 6-7 comfortable, 8-9 hard, 10 maximal.
function rpeTone(rpe) {
  if (rpe === null || rpe === undefined || rpe === '') return null;
  const n = Number(rpe);
  if (n >= 10) return 'max';
  if (n >= 8) return 'hard';
  if (n >= 6) return 'easy';
  return null;
}

export function SharedWorkoutExercises({ share }) {
  const groups = new Map();
  for (const set of share.sets || []) {
    const key = exerciseIdentityKey(set);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(set);
  }
  return <div className="community-exercises">
    {[...groups.entries()].map(([key, sets], index) => <section key={key} className="community-exercise" aria-labelledby={`exercise-${index}`}>
      <header className="community-exercise-head">
        <h3 id={`exercise-${index}`}>{exerciseLabel(sets[0])}</h3>
      </header>
      <table className="community-sets">
        <thead><tr><th scope="col">{t('Set')}</th><th scope="col">{t('Weight')}</th><th scope="col"><abbr title={t('Reps')}>{repsHeader()}</abbr></th><th scope="col">RPE</th></tr></thead>
        <tbody>{sets.flatMap((set, row) => {
          const warm = isWarmup(set);
          const tone = rpeTone(set.rpe);
          const cells = <tr key={row} className={warm ? 'community-set-warmup' : undefined}>
            <td>{warm ? <abbr className="community-warmup-badge" title={t('Warmup')}>W</abbr> : set.set_number}</td>
            <td>{value(set.weight, ' kg')}</td>
            <td>{value(set.reps)}</td>
            <td>{tone ? <span className={`community-rpe community-rpe-${tone}`}>{value(set.rpe)}</span> : value(set.rpe)}</td>
          </tr>;
          return set.notes ? [cells, <tr key={`${row}-note`} className="community-set-note"><td /><td colSpan={3}>{set.notes}</td></tr>] : [cells];
        })}</tbody>
      </table>
    </section>)}
  </div>;
}
