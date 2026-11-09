# LifeOS Production Launch

## Latest Verified State (2026-11-09 03:39 UTC)

Backup/recovery and hosted CI gates PASSED. Four targeted migrations applied via
the connected Supabase migration tool, without replaying historical gaps:

| Migration | Production-assigned version |
| --- | --- |
| workout_web_push | 20261109033543 |
| curl_catalog_identity | 20261109033551 |
| settings_identity_defaults | 20261109033558 |
| workout_push_cron | 20261109033605 |
| workout_push_transport_guard | 20261109034356 |

Source counts remain54 workouts,564 sets,7 templates,31 template exercises.
All four protected digests match preflight. Curl references:18 canonical/0 retired
sets,5 canonical/0 retired snapshots,18 canonical/0 retired Community sets.
Username normalization completed with0 collisions; existing3 English/3 Italian
preferences and all notes-private settings are unchanged. New push tables have
RLS, zero historical timers; service-only subscription reads have no client policy.
Private scheduler functions have fixed empty search paths and postgres-only grants.

**Notification security gate:** managed pg_net ignores postgres REVOKE of
supabase_admin-owned PUBLIC grants. Verified effective authenticated SELECT remains
true. No dispatch/VAPID secret has been created or exposed. Production worker flag
is explicitly false, dispatch Cron inactive, scheduler control disabled. A tested
forward guard is now applied and verified: calling the scheduler records
`unsafe_transport_permissions`, keeps it disabled and enqueues zero HTTP requests.
Oracle fallback access is unavailable (no configured host/key). Background Web Push
must not be called operational until this is resolved. Foreground countdown is
independent. No paid services or plan changes were made.

Hosted run42557692854 ond23c899 succeeded, including the new regression that
reproduced and then prevented credential use through a PUBLIC-readable queue.
Production still serves the previous main commit pending final ledger sealing.
Transaction-scoped production timer smoke passed OFF/scheduling/expiry/idempotency,
replacement/disable/end/historical-no-arm checks. All temporary rows rolled back.
No actual transport delivery is claimed; HTTP and OS delivery remain untested.
Earlier attempt sections below are historical evidence, not current gate status.

## Current Attempt: 2026-11-09

**LIFEOS - LAUNCH BLOCKED: production backup/isolated restore not verified.**
Superseded at2026-11-09 03:28UTC: the owner supplied the connection and native
encrypted backup/scoped restore verification PASSED. Release execution resumes;
the earlier blocked status below is retained as history, not the current gate.
Status recorded at2026-11-09 03:02UTC (04:02Europe/Rome). No new production
deployment occurred; there is no release/deployment timestamp for the new version.

Owner-authorized execution on `codex/lifeos-ui-modernization`, production branch
`main`, baseline `23a4b6256c9b86b8f8cf64bc458fc3f0429623ac`.

## Mandatory Gates

- GitHub repository is public, default branch main, authenticated account has
  administrative/push permissions. Actions enabled; declared checkout/setup-node
  tags exist. Workflow authorization was refreshed and now includes workflow scope.
- Supabase organization is **Free**, production LifeOS project
  `wrqscqhclepwxxkazbnc`, PostgreSQL17.6. Database size observed about22.4MB.
  pg_cron1.6.4 and pg_net0.20.0 are available, not installed. Vault0.3.1 is installed.
- Vercel existing LifeOS project is `prj_knu6xjJQj3e2gBJkki82HAfu6XeD`, team
  `lifeos2`, plan **Hobby**, Node24. Production domain remains
  https://lifeos-ruby-gamma.vercel.app/ . No new project was created.
- **Backup restore not yet demonstrated.** No PostgreSQL connection password/URL
  is available locally. Free plan does not provide the paid managed-backup
  retention guarantee; official guidance recommends CLI logical dumps. No upgrade
  or paid branch/PITR was purchased. A supported dump/isolated restore is a hard gate.
  The requested missing capability is `LIFEOS_BACKUP_DATABASE_URL` in ignored
  `.env.local`, not a credential pasted into chat. No recovery copy currently exists.

