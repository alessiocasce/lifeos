# LifeOS Deployment Guide

Reviewed 2026-11-17 against current source and release metadata. Use [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) for the latest verified SHA and [QA_DEPLOYMENT.md](QA_DEPLOYMENT.md) for integration checks. The full-stack production target is the existing Vercel LifeOS project; a static Netlify upload alone does not host its `/api` functions.

## Current production target

- Repository: `alessiocasce/lifeos`; production branch: `main`.
- Vercel project: `lifeos` (`prj_knu6xjJQj3e2gBJkki82HAfu6XeD`).
- Public domain: `https://lifeos-ruby-gamma.vercel.app`.
- November 17 verification: production deployment `dpl_7o4x396sDEX2mGhK6dcFvB43qPxs` READY at source `fe8b99c`; `/build-version.json` returned the same full SHA. Recheck these facts for a later release.
- Git integration builds/deploys `main`; avoid creating a duplicate manual deployment for an already successful Git release. `vercel.json` owns SPA/API/OAuth rewrites and cache headers.

## Configuration boundaries

Frontend-safe values in local/deployment configuration:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Backend-only configuration includes `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `LIFEOS_ACTION_TOKEN` and `LIFEOS_ACTION_USER_ID`. `GEMINI_MODEL` is optional; the current source default is `gemini-2.5-flash`. Keep service-role/model/action/bridge/OAuth/dispatch secrets out of `VITE_` variables, source and logs.

Feature-specific variables and request contracts live in:

- [Action API](ACTION_API.md): trusted personal automation.
- [MCP](MCP.md): static-token/OAuth read and explicitly scoped semantic sync.
- [WhatsApp](../bridge/whatsapp/README.md): bridge secret, sender allowlist/aliases and shared outbox.
- [Web Push](WORKOUT_WEB_PUSH.md): Vercel-only VAPID/admin credentials and isolated Oracle dispatch worker.
- [Auth confirmation](AUTH_CONFIRMATION.md): allowed redirects, confirmation/onboarding and recovery.

Redeploy after an intentional environment change. Do not infer current secret provisioning or worker health from a historical deployment checklist.

## Database changes

For existing production, confirm required objects and the applied migration ledger. Apply only the explicitly reviewed missing forward migration for the authorized release, with backup, rollback/restore plan and isolated verification where required. Do not rerun `supabase/schema.sql`, broad-replay historical files, or use blanket `supabase db push`. A missing historical ledger entry does not prove its objects are missing.

For a genuinely empty development/staging database, review the baseline and feature migration dependencies together before bootstrap. `schema.sql` alone is not a complete current-object inventory; newer Web Push objects are in forward migrations. Never turn an empty-database setup recipe into a production upgrade. See [supabase/README.md](../supabase/README.md) and the named release checklist.

The rest-coordination refactor and this documentation audit change no schema. No schema rerun required.

## Build and release validation

Use scripts from `package.json`, including the required:

```powershell
npm.cmd run test:brain
npm.cmd run build
npm.cmd run check:functions
git diff --check
```

Run the affected module suites/browser checks as well. For rest coordination use the commands/evidence in [the acceptance document](qa/workout-rest-coordination.md). Check changed backend files with `node --check`. The build may retain a non-failing large-chunk warning; report it rather than suppressing it.

Verify intended repository/project/branch/commit/environment before publishing. After release, inspect the actual deployment status and compare the public `/build-version.json` with the intended SHA. Run authenticated flow checks only within the authorized data scope. A READY build, local fixtures or provider acceptance do not prove hosted RLS, Oracle health, email receipt or physical iPhone notification display.

## PWA update and operational acceptance

Existing installed clients can keep an older worker until a guarded update. Preserve drafts/auth/storage; apply through the offered update flow or guarded refresh when no workout is loading/active and no meaningful unsaved work remains. Finishing one set does not make an active workout safe to reload. Never clear application storage or force activation as a normal update procedure.

A Vercel frontend/backend deploy does not require restarting the independently operated WhatsApp or Web Push workers unless their code/configuration changed. Use each worker's dedicated service account/runbook, not a supervisor-wide restart.

Complete [PWA QA](QA_PWA.md), [full-app QA](QA_FULL_APP.md), and feature-specific deployed QA as applicable. Physical iPhone/PWA lifecycle, notification display and real email acceptance remain explicit manual gates.
