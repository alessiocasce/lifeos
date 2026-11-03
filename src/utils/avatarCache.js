// Authorization is viewer-scoped; neither signed URLs nor tokens touch storage.
export function createAvatarCache({ now = Date.now } = {}) {
  const entries = new Map();
  let generation = 0;
  const key = (viewer, profile) => `${viewer || ''}:${profile?.avatar_path || profile?.avatar_url || ''}`;
  return {
    peek(viewer, profile) { const row = entries.get(key(viewer, profile)); return row?.expires > now() ? row.url : null; },
    remaining(viewer, profile) { return Math.max(0, (entries.get(key(viewer, profile))?.expires || 0) - now()); },
    async load(viewer, profile, loader, force = false) {
      if (!viewer || (!profile?.avatar_path && !profile?.avatar_url)) return null;
      const id = key(viewer, profile);
      let row = entries.get(id);
      if (row?.pending) return row.pending;
      if (!force && row?.expires > now() + 30000) return row.url;
      const version = generation;
      row ||= {};
      entries.set(id, row);
      row.pending = Promise.resolve().then(() => loader(profile, viewer)).then(url => {
        if (version === generation && entries.get(id) === row) { row.url = url; row.expires = now() + 300000; }
        return version === generation ? url : null;
      }).catch(error => { if (entries.get(id) === row) entries.delete(id); throw error; }).finally(() => { row.pending = null; });
      return row.pending;
    },
    invalidate(viewer, profile) { entries.delete(key(viewer, profile)); },
    clear() { generation++; entries.clear(); },
  };
}
export const avatarCache = createAvatarCache();
