# LifeOS documentation index

**Resume after clear or session exit:** [current session handoff](agents/current-handoff.md) records the relocated workspace, approved Settings, floating bottom-bar, Companion, Community and Training decisions, release checks, populated preview startup and remaining device acceptance gates.

Documentation audit reviewed 2026-11-17 against application source `fe8b99c` and current Git/Vercel metadata. Start a fresh agent session with [AGENTS.md](../AGENTS.md), [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md), and `git status`. The [documentation audit](audits/DOCUMENTATION_STATUS.md) inventories every repository Markdown file and records verification limits.

Current UI release: [2026-11-19 checks](qa/ui-release-2026-11-19.md).

## Source and release authority

- Application behavior: current code and configuration. `PROJECT_CONTEXT.md` is the architecture handoff; module docs below explain boundaries and QA.
- Release evidence: [HISTORY.md](HISTORY.md) is newest first. November 17 production is READY at `fe8b99c`, independently matched by the public build-version endpoint. This is a dated observation, not a perpetual health guarantee.
- Database: [supabase/README.md](../supabase/README.md), baseline schema and reviewed forward migrations. Verify objects/ledger before a targeted change; never replay production schema as a QA precondition.
- Requirements: a spec describes the intended contract. Its status and implementation evidence determine what is complete; a proposal or simulation alone does not establish runtime behavior.

## Current implementation references

| Area | Reference | QA / acceptance |
| --- | --- | --- |
| Release and PWA | [Deployment](DEPLOYMENT.md), [Web Push](WORKOUT_WEB_PUSH.md) | [Deployment QA](QA_DEPLOYMENT.md), [PWA QA](QA_PWA.md) |
| Training and rest coordination | [Completed rest spec](specs/workout-rest-coordination.md), [catalog](EXERCISE_CATALOG_REVISION.md) | [Workout QA](QA_WORKOUT.md), [rest evidence](qa/workout-rest-coordination.md) |
| Command / Home | `src/tabs/HomeTab.jsx` | [Command QA](QA_COMMAND_UI.md), [Home QA](QA_HOME.md) |
| Brain / Companion | [Brain architecture](BRAIN_ARCHITECTURE.md), [MCP](MCP.md) | [Companion controls](QA_COMPANION_UI.md), [AI behavior](QA_AI_ASSISTANT.md) |
| WhatsApp | [Bridge](../bridge/whatsapp/README.md), [outbox](WHATSAPP_PROACTIVE_ARCHITECTURE.md), [reply ownership](WHATSAPP_BRIDGE_RELIABILITY_PATCH.md) | [Reliability release](RELIABILITY_RELEASE.md), `test:brain`, `test:reliability`, `test:bridge` |
| Local Settings UI | [Current handoff](agents/current-handoff.md), `src/tabs/SettingsTab.jsx` | [Settings verification](qa/settings-apple-design.md) |
| Local mobile navigation | `src/components/MobileNavigation.jsx`, `src/styles/navigation.css` | [Bottom-bar verification](qa/apple-bottom-bar.md) |
| Local Companion redesign | `src/tabs/AIAssistantTab.jsx`, `src/styles/companion.css` | [Companion redesign verification](qa/companion-apple-design.md) |
| Auth, profile and sharing | [Confirmation/recovery](AUTH_CONFIRMATION.md), [Community](COMMUNITY.md) | [Full-app QA](QA_FULL_APP.md), current auth/profile/community browser tests |
| Calendar, Memos, Projects | Current tabs/services and [Action API](ACTION_API.md) | [Calendar](QA_CALENDAR.md), [Memos](QA_MEMOS.md), [Projects](QA_PROJECTS.md) |
| Health and Finances | Current tabs/services and [Action API](ACTION_API.md) | [Health](QA_HEALTH.md), [Finances](QA_FINANCES.md) |
| Agent workflow | [Issue tracker](agents/issue-tracker.md), [labels](agents/triage-labels.md), [domain docs](agents/domain.md), [glossary](../GLOSSARY.md) | Check live issues; rest tickets #6-#8 are complete. `docs/adr/` is optional and currently absent. |

QA checklists describe tests to perform; they are not proof that every step has passed on the latest deployment. Use dated acceptance evidence and identify fixtures, hosted checks and physical-device results separately. Full-app checklists contain dated release sections; the current module UI references take precedence for navigation and layout.

## Plans, history and generated material

- **Community was redesigned from `main` on 2026-11-18**, replacing the Codex implementation; see the top of [Community evidence](qa/community-apple-design.md).
- [Community Apple-style plan](plans/community-apple-design.md) (visual decisions superseded) preserves the complete end-to-end UI plan and confirmed choices: existing capabilities, full-page member/workout drill-down and open exercise/set logs. The complete design is implemented locally; see [Community evidence](qa/community-apple-design.md) before continuing. No commit or deployment.
- [Settings Apple design audit](audits/SETTINGS_APPLE_DESIGN.md) records the baseline Settings findings. Slices 1-4 of its [implementation plan](plans/settings-apple-design.md) are implemented locally; see [verification and remaining acceptance gates](qa/settings-apple-design.md). They are not committed or deployed.
- [Companion vNext](LIFEOS_COMPANION_VNEXT.md) is a living product roadmap, broader than the implemented beliefs/memory/sync/monitor boundaries.
- [Rankings blueprint](plans/lifeos-rankings/README.md) remains design-only and awaits its own approvals. Its production-scoring/enrollment/reward proposals were not implemented by the timer refactor.
- [Archived handoffs](archive/README.md) and the Rankings archive retain point-in-time briefs/progress. Their old commands/statuses are not current implementation instructions.
- Dated release audits and Training/PWA design reports preserve what was checked then. New banners point to the current handoff; historical measurements and deployment IDs remain intact.
- [Daily Review QA](QA_DAILY_REVIEW.md) is a legacy UI checklist. Compatibility data/services remain, but Companion does not render that workflow.
- [Graph report](../graphify-out/GRAPH_REPORT.md) is a local generated snapshot predating the coordinator merge. It was not rebuilt for this audit; verify every graph observation against current code.

## Safe session handoff

`/clear` clears conversation context, not workspace files or Git commits. On this checkout, the merged implementation is committed/pushed on `main`; this documentation refresh is local until explicitly committed/pushed. Pre-existing local agent, glossary, tracker, spec, Rankings and graph files also include uncommitted/untracked material. Preserve it and inspect status before staging anything. A fresh clone will not contain local-only files.

The broad `npm test` currently fails in the attention-monitor fixed-clock/DB-clock fixture; see the audit for the exact constraint and dates. No production/test implementation was changed by this documentation audit.

Physical iPhone display/installed-PWA behavior, real email receipt, current Oracle health and a fresh hosted database/RLS audit are separate outstanding verification limits. Do not convert local fixtures or a READY deployment into those acceptance claims.
