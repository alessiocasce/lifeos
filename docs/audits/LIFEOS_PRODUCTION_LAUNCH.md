# LifeOS Production Launch

## Oracle Push Completion (2026-11-09 22:22 Europe/Rome)

**SERVER-SIDE OPERATIONAL - IPHONE ACCEPTANCE PENDING.** This supersedes the
earlier background-delivery blocker; physical iPhone and real-email acceptance
are not retrospectively claimed.

- PR3 merged64bba3670c488f8c8af0e24d6313d8faecb69a4d; PR4 corrected PM2's ESM
  entrypoint and merged222aacd3b36e109e4ab6f066a987f3569d259290.
  https://github.com/alessiocasce/lifeos/pull/3
  https://github.com/alessiocasce/lifeos/pull/4
- Current Git main/production SHA222aacd3b36e109e4ab6f066a987f3569d259290,
  deployment `dpl_BvsEUEV3UvBoiea8AS4FNL8eY2a1` READY, Git integration.
  https://lifeos-4tv8wkz92-lifeos2.vercel.app and the existing production alias
  serve the matching build-version. No manual duplicate deployment or new project.
- Final hosted run https://github.com/alessiocasce/lifeos/actions/runs/42700909100
  SUCCESS:13 helpers,45 Chromium,3 WebKit plus push/SQL/RLS/backend/PWA/build/function
  checks. Local push harnesses, worker regression, syntax/build/diff passed. The
  production app/API/service-worker logic was reused, not redesigned.
- Existing Oracle Ubuntu22.04 ARM64 VM:2OCPUs/12GB RAM,45GB root,29GB free; about
 53MB dedicated supervisor/worker cgroup at idle. This shape fits current published
  Always Free A1 limits; billing/other tenancy resources cannot be proved through
  SSH alone. No VM/resource/paid plan was created or resized.
- Independent `lifeos-push` system user, Node24.22.2 official ARM64 SHA256-verified
  runtime, PM2 process `lifeos-workout-push`, private PM2_HOME. Existing system Node20
  and WhatsApp PM2 service were unchanged; bridge PID357263/restarts0 throughout.
- Reboot startup enabled via `pm2-lifeos-push.service`; saved PM2 process list,
  crash restart,5second restart delay,128MB worker/256MB cgroup caps. Resurrect and
  dedicated service restart tested; no VM reboot/interruption of the bridge.
- `/etc/lifeos-workout-push/worker.env` root:lifeos-push0640, parent0750, contains
  only origin and dispatch secret. VAPID private key and service-role access are
  not installed on Oracle. Vercel production has all five required variables,
  private/dispatch material stored as sensitive values, flagtrue. Keys validated
  cryptographically; encrypted operator recovery copy outside Git. No values logged.
- No new firewall/inbound port was opened. Verified SSH host key and HTTPS/TLS
  were retained. Supabase Cron dispatch remains inactive, private controlfalse,
  request IDnull; transport guard unchanged. No migrations reapplied or altered.
- Ten-second non-overlapping polling (plus response time). Atomic redacted health
  heartbeat shows HTTP200/failures0. Per-minute systemd health timer passed. Sparse
  idle logs, bounded failure logs and1MB/daily logrotate with5 compressed rotations.
  Local journal failures are actionable; no external paging recipient is configured.

### Actual Delivery Evidence

Using temporary authenticated QA accounts with workout sharing/notes OFF, real
ordinary-user API calls and an isolated non-incognito installed Google Chrome
profile, without mocking push events or transport:

1. Real push-service subscription registered; VAPID keypair validated.
2. Saving a real private test set created the durable deadline. Oracle claimed it,
   Vercel's web-push encrypted/signed delivery was accepted, and Chrome's active
   notification registration exposed **LifeOS - Rest complete / You can start your
   next set.** after ALL app pages were closed, observed through the real
   `registration.getNotifications()` API, not a human-observed OS banner.
   This is actual client receipt,
   not merely HTTP200/provider acceptance. It is not physical iPhone evidence.
3. A second pending set superseded the old one. Restarting only the notification
   service preserved the pending timer; only the replacement arrived. Prior sent
   records intentionally become cancelled when superseded, revoking delayed tokens.
4. Notifications OFF revoked delivery; timer OFF cancelled/prevented scheduling;
   End Workout cancelled pending delivery. No notification after those deadlines.
5. Unregister and browser unsubscribe succeeded. Reusing that now-revoked endpoint
   produced one failed delivery and automatic404/410 subscription removal; no retry
   loop. That expected QA provider rejection is not a worker transport outage.
