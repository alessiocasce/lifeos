# Companion vNext First Slice Progress

## Overall Status

In progress. Milestone 1 (persistent beliefs) is implemented and verified. The execution brief remains `docs/CODEX_COMPANION_VNEXT_FIRST_SLICE.md`; this file is only a resumable implementation handoff.

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

## Files / Schema Changed

- `api/_utils/brainBeliefs.js`
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
- `npm run test:companion` (5 focused behavior tests)
- `npm run test:schema` (includes isolated Companion migration application and RPC replay)
- `git diff --check`

## Tests Failing

- None known for milestone 1.

## Work In Progress

- Milestone 2: semantic routine-state inference and deterministic validation, followed by compound proactive orchestration.

## Requirements Still Missing

- Semantic routine-state inference with validated operations.
- Compound proactive reply plus residual semantic processing.
- Butler result/wording separation.
- Candidate and delivery-time belief filtering.
- Bounded anti-nag behavior.
- MCP/context exposure.
- Canonical journeys A-F and full validation.
- Deployment and Oracle/WhatsApp QA documentation.

## Known Risks / Decisions

- A bare `no` must record bounded feedback without fabricating an inactive routine.
- Routine state changes must be idempotent and preserve history/provenance.
- `brain_beliefs.value.state` is domain state (`active`, `inactive`, `suspended`, `uncertain`); `record_status` is row lifecycle (`current`, `superseded`).
- One negative reply creates an active belief with an eight-hour cooldown. A second creates an uncertain belief with a seven-day cooldown; after that, candidate generation should ask a stale-model clarification rather than resume a normal nudge.
- Existing quote ownership and health target resolution must remain the only authority for deterministic proactive writes.
- No external MCP write primitive will be added unless the internal semantic mutation contract proves sufficiently narrow and safe.

## Last Good Commit

`2f52715` - `Add Companion belief state model`

## Recommended Next Step

Implement a provider-agnostic semantic routine-state extractor/validator. It should accept current message plus an optional trusted proactive routine target, return a narrow operation (`deactivate`, `suspend`, `reactivate`, `no_change`), reject bare `no` as permanent state evidence, and expose injected-model pure tests before it is wired into `chat.js`.
