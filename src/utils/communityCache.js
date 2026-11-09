// Memory only: authenticated summaries, never detail responses or durable snapshots.
const lists = new Map();
const views = new Map();
let revision = 0;
export const COMMUNITY_FRESH_MS = 30000;
export const communityKey = (userId, kind, author, search) => JSON.stringify([userId, kind, author || '', search || '']);
export const communityRevision = () => revision;
export function readCommunityList(key) {
  const value = lists.get(key);
  if (!value || Date.now() - value.checkedAt >= COMMUNITY_FRESH_MS) { lists.delete(key); return null; }
  return value;
}
export function writeCommunityList(key, value, expectedRevision) {
  if (expectedRevision !== revision) return;
  lists.delete(key);
  lists.set(key, value);
  if (lists.size > 24) lists.delete(lists.keys().next().value);
}
export function invalidateCommunity({ refresh = true } = {}) {
  revision++;
  lists.clear();
  window.dispatchEvent(new CustomEvent('lifeos:community-invalidated', { detail: { refresh } }));
}
export function clearCommunitySession() { revision++; lists.clear(); views.clear(); }
export function rememberCommunityView(userId, hash, value) {
  const key = JSON.stringify([userId, hash]);
  views.delete(key); views.set(key, value);
  if (views.size > 40) views.delete(views.keys().next().value);
}
export const readCommunityView = (userId, hash) => views.get(JSON.stringify([userId, hash]));