6. A fresh real receipt was repeated AFTER final production222aacd was READY.
   Worker log21:21:45UTC:claimed1/accepted1/failed0. Health was HTTP200/failures0.
7. Unauthenticated dispatch returned401. Existing isolated A/B/anon RLS, token
   revocation, fail-open logging and bounded claim regressions passed. No account
   privileges, Community privacy rules or historical workout fields were changed.

All QA accounts and dependent workouts/sets/timers/subscriptions were removed after
successful and failed test attempts. Real member activity continued during this
run, so the old54/564 launch counts are not immutable expectations. Final snapshot
observed56 workouts/601 sets,6 real auth users,0 subscriptions and0 pending timers.
Only explicitly created QA user IDs were deleted; no real member data was cleaned.
No production error/fatal log entries in the inspected final-deployment window.

Initial QA issues were distinguished from implementation defects: transient local
DNS failure; off-the-record Chrome rejects push registration (fixed by isolated
persistent profile); the real PM2 wrapper/main-guard bug (fixed and regression
covered); and an incorrect test expecting2 rows still marked sent after supersession
(correct token-revocation behavior leaves1). No failing test was concealed.

### Usage, Safety and Remaining Acceptance

259200 calls/30days zero-latency ceiling; real serial request latency lowers that
count. About0.55-0.65second idle wall time; actual active CPU/monthly team consumption
not available from these checks. At2GB and0.65seconds, conservative memory estimate
93.6GB-hours/month before considering lower serial rate. Hobby includes1million
invocations/4CPU-hours, shared with existing services. No zero-cost/headroom guarantee
is inferred and no paid upgrade made. Monitor account usage before scaling.

Immediate kill: stop only `pm2-lifeos-push.service`; optionally set the Vercel worker
flagfalse and deploy it. Never start pg_net transport. Foreground countdown is
independent. Node/runtime and worker/config installed hashes match reviewed source.

Physical iPhone Home Screen PWA permission/background/closed/locked/replacement/
cancellation acceptance remains pending. Exact procedure is in WORKOUT_WEB_PUSH.md.
OS/network/power delays, delayed display races and ambiguous-send/no-retry behavior
remain documented limitations. No exactly-once OS or exact-time promise is made.
The actual VM reboot and external alert delivery were intentionally not tested.
No schema rerun required. Earlier sections below are dated launch history.

## Final Outcome (2026-11-09 03:52 UTC)

**LIFEOS - PRODUCTION DEPLOYED, ACCEPTANCE PENDING.**

- PR https://github.com/alessiocasce/lifeos/pull/2 merged at03:48:29UTC.
- Reviewed head `0e6e971466982eedf36b6a683002e5d10d093634`; final hosted run
  https://github.com/alessiocasce/lifeos/actions/runs/42558036614 SUCCESS.
  Exact reported totals:13 helper tests,45 Chromium cases,3 WebKit cases.
  Deterministic PostgreSQL/RLS/Community/Brain/schema, production build, seven-route
  function gate, guarded Workbox A->B and diff checks also passed.
- Production/main SHA `87acd1ead077ce73ad4e35af96030bc826787242`.
  Git-triggered deployment `dpl_3MSHRNAuFHLZf8amsTAHhQwPciUx` READY at03:48:53UTC
  (04:48:53Europe/Rome). No duplicate manual deployment.
  https://lifeos-mo9mard0x-lifeos2.vercel.app is the deployment URL;
  https://lifeos-ruby-gamma.vercel.app is assigned to it and serves that exact SHA.
- Served entry `/assets/index-B5KyVusV.js`; checked fixture markers absent.
  Manifest/service-worker HTTP200; build includes38 precache entries.
- All five applied migration versions are listed below, exactly matching checked-in
  filenames. No historical migration gaps replayed and no schema rerun required.
- Final source baseline remains54 workouts/564 sets/7 templates/31 template exercises,
  53 Community shares/564 projected sets,6 auth users and6 profiles/preferences.
  All four protected digests still match before release. Zero retired curl source
  references;18 canonical sets and5 canonical snapshot entries. No user data lost.

### Real Production Acceptance Performed

Two temporary, genuinely authenticated accounts were created through Admin Auth,
then exercised through ordinary signed-in clients and the actual public URL. Both
were opted out of workout sharing before synthetic QA workouts; no fake public post
or real member workout was created/edited. All QA accounts and dependent rows were
removed after each attempt; final aggregate baseline restored. Passwords/tokens
remained in memory, never source/logs. Ordinary authenticated requests proved:

