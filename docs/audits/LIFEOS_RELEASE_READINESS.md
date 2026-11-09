# LifeOS Release Readiness

## Verdict

### Authorized launch attempt (2026-11-09)

Backup gate subsequently PASSED: encrypted full pg_dump archive and native isolated
restore of10 affected/auth tables have matching full-row digests/counts and zero
orphan ownership references. See the launch report's scoped recovery evidence.

The owner has now authorized release execution, conditional on backup/restore,
hosted CI and integrity gates. The prior local-review restrictions below describe
the earlier review, not the new authorization. Current evidence and blockers are
tracked in [LIFEOS_PRODUCTION_LAUNCH.md](LIFEOS_PRODUCTION_LAUNCH.md).
Feature branch and PR2 now exist. Hosted CI passed on3503f30 (45 Chromium,
3 WebKit,13 helpers plus database/backend/build/PWA gates). Production launch is
**BLOCKED** solely at the mandatory unverified backup/restore gate; main has not
been merged, no migrations applied and background notifications remain gated.
The selected scheduler is now Supabase Cron, with a fourth disabled-by-default
forward migration `20261109024936_workout_push_cron.sql`. Oracle is fallback only.
No scheduler or production migration may be enabled before backup verification.

**READY FOR RELEASE APPROVAL** for the reviewed local implementation. This is NOT
a claim of deployed notification delivery or authority to deploy. The production
configuration, hosted CI and physical-device gates below remain mandatory.

Branch: `codex/lifeos-ui-modernization`; HEAD remains `23a4b6256c9b86b8f8cf64bc458fc3f0429623ac`.
All modernization/correction changes remain uncommitted and unstaged. No push,
deployment, migration execution or production user-data write occurred. Existing
Rankings planning and unrelated work were preserved. No schema rerun required.

## Final Corrections

- Owner-confirmed Barbell Curl uses `a2bc1c95-14c7-558d-a56b-0973cc4793dd` only,
  English **Barbell Curl**, Italian **Curl con bilanciere EZ**, equipment `ez_bar`.
  EZ-Bar Curl, EZ Bar Curl and Italian names remain searchable. The retired
  `860c2371-8592-5ad9-aa43-805984020e52` definition/FK survives, inactive.
- The pending migration reconciles old UUID and exact confirmed text-only sources,
  ordered snapshots and sanitized Community projections. It preserves authored
  text, session/set IDs, every performance field, ownership and source timestamps.
  It normalizes future stale/offline writes too. Other curls are not merged.
- JS identity/display and authenticated writes agree with SQL; Last Time combines
  old/new/text curl records. Catalog stays 224 entries, 79 active, 145 inactive.
- Fault injection proved a failed timer replacement originally left the old timer
  armed. Its insert now has a separate exception subtransaction: set logging and
  old cancellation survive. Broader timer failures remain fail-open for set saves.
- Notification configuration requires keys, subject, dispatch secret and enabled
  worker flag. Registration/removal, ownership and actual encrypted/signature
  payload construction are tested. A separate supervised worker is prepared.
- Expired recovery URL errors now offer another reset without displaying untrusted
  URL error details. Existing reset input/retry behavior is retained.
- Compatible dependency patches remove all seven high findings; six low/moderate
  build-tool findings remain explicitly documented, not hidden with a force fix.

## Read-only Production Preflight

Project connector verified **LifeOS / wrqscqhclepwxxkazbnc / eu-west-1 /
ACTIVE_HEALTHY / PostgreSQL17.6**, on 2026-11-08. Latest recorded migration:
`20261103154140_workout_history_atomic_delete`. All three pending versions are absent.
No `pg_cron`/`pg_net` extensions or new push tables currently exist.

Run [release-preflight.sql](sql/release-preflight.sql) again immediately before an
authorized rollout. It is SELECT-only and returns aggregate counts and protected
source digests, never private records/credentials. A fresh baseline is mandatory if
members train between this capture and rollout.

