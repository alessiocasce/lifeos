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
- Next: commit Checkpoint A, record its SHA here, then inspect actual proactive/outbox/permission code before Checkpoint B.
- Last good commit before Checkpoint A: `fdf9b5d`.

## Slice 4 checkpoints

- B: typed monitor registry plus standing MONITOR/MESSAGE permission, default deny.
- C: shared Attention Engine, quiet hours/cooldowns/dismissal and bounded decision ledger.
- D: reuse proactive outbox/Butler and pass service-seam regressions.
- E: explicit migration/live QA, OAuth and migration-ledger audit, docs and deploy handoff.
