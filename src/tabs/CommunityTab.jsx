import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Pencil, RefreshCw, Search } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { communityApi } from '../services/lifeosApi';
import { t, formatDate } from '../i18n';
import { MemberIdentity, SharedWorkoutCard, SharedWorkoutSets } from '../components/SharedWorkout';
import { COMMUNITY_FRESH_MS, communityKey, communityRevision, invalidateCommunity, readCommunityList, readCommunityView, rememberCommunityView, writeCommunityList } from '../utils/communityCache';
import '../styles/community.css';

const route = (hash) => {
  const params = new URLSearchParams(hash.slice(1));
  return { share: params.get('share'), member: params.get('member'), members: params.has('members') };
};
const navigationKey = 'lifeosCommunity';

// Each browser entry carries its origin stack; refresh retains it, copied URLs do not.
function readNavigation(userId) {
  const saved = window.history.state?.[navigationKey];
  if (saved?.userId === userId && saved.current?.hash === window.location.hash && Array.isArray(saved.origins)) return saved;
  return { userId, current: { search: '', scrollY: 0, ...readCommunityView(userId, window.location.hash), key: crypto.randomUUID(), hash: window.location.hash }, origins: [] };
}

function writeNavigation(value, method = 'replaceState') {
  window.history[method]({ ...window.history.state, [navigationKey]: value }, '', `${window.location.pathname}${window.location.search}${value.current.hash}`);
}

// Account-keyed mounting plus request generations prevent stale reads after auth/navigation.
export function CommunityTab() {
  const { authUser } = useLifeOS();
  return authUser ? <CommunityWorkspace key={authUser.id} userId={authUser.id} /> : null;
}

function CommunityWorkspace({ userId }) {
  const { setActiveTab } = useLifeOS();
  const [navigation, setNavigation] = useState(() => readNavigation(userId));
  const location = route(navigation.current.hash);
  const pendingScroll = useRef(navigation.current.key);
  const restoreScroll = useCallback((more = false) => {
    if (pendingScroll.current !== navigation.current.key) return true;
    if (more && navigation.current.scrollY > document.documentElement.scrollHeight - window.innerHeight) return false;
    window.scrollTo({ top: navigation.current.scrollY, behavior: 'instant' });
    pendingScroll.current = null;
    return true;
  }, [navigation]);
  useLayoutEffect(() => {
    pendingScroll.current = navigation.current.key;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [navigation.current.key]);
  useEffect(() => {
    writeNavigation(navigation);
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const update = () => {
      if (window.location.pathname !== '/community') return;
      const next = readNavigation(userId);
      writeNavigation(next);
      setNavigation(next);
    };
    const rememberScroll = () => {
      if (pendingScroll.current || window.location.pathname !== '/community') return;
      const current = readNavigation(userId);
      writeNavigation({ ...current, current: { ...current.current, scrollY: window.scrollY } });
      rememberCommunityView(userId, current.current.hash, { ...current.current, scrollY: window.scrollY });
    };
    window.addEventListener('hashchange', update); window.addEventListener('popstate', update);
    window.addEventListener('scroll', rememberScroll, { passive: true });
    return () => { window.history.scrollRestoration = previousRestoration; window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); window.removeEventListener('scroll', rememberScroll); };
  }, [userId]);
  const navigate = (key, id) => {
    const hash = key ? `#${key}${id ? `=${encodeURIComponent(id)}` : ''}` : '';
    if (hash === navigation.current.hash) return;
    const current = { ...navigation.current, scrollY: window.scrollY };
    rememberCommunityView(userId, current.hash, current);
    writeNavigation({ ...navigation, current });
    const saved = readCommunityView(userId, hash);
    const next = { userId, current: { search: '', scrollY: 0, ...saved, key: crypto.randomUUID(), hash }, origins: [...navigation.origins, current] };
    writeNavigation(next, 'pushState');
    setNavigation(next);
  };
  const back = () => {
    if (navigation.origins.length) { window.history.back(); return; }
    const next = { userId, current: { ...navigation.current, key: crypto.randomUUID(), hash: '', scrollY: 0 }, origins: [] };
    writeNavigation(next);
    setNavigation(next);
  };
  const setSearch = (search) => {
    const next = { ...navigation, current: { ...navigation.current, search } };
    rememberCommunityView(userId, next.current.hash, next.current);
    writeNavigation(next);
    setNavigation(next);
  };
  if (location.share) return <ShareDetail key={location.share} userId={userId} id={location.share} navigate={navigate} back={back} restoreScroll={restoreScroll} />;
  if (location.member) return <MemberProfile key={location.member} userId={userId} id={location.member} navigate={navigate} back={back} restoreScroll={restoreScroll} onEdit={() => setActiveTab('settings')} />;
  return <div className="community-workspace max-w-3xl min-w-0">
    <p className="community-intro">{t('Completed workouts from members with Workout Sharing enabled.')}</p>
    <div role="tablist" aria-label={t('Community views')} className="community-tabs">
      {['Feed', 'Members'].map(label => <button type="button" role="tab" key={label} id={`community-tab-${label}`} aria-controls="community-panel" tabIndex={((label === 'Members') === location.members) ? 0 : -1} aria-selected={(label === 'Members') === location.members} className={`min-h-11 border-b-2 px-1 text-sm ${((label === 'Members') === location.members) ? 'border-zinc-100 text-zinc-100' : 'border-transparent text-zinc-400'}`}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const buttons = event.currentTarget.parentElement.querySelectorAll('[role="tab"]');
          const index = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : label === 'Feed' ? 1 : 0;
          buttons[index].focus({ preventScroll: true }); buttons[index].click();
        }} onClick={() => navigate(label === 'Members' ? 'members' : '')}>{t(label)}</button>)}
    </div>
    <div role="tabpanel" id="community-panel" aria-labelledby={`community-tab-${location.members ? 'Members' : 'Feed'}`}>
      {location.members ? <MemberDirectory userId={userId} input={navigation.current.search} setInput={setSearch} navigate={navigate} restoreScroll={restoreScroll} /> : <Feed userId={userId} navigate={navigate} restoreScroll={restoreScroll} />}
    </div>
  </div>;
}

