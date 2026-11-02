export const PRODUCTION_AUTH_REDIRECT_URL = 'https://lifeos-ruby-gamma.vercel.app/';

// Keep the standard ConfirmationURL implicit flow; the SDK owns token validation
// and fragment cleanup before the authenticated app (and Community router) mounts.
export const SUPABASE_AUTH_OPTIONS = {
  flowType: 'implicit',
  detectSessionInUrl: true,
  persistSession: true,
  autoRefreshToken: true,
};

export function getSignupEmailRedirectTo({
  isDevelopment = import.meta.env?.DEV === true,
  localRedirectUrl = import.meta.env?.VITE_AUTH_LOCAL_REDIRECT_URL,
  currentOrigin = globalThis.window?.location?.origin,
} = {}) {
  if (isDevelopment !== true || !localRedirectUrl || !currentOrigin) return PRODUCTION_AUTH_REDIRECT_URL;

  try {
    const url = new URL(localRedirectUrl);
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!isLoopback || !['http:', 'https:'].includes(url.protocol)
      || url.origin !== currentOrigin || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) return PRODUCTION_AUTH_REDIRECT_URL;
    return url.href;
  } catch {
    return PRODUCTION_AUTH_REDIRECT_URL;
  }
}
