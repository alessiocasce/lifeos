import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search, UsersRound, X, Dumbbell } from 'lucide-react';
import { useLifeOS } from '../context/LifeOSContext';
import { communityApi } from '../services/lifeosApi';
import { t } from '../i18n';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { SettingsDialog } from '../components/SettingsDialog';
import { AuthorButton, SharedWorkoutExercises, SharedWorkoutPost, longDate, usernameOf } from '../components/SharedWorkout';
import { COMMUNITY_FRESH_MS, communityKey, communityRevision, invalidateCommunity, readCommunityList, readCommunityView, rememberCommunityView, writeCommunityList } from '../utils/communityCache';
import '../styles/community.css';
import '../styles/settings.css';

const route = (hash) => {
  const params = new URLSearchParams(hash.slice(1));
  return { share: params.get('share'), member: params.get('member'), members: params.has('members') };
};
const isTopLevel = hash => hash === '' || hash === '#members';
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

// Push/pop slide along the same horizontal path; Feed/Members switches cross-fade.
function transitionBetween(from, to) {
  if (!from) return 'none';
  if (isTopLevel(from.current.hash) && isTopLevel(to.current.hash)) return 'switch';
  return to.origins.length < from.origins.length ? 'pop' : 'push';
}

function backLabel(origins) {
  const hash = origins.at(-1)?.hash ?? '';
  if (hash.startsWith('#share=')) return 'Back to workout';
  if (hash.startsWith('#member=')) return 'Back to profile';
  if (hash === '#members') return 'Back to Members';
  return 'Back to Feed';
}

// Account-keyed mounting plus request generations prevent stale reads after auth/navigation.
export function CommunityTab() {
  const { authUser } = useLifeOS();
  return authUser ? <CommunityWorkspace key={authUser.id} userId={authUser.id} /> : null;
}

function CommunityWorkspace({ userId }) {
  const [navigation, setNavigationState] = useState(() => readNavigation(userId));
  const [transition, setTransition] = useState('none');
  const navigationRef = useRef(navigation);
  const setNavigation = useCallback(next => {
    setTransition(transitionBetween(navigationRef.current, next));
    navigationRef.current = next;
    setNavigationState(next);
  }, []);
  const location = route(navigation.current.hash);
  const pendingScroll = useRef(navigation.current.key);
  const restoreScroll = useCallback((more = false) => {
    if (pendingScroll.current !== navigation.current.key) return true;
    if (more && navigation.current.scrollY > document.documentElement.scrollHeight - window.innerHeight) return false;
    window.scrollTo({ top: navigation.current.scrollY, behavior: 'instant' });
    pendingScroll.current = null;
    // Returning puts focus back on the control that opened the page we left.
    const focusKey = navigation.current.focusKey;
    if (focusKey) document.querySelector(`.community [data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
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
  const navigate = (key, id, focusKey) => {
    const hash = key ? `#${key}${id ? `=${encodeURIComponent(id)}` : ''}` : '';
    if (hash === navigation.current.hash) return;
    const current = { ...navigation.current, scrollY: window.scrollY, focusKey };
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
    navigationRef.current = next;
    setNavigationState(next);
  };
  const backBar = <BackBar label={backLabel(navigation.origins)} onBack={back} />;
  let page;
  if (location.share) page = <ShareDetail userId={userId} id={location.share} navigate={navigate} backBar={backBar} restoreScroll={restoreScroll} />;
  else if (location.member) page = <MemberProfile userId={userId} id={location.member} navigate={navigate} backBar={backBar} restoreScroll={restoreScroll} />;
  else page = <div role="tabpanel" id="community-panel" aria-labelledby={`community-tab-${location.members ? 'members' : 'feed'}`}>
    {location.members ? <MemberDirectory userId={userId} input={navigation.current.search} setInput={setSearch} navigate={navigate} restoreScroll={restoreScroll} /> : <Feed userId={userId} navigate={navigate} restoreScroll={restoreScroll} />}
  </div>;
  return <div className="community">
    {isTopLevel(navigation.current.hash) ? <Segments members={location.members} onSelect={members => navigate(members ? 'members' : '')} /> : null}
    <div key={navigation.current.key} className="community-page" data-transition={transition}>{page}</div>
  </div>;
}

function Segments({ members, onSelect }) {
  const options = [['feed', 'Feed'], ['members', 'Members']];
  const index = members ? 1 : 0;
  return <div className="community-toolbar">
    <div role="tablist" aria-label={t('Community views')} className="community-segments" style={{ '--segment-index': index }}>
      <span className="community-segment-thumb" aria-hidden="true" />
      {options.map(([id, label], position) => <button type="button" role="tab" key={id} id={`community-tab-${id}`} aria-controls="community-panel"
        aria-selected={position === index} tabIndex={position === index ? 0 : -1} className="community-segment"
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - position;
          event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[target].focus({ preventScroll: true });
          onSelect(target === 1);
        }}
        onClick={() => onSelect(position === 1)}>{t(label)}</button>)}
    </div>
  </div>;
}

