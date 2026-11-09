# LifeOS Production Launch

## Current Attempt: 2026-11-09

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
forward migration `20261109024936_workout_push_cron.sql` is local/unapplied.
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

Use the supported Supabase dump/restore or PostgreSQL tooling with a consistent
snapshot, encrypt the recovery copy outside Git, and restore it to an isolated
database. Verify workout/set/template/profile/Community counts, source digests,
references, policies and relevant functions. Do not equate a dashboard backup
setting or SELECT-only preflight with demonstrated recoverability. Do not invent
a reverse identity migration. Existing production stays untouched until this gate.