## Scheduler

Preferred and prepared: Supabase Cron,10second due-only check, pg_net POST to the
existing authenticated dispatch endpoint, Vault-held dispatch credential. Fourth
forward migration `20261109033605_workout_push_cron.sql` is local/unapplied.
Job and private control start disabled. No Oracle process was started.

Estimated259200 DB checks/month, zero idle HTTP/function calls, plus actual due
timer dispatches. Current actual Vercel/Supabase consumption and resulting latency
remain unmeasured; no claim of free/unlimited capacity. No paid resources enabled.
Own cron history retention2days and finished-timer retention30days are prepared.
HTTP failure breaker disables dispatch after3 consecutive failures. External alert
delivery is not configured or claimed. See WORKOUT_WEB_PUSH.md for kill switches.

## Git / CI / Deployment

This section is updated with actual commit, PR and hosted results during execution.
No merge or production promotion is permitted while the backup gate is unresolved.
Private reference images, local screenshots, environment files, backups, temporary
test results and existing Rankings plans are excluded from the release commit.

- Implementation commit: `b8302fc88bf7bc061fb43299fff96b8efe48122f`, pushed to
  the feature branch. Draft PR: https://github.com/alessiocasce/lifeos/pull/2 .
- Initial hosted run42553569740 passed deterministic DB/contracts and existing
  backend safety gates, then failed because ubuntu-latest moved to26.04, unsupported
  by pinned Playwright1.58.2. Runner is corrected to supported ubuntu-24.04; no
  dependency major upgrade or skipped browser checks.
- Corrective commit `3503f30971aef83d0df60d6b89aa2af712609948` was pushed.
  Hosted run https://github.com/alessiocasce/lifeos/actions/runs/42553786154
  **SUCCEEDED**:13 helper cases,45 Chromium cases,3 selected WebKit cases,
  deterministic SQL/RLS/migration/scheduler tests, Brain/Community/schema gates,
  production build, real local Workbox A->B test and diff checks. Function count7.
  The8 broader WebKit cases passed locally in the preceding review; hosted3 must
  not be misreported as those same8.
- Automatic **preview only** deployment `dpl_EihL4DTxRLfw7uVqCRS4gHDwFZs5` is READY
  for b8302fc: https://lifeos-3iwtxoh62-lifeos2.vercel.app . It is not production.
- Production remains READY on `23a4b6256c9b86b8f8cf64bc458fc3f0429623ac`, deployment
  `dpl_EUX39ge3cUeaR8R3EuoyyhhhMjyE`; the existing production alias is unchanged.
- Fresh read-only preflight still reports54 workouts/564 sets/7 templates/31 template
  exercises,9 retired curl sets and3 snapshots,0 username collisions. Protected
  digests match the prior review. No new migrations are recorded or push tables present.
- Vercel environment inventory contains no LIFEOS_PUSH_* keys. No secret values
  were read/printed. No production notification capability is enabled.

## Production Baseline Inspection (Not New-release Acceptance)

- The public URL loads the existing sign-in screen. Actual agent-browser snapshot
  and390px screenshot captured; screenshot remains ignored in test-results.
  Axe WCAG2A/AA scan:0 violations,0 incomplete. No credentials were entered and no
  authentication/workout mutation smoke was attempted before backup verification.
- `/build-version.json` returns old production SHA23a4b62. This confirms main traffic
  was not switched to either feature commit or the preview deployment.
- Read-only DB observation:22,416,531bytes,9 connections,0 recorded deadlocks;
  Cron/net remain absent and Vault present. These are snapshots, not load tests.