| Table / representation | Observed before | Expected after approved migration (NOT executed) |
| --- | --- | --- |
| workouts | 54 rows; 3 snapshots need identity correction | 54 rows; 3 snapshots changed, all other fields unchanged |
| workout_sets | 564 rows; 9 retired curl IDs, 9 canonical, 0 confirmed text-only | 564 rows; 18 canonical, 0 retired; 9 exercise_id-only changes |
| workout_templates | 7 rows | 7 unchanged |
| workout_template_exercises | 31 rows; 0 retired, 2 canonical, 0 text-only | 31 rows; no existing source changes |
| template_snapshot entries | 86; 3 retired, 2 canonical | 86; 5 canonical, 0 retired, same order/text/extra fields |
| Community sets | 564 projected entries; 9 retired, 9 canonical across 3 affected shares | 564 entries; 18 canonical, 0 retired; 3 sanitized shares refreshed, IDs retained |
| exercise_catalog | Existing retired definition inactive; EZ active | One metadata row corrected (Italian label); UUIDs/slugs/equipment unchanged |
| exercise_aliases | 4 of 5 confirmed target aliases exist; 1 equivalent alias still bound to retired ID | Add 1 canonical alias, remove 1 duplicate retired binding; retain straight-specific legacy definition alias |
| user_profiles | 1 uppercase username; 0 lower(trim()) collision groups | Normalize 1 username; preserve user IDs, photo paths and public links |
| user_preferences | 3 English, 3 Italian; sharing ON/notes OFF for all 6 | Existing rows/settings unchanged; new/unset defaults it/ON/OFF |

Protected preflight digests (expected unchanged absent concurrent user writes):
sets `c5570c0c709f00aed92a592db55e4669`; template exercises
`db97a3a7c27b73a23890161cdac2f23d`; workouts excluding snapshots
`e3341287b6f37914d58a2a2705856bad`; ordered snapshot content excluding exercise_id
`e8a635cbab2371b532e779a28cd8ced3`.

Schema-wide typed-reference inventory found exercise_catalog FKs only in
exercise_aliases, workout_sets and workout_template_exercises; relevant JSON
references are workouts.template_snapshot and community_workout_shares.sets.
No unsupported snapshot shapes were found. Private workout/template/preference RLS
is enabled. No private UUID/account IDs were embedded in committed-source candidates.

### Actual Isolated Before/After Evidence

`node scripts/test-curl-reconciliation.js` uses two synthetic owners and the real
automatic Community triggers. Eight source sets and eight template exercises
remain eight: four IDs change in each table; all other fields deep-equal their
original records. Four of six snapshot entries change identity across two workouts.
Two shares refresh with stable IDs, four sets/two exercise groups each, notes still
hidden. Second migration run changes zero source/projection values. A stale-client
insert afterward also resolves to the canonical UUID. A/B/anonymous access is tested.
These are actual local results, not an assertion of a production post-migration run.

## Exact Pending Migration Sequence

1. `20261108120000_workout_web_push.sql`
2. `20261108121000_curl_catalog_identity.sql`
3. `20261108220000_settings_identity_defaults.sql`

The exact sequence was rehearsed on a production-compatible isolated schema,
including all applied identity/media/history prerequisites. It preserves existing
English and explicit sharing OFF, historical ended_at, Community, owner isolation
and live timer scheduling/end cancellation. No historical timer is armed.

The push migration is **ledger-once**, not blindly replayable CREATE TABLE SQL.
Curl and identity corrections are repeat-safe in tests. Use the existing targeted
migration connector after approval; never broad `supabase db push` or schema.sql.
Verify ledger and seal any connector-assigned version/filename together. If any
pending version is unexpectedly already recorded elsewhere, do not rewrite it:
stop and prepare a forward reconciliation. Applied historical SQL was not changed.

Privileged push functions have fixed empty search_path, owner-scoped cancellation,
service-only claims, hidden delivery capabilities and no arbitrary destination.
Curl normalization is an unexposed invoker trigger, not an admin RPC. Identity
normalization aborts collisions and does not use user metadata for authorization.

## Backup, Deployment Order and Recovery

Before production approval: verify backup/PITR availability and retention in the
Supabase dashboard; this task did NOT verify the plan's restore capability or make
a backup. Take an encrypted consistent backup/export of the affected catalog,
aliases, sources, snapshots, profiles, preferences and projections; verify a restore
in isolation. Record protected digests/counts and current Git/Vercel SHA. Do not put
backups or private rows in this repo.

After explicit authorization: review/stage intended files only -> commit -> publish
the feature branch/open a PR for credential-free hosted CI (not production main) ->
recheck project/ledger/baseline -> apply the three
targeted migrations transactionally -> inspect definitions/grants/counts/digests ->
push reviewed main -> verify automatic Vercel READY and production alias/SHA ->
configure/start/verify worker -> controlled post-deployment smoke -> device acceptance.
Use a quiet maintenance window and bounded lock/statement timeouts (e.g.5s/30s,
validated against the chosen connector); abort rather than wait indefinitely.