function useCommunityList(userId, kind, author, search = '') {
  const key = communityKey(userId, kind, author, search);
  const empty = () => ({ rows: [], loading: true, refreshing: false, more: false, error: false, pages: 1 });
  const [stored, setState] = useState(() => ({ key, ...(readCommunityList(key) || empty()) }));
  const state = stored.key === key ? stored : { key, ...(readCommunityList(key) || empty()) };
  const generation = useRef(0);
  const busy = useRef(false);
  const stateRef = useRef(state); stateRef.current = state;
  const load = useCallback(async (append = false) => {
    if (append && busy.current) return;
    const request = ++generation.current;
    const revision = communityRevision();
    busy.current = true;
    const previous = stateRef.current;
    setState({ ...previous, key, loading: !previous.rows.length, refreshing: Boolean(previous.rows.length), error: false });
    try {
      let rows = append ? previous.rows : [];
      let more = false;
      const pages = append ? 1 : previous.pages || 1;
      const identity = kind === 'members' ? 'user_id' : 'id';
      for (let page = 0; page < pages; page++) {
        const result = kind === 'members' ? await communityApi.members(userId, { search, offset: rows.length }) : await communityApi.feed(userId, { author, cursor: rows.at(-1) });
        if (generation.current !== request || communityRevision() !== revision) return;
        rows = [...new Map([...rows, ...result].map(row => [row[identity], row])).values()];
        more = result.length === (kind === 'members' ? 20 : 10);
        if (!more) break;
      }
      const next = { key, rows, loading: false, refreshing: false, more, error: false, pages: append ? previous.pages + 1 : pages, checkedAt: Date.now() };
      writeCommunityList(key, next, revision);
      setState(next);
    } catch {
      if (generation.current === request && communityRevision() === revision) {
        // Failed revalidation is not proof that a cached projection is still public.
        invalidateCommunity({ refresh: false });
        setState({ key, ...empty(), loading: false, error: true });
      }
    }
    finally { if (generation.current === request) busy.current = false; }
  }, [userId, kind, author, search, key]);
  useEffect(() => {
    const cached = readCommunityList(key);
    if (cached) setState({ key, ...cached });
    else { stateRef.current = { key, ...empty() }; void load(); }
    return () => { generation.current++; busy.current = false; };
  }, [load, key]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const invalidate = event => { generation.current++; busy.current = false; stateRef.current = { key, ...empty(), loading: event.detail?.refresh !== false }; setState(stateRef.current); if (event.detail?.refresh !== false) void load(); };
    const visibility = () => { if (document.visibilityState === 'hidden') invalidateCommunity({ refresh: false }); else refresh(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visibility); window.addEventListener('lifeos:community-invalidated', invalidate);
    const interval = setInterval(refresh, COMMUNITY_FRESH_MS);
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('lifeos:community-invalidated', invalidate); };
  }, [load]);
  return { ...state, load };
}