- Italian/sharing-ON/notes-OFF initialization; explicit English choice retained.
- A cannot read/write B preferences/workouts/sets; catalog mutation denied;
  subscription capability URLs and timer tokens inaccessible to client reads.
- Authenticated notification config reports configured=false; missing authentication
  rejects config and dispatch with401.
- UI login/logout/account switching: English A and Italian B show only their own
  Settings identity/preferences. No stale previous-user profile.
- Start empty workout name-only dialog; canonical curl selection; warmup save and
  automatic warmup reset; real Supabase set persistence; reload continuity.
- Foreground timer enabled through UI,60second preference persisted; saved set
  created one server deadline, reload retained it, End Workout cancelled it.
  Background notification preference remained OFF throughout.
- Completion and real summary, one saved template, Back to training and persisted
  dismissal; History correction without reopening; custom delete confirmation
  cancelled without deleting the workout; Community loads.
- No horizontal overflow at375/390/430px. Production screenshots in ignored
  `test-results/production-{training,completion,history,rest}-390.png`; Italian
  Settings screenshot has430px width despite its historical390 filename.
- Zero Playwright page errors. Fresh production agent-browser login audit:
  axe4.12.1 WCAG2A/AA0 violations/0 incomplete; no console page errors.
  This is login-only accessibility evidence, not a full authenticated WCAG audit.
- Vercel runtime error/fatal grouped query returned no entries for this deployment
  in the inspected10minute window. Not a long-term monitoring guarantee.

One extended smoke initially failed because Playwright check() expected immediate
optimistic state on a server-saved switch. Replacing that assertion with one click
and an awaited saved checked state passed; no application fix or hidden retry was
needed. QA cleanup succeeded on the failed attempt too.

### Infrastructure and Remaining Gates

Foreground countdown is operational. Background Web Push is **not operational**:
Supabase queue permissions cannot meet the credential-isolation gate; dispatch
Cron and private control remain OFF, worker environment flagfalse, no VAPID/dispatch
secret or subscription provisioned. The forward guard was physically executed and
returned unsafe_transport_permissions,0 queued requests,0 timers. Owner declined
Oracle access for now. No Oracle/WhatsApp bridge restart occurred. No OS delivery
or real subscribed-client transport acceptance is claimed.

Hourly bounded maintenance is scheduled; dispatch has0 executions/requests and
therefore0 added dispatch HTTP/function invocations. The proposed enabled10second
cadence would mean259200 DB checks per30days, not the current actual load. Database
observed23.0MB/13 connections,0 failed Cron runs. Vercel billing endpoint returned
404 costs_not_found for the Hobby team; a monthly usage/headroom claim is unavailable.
No paid resources, uncontrolled worker loop, external alert destination or billing
upgrade was enabled. Original6 low/moderate build-chain advisories remain documented;
entry-size warning remains visible, not suppressed.

Security advisors: intentional service-only subscription table adds one no-policy
RLS INFO. Existing mutable-search-path/password-protection warnings remain, plus
the intended authenticated cancellation RPC with auth.uid ownership and fixed
search path. No new ERROR entry. Performance notices include legacy unindexed FKs,
RLS initplan and duplicate Vault index; new unused-index INFO is expected at0 timers.
No unrelated policies or legacy functions were changed to silence advisors.

Still requires human/external acceptance:
1. Real iPhone Safari and installed-PWA cold launch/dock/keyboard/background/update.
2. Real controlled inbox password-reset delivery, redirect, password change and reuse.
3. Secure background transport setup, then actual subscribed-client Web Push and
   physical locked/backgrounded/killed iPhone receipt/replacement/OFF/end checks.
4. Photo upload/edit against a real chosen image was validated locally, not changed
   on a real production member profile in this smoke.

Immediate notification kill remains workerflagfalse + scheduler controlfalse +
inactive dispatchjob. For severe frontend regression, previous production deployment
`dpl_EUX39ge3cUeaR8R3EuoyyhhhMjyE`/23a4b62 is the rollback candidate: move traffic
back through Vercel, retain forward-compatible database changes, re-run read-only
digests. Never reverse historical exercise identities speculatively. Encrypted
backup/scoped restore evidence below remains the recovery anchor; protect DPAPI
profile and arrange operator off-machine escrow. The stopped private local recovery
cluster cleanup was tool-policy blocked and remains an explicit owner action.

Rankings/plans, private reference images, screenshots, environment files and backup
material remain outside the release commit. Earlier sections below are the dated
execution log and must not be interpreted as current release state.

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
