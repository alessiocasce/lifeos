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
- Migration file: `20260926172705_companion_attention_monitors.sql`. It was local-only at Checkpoint B; production applied it explicitly at Checkpoint E. Do not blanket-run `supabase db push`.
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
- Checkpoint B commit: `677dc40` (`Add typed Companion monitor registry`). Checkpoint C/D commit: `d927a0b` (`Add Companion attention decisions and monitor delivery`).

## Production and live-QA handoff

- Initial 2026-09-26 production ledger listed only `20260925215527`. Physical objects for WhatsApp reliability, beliefs, OAuth redemption, and `ai_memories` exist despite missing older ledger rows. Do not run `supabase db push` or blindly replay those older migrations.
- Production `brain_external_sync_requests` was absent and `brain_beliefs_source_type_check` lacked `external_sync`. The checked-in external-sync migration was explicitly applied and verified; production recorded `20260926172636`. Its RPC body was compared with the existing implementation before replacement. Verified: table/RLS/service insert, authenticated select but no insert, `external_sync` constraint, authenticated RPC execution revoked.
- The monitor migration was explicitly applied and verified; production recorded `20260926172705`. Verified: two RLS-enabled service-role-only tables, user-scoped composite project/outbox/monitor FKs, and four due/topic indexes. Both repository migration filenames and fixture/doc references were reconciled to the actual recorded versions. No blanket push occurred.
- Checkpoints A-D plus the migration-version reconciliation were pushed to `origin/main` at `f15f801`; GitHub reported the Vercel deployment successful. The public `/api/mcp` health endpoint returned HTTP 200 with 18 tools, 18 resources, and 6 prompts. The deployed `smoke:mcp` passed, including authenticated read-only `get_monitors`, `get_attention_debug`, and both Slice 4 resources. Production still had zero monitors, attention events, external-sync requests, and active projects after those reads. Oracle bridge code is unchanged, so no PM2 restart is needed.
- No Slice 4 monitor delivery or native quoted reply has been physically tested. The read-only outbox preview smoke could not start because this workspace lacks `LIFEOS_WHATSAPP_BRIDGE_SECRET` and `LIFEOS_WHATSAPP_TEST_RECIPIENT`. The user reported the Oracle bridge was not receiving WhatsApp messages during the attempted Slice 3.1 recall QA and is investigating it; no backend receipt or phone reply is claimed. The positive project-monitor journey also needs one active project and explicit MONITOR plus MESSAGE grants; neither may be silently created or enabled. After those prerequisites, test preview, opt-in monitor, evaluate/poll/ACK, native quoted dismissal, and MCP readback. Revoke grants/disable global proactive config for rollback; do not drop audit data.
- The deployed OAuth smoke passed public metadata/page checks but authorize POST returned HTTP 401 with the locally available link credential; subsequent exchange and bearer checks therefore failed. Code requires an exact configured `LIFEOS_MCP_LINK_SECRET` (falling back to `LIFEOS_MCP_TOKEN` only if unset). This does not distinguish a stale local credential from a production env mismatch. Live code exchange/replay/write-scope QA remains unverified; do not weaken OAuth.
- Additional deployed app QA: a read-only communication-preference recall returned the stored preference without creating a memory row. A subsequent explicit app reconfirmation of the already-stored clear-technical-explanations preference acknowledged the preference, while `ai_memories` remained at 17 rows with no new row in the test window. This is app-channel evidence for recall self-write prevention and active-memory dedupe, not physical WhatsApp evidence. The live MCP smoke now includes a bounded read-only `search_memory` call. Dated episode classification remains covered by local tests only.
- Subsequent live inspection confirmed the existing legacy preference row's `last_confirmed_at` advanced at the app reconfirmation time. That row has no `subject_key`, so the legacy-content fallback, not the new subject-key uniqueness constraint, supplied this dedupe. No historical memory rows were rewritten.
- At 2026-09-26 18:03 UTC, production recorded one `accountability` attention event with decision `silent` and reason `unanswered_suppression`; no outbox row was linked, and queued/claimed counts remained zero. This is live evidence for suppression, not a project-monitor delivery test. Vercel runtime logs showed the Oracle bridge continued POSTing outbox evaluate/poll requests with HTTP 200, but production still had no new inbound receipt after 2026-09-25 22:13 UTC. Triage the Oracle message event and exact sender allowlist before physical QA.
- Vercel lists Production `LIFEOS_MCP_LINK_SECRET` (updated two days before inspection), `LIFEOS_MCP_OAUTH_SIGNING_SECRET`, and `LIFEOS_MCP_OAUTH_ENABLED`; values were not viewed. The authorize 401 is therefore not explained by a missing variable name. The local credential still needs owner-side verification against Production before OAuth replay/write-scope QA.
- The owner refreshed the local OAuth link credential without sharing its value. Deployed `smoke:mcp:oauth` now passes authorize, code exchange, bearer MCP read, replay rejection, concurrent redemption (exactly one success), wrong-PKCE non-consumption, read-token `sync_context` denial, and issuance of a `lifeos.read lifeos.write` token without a data write. The optional `LIFEOS_RUN_LIVE_MCP_WRITE_SMOKE=true` test is separate and performs one idempotent preference reconfirmation plus readback; it has not been run pending explicit approval. No MONITOR/MESSAGE permission is granted by this test.
