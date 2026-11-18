# Documentation status and session handoff

Later release evidence: [2026-11-19 UI checks](../qa/ui-release-2026-11-19.md).
The monitor-clock and stale Training-locator issues recorded in this dated audit
were corrected during that release batch; retain the audit as historical evidence.

**Current resume entry point:** [session handoff](../agents/current-handoff.md). The audit below is the earlier documentation-only snapshot. Subsequent Settings, bottom-bar, Companion and Community runtime/test changes are local, uncommitted and not deployed; their latest behavior/evidence are in the handoff and module QA pages. The original inventory/counts are not an updated census of those later files.

Audit date: 2026-11-17. Application baseline: `fe8b99c70c7487500883954fd515f13a5cb487c8` on `main` and `origin/main`. This is a local documentation refresh after that implementation; it changes no application, test, schema or worker code.

## Verified implementation and release

- Rest coordination is implemented/reviewed; GitHub tickets #6, #7 and #8 are closed. The only currently open GitHub issue returned by the audit is #1 (Companion Focus Sessions/local desktop sensor), not an unfinished rest ticket.
- The Vercel connector resolves `lifeos-ruby-gamma.vercel.app` to READY production deployment `dpl_7o4x396sDEX2mGhK6dcFvB43qPxs`, project `lifeos`, Git source `main` at the full SHA above. A separate unauthenticated `/build-version.json` read returned exactly that SHA.
- Oracle worker activation is documented in the November 9 runbook. Supabase `pg_net` dispatch stays disabled. Current Oracle health/configuration and physical notification display were not revalidated.
- Rankings remains a design-only prototype/spec. Companion's broader roadmap is not an assertion that every proposal is implemented. Daily Review's old UI checklist is legacy; persistence remains for compatibility.

## Corrections made

- Updated the project handoff/release history, source/deployment state, completed rest spec and scoped acceptance evidence.
- Corrected the five-destination mobile dock, Settings/Community, Command limits/signals, Companion context-sheet conversation navigation and selected-thread continuity, current empty-state copy, chat-helper/orchestration ownership, and the permission-gated belief/memory/monitor boundary.
- Removed active QA/deployment instructions to replay the full production schema. Baseline schema plus reviewed newer forward migrations define current database features; a missing ledger entry does not authorize replay.
- Corrected guarded PWA behavior: any active/loading workout blocks activation, including a clean/incomplete logger or another tab; saving one set does not release the guard.
- Marked dated reports and archived briefs as point-in-time evidence, kept their measurements/history, repaired relative links after archive moves, and marked the generated graph report stale without rebuilding it.
- Added a documentation index and per-file inventory so a fresh session can find current guidance without treating every historical report as a live instruction.

## Validation performed in this audit

| Check | Result |
| --- | --- |
| `npm run build` | PASS; existing non-failing large-chunk warning retained |
| `npm run test:workout:rest-coordinator` | PASS |
| `npm run test:workout:rest-adapter` | PASS |
| `npm run check:functions` | PASS; seven Vercel route functions |
| `npx playwright test tests/ui/command.spec.js tests/ui/companion.spec.js` | PASS, 28/28 Chromium cases |
| `node scripts/tests/test-companion-app.js` | PASS when run separately |
| `npm test` | NOT GREEN: reaches `test:attention`, then fixed-clock fixture violates `brain_monitors_check`; previous chained Brain/MCP/OAuth/MCP-write/memory/schema/reliability/bridge/workout/belief suites pass |
| `git diff --check` | PASS |
| Markdown inventory / local page links | See scope/counts below; no external URL freshness or browser-anchor acceptance implied |

### Existing attention-monitor test failure

`scripts/tests/test-companion-monitors.js` injects `2026-09-26T12:00:00Z`; `normalizeMonitorProposal` generates the default 45-day expiry `2026-11-10T12:00:00Z`. `createValidatedMonitor` leaves `created_at` to the database default, which the isolated PGlite probe returned as `2026-11-17`. The real checked-in constraint is `expires_at > created_at`, hence SQLSTATE `23514`. This demonstrates incompatible fixture/database clocks; it is not evidence of a production permission or delivery failure. No clock workaround, constraint weakening or runtime/test edit was made in this documentation task. The failed chained suite stops before its app subtest; running that subtest separately passes.

