# Signup Email Confirmation

## Integration

`src/services/lifeosApi.js` now imports:

```js
import { getSignupEmailRedirectTo } from '../lib/authRedirect';
```

The existing `authApi.signUp` supplies the validated redirect:

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

The Supabase connector does not expose Auth URL/template configuration. These
settings were inspected through the authenticated dashboard, not inferred from
the public `/auth/v1/settings` endpoint.
Read-only inspection on 2026-10-31 returned HTTP 200, email signup enabled,
signup not disabled, and `mailer_autoconfirm: false` (confirmation required).
On 2026-10-31, this release verified that Site URL was already correct,
added and saved the exact production origin redirect entry (the allowlist was
previously empty), and verified that Confirm sign up still uses
`{{ .ConfirmationURL }}`. The dashboard warns about built-in SMTP limits; delivery remains subject
to those limits until an appropriate SMTP configuration is provided.

At https://supabase.com/dashboard/project/wrqscqhclepwxxkazbnc/auth/url-configuration:

- Site URL: `https://lifeos-ruby-gamma.vercel.app`
- Saved production redirect entry: `https://lifeos-ruby-gamma.vercel.app`
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
Controlled production GoTrue smoke passed: password sign-in was rejected before
confirmation, a genuine one-use verification URL confirmed the disposable account,
HTTP 303 redirected to the production origin with a session fragment, confirmed
state was checked, then password sign-in/logout succeeded. The account was deleted.
`LIFEOS_RUN_AUTH_CONFIRMATION_SMOKE=true node --env-file=.env.local scripts/smoke-auth-confirmation.js`
is explicitly armed and never prints credentials/tokens or sends signup emails.
This proves GoTrue verification, not email delivery or a real mailbox click;
the actual emailed signup journey remains owner QA until recorded.

After coordinated configuration and deployment, use a fresh test mailbox:

1. Sign up; verify no session and password sign-in rejected before confirmation.
2. Inspect the email link: it must target the project's `/auth/v1/verify` with
   a one-use token and canonical `redirect_to`, not just the LifeOS homepage.
3. Click once; verify Supabase email confirmation state, correct app origin,
   session establishment and removal of the token fragment. Do not log tokens.
4. Reload, sign out and password sign in again. Test an expired/reused link,
   another browser, Community direct links, and local development separately.
5. Loading the homepage alone is not evidence of verified email ownership.

No Auth schema rerun required. The broader profile release has two targeted
migrations; see TRAINING_PROFILE_RELEASE.md for the verified production rollout.

## Official References

- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/reference/javascript/auth-signup
- https://supabase.com/docs/guides/auth/sessions/implicit-flow
