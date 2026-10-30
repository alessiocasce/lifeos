import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Search, ShieldOff } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { communityApi } from '../services/lifeosApi';
import { t, formatDate } from '../i18n';
import { MemberIdentity, SharedWorkoutCard, SharedWorkoutSets } from '../components/SharedWorkout';

const route = () => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return { share: params.get('share'), member: params.get('member'), members: params.has('members') };
};
const navigate = (key, id) => { window.location.hash = key ? `${key}${id ? `=${encodeURIComponent(id)}` : ''}` : ''; };

// Account-keyed mounting plus request generations prevent stale reads after auth/navigation.
export function CommunityTab() {
  const { authUser } = useLifeOS();
  return authUser ? <CommunityWorkspace key={authUser.id} userId={authUser.id} /> : null;
}

function CommunityWorkspace({ userId }) {
  const [location, setLocation] = useState(route);
  useEffect(() => {
    const update = () => setLocation(route());
    window.addEventListener('hashchange', update); window.addEventListener('popstate', update);
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, []);
  if (location.share) return <ShareDetail key={location.share} userId={userId} id={location.share} />;
  if (location.member) return <MemberProfile key={location.member} userId={userId} id={location.member} />;
  return <div className="max-w-3xl min-w-0">
    <p className="mb-5 text-sm text-zinc-400">{t('Workouts intentionally shared by LifeOS members.')}</p>
    <div role="tablist" aria-label={t('Community views')} className="mb-6 flex gap-5 border-b border-white/10">
      {['Feed', 'Members'].map(label => <button type="button" role="tab" key={label} aria-selected={(label === 'Members') === location.members} className={`min-h-11 border-b-2 px-1 text-sm ${((label === 'Members') === location.members) ? 'border-zinc-100 text-zinc-100' : 'border-transparent text-zinc-400'}`} onClick={() => navigate(label === 'Members' ? 'members' : '')}>{t(label)}</button>)}
    </div>
    {location.members ? <MemberDirectory userId={userId} /> : <Feed userId={userId} />}
  </div>;
}

function useCommunityList(userId, kind, author, search = '') {
  const [state, setState] = useState({ rows: [], loading: true, more: false, error: false });
  const generation = useRef(0);
  const busy = useRef(false);
  const stateRef = useRef(state); stateRef.current = state;
  const load = useCallback(async (append = false) => {
    if (append && busy.current) return;
    const request = ++generation.current;
    busy.current = true;
    const previous = append ? stateRef.current.rows : [];
    setState({ rows: previous, loading: true, more: false, error: false });
    try {
      const rows = kind === 'members' ? await communityApi.members(userId, { search, offset: previous.length }) : await communityApi.feed(userId, { author, cursor: previous.at(-1) });
      if (generation.current !== request) return;
      const key = kind === 'members' ? 'user_id' : 'id';
      setState({ rows: [...new Map([...previous, ...rows].map(r => [r[key], r])).values()], loading: false, more: rows.length === (kind === 'members' ? 20 : 10), error: false });
    } catch { if (generation.current === request) setState({ rows: previous, loading: false, more: append, error: true }); }
    finally { if (generation.current === request) busy.current = false; }
  }, [userId, kind, author, search]);
  useEffect(() => { void load(); return () => { generation.current++; busy.current = false; }; }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  return { ...state, load };
}

function ListFooter({ data, empty }) {
  return <>
    {data.loading ? <p role="status" className="py-5 text-sm text-zinc-400">{t('Loading Community...')}</p> : null}
    {data.error ? <div role="alert" className="py-4 text-sm text-amber-200">{t('Community is unavailable. Try again.')}<button type="button" className="ml-3 inline-flex min-h-11 items-center gap-2" onClick={() => data.load(Boolean(data.rows.length))}><RefreshCw size={16} />{t('Retry')}</button></div> : null}
    {!data.loading && !data.error && !data.rows.length ? <p className="border-t border-white/10 py-8 text-sm text-zinc-400">{t(empty)}</p> : null}
    {data.more && !data.loading && !data.error ? <button type="button" className="mt-5 min-h-11 border-b border-white/20 text-sm" onClick={() => data.load(true)}>{t('Load more')}</button> : null}
  </>;
}

function Feed({ userId, author = null }) {
  const data = useCommunityList(userId, 'feed', author);
  return <section aria-label={t('Shared workouts')} className="min-w-0">
    <div className="grid gap-4">{data.rows.map(share => <SharedWorkoutCard key={share.id} share={share} onOpen={() => navigate('share', share.id)} onMember={() => navigate('member', share.author_id)} />)}</div>
    <ListFooter data={data} empty={author === userId ? 'You have not shared any workouts. Share a completed workout from Training History.' : 'No shared workouts yet.'} />
  </section>;
}

function MemberDirectory({ userId }) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSearch(input), 250); return () => clearTimeout(timer); }, [input]);
  const data = useCommunityList(userId, 'members', null, search);
  return <section>
    <label className="mb-5 flex min-h-11 items-center gap-3 border border-white/15 px-3"><Search size={17} /><input value={input} onChange={e => setInput(e.target.value)} aria-label={t('Find members')} placeholder={t('Username or display name')} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" maxLength={60} /></label>
    <div className="grid gap-1">{data.rows.map(profile => <div className="border-b border-white/10 py-3" key={profile.user_id}><MemberIdentity profile={profile} onOpen={() => navigate('member', profile.user_id)} /></div>)}</div>
    <ListFooter data={data} empty="No matching members." />
  </section>;
}