// Visible text is the previous page's title, as in a navigation bar.
const backTitles = { 'Back to Feed': 'Feed', 'Back to Members': 'Members', 'Back to profile': 'Profile', 'Back to workout': 'Workout' };

function BackBar({ label, onBack }) {
  return <div className="community-backbar">
    <button type="button" className="community-back" aria-label={t(label)} onClick={onBack}>
      <ChevronLeft size={22} strokeWidth={2.25} aria-hidden="true" /><span aria-hidden="true">{t(backTitles[label])}</span>
    </button>
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

function Skeleton({ rows = 3, variant = 'post' }) {
  return <div className={`community-group community-skeleton community-skeleton-${variant}`} aria-hidden="true">
    {Array.from({ length: rows }, (_, i) => <div key={i} className="community-skeleton-row"><span /><span /><span /></div>)}
  </div>;
}

function EmptyState({ icon: Icon, title, children }) {
  return <div className="community-state">
    <span className="community-state-icon"><Icon size={26} aria-hidden="true" /></span>
    <p className="community-state-title">{title}</p>
    {children}
  </div>;
}

function ErrorState({ retry }) {
  return <div role="alert" className="community-state">
    <p className="community-state-title">{t('Community is unavailable. Try again.')}</p>
    <button type="button" className="community-pill-button" onClick={retry}><RefreshCw size={16} aria-hidden="true" />{t('Retry')}</button>
  </div>;
}

function ListStatus({ data, skeleton, empty }) {
  return <>
    {data.loading ? <><p role="status" className="sr-only">{t('Loading Community...')}</p>{skeleton}</> : null}
    {data.error ? <ErrorState retry={() => data.load(Boolean(data.rows.length))} /> : null}
    {!data.loading && !data.error && !data.rows.length ? empty : null}
    {data.more && !data.loading && !data.error ? <button type="button" disabled={data.refreshing} className="community-load-more" onClick={() => data.load(true)}>{t('Load more')}</button> : null}
  </>;
}

function Feed({ userId, author = null, navigate, restoreScroll }) {
  const data = useCommunityList(userId, 'feed', author);
  useEffect(() => { if (!data.loading && !data.error && !restoreScroll(data.more)) void data.load(true); }, [data.loading, data.error, data.more, data.load, restoreScroll]);
  const own = author === userId;
  return <section aria-label={t('Shared workouts')} aria-busy={data.loading || data.refreshing} className="community-feed">
    {data.rows.length ? <div className="community-cards">
      {data.rows.map(share => <SharedWorkoutPost key={share.id} share={share}
        onOpen={() => navigate('share', share.id, `share:${share.id}`)} onMember={() => navigate('member', share.author_id, `author:${share.id}`)} />)}
    </div> : null}
    <ListStatus data={data} skeleton={<Skeleton />} empty={<EmptyState icon={Dumbbell} title={t(own ? 'Completed workouts appear here when Workout Sharing is on and your public profile is complete.' : 'No shared workouts yet.')} />} />
  </section>;
}

function MemberDirectory({ userId, input, setInput, navigate, restoreScroll }) {
  const [search, setSearch] = useState(input);
  const field = useRef(null);
  useEffect(() => { const timer = setTimeout(() => setSearch(input), 250); return () => clearTimeout(timer); }, [input]);
  const data = useCommunityList(userId, 'members', null, search);
  useEffect(() => { if (!data.loading && !data.error && !restoreScroll(data.more)) void data.load(true); }, [data.loading, data.error, data.more, data.load, restoreScroll]);
  const clear = () => { setInput(''); field.current?.focus(); };
  return <section className="community-directory">
    <div className="community-search">
      <Search size={17} aria-hidden="true" />
      <input ref={field} type="text" inputMode="search" enterKeyHint="search" name="member-search" autoComplete="off" spellCheck={false} value={input}
        onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && input) { event.preventDefault(); clear(); } }}
        aria-label={t('Find members')} placeholder={t('Search usernames')} maxLength={60} />
      {input ? <button type="button" className="community-search-clear" aria-label={t('Clear search')} onClick={clear}><X size={14} strokeWidth={3} aria-hidden="true" /></button> : null}
    </div>
    {data.rows.length ? <ul className="community-group" aria-label={t('Members')}>
        {data.rows.map(profile => <li key={profile.user_id} className="community-member">
          <button type="button" aria-label={`@${usernameOf(profile)}`} data-focus-key={`member:${profile.user_id}`} className="community-member-open" onClick={() => navigate('member', profile.user_id, `member:${profile.user_id}`)}>
            <ProfileAvatar profile={profile} className="community-member-avatar" />
            <span className="community-member-name">{usernameOf(profile)}</span>
            {profile.user_id === userId ? <span className="community-you">{t('You')}</span> : null}
            <ChevronRight className="community-chevron-inline" size={18} aria-hidden="true" />
          </button>
        </li>)}
      </ul> : null}
    <ListStatus data={data} skeleton={<Skeleton rows={5} variant="member" />} empty={search
      ? <EmptyState icon={Search} title={t('No matching members.')}><button type="button" className="community-pill-button" onClick={clear}>{t('Clear search')}</button></EmptyState>
      : <EmptyState icon={UsersRound} title={t('No members available.')} />} />
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