- Security advisors show no ERROR entries. Existing warnings:3 mutable-search-path
  legacy functions, intentionally exposed profile/availability/status SECURITY
  DEFINER APIs, and leaked-password protection disabled. Seven no-policy RLS tables
  are INFO/service-only or retired. No unrelated policy/function change was made.
  Review [search-path guidance](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
  and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
  The scheduler/new-migration security state cannot be verified in production until
  authorized backup-gated installation. The six dependency advisories remain the
  documented low/moderate build-tool risks, not silently accepted as zero risk.
- Browser automation reported an older Chrome binary; it was used only for the
  unauthenticated baseline. No claim of physical iPhone or new-release acceptance.

## Exact Remaining Gate

Provide a production PostgreSQL/session-pooler connection through ignored
`.env.local` as `LIFEOS_BACKUP_DATABASE_URL` (never paste credentials into chat),
or a supported securely supplied consistent recovery export. Obtain/encrypt the
backup outside Git and demonstrate its isolated restore. Then recheck fresh
preflight, install the four targeted migrations, provision VAPID/Vault/dispatch,
verify scheduler and controlled transport, merge only after green CI, verify the
production SHA and perform the listed acceptance flows. Do not buy PITR/branches
or enable notifications globally to bypass this gate.

PR2 deliberately remains draft/unmerged; main and production remain unchanged.
No migrations, extension installation, Vault write, production environment change,
worker activation or real user record mutation was performed. Physical notification
delivery and real email recovery remain unverified. There is no safe basis to
declare the new release live.

## Evidence and Acceptance

Local release baseline:40 Chromium /8 WebKit /13 helper cases plus database,
Community, schema, Brain and real local Workbox-upgrade checks passed. Scheduler
has an additional real-Postgres SQL test with mocked external cron/net/Vault
adapters: no hosted scheduler/transport is claimed by that test.

Production migration ledger, current protected digests and curl reconciliation
must be rechecked immediately before any authorized application. No production
migration or data write has occurred in this attempt. No VAPID/private dispatch
credential was generated or provisioned. Notification delivery remains gated.

Physical iPhone delivery, production subscribed-client transport, actual email
recovery, production UI acceptance and a live deployment timestamp are pending.
There is no new production deployment date/time to report at this stage.

## Recovery Requirement

### Verified recovery evidence (2026-11-09)

- Full PostgreSQL custom archive obtained with pg_dump18 from PG17.6 using an
  exported repeatable-read read-only snapshot. Source verification uses that same
  snapshot; no production data write is involved.
- Stored archive:1,219,059 encrypted bytes, AES-256-GCM. Key protected with Windows
  CurrentUser DPAPI; directory ACL restricts access to the current account. Archive,
  key and evidence are outside Git in the owner's `.codex/private` recovery folder.
- Recovery used the stored encrypted file and stored protected key, not the original
  memory buffers. Decrypted archive checksum matched before native pg_restore.
- Isolated native PostgreSQL18 restore passed with exit-on-error for the10 affected/
  auth tables, their native definitions, primary/foreign constraints and indexes.
  All full-row ordered digests and counts matched: auth users6, workouts54, sets564,
  templates7, template exercises31, profiles6, preferences6, catalog224, aliases488,
  Community shares53. Orphan set/template/share ownership-reference counts are0.
- The isolated server is stopped. The archive temporary plaintext file was removed.
  Automatic removal of the stopped private test cluster was rejected by the tool's
  filesystem policy; that ACL-protected cluster remains for owner cleanup. No
  workaround or deletion of other PostgreSQL data was attempted.
- Scope limitation: this verifies affected application/auth data restoration,
  not a complete local Supabase extension stack or Storage-blob restoration.
  The archive itself is a full logical database dump. Keep Windows DPAPI recovery
  material/profile available; portable/offsite key escrow remains an operator task.
- Operator source utilities contain no credentials or backup rows. Password stays
  in the native child environment; it is not passed on the command line or printed.

Use the supported Supabase dump/restore or PostgreSQL tooling with a consistent
snapshot, encrypt the recovery copy outside Git, and restore it to an isolated
database. Verify workout/set/template/profile/Community counts, source digests,
references, policies and relevant functions. Do not equate a dashboard backup
setting or SELECT-only preflight with demonstrated recoverability. Do not invent
a reverse identity migration. Existing production stays untouched until this gate.