On SQL failure, transaction rollback must restore data and trigger modes; do not
continue to deploy. On code failure, additive DB objects can remain while restoring
the reviewed compatible code. Disable worker flag/stop only the push process and
invalidate pending tokens before recovery. Never undo the confirmed identity by
guessing a reverse map; use the secured preflight backup and a reviewed forward fix.
No destructive reverse migration or old schema replay is an acceptable rollback.

## Notification Configuration and Operating Gate

Selected: separate Oracle Node24/PM2 single-instance process, not the WhatsApp
bridge. Config: `ops/workout-push/ecosystem.config.cjs`; complete setup, comparison,
cadence/cost, heartbeat and incident instructions: [WORKOUT_WEB_PUSH.md](../WORKOUT_WEB_PUSH.md).
Supabase Cron seconds are technically viable, but pg_cron/pg_net/Vault setup is
not present or authorized. Standard Vercel Cron is not the selected sub-minute worker.

| Environment | Required variables (values omitted) |
| --- | --- |
| Vercel server | Existing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY; LIFEOS_PUSH_PUBLIC_KEY, LIFEOS_PUSH_PRIVATE_KEY, LIFEOS_PUSH_SUBJECT, LIFEOS_PUSH_DISPATCH_SECRET, LIFEOS_PUSH_WORKER_ENABLED |
| Oracle worker protected env file | LIFEOS_PUSH_ORIGIN, LIFEOS_PUSH_DISPATCH_SECRET |
| Browser | Existing safe VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY only; VAPID public key obtained through authenticated config |

Do not put private VAPID/service-role/worker credentials in VITE variables, logs,
URLs, code or Git. No real VAPID keys were generated here. Foreground countdown
works independently of background setup. Configuration flags are not health proof.
Worker capacity/access, Vercel usage allowance (~518,400 idle polls/30days), billing
alerts, supervision/reboot recovery and independent heartbeat alarm remain unverified.

## Focused Validation