function RecordStatus({ data, unavailable }) {
  if (data.loading) return <><p role="status" className="sr-only">{t('Loading Community...')}</p><Skeleton rows={2} /></>;
  if (data.error) return <ErrorState retry={data.retry} />;
  return <EmptyState icon={UsersRound} title={t(unavailable)} />;
}

function ShareDetail({ userId, id, navigate, backBar, restoreScroll }) {
  const data = useCommunityRecord(userId, id, 'detail');
  useEffect(() => { if (!data.loading) restoreScroll(); }, [data.loading, restoreScroll]);
  const share = data.value;
  return <article className="community-detail" aria-busy={data.loading}>
    {backBar}
    {!share ? <RecordStatus data={data} unavailable="This workout is private or unavailable." /> : <>
      <header className="community-detail-head">
        <AuthorButton profile={share.author} focusKey="detail-author" onOpen={() => navigate('member', share.author_id, 'detail-author')} />
        <div className="community-detail-line">
          <h2 className="community-detail-title">{share.title}</h2>
          <time className="community-detail-date" dateTime={share.performed_on}>{longDate(share.performed_on)}</time>
        </div>
      </header>
      {share.notes ? <p className="community-notes">{share.notes}</p> : null}
      <SharedWorkoutExercises share={share} />
    </>}
  </article>;
}

function MemberProfile({ userId, id, navigate, backBar, restoreScroll }) {
  const data = useCommunityRecord(userId, id, 'member');
  const [viewedPhoto, setViewedPhoto] = useState(null);
  const photoTrigger = useRef(null);
  useEffect(() => {
    if (viewedPhoto && data.value?.user_id !== viewedPhoto) setViewedPhoto(null);
  }, [data.value, viewedPhoto]);
  useEffect(() => { if (!data.loading && (!data.value || data.error)) restoreScroll(); }, [data, restoreScroll]);
  const profile = data.value;
  return <section className="community-profile" aria-busy={data.loading}>
    {backBar}
    {!profile ? <RecordStatus data={data} unavailable="Member unavailable." /> : <>
      <header className="community-hero">
        <button ref={photoTrigger} type="button" className="community-hero-photo" aria-label={t('View profile photo')} onClick={() => setViewedPhoto(profile.user_id)}>
          <ProfileAvatar profile={profile} className="community-hero-avatar" />
        </button>
        <h2 className="community-hero-name">@{usernameOf(profile)}</h2>
      </header>
      <Feed userId={userId} author={id} navigate={navigate} restoreScroll={restoreScroll} />
      {viewedPhoto === profile.user_id && <SettingsDialog title="Profile photo" showHeader={false} className="settings-photo-viewer" triggerRef={photoTrigger} onClose={() => setViewedPhoto(null)}>
        <div className="settings-photo-circle"><ProfileAvatar profile={profile} /></div>
      </SettingsDialog>}
    </>}
  </section>;
}
