# Signup Email Confirmation

## Integration

The owner of `src/services/lifeosApi.js` must add:

```js
import { getSignupEmailRedirectTo } from '../lib/authRedirect';
```

Replace only the existing `authApi.signUp` implementation:

```js
async signUp({ email, password }) {
  return throwIfError(await requireSupabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: getSignupEmailRedirectTo() },
  }));
},
```

Production and preview builds always use `https://lifeos-ruby-gamma.vercel.app/`.
Development also defaults to production. To opt into a local return, set
`VITE_AUTH_LOCAL_REDIRECT_URL=http://127.0.0.1:5173/` in `.env.local` and allowlist
that exact URL in Supabase. It must match the current browser origin, use HTTP(S)
and a loopback host (localhost, 127.0.0.1, or [::1]), and contain no credentials,
path beyond `/`, query or fragment. Different ports require explicit matching
configuration and allowlist entries. Never set a local override in production.

## Dashboard Status

The connected Supabase tool only exposes documentation search, not Auth admin
configuration. The public `/auth/v1/settings` endpoint cannot expose the Site
URL, redirect allowlist or email template. This code slice has not independently
inspected those dashboard values or changed production settings/accounts.
Read-only inspection on 2026-10-31 returned HTTP 200, email signup enabled,
signup not disabled, and `mailer_autoconfirm: false` (confirmation required).
On 2026-10-31, the dashboard owner verified that Site URL was already correct,
added and saved the exact production redirect entry (the allowlist was previously
empty), and verified that Confirm sign up still uses `{{ .ConfirmationURL }}`.
These dashboard changes were made by the owner, not this code slice. The
dashboard warns about built-in SMTP production limits; delivery remains subject
to those limits until an appropriate SMTP configuration is provided.
Do not edit the dashboard concurrently with the owner.

At https://supabase.com/dashboard/project/wrqscqhclepwxxkazbnc/auth/url-configuration:

- Site URL: `https://lifeos-ruby-gamma.vercel.app`
- Exact production redirect entry: `https://lifeos-ruby-gamma.vercel.app/`
- Keep only required explicit local-development redirect entries. No production
  wildcard or preview domain is needed for this signup flow.

At https://supabase.com/dashboard/project/wrqscqhclepwxxkazbnc/auth/templates,
Confirm sign up must retain a genuine verification link:

```html
<a href="{{ .ConfirmationURL }}">Confirm email address</a>
```

Keep Confirm email enabled in the Email provider settings. Do not replace the
link with SiteURL/RedirectTo, auto-confirm users, or disable email verification.
An unallowlisted redirect can fall back to the Site URL; code alone cannot fix
incorrect dashboard settings. Previously issued emails may retain their old
destination; request a fresh email after the coordinated rollout.

## Fragment Handling

The installed Supabase SDK consumes the implicit access/refresh-token fragment,
validates the access token via Auth `/user`, persists the returned session and
clears the hash on success. `LifeOSContext.getSession()` waits for SDK
initialization; `App` gates all tab rendering on auth readiness. Community only
reads its own hashes after authentication. Workout restoration runs after auth.
No custom token parser, `verifyOtp`, PKCE exchange or early hash rewrite is needed.
The redirect helper deliberately returns `/` without a navigation fragment.
AuthScreen continues to announce email confirmation and remain signed out when
signup returns no session. Failed/expired links must never be treated as success.

## Validation

Run `node scripts/test-auth-redirect.js`, `npx playwright test tests/ui/auth.spec.js`,
`npm run test:brain`, `npm run build`, and `git diff --check`.
The isolated SDK tests use mocked Auth responses, not real verification evidence.
Local results on 2026-10-31: 28 redirect-policy cases and 7 installed-SDK
scenarios passed; all 10 existing auth UI cases passed on rerun after an initial
local QA server connection-refused run. Brain regression harness and production
build passed (existing >500 kB chunk warning); `git diff --check` passed.
The owner is handling any controlled disposable-account/generated-link smoke.
Generated-link verification is not proof of email delivery or a real inbox click;
the actual inbox signup/confirmation journey remains owner QA until recorded.

After coordinated configuration and deployment, use a fresh test mailbox:

1. Sign up; verify no session and password sign-in rejected before confirmation.
2. Inspect the email link: it must target the project's `/auth/v1/verify` with
   a one-use token and canonical `redirect_to`, not just the LifeOS homepage.
3. Click once; verify Supabase email confirmation state, correct app origin,
   session establishment and removal of the token fragment. Do not log tokens.
4. Reload, sign out and password sign in again. Test an expired/reused link,
   another browser, Community direct links, and local development separately.
5. Loading the homepage alone is not evidence of verified email ownership.

No schema rerun required. No commit or production deployment is part of this slice.

## Official References

- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/reference/javascript/auth-signup
- https://supabase.com/docs/guides/auth/sessions/implicit-flow