function useCommunityRecord(userId, id, kind) {
  const [state, setState] = useState({ value: null, loading: true, error: false });
  useEffect(() => {
    let revision = 0, alive = true;
    const load = async () => {
      const request = ++revision;
      setState({ value: null, loading: true, error: false });
      try { const value = await communityApi[kind](userId, id); if (alive && revision === request) setState({ value, loading: false, error: false }); }
      catch { if (alive && revision === request) setState({ value: null, loading: false, error: true }); }
    };
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    void load(); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    // Never retain a detail snapshot indefinitely when its publication may be revoked.
    const interval = setInterval(refresh, 30000);
    return () => { alive = false; revision++; clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [userId, id, kind]);
  return state;
}

function BackToCommunity() {
  return <button type="button" className="mb-5 flex min-h-11 items-center gap-2 text-sm text-zinc-300" onClick={() => navigate('')}><ArrowLeft size={16} />{t('Back to Community')}</button>;
}

function ShareDetail({ userId, id }) {
  const data = useCommunityRecord(userId, id, 'detail');
  const [withdrawn, setWithdrawn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const withdraw = async () => {
    if (busy) return;
    setBusy(true); setError(false);
    try { await communityApi.withdrawShared(userId, id); if (alive.current) setWithdrawn(true); }
    catch { if (alive.current) setError(true); }
    finally { if (alive.current) setBusy(false); }
  };
  return <section className="max-w-2xl min-w-0"><BackToCommunity />
    {withdrawn ? <p>{t('This workout is private or unavailable.')}</p> : data.loading ? <p role="status">{t('Loading Community...')}</p> : data.error ? <p role="alert">{t('Community is unavailable. Try again.')}</p> : !data.value ? <p>{t('This workout is private or unavailable.')}</p> : <>
      <MemberIdentity profile={data.value.author} onOpen={() => navigate('member', data.value.author_id)} />
      <p className="mt-6 text-xs uppercase text-zinc-400">{t('Shared with Community')}</p>
      <h2 className="mt-2 break-words text-xl font-semibold">{data.value.title}</h2><time className="text-sm text-zinc-400">{formatDate(data.value.performed_on)}</time>
      {data.value.author_id === userId ? <button type="button" disabled={busy} onClick={withdraw} className="mt-3 flex min-h-11 items-center gap-2 text-sm text-zinc-400"><ShieldOff size={16} />{t('Stop sharing')}</button> : null}
      {error ? <p role="alert" className="text-sm text-amber-200">{t('Sharing failed. Refresh and try again.')}</p> : null}
      <SharedWorkoutSets share={data.value} />
    </>}
  </section>;
}

function MemberProfile({ userId, id }) {
  const data = useCommunityRecord(userId, id, 'member');
  return <section className="max-w-3xl min-w-0"><BackToCommunity />
    {data.loading ? <p role="status">{t('Loading Community...')}</p> : data.error ? <p role="alert">{t('Community is unavailable. Try again.')}</p> : !data.value ? <p>{t('Member unavailable.')}</p> : <>
      <MemberIdentity profile={data.value} /><h2 className="mb-4 mt-8 text-sm font-semibold">{t('Shared workouts')}</h2><Feed userId={userId} author={id} />
    </>}
  </section>;
}
