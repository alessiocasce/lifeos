# Companion vNext First Slice Progress

## Overall Status

Implementation complete and locally validated. Milestones 1-4 (beliefs, semantic operations, compound runtime, MCP/context exposure, canonical database journey, and handoff docs) satisfy the first-slice execution brief. Production activation still requires applying the additive Supabase migration before deploying Vercel, followed by the documented physical Oracle/WhatsApp QA.

## Implementation Approach

Build the slice in coherent layers:

1. persistent, user-scoped belief/current-state model with immutable supersession history;
2. semantic routine-state inference and deterministic validation;
3. compound proactive reply orchestration and Butler result rendering;
4. candidate generation and delivery-time filtering from current beliefs;
5. read-only context/MCP exposure;
6. end-to-end PGlite regressions, full validation, and deployment documentation.

The existing BrainTurn, interaction ownership, provider delivery mapping, outbox, and health mutation paths remain authoritative and are not being replaced.

## Completed Requirements

- Repository and execution brief inspected against current `main`.
- Existing proactive accountability, reply ownership, delivery revalidation, MCP, schema, and PGlite seams mapped.
- Added a user-scoped `brain_beliefs` model with exactly one current row per subject/predicate, immutable supersession history, confidence, provenance, effective time, and idempotency.
- Added an atomic transition RPC guarded by a per-subject transaction advisory lock.
- Added a model-agnostic belief service for explicit routine transitions, current/history reads, bounded negative feedback, and proactive policy evaluation.
- A first bare `no` records evidence but remains active; repeated negative feedback becomes uncertain with a bounded cooldown, never implicitly inactive.
- Explicit reactivation supersedes inactive history without deleting it.
- Added a provider-agnostic routine semantic contract with an injectable inference function and Gemini as the default provider adapter.
- Deterministic validation restricts model output to `deactivate`, `suspend`, `reactivate`, `stale_assumption`, or `no_change` for a grounded tracked routine.
- Bare replies bypass semantic inference; low-confidence and cross-target operations are rejected before persistence.
- Temporary pauses are bounded (explicit end/duration or a documented 14-day conservative fallback).
- Added an explicit compound proactive turn stage that keeps the trusted accountability target immutable, resolves it once, then applies only a validated routine-state operation.
- Active/quoted proactive ownership can nominate rich semantic replies without broadening target selection.
- Added a channel-independent Butler machine-result/rendering split with an optional Gemini renderer and concise deterministic fallback.
- Preserved meaningful unrelated residual content for the existing knowledge-extraction path without running the health target twice.
- Added standalone natural routine reactivation/deactivation handling before generic routing.
- Accountability candidate generation and delivery-time revalidation now reject inactive, suspended, cooling-down, or uncertain routine beliefs.
- State changes cancel already queued candidates for the same routine.
- Added read-only MCP tool `get_current_beliefs`, resource `lifeos://brain/current-beliefs`, snapshot/context belief sections, and safe current-row serialization.
- Added a canonical PGlite journey using persisted outbox, assistant message, active interaction ownership, real proactive resolver, real belief RPC, resolution metadata, interaction close, replay idempotency, and next-day candidate suppression.
- Updated architecture, MCP, WhatsApp, QA, deployment, product-direction, and project handoff docs to match the implemented slice.
- Authenticated clients have user-scoped read access to beliefs; semantic transition RPC execution is service-role-only.

## Files / Schema Changed

- `api/_utils/brainBeliefs.js`
- `api/_utils/brainRoutineSemantics.js`
- `api/_utils/brainCompanionTurn.js`
- `api/_utils/brainButler.js`
- `api/_utils/brainInteractionSelection.js`
- `api/_utils/brainProactiveAccountability.js`
- `api/_utils/brainProactiveDelivery.js`
- `api/ai/chat.js`
- `api/_utils/lifeosContextCompiler.js`
- `api/_utils/mcpLifeosData.js`
- `api/mcp.js`
- `supabase/schema.sql`
- `supabase/migrations/20260919120000_companion_beliefs.sql`
- `tests/brain/reliabilityDatabase.js`
- `scripts/test-companion-beliefs.js`
- `scripts/test-schema-contracts.js`
- `package.json`
- `docs/CODEX_COMPANION_VNEXT_PROGRESS.md`
- `PROJECT_CONTEXT.md`
- `docs/BRAIN_ARCHITECTURE.md`
- `docs/WHATSAPP_PROACTIVE_ARCHITECTURE.md`
- `docs/MCP.md`
- `docs/LIFEOS_COMPANION_VNEXT.md`
- `docs/QA_AI_ASSISTANT.md`
- `docs/QA_DEPLOYMENT.md`

## Migrations Added

- `20260919120000_companion_beliefs.sql`

## Tests Passing

- `node --check` for all changed backend/test JavaScript files
- `npm run test:companion` (18 focused behavior tests)
- `npm run test:schema` (includes isolated Companion migration application and RPC replay)
- `npm run test:reliability`
- `npm run test:brain`
- `npm run test:bridge`
- `npm run test:mcp`
- `npm test` (Brain, MCP, schema, reliability, bridge, Workout, and Companion)
- `npm run check:functions` (7 Vercel functions)
- `npm run build`
- `git diff --check`

## Tests Failing

- None.

## Work In Progress

- None in the repository. Deployment and physical transport QA are operational follow-ups.

## Requirements Still Missing

- No implementation requirement remains for this slice.
- Physical Oracle/WhatsApp/Gemini QA remains a post-deploy manual requirement and cannot be claimed locally.

## Known Risks / Decisions

- A bare `no` must record bounded feedback without fabricating an inactive routine.
- Routine state changes must be idempotent and preserve history/provenance.
- `brain_beliefs.value.state` is domain state (`active`, `inactive`, `suspended`, `uncertain`); `record_status` is row lifecycle (`current`, `superseded`).
- One negative reply creates an active belief with an eight-hour cooldown. A second creates an uncertain belief with a seven-day cooldown; normal habit nudges remain suppressed until the uncertainty is explicitly resolved.
- Current v1 behavior suppresses uncertain routines after cooldown rather than sending an automatic clarification; a future stale-model clarification family can make that conversational without restoring ordinary nags.
- Rich semantic interpretation uses one model call; Butler wording may use a second call but always falls back deterministically. No new provider dependency was added.
- No MCP write primitive was added. The internal semantic mutation service is narrow and tested; an external write contract is deferred until it can carry equivalent subject grounding, idempotency, provenance, and authorization.
- Existing quote ownership and health target resolution must remain the only authority for deterministic proactive writes.
- No external MCP write primitive will be added unless the internal semantic mutation contract proves sufficiently narrow and safe.

## Last Good Commit

`c7eee21` - `Complete Companion vNext first slice`

## Recommended Next Step

Apply `supabase/migrations/20260919120000_companion_beliefs.sql`, deploy the Vercel backend, then run the manual WhatsApp journey in `docs/WHATSAPP_PROACTIVE_ARCHITECTURE.md`. The next code slice should add a narrow authenticated semantic belief write API/MCP contract only after production QA confirms this internal transition service.
