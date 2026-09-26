# Companion Slice 3.1 / Slice 4 Progress

## Checkpoint A: memory hardening

- Phase: Slice 3.1 complete locally; Slice 4 not started at this checkpoint.
- Recall questions are observational; the explicit `remember` parser is command-anchored and post-answer extraction declines recall turns.
- Dated meaningful starts/stops/launches and decisions are repaired to episode/decision; mere dates do not force a kind.
- Narrow communication preference claims normalize to stable semantic subjects across app/WhatsApp, with exact punctuation-insensitive dedupe for other candidates. The initial and latest provenance are retained by the existing curation RPC. Existing production duplicates are not deleted.
- Files: `api/_utils/brain.js`, `api/_utils/brainAutobiographicalMemory.js`, `api/ai/chat.js`, `scripts/test-autobiographical-memory.js`, and this handoff/QA documentation.
- No migration or environment change for Slice 3.1. Do not run a blanket Supabase CLI push: production's migration ledger is incomplete relative to repository history.
- Local focused gates: `test:memory`, `test:brain`, `test:mcp`, `test:reliability` passed. Full Slice 4 gate remains pending.
- Live QA: not repeated after this code change; prior app/WhatsApp/MCP checks and their defects are recorded in `CODEX_COMPANION_VNEXT_SLICE3_PROGRESS.md`.
- Checkpoint A commit: `adf31f5` (`Harden Companion autobiographical memory`).
- Last good commit before Checkpoint A: `fdf9b5d`.

## Checkpoint B: typed registry and standing permissions

- Current phase: implementing and testing registry/permission before Attention Engine integration.
- `brain_monitors` is a service-role-only, typed project-staleness registry with grounded project FK, active-topic uniqueness, bounded cadence/checks/expiry, provenance, and state transitions.
- `brain_attention_events` is a service-role-only bounded ledger prepared for the next checkpoint.
- Existing `brain_beliefs` holds explicit `companion.monitor` and `companion.message` grants. Both default false; assistant inference cannot grant them. `sync_context` accepts only explicit boolean `monitor_permission` updates under `lifeos.write`.
- Brain post-answer maintenance only recognizes a narrow first-person project statement grounded against one active project, or an explicit project resolution. Failed maintenance cannot fail the user turn.
- Migration file: `20260926112420_companion_attention_monitors.sql`. It is **local only, not applied to production**; do not deploy dependent backend code or blanket-run `supabase db push`.
- Focused local gates so far: `test:attention`, `test:brain`, `test:mcp-write`, `test:schema` pass. Attention/outbox integration and full gate are pending.
- Production ledger read on 2026-09-26 lists only `20260925215527`; earlier repository migration versions are absent despite present schema objects. Reconcile history separately; do not replay historical migrations.
- Next: implement deterministic silent/message decision, ledger, cooldown/quiet-hours/dismissal checks, then integrate through the existing outbox.

## Slice 4 checkpoints

- B: typed monitor registry plus standing MONITOR/MESSAGE permission, default deny.
- C: shared Attention Engine, quiet hours/cooldowns/dismissal and bounded decision ledger.
- D: reuse proactive outbox/Butler and pass service-seam regressions.
- E: explicit migration/live QA, OAuth and migration-ledger audit, docs and deploy handoff.