Two previously identified `training-prefill-rest` browser cases have stale Weight locators. They were not rerun or changed here. The prior rest implementation's 21/21 focused browser batch remains dated evidence, separate from this audit's 28/28 Command/Companion run.

## Coverage and remaining limits

Inventoried and text/status/path/link-scanned **96 Markdown files**, including local-only documents and the generated graph report. Vendor/build/test-output directories (`node_modules`, `.git`, `dist`, `test-results`, `playwright-report`) are excluded. 71 files differ from the audit-start snapshot, including new indexes and small historical-status banners; the remainder were retained within their documented scope. Active handoff/operational/UI claims were checked against relevant source/configuration. Archived numeric results remain historical evidence, not rerun acceptance.

Role counts: Active QA procedure: 14, Completed spec: 1, Current audit: 1, Current reference: 22, Dated acceptance evidence: 1, Dated release/QA evidence: 13, Design-only rankings: 6, Historical archive: 33, Legacy UI checklist: 1, Product roadmap: 1, Release history: 1, Stale generated snapshot: 1, Visual input reference: 1.

Local Markdown page-link scan: **0 missing targets**. Optional `docs/adr/` is intentionally absent, and API endpoint names or deliberately removed historical code paths are not broken Markdown links. External websites, HTML/browser anchors and old ignored screenshot artifacts were not exhaustively fetched or recreated.

Physical iPhone notification display/keyboard/process eviction, real email receipt, fresh hosted RLS/catalog verification, Oracle heartbeat/billing and full browser regression remain separate unverified gates. Build/provider status and isolated fixtures do not prove those outcomes. The dependency advisory audit is dated evidence, not a fresh vulnerability scan. No schema rerun required.

## Git and context-clear safety

The reviewed application implementation is committed/pushed on `main`. These documentation changes remain local/uncommitted; this task did not authorize another commit/push. Pre-existing local `AGENTS.md` edits and untracked glossary/tracker/spec/Rankings/graph material are preserved. `/clear` preserves the local workspace but does not create a backup; a fresh clone excludes local-only files. Run `git status` before staging/resuming, and use [AGENTS.md](../../AGENTS.md), [PROJECT_CONTEXT.md](../../PROJECT_CONTEXT.md) and [the index](../README.md).

## Complete Markdown inventory

“Tracked” describes whether Git already tracks the path, not whether today's edits are committed. “Reviewed/retained” describes scope/link/status screening, not a new end-to-end proof of every historical paragraph.

