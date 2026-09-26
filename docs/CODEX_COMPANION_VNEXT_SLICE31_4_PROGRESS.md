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

## Checkpoints C/D: Attention and delivery integration

- `brainAttentionEngine.js` makes a bounded `silent`/`message` decision. Project monitors require importance >=3, confidence >=0.8, explicit MESSAGE permission, no quiet-hours conflict, no 7-day same-topic delivery, fewer than 3 interruptions today, and a 2-hour global gap. Repeated dismissals and two unanswered monitor prompts suppress further messages.
- Accountability candidates now also pass a stricter shared decision: normal quiet hours, at most 4 proactive messages/day, a 90-minute global gap, and suppression after repeated dismissal or unanswered same-rule prompts. Memo rules keep their existing policy. Existing inactive/suspended routine beliefs still block generation and poll-time delivery.
- `brainMonitorEvaluation.js` checks at most 30 due typed project monitors in one bounded batch without Gemini. It records a bounded reason-code ledger, advances checks, retires inactive projects, and retries a quiet-hours check after quiet hours end. Preview is read-only. Event/outbox linkage and replay recovery avoid a permanently due check or a duplicate candidate after an interrupted evaluation.
- Approved monitor wording is rendered by `brainButler.js` only after approval. Existing WhatsApp outbox handles enqueue, claim, delivery revalidation, sent ACK, and provider mapping. `brainMonitorReplies.js` handles only a recently delivered monitor prompt; an answer marks the outbox prompt resolved, repeated dismissal suspends the monitor, and explicit loss of priority retires it. It does not execute Health, memo, calendar, or planner writes.
- MCP `get_monitors`, `get_attention_debug`, `lifeos://brain/monitors`, and `lifeos://brain/attention-debug` are read-only and user-scoped. Only `sync_context` can grant MONITOR/MESSAGE standing permission under `lifeos.write` from an explicit user authorization.
- Local gates: `npm test`, `npm run check:functions` (7), `npm run build`, syntax checks, and `git diff --check` passed on this checkpoint. Focused PGlite tests exercise permission absence/presence, typed validation, preview, ledger promotion, enqueue/poll, replay, trusted quoted reply, dismissal, and cross-channel retirement.
- Checkpoint B commit: `677dc40` (`Add typed Companion monitor registry`). Checkpoint C/D commit: pending.

## Production and live-QA handoff

- On 2026-09-26, production `supabase_migrations.schema_migrations` listed only `20260925215527`. Physical objects for WhatsApp reliability, beliefs, OAuth redemption, and `ai_memories` exist despite missing older ledger rows. Do not run `supabase db push` or blindly replay those migrations.
- Production `brain_external_sync_requests` is absent and `brain_beliefs_source_type_check` does not allow `external_sync`; this is a confirmed schema gap, not merely ledger drift. Audit and explicitly apply the external-sync migration before live permission-sync QA. Its existing belief-transition function must be compared before replacing it.
- `20260926112420_companion_attention_monitors.sql` is local only until explicitly applied and verified. The physical `projects` and `brain_outbox_messages` composite ownership keys required by it are present. Do not deploy code that queries the new tables before applying this migration.
- No new backend, migration, or bridge code from this checkpoint has been deployed. Thus no Slice 4 physical WhatsApp or live MCP results are claimed. Oracle PM2 bridge code is unchanged; after backend deployment, test preview, an opt-in monitor, evaluate/poll/ACK, a native quoted dismissal, and MCP readback. Revoke grants/disable global proactive config for rollback; do not drop audit data.
- The prior live OAuth authorize POST returned HTTP 401. Code requires an exact configured `LIFEOS_MCP_LINK_SECRET` (falling back to `LIFEOS_MCP_TOKEN` only if unset). No current local process credential is available to distinguish a stale local secret from a production env mismatch. Do not weaken OAuth. Live code exchange/replay/write-scope QA remains unverified.