function ListFooter({ data, empty }) {
  return <>
    {data.loading ? <p role="status" className="py-5 text-sm text-zinc-400">{t('Loading Community...')}</p> : null}
    {data.error ? <div role="alert" className="py-4 text-sm text-amber-200">{t('Community is unavailable. Try again.')}<button type="button" className="ml-3 inline-flex min-h-11 items-center gap-2" onClick={() => data.load(Boolean(data.rows.length))}><RefreshCw size={16} />{t('Retry')}</button></div> : null}
    {!data.loading && !data.error && !data.rows.length ? <p className="community-empty">{t(empty)}</p> : null}
    {data.more && !data.loading && !data.error ? <button type="button" disabled={data.refreshing} className="community-load-more" onClick={() => data.load(true)}>{t('Load more')}</button> : null}
  </>;
}

function Feed({ userId, author = null, navigate, restoreScroll }) {
  const data = useCommunityList(userId, 'feed', author);
  useEffect(() => { if (!data.loading && !data.error && !restoreScroll(data.more)) void data.load(true); }, [data.loading, data.error, data.more, data.load, restoreScroll]);
  return <section aria-label={t('Shared workouts')} aria-busy={data.loading || data.refreshing} className="min-w-0">
    <div className="grid gap-4">{data.rows.map(share => <SharedWorkoutCard key={share.id} share={share} onOpen={() => navigate('share', share.id)} onMember={() => navigate('member', share.author_id)} />)}</div>
    <ListFooter data={data} empty={author === userId ? 'Completed workouts appear here when Workout Sharing is on and your public profile is complete.' : 'No shared workouts yet.'} />
  </section>;
}

function MemberDirectory({ userId, input, setInput, navigate, restoreScroll }) {
  const [search, setSearch] = useState(input);
  useEffect(() => { const timer = setTimeout(() => setSearch(input), 250); return () => clearTimeout(timer); }, [input]);
  const data = useCommunityList(userId, 'members', null, search);
  useEffect(() => { if (!data.loading && !data.error && !restoreScroll(data.more)) void data.load(true); }, [data.loading, data.error, data.more, data.load, restoreScroll]);
  return <section>
    <label className="community-search"><Search size={18} aria-hidden="true" /><input type="text" inputMode="search" enterKeyHint="search" name="member-search" autoComplete="off" spellCheck={false} value={input} onChange={e => setInput(e.target.value)} aria-label={t('Find members')} placeholder={t('Search usernames')} maxLength={60} /></label>
    <div className="community-members">{data.rows.map(profile => <div className="community-member-row" key={profile.user_id}><MemberIdentity profile={profile} onOpen={() => navigate('member', profile.user_id)} /></div>)}</div>
    <ListFooter data={data} empty="No matching members." />
  </section>;
}

