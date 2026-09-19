# Companion vNext First Slice Progress

## Overall Status

In progress. Milestones 1-3 (persistent beliefs, semantic routine operations, and compound proactive runtime) are implemented and verified. The execution brief remains `docs/CODEX_COMPANION_VNEXT_FIRST_SLICE.md`; this file is only a resumable implementation handoff.

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

## Files / Schema Changed

- `api/_utils/brainBeliefs.js`
- `api/_utils/brainRoutineSemantics.js`
- `api/_utils/brainCompanionTurn.js`
- `api/_utils/brainButler.js`
- `api/_utils/brainInteractionSelection.js`
- `api/_utils/brainProactiveAccountability.js`
- `api/_utils/brainProactiveDelivery.js`
- `api/ai/chat.js`
- `supabase/schema.sql`
- `supabase/migrations/20260919120000_companion_beliefs.sql`
- `tests/brain/reliabilityDatabase.js`
- `scripts/test-companion-beliefs.js`
- `scripts/test-schema-contracts.js`
- `package.json`
- `docs/CODEX_COMPANION_VNEXT_PROGRESS.md`

## Migrations Added

- `20260919120000_companion_beliefs.sql`

## Tests Passing

- `node --check api/_utils/brainBeliefs.js`
- `node --check scripts/test-companion-beliefs.js`
- `npm run test:companion` (16 focused behavior tests)
- `npm run test:schema` (includes isolated Companion migration application and RPC replay)
- `npm run test:reliability`
- `npm run test:brain`
- `git diff --check`

## Tests Failing

- None known for milestone 1.

## Work In Progress

- Milestone 4: MCP/context exposure, strengthened end-to-end database journey tests, and documentation.

## Requirements Still Missing

- MCP/context exposure.
- Canonical journeys A-F and full validation.
- Deployment and Oracle/WhatsApp QA documentation.

## Known Risks / Decisions

- A bare `no` must record bounded feedback without fabricating an inactive routine.
- Routine state changes must be idempotent and preserve history/provenance.
- `brain_beliefs.value.state` is domain state (`active`, `inactive`, `suspended`, `uncertain`); `record_status` is row lifecycle (`current`, `superseded`).
- One negative reply creates an active belief with an eight-hour cooldown. A second creates an uncertain belief with a seven-day cooldown; normal habit nudges remain suppressed until the uncertainty is explicitly resolved.
- Current v1 behavior suppresses uncertain routines after cooldown rather than sending an automatic clarification; a future stale-model clarification family can make that conversational without restoring ordinary nags.
- Rich semantic interpretation uses one model call; Butler wording may use a second call but always falls back deterministically. No new provider dependency was added.
- Existing quote ownership and health target resolution must remain the only authority for deterministic proactive writes.
- No external MCP write primitive will be added unless the internal semantic mutation contract proves sufficiently narrow and safe.

## Last Good Commit

`ee0ce38` - `Add semantic routine state contract`

## Recommended Next Step

Expose sanitized current beliefs through shared context/MCP without weakening read-only v1. Then add a PGlite canonical journey that persists a delivered proactive message, selects the real owned target, applies the compound transition idempotently, proves no health write, and proves subsequent candidate/delivery suppression.