| File | Role | Audit action | Git backing |
| --- | --- | --- | --- |
| [AGENTS.md](../../AGENTS.md) | Current reference | Updated / scoped | Tracked |
| [bridge/whatsapp/README.md](../../bridge/whatsapp/README.md) | Current reference | Updated / scoped | Tracked |
| [docs/ACTION_API.md](../ACTION_API.md) | Current reference | Reviewed / retained | Tracked |
| [docs/agents/domain.md](../agents/domain.md) | Current reference | Reviewed / retained | Local only |
| [docs/agents/issue-tracker.md](../agents/issue-tracker.md) | Current reference | Reviewed / retained | Local only |
| [docs/agents/triage-labels.md](../agents/triage-labels.md) | Current reference | Reviewed / retained | Local only |
| [docs/archive/CODEX_COMPANION_VNEXT_FIRST_SLICE.md](../archive/CODEX_COMPANION_VNEXT_FIRST_SLICE.md) | Historical archive | Updated / scoped | Tracked |
| [docs/archive/CODEX_COMPANION_VNEXT_PROGRESS.md](../archive/CODEX_COMPANION_VNEXT_PROGRESS.md) | Historical archive | Updated / scoped | Tracked |
| [docs/archive/CODEX_COMPANION_VNEXT_SECOND_SLICE.md](../archive/CODEX_COMPANION_VNEXT_SECOND_SLICE.md) | Historical archive | Updated / scoped | Tracked |
| [docs/archive/CODEX_COMPANION_VNEXT_SLICE25_AND_3.md](../archive/CODEX_COMPANION_VNEXT_SLICE25_AND_3.md) | Historical archive | Updated / scoped | Tracked |
| [docs/archive/CODEX_COMPANION_VNEXT_SLICE2_PROGRESS.md](../archive/CODEX_COMPANION_VNEXT_SLICE2_PROGRESS.md) | Historical archive | Updated / scoped | Tracked |
| [docs/archive/CODEX_COMPANION_VNEXT_SLICE31_4_PROGRESS.md](../archive/CODEX_COMPANION_VNEXT_SLICE31_4_PROGRESS.md) | Historical archive | Updated / scoped | Tracked |
| [docs/archive/CODEX_COMPANION_VNEXT_SLICE3_PROGRESS.md](../archive/CODEX_COMPANION_VNEXT_SLICE3_PROGRESS.md) | Historical archive | Updated / scoped | Tracked |
| [docs/archive/README.md](../archive/README.md) | Historical archive | Reviewed / retained | Tracked |
| [docs/archive/UI_FEATURE_PRESERVATION.md](../archive/UI_FEATURE_PRESERVATION.md) | Historical archive | Updated / scoped | Tracked |
| [docs/archive/UI_RECONSTRUCTION_AUDIT.md](../archive/UI_RECONSTRUCTION_AUDIT.md) | Historical archive | Updated / scoped | Tracked |
| [docs/archive/UI_RECONSTRUCTION_PROGRESS.md](../archive/UI_RECONSTRUCTION_PROGRESS.md) | Historical archive | Updated / scoped | Tracked |
| [docs/archive/UI_RECONSTRUCTION_REPORT.md](../archive/UI_RECONSTRUCTION_REPORT.md) | Historical archive | Updated / scoped | Tracked |
| [docs/audits/DEPENDENCY_RELEASE_AUDIT.md](DEPENDENCY_RELEASE_AUDIT.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/audits/DOCUMENTATION_STATUS.md](DOCUMENTATION_STATUS.md) | Current audit | New full inventory / verification limits | Local only |
| [docs/audits/lifeos-ui/references/LifeOS_Codex_Visual_References/REFERENCE_GUIDE.md](lifeos-ui/references/LifeOS_Codex_Visual_References/REFERENCE_GUIDE.md) | Visual input reference | Reviewed / retained | Local only |
| [docs/audits/lifeos-ui/TRAINING_IDENTITY_REVIEW.md](lifeos-ui/TRAINING_IDENTITY_REVIEW.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/audits/LIFEOS_PRODUCTION_LAUNCH.md](LIFEOS_PRODUCTION_LAUNCH.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/audits/LIFEOS_RELEASE_READINESS.md](LIFEOS_RELEASE_READINESS.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/audits/LIFEOS_UI_UX_MODERNIZATION.md](LIFEOS_UI_UX_MODERNIZATION.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/AUTH_CONFIRMATION.md](../AUTH_CONFIRMATION.md) | Current reference | Updated / scoped | Tracked |
| [docs/BRAIN_ARCHITECTURE.md](../BRAIN_ARCHITECTURE.md) | Current reference | Updated / scoped | Tracked |
| [docs/COMMUNITY.md](../COMMUNITY.md) | Current reference | Updated / scoped | Tracked |
| [docs/DEPLOYMENT.md](../DEPLOYMENT.md) | Current reference | Updated / scoped | Tracked |
| [docs/design-qa.md](../design-qa.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/EXERCISE_CATALOG_REVISION.md](../EXERCISE_CATALOG_REVISION.md) | Current reference | Reviewed / retained | Tracked |
| [docs/HISTORY.md](../HISTORY.md) | Release history | Updated / scoped | Tracked |
| [docs/LIFEOS_COMPANION_VNEXT.md](../LIFEOS_COMPANION_VNEXT.md) | Product roadmap | Updated / scoped | Tracked |
| [docs/MCP.md](../MCP.md) | Current reference | Reviewed / retained | Tracked |
| [docs/plans/lifeos-rankings/archive/00-executive-summary.md](../plans/lifeos-rankings/archive/00-executive-summary.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/01-current-architecture.md](../plans/lifeos-rankings/archive/01-current-architecture.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/02-product-decisions.md](../plans/lifeos-rankings/archive/02-product-decisions.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/03-lifetime-xp.md](../plans/lifeos-rankings/archive/03-lifetime-xp.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/04-competitive-ranking.md](../plans/lifeos-rankings/archive/04-competitive-ranking.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/05-personal-progress-algorithm.md](../plans/lifeos-rankings/archive/05-personal-progress-algorithm.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/06-algorithm-simulations.md](../plans/lifeos-rankings/archive/06-algorithm-simulations.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/07-leaderboards.md](../plans/lifeos-rankings/archive/07-leaderboards.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/08-badges-titles-rewards.md](../plans/lifeos-rankings/archive/08-badges-titles-rewards.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/09-community-and-profiles.md](../plans/lifeos-rankings/archive/09-community-and-profiles.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/10-ux-interactions.md](../plans/lifeos-rankings/archive/10-ux-interactions.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/11-visual-design-system.md](../plans/lifeos-rankings/archive/11-visual-design-system.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/12-technical-architecture.md](../plans/lifeos-rankings/archive/12-technical-architecture.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/13-security-and-privacy.md](../plans/lifeos-rankings/archive/13-security-and-privacy.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/14-implementation-plan.md](../plans/lifeos-rankings/archive/14-implementation-plan.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/15-test-and-acceptance-matrix.md](../plans/lifeos-rankings/archive/15-test-and-acceptance-matrix.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/16-risks-and-open-decisions.md](../plans/lifeos-rankings/archive/16-risks-and-open-decisions.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/17-final-product-corrections.md](../plans/lifeos-rankings/archive/17-final-product-corrections.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/design-qa-before-finalization.md](../plans/lifeos-rankings/archive/design-qa-before-finalization.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/README-before-finalization.md](../plans/lifeos-rankings/archive/README-before-finalization.md) | Historical archive | Updated / scoped | Local only |
| [docs/plans/lifeos-rankings/archive/README.md](../plans/lifeos-rankings/archive/README.md) | Historical archive | Reviewed / retained | Local only |
| [docs/plans/lifeos-rankings/DECISION-CHANGELOG.md](../plans/lifeos-rankings/DECISION-CHANGELOG.md) | Design-only rankings | Reviewed / retained | Local only |
| [docs/plans/lifeos-rankings/design-qa.md](../plans/lifeos-rankings/design-qa.md) | Design-only rankings | Reviewed / retained | Local only |
| [docs/plans/lifeos-rankings/FINAL-APPROVAL.md](../plans/lifeos-rankings/FINAL-APPROVAL.md) | Design-only rankings | Reviewed / retained | Local only |
| [docs/plans/lifeos-rankings/IMPLEMENTATION.md](../plans/lifeos-rankings/IMPLEMENTATION.md) | Design-only rankings | Reviewed / retained | Local only |
| [docs/plans/lifeos-rankings/PRODUCT-SPEC.md](../plans/lifeos-rankings/PRODUCT-SPEC.md) | Design-only rankings | Reviewed / retained | Local only |
| [docs/plans/lifeos-rankings/README.md](../plans/lifeos-rankings/README.md) | Design-only rankings | Updated / scoped | Local only |
| [docs/PWA_TRAINING_CORRECTIONS.md](../PWA_TRAINING_CORRECTIONS.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/qa/workout-rest-coordination.md](../qa/workout-rest-coordination.md) | Dated acceptance evidence | Updated / scoped | Tracked |
| [docs/QA_AI_ASSISTANT.md](../QA_AI_ASSISTANT.md) | Active QA procedure | Updated / scoped | Tracked |
| [docs/QA_CALENDAR.md](../QA_CALENDAR.md) | Active QA procedure | Updated / scoped | Tracked |
| [docs/QA_COMMAND_UI.md](../QA_COMMAND_UI.md) | Active QA procedure | Reviewed / retained | Tracked |
| [docs/QA_COMPANION_UI.md](../QA_COMPANION_UI.md) | Active QA procedure | Updated / scoped | Tracked |
| [docs/QA_DAILY_REVIEW.md](../QA_DAILY_REVIEW.md) | Legacy UI checklist | Updated / scoped | Tracked |
| [docs/QA_DEPLOYMENT.md](../QA_DEPLOYMENT.md) | Active QA procedure | Updated / scoped | Tracked |
| [docs/QA_DOCK_LONG_SCROLL.md](../QA_DOCK_LONG_SCROLL.md) | Active QA procedure | Reviewed / retained | Tracked |
| [docs/QA_FINANCES.md](../QA_FINANCES.md) | Active QA procedure | Reviewed / retained | Tracked |
| [docs/QA_FULL_APP.md](../QA_FULL_APP.md) | Active QA procedure | Updated / scoped | Tracked |
| [docs/QA_HEALTH.md](../QA_HEALTH.md) | Active QA procedure | Reviewed / retained | Tracked |
| [docs/QA_HOME.md](../QA_HOME.md) | Active QA procedure | Updated / scoped | Tracked |
| [docs/QA_MEMOS.md](../QA_MEMOS.md) | Active QA procedure | Reviewed / retained | Tracked |
| [docs/QA_PROJECTS.md](../QA_PROJECTS.md) | Active QA procedure | Reviewed / retained | Tracked |
| [docs/QA_PWA.md](../QA_PWA.md) | Active QA procedure | Updated / scoped | Tracked |
| [docs/QA_WORKOUT.md](../QA_WORKOUT.md) | Active QA procedure | Updated / scoped | Tracked |
| [docs/README.md](../README.md) | Current reference | New current-doc routing / handoff | Local only |
| [docs/RELIABILITY_RELEASE.md](../RELIABILITY_RELEASE.md) | Current reference | Reviewed / retained | Tracked |
| [docs/SOCIAL_TRAINING_DEPLOYMENT.md](../SOCIAL_TRAINING_DEPLOYMENT.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/SOCIAL_TRAINING_FOUNDATION.md](../SOCIAL_TRAINING_FOUNDATION.md) | Current reference | Reviewed / retained | Tracked |
| [docs/specs/workout-rest-coordination.md](../specs/workout-rest-coordination.md) | Completed spec | Updated / scoped | Local only |
| [docs/TRAINING_ACTIVE_RELEASE.md](../TRAINING_ACTIVE_RELEASE.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/TRAINING_CORRECTIVE_RECOVERY.md](../TRAINING_CORRECTIVE_RECOVERY.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/TRAINING_NAVIGATION_QA.md](../TRAINING_NAVIGATION_QA.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/TRAINING_PROFILE_RELEASE.md](../TRAINING_PROFILE_RELEASE.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/TRAINING_VISUAL_FIDELITY.md](../TRAINING_VISUAL_FIDELITY.md) | Dated release/QA evidence | Updated / scoped | Tracked |
| [docs/WHATSAPP_BRIDGE_RELIABILITY_PATCH.md](../WHATSAPP_BRIDGE_RELIABILITY_PATCH.md) | Current reference | Reviewed / retained | Tracked |
| [docs/WHATSAPP_PROACTIVE_ARCHITECTURE.md](../WHATSAPP_PROACTIVE_ARCHITECTURE.md) | Current reference | Updated / scoped | Tracked |
| [docs/WORKOUT_WEB_PUSH.md](../WORKOUT_WEB_PUSH.md) | Current reference | Updated / scoped | Tracked |
| [GLOSSARY.md](../../GLOSSARY.md) | Current reference | Reviewed / retained | Local only |
| [graphify-out/GRAPH_REPORT.md](../../graphify-out/GRAPH_REPORT.md) | Stale generated snapshot | Marked stale; no graph rebuild | Local only |
| [PROJECT_CONTEXT.md](../../PROJECT_CONTEXT.md) | Current reference | Updated / scoped | Tracked |
| [supabase/README.md](../../supabase/README.md) | Current reference | Updated / scoped | Tracked |
| [tests/brain/README.md](../../tests/brain/README.md) | Current reference | Reviewed / retained | Tracked |