function useCommunityRecord(userId, id, kind) {
  const [state, setState] = useState({ value: null, loading: true, error: false });
  const retry = useRef(null);
  useEffect(() => {
    let revision = 0, alive = true;
    const load = async () => {
      const request = ++revision;
      try {
        const value = await communityApi[kind](userId, id);
        if (alive && revision === request) {
          if (!value) invalidateCommunity({ refresh: false });
          setState({ value, loading: false, error: false });
        }
      } catch {
        if (alive && revision === request) {
          invalidateCommunity({ refresh: false });
          setState({ value: null, loading: false, error: true });
        }
      }
    };
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    retry.current = () => { setState({ value: null, loading: true, error: false }); void load(); };
    const invalidate = event => { revision++; setState({ value: null, loading: event.detail?.refresh !== false, error: false }); if (event.detail?.refresh !== false) refresh(); };
    const visibility = () => { if (document.visibilityState === 'hidden') { revision++; setState({ value: null, loading: true, error: false }); } else refresh(); };
    void load(); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visibility); window.addEventListener('lifeos:community-invalidated', invalidate);
    // Never retain a detail snapshot indefinitely when its publication may be revoked.
    const interval = setInterval(refresh, 30000);
    return () => { alive = false; revision++; retry.current = null; clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('lifeos:community-invalidated', invalidate); };
  }, [userId, id, kind]);
  return { ...state, retry: () => retry.current?.() };
}

function RecordError({ retry }) {
  return <div role="alert" className="py-4 text-sm text-amber-200">{t('Community is unavailable. Try again.')}<button type="button" className="ml-3 inline-flex min-h-11 items-center gap-2" onClick={retry}><RefreshCw size={16} aria-hidden="true" />{t('Retry')}</button></div>;
}

function BackToCommunity({ onBack }) {
  return <button type="button" className="mb-5 flex min-h-11 items-center gap-2 text-sm text-zinc-300" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />{t('Back')}</button>;
}

function ShareDetail({ userId, id, navigate, back, restoreScroll }) {
  const data = useCommunityRecord(userId, id, 'detail');
  useEffect(() => { if (!data.loading) restoreScroll(); }, [data.loading, restoreScroll]);
  return <section className="community-detail max-w-2xl min-w-0"><BackToCommunity onBack={back} />
    {data.loading ? <p role="status">{t('Loading Community...')}</p> : data.error ? <RecordError retry={data.retry} /> : !data.value ? <p>{t('This workout is private or unavailable.')}</p> : <>
      <MemberIdentity profile={data.value.author} onOpen={() => navigate('member', data.value.author_id)} />
      <h2 className="mt-6 break-words text-2xl font-semibold">{data.value.title}</h2><time className="mt-2 block text-sm text-zinc-400" dateTime={data.value.performed_on}>{formatDate(data.value.performed_on)}</time>
      <SharedWorkoutSets share={data.value} />
    </>}
  </section>;
}

function MemberProfile({ userId, id, navigate, back, restoreScroll, onEdit }) {
  const data = useCommunityRecord(userId, id, 'member');
  useEffect(() => { if (!data.loading && (!data.value || data.error)) restoreScroll(); }, [data, restoreScroll]);
  return <section className="community-profile max-w-3xl min-w-0"><BackToCommunity onBack={back} />
    {data.loading ? <p role="status">{t('Loading Community...')}</p> : data.error ? <RecordError retry={data.retry} /> : !data.value ? <p>{t('Member unavailable.')}</p> : <>
      <div className="flex flex-wrap items-center gap-3"><MemberIdentity profile={data.value} />{id === userId ? <button type="button" className="icon-button" title={t('Public profile')} aria-label={t('Public profile')} onClick={onEdit}><Pencil size={17} /></button> : null}</div><h2 className="mb-4 mt-8 text-sm font-semibold">{t('Shared workouts')}</h2><Feed userId={userId} author={id} navigate={navigate} restoreScroll={restoreScroll} />
    </>}
  </section>;
}
