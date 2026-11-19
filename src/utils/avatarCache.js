// Authorization and decoded images stay in memory, scoped to the viewer.
export function createAvatarCache({ now = Date.now, prepare = url => url, release = () => {} } = {}) {
  const entries = new Map();
  const key = (viewer, profile) => `${viewer || ''}:${profile?.avatar_path || profile?.avatar_url || ''}`;
  const drop = id => {
    const row = entries.get(id);
    entries.delete(id);
    if (row?.url) release(row.url);
  };
  return {
    peek(viewer, profile) { const row = entries.get(key(viewer, profile)); return row?.expires > now() ? row.url : null; },
    remaining(viewer, profile) { return Math.max(0, (entries.get(key(viewer, profile))?.expires || 0) - now()); },
    async load(viewer, profile, loader, force = false) {
      if (!viewer || (!profile?.avatar_path && !profile?.avatar_url)) return null;
      const id = key(viewer, profile);
      let row = entries.get(id);
      if (row?.pending) return row.pending;
      if (!force && row?.expires > now() + 30000) return row.url;
      row ||= {};
      entries.set(id, row);
      row.pending = Promise.resolve().then(async () => {
        const signed = await loader(profile, viewer);
        if (entries.get(id) !== row) return null;
        const previous = row.url;
        const url = signed ? await prepare(signed, profile, force ? null : previous) : null;
        if (entries.get(id) !== row) {
          if (url && url !== previous) release(url);
          return null;
        }
        if (previous && previous !== url) release(previous);
        row.url = url;
        row.expires = now() + 300000;
        return url;
      }).catch(error => {
        if (entries.get(id) === row && (!row.url || isAvatarAccessDenied(error))) drop(id);
        throw error;
      }).finally(() => { row.pending = null; });
      return row.pending;
    },
    invalidate(viewer, profile) { drop(key(viewer, profile)); },
    clear() { for (const id of entries.keys()) drop(id); },
  };
}

export function isAvatarAccessDenied(error) {
  return [401, 403, 404].includes(Number(error?.statusCode || error?.status));
}

async function decodeAvatar(url) {
  const image = new Image();
  image.referrerPolicy = 'no-referrer';
  image.src = url;
  await image.decode();
}

async function prepareAvatar(url, profile, previous) {
  if (!profile.avatar_path) {
    // Legacy hosts may allow image embedding without allowing a CORS fetch.
    if (url !== previous) await decodeAvatar(url);
    return url;
  }
  // Uploaded paths are immutable. Refresh access without downloading again.
  if (previous) return previous;
  const response = await fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (response.status !== 200) throw Object.assign(new Error('Profile photo download failed'), { status: response.status });
  const blob = await response.blob();
  const bytes = new DataView(await blob.arrayBuffer());
  // Some decoders accept truncated JPEGs and paint only the rows they have.
  const jpeg = bytes.byteLength >= 2 && bytes.getUint16(0) === 0xffd8;
  const webp = bytes.byteLength >= 12 && bytes.getUint32(0) === 0x52494646 && bytes.getUint32(8) === 0x57454250;
  if ((jpeg && bytes.getUint16(bytes.byteLength - 2) !== 0xffd9) || (webp && bytes.getUint32(4, true) + 8 > bytes.byteLength)) {
    throw new Error('Incomplete profile photo');
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    await decodeAvatar(objectUrl);
    return objectUrl;
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export const avatarCache = createAvatarCache({
  prepare: prepareAvatar,
  release: url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); },
});
