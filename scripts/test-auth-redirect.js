import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { getSignupEmailRedirectTo, PRODUCTION_AUTH_REDIRECT_URL } from '../src/lib/authRedirect.js';

const canonical = PRODUCTION_AUTH_REDIRECT_URL;
let checks = 0;
function checkRedirect(options, expected = canonical) {
  assert.equal(getSignupEmailRedirectTo(options), expected);
  checks += 1;
}

checkRedirect();
for (const currentOrigin of [undefined, 'http://localhost:3000', 'https://preview.vercel.app', canonical.slice(0, -1)]) {
  for (const isDevelopment of [false, 'true']) {
    checkRedirect({ currentOrigin, isDevelopment, localRedirectUrl: 'http://localhost:3000/' });
  }
}
checkRedirect({ isDevelopment: true, currentOrigin: 'http://localhost:5173' });
for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173', 'https://localhost:5173']) {
  checkRedirect({ isDevelopment: true, currentOrigin: origin, localRedirectUrl: `${origin}/` }, `${origin}/`);
}
for (const localRedirectUrl of [
  'not a URL', '//localhost:5173/', 'javascript:alert(1)', 'file:///tmp/',
  'https://evil.test/', 'http://localhost.evil.test:5173/', 'http://127.0.0.2:5173/',
  'http://localhost:3000/', 'http://user:password@localhost:5173/',
  'http://localhost:5173/community', 'http://localhost:5173/?redirect_to=https://evil.test',
  'http://localhost:5173/#members', 'http://localhost:5173/#access_token=private',
]) {
  checkRedirect({ isDevelopment: true, currentOrigin: 'http://localhost:5173', localRedirectUrl });
}
checkRedirect({ isDevelopment: true, currentOrigin: 'https://preview.vercel.app', localRedirectUrl: 'https://preview.vercel.app/' });
console.log(`PASS ${checks} redirect policy cases`);

// Bundle the installed SDK and the same options imported by supabaseClient.
// All network responses below are fixtures; no real account or email is created.
const bundle = await build({
  stdin: {
    contents: `import { createClient } from '@supabase/supabase-js';
      import { SUPABASE_AUTH_OPTIONS } from './src/lib/authRedirect.js';
      window.createTestClient = () => createClient('https://auth.example.test', 'fixture-anon-key', {
        auth: { ...SUPABASE_AUTH_OPTIONS, autoRefreshToken: false },
      });`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
});
const browser = await chromium.launch();
const confirmedUser = {
  id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.test',
  aud: 'authenticated', role: 'authenticated', email_confirmed_at: '2026-10-31T00:00:00Z',
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-31T00:00:00Z',
};
try {
  for (const scenario of ['confirmation', 'invalid-token', 'expired-link', 'members', 'member', 'share', 'signup']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests = [];
    let allowPasswordSignIn = false;
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === new URL(canonical).origin && request.isNavigationRequest()) {
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated Auth SDK QA</title>' });
      }
      assert.equal(url.origin, 'https://auth.example.test', 'Unexpected external request');
      requests.push({ path: url.pathname, search: url.searchParams, body: request.postDataJSON() });
      if (url.pathname === '/auth/v1/user') {
        return route.fulfill({ status: scenario === 'invalid-token' ? 401 : 200, json: scenario === 'invalid-token'
          ? { code: 'bad_jwt', msg: 'Invalid token' } : confirmedUser });
      }
      if (url.pathname === '/auth/v1/signup') {
        return route.fulfill({ json: { ...confirmedUser, email_confirmed_at: null, identities: [] } });
      }
      if (url.pathname === '/auth/v1/token') {
        return route.fulfill({ status: allowPasswordSignIn ? 200 : 400, json: allowPasswordSignIn
          ? { access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user: confirmedUser }
          : { error_code: 'email_not_confirmed', msg: 'Email not confirmed' } });
      }
      if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
      throw new Error(`Unexpected Auth endpoint: ${url.pathname}`);
    });
    const tokenHash = '#access_token=fixture-access&refresh_token=fixture-refresh&expires_in=3600&token_type=bearer&type=signup';
    const hash = ['confirmation', 'invalid-token'].includes(scenario) ? tokenHash
      : scenario === 'expired-link' ? '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
        : scenario === 'members' ? '#members' : scenario === 'member' ? '#member=fixture-id'
          : scenario === 'share' ? '#share=fixture-id' : '';
    await page.goto(`${canonical}${hash}`);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(async () => {
      window.client = window.createTestClient();
      const initialized = await window.client.auth.initialize();
      const { data, error } = await window.client.auth.getSession();
      return { userId: data.session?.user?.id ?? null, error: initialized.error?.message ?? error?.message ?? null, hash: location.hash };
    });
    if (scenario === 'confirmation') {
      assert.equal(result.userId, confirmedUser.id);
      assert.equal(result.error, null);
      assert.equal(result.hash, '');
      assert.equal(requests.filter(r => r.path === '/auth/v1/user').length, 1);
      await page.reload();
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      assert.equal(await page.evaluate(async () => {
        window.client = window.createTestClient();
        return (await window.client.auth.getSession()).data.session?.user.id;
      }), confirmedUser.id);
      assert.equal(await page.evaluate(async () => {
        await window.client.auth.signOut();
        return (await window.client.auth.getSession()).data.session;
      }), null);
      allowPasswordSignIn = true;
      assert.equal(await page.evaluate(async () => (await window.client.auth.signInWithPassword({
        email: 'fixture@example.test', password: 'fixture-password',
      })).data.session?.user.id), confirmedUser.id);
    } else {
      assert.equal(result.userId, null);
      if (['invalid-token', 'expired-link'].includes(scenario)) assert.ok(result.error);
      else assert.equal(result.error, null);
      assert.equal(result.hash, hash, 'Non-success fragments must not be rewritten by app navigation');
    }
    if (scenario === 'signup') {
      const signup = await page.evaluate(async (emailRedirectTo) => {
        const { data, error } = await window.client.auth.signUp({
          email: 'fixture@example.test', password: 'fixture-password', options: { emailRedirectTo },
        });
        const signIn = await window.client.auth.signInWithPassword({ email: 'fixture@example.test', password: 'fixture-password' });
        return { session: data.session, error: error?.message ?? null, signInSession: signIn.data.session, signInCode: signIn.error?.code };
      }, canonical);
      assert.deepEqual(signup, { session: null, error: null, signInSession: null, signInCode: 'email_not_confirmed' });
      assert.equal(requests.find(r => r.path === '/auth/v1/signup').search.get('redirect_to'), canonical);
    }
    console.log(`PASS installed SDK: ${scenario}`);
    await context.close();
  }
} finally {
  await browser.close();
}