| Command / check | Actual result in this correction pass |
| --- | --- |
| node --test tests/settings/*.test.js tests/workout/modernTraining.test.js tests/workout/modernWorkoutApi.test.js tests/workout/exerciseSelectorLabels.test.js | 13 passed |
| node scripts/test-curl-reconciliation.js | Passed preservation, aliases/parity, projections, idempotency and A/B/anon |
| node scripts/test-release-migrations.js | Passed exact sequence and coexistence |
| node scripts/test-settings-identity.js | Passed defaults, English/OFF retention, collision abort, photo/identity preservation and RLS |
| npm run test:workout:push | All five harnesses passed: helper, PostgreSQL, API/crypto/registration, SW, operational worker |
| npm run test:workout | 11 render states plus continuity storage passed; expected SSR useLayoutEffect warning only |
| node scripts/test-workout-history-db.js; node scripts/test-workout-mutation-guards.js | Passed atomicity, concurrency, historical completion, Community and service guards |
| npm run test:social-training; npm run test:community; npm run test:schema; npm run test:brain | Passed |
| Focused Chromium: modern-training, modern-settings, workout-push, auth-recovery, workout-continuity, shell-continuity | Final stable run: 40 passed |
| Focused WebKit on the same high-risk surfaces | Final run: 8 passed |
| npm run test:pwa | Passed real local production-mode Workbox A->B guarded update, storage and no-other-tab reload |
| npm run build (LIFEOS_ANALYZE_BUNDLE=true) | Passed Vite6.4.5 / generateSW; 38 precache entries; entry632.59kB /171.55kB gzip warning remains |
| npm run check:functions | Passed: 7 |
| JS/CJS syntax; catalog/generator seals; git diff --check | Passed |
| Actual GitHub Ubuntu workflow run | Pending: new workflow uncommitted; act/Docker unavailable locally. Equivalent commands run locally, not proof of hosted CI |

Test issues were investigated, not hidden: the initial Last Time test used an
incorrect button role for details/summary; final region/summary interaction passes.
The initial WebKit photo case failed because the fixture network guard blocked
same-origin blob: decoding. An isolated reproduction proved this; the guard now
permits only the fixture origin, including local blobs. Real photo code was unchanged.
Final suites ran serially to avoid Playwright artifact-directory interference.

Visuals were reviewed, not redesigned: actual 390px Training and floating timer
screenshots are in `lifeos-ui/screenshots/release-training-390.png` and
`release-rest-settings-390.png`. Existing Settings/History/Community screenshots were
retained. Tests cover375/390/430 and1024/1440. Agent-browser axe scan on timer dialog:
0 violations, 1 incomplete contrast rule on gradient/overlap; labels/help were manually
reviewed. Emulation/desktop WebKit do not establish physical Safari acceptance.

## Dependencies and Performance

See [DEPENDENCY_RELEASE_AUDIT.md](DEPENDENCY_RELEASE_AUDIT.md) and structured
`dependencies/before.json` / `after.json` for each version, parent chain, vulnerability,
affected range and remediation. Compatible `npm audit fix` changed32 packages and
removed1; no force, framework major, PWA downgrade or transitive override.
Remaining6 findings: deepmerge and its resolver chain(low), glob/minimatch and
Workbox/PWA chains(moderate). None high/critical. These are trusted-input build-tool
risks requiring explicit acceptance/upstream follow-up, not a clean audit.
Browserslist data refreshed; the stale warning is gone. Entry attribution identifies
Supabase SDK, React DOM, catalog/context/localization; warning not suppressed and
no risky auth-loading architecture change was added just to hide it.

## Post-deployment Smoke and Physical Acceptance (Pending)

1. Confirm deployment SHA/alias, startup/auth, English retained, new Italian/ON/OFF
   defaults, username/photo UI and member links without changing real records.
2. Re-run SELECT preflight, compare totals/protected digests and inspect new RLS,
   function grants/search_path, triggers/indexes, 0 retired source references and
   the expected curl catalog/projection count. Review relevant Supabase advisors.
3. With a controlled account, verify subscription registration/removal, unauthenticated
   rejection, owner boundaries, one due delivery, replacement/OFF/end cancellation,
   missing/invalid subscriptions and expiry. Clean up QA data; do not fabricate gym
   records in the owner's real History. Provider acceptance is not OS delivery.
4. On a real supported iPhone Home Screen PWA: enable through a direct gesture,
   save a valid set, lock phone and confirm exactly the expected rest notification.
   Repeat with app backgrounded and killed; compare server deadline/worker logs and
   receipt time. Test replacement, cancel, timer OFF, notifications OFF, workout end,
   expiry/offline return, account logout/switch, permission denied/revoked, cold launch
   dock and guarded PWA update. Already displayed notifications cannot be unsent.
5. Real email recovery: verify approved production redirect allowlist and email
   template/provider; request from a controlled account, follow once, change password,
   sign in, then test reused/expired link, failed-network retry and absence of token
   logging. No real email or production password change occurred locally.

## Approval Gates and Limits

Skills applied in this final pass: TDD/systematic-debugging produced failing curl
and timer-fault regressions before fixes and traced the WebKit blob failure to its
test guard. Supabase/Postgres guidance informed locks, invoker triggers, grants and
two-user RLS rehearsal. React performance guidance informed measured bundle
attribution instead of an unnecessary context rewrite. Agent-browser plus the
frontend-design/anti-ui-slop/web-design-guidelines review preserved the approved
screens and checked the actual floating dialog/accessibility; no redesign or paid
reference-library access is claimed.

- Owner approval is still required for any commit/push/deployment/migration.
- Before rollout: verified backup/restore, fresh preflight, hosted CI, dependency-risk
  acceptance, operational host capacity/billing and secure VAPID/worker setup.
- Before declaring push operational: deployed controlled smoke and physical iPhone
  acceptance, not just a configured flag or an HTTP200 response.
- Remaining transport limits: OS/network/power delays, small verification-to-display
  race, no automatic ambiguous-send retries, no exactly-once OS guarantee, and no
  measured server/client clock-skew correction. Cancellation cannot retract an
  already displayed alert. Long-term timer/subscription retention needs bounded
  operational maintenance before scale.
- Save-as-template remains a device-locked/retry-resumable existing multi-call API,
  not cross-device exactly-once creation. No new speculative architecture was added.
- No production delivery, real email recovery, hosted CI or physical iPhone pass is
  claimed. Rankings/gamification are unchanged. Stop here for owner review.
