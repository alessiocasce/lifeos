# LifeOS Reliability Release

## Follow-up: WhatsApp Interaction Ownership

The earlier `supabase/releases/reliability.sql` migration remains unchanged. This follow-up requires one additional additive migration: `supabase/migrations/20260908231937_whatsapp_interaction_reliability.sql`. It adds durable inbound receipts, outgoing provider-message correlation, versioned current interaction ownership, and a partial unique assistant/outbox linkage. It does not alter Health/Memo schemas or the already-migrated text `source_id`.

Deploy in this order: complete local tests; pause Oracle PM2 inbound/polling; apply only the new migration; deploy Vercel; update the external bridge using [WHATSAPP_BRIDGE_RELIABILITY_PATCH.md](WHATSAPP_BRIDGE_RELIABILITY_PATCH.md); restart PM2 and run designated-chat QA. The bridge source is not in this repo, so backend deployment alone does not complete native quote/retry reliability.

New inbound IDs atomically claim a receipt before Brain effects. Completed duplicates replay one stored response; concurrent or uncertain claims do not re-execute. New outgoing IDs map only to an assistant message in the same user-scoped WhatsApp recipient thread. Assistant interaction metadata is recursive, bounded, secret-redacted JSON (`metadata_version: 2`), and proactive target objects retain their types.

BrainTurn now uses one immutable interaction selection. Grounded current-message Health/commands and strong pending cancellation precede trusted native quotes; delivered active ownership precedes a 30-minute adjacent legacy fallback. The proactive executor receives that exact target and cannot silently choose another historical message. Interaction replacement/closure is version-fenced.

`npm run test:schema` executes the additive migration in disposable PostgreSQL and checks RLS, ID constraints, ownership, and uniqueness. `npm run test:reliability` uses actual assistant persistence plus receipt/delivery/interaction tables and exact Health effects. `npm run test:bridge` validates the reference adapter shapes only; it is not proof that Oracle `wts.js` was changed.

After applying the migration, run read-only verification queries:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('brain_whatsapp_inbound_receipts', 'brain_whatsapp_message_deliveries', 'brain_interaction_state')
order by table_name, ordinal_position;

select c.relname, c.relrowsecurity
from pg_class c
where c.relname in ('brain_whatsapp_inbound_receipts', 'brain_whatsapp_message_deliveries', 'brain_interaction_state');

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('brain_whatsapp_inbound_receipts', 'brain_whatsapp_message_deliveries', 'brain_interaction_state')
  and grantee in ('anon', 'authenticated');

select user_id, thread_id, metadata->>'outbox_message_id' as outbox_message_id, count(*)
from public.ai_chat_messages
where role = 'assistant' and coalesce(metadata->>'outbox_message_id', '') <> ''
group by user_id, thread_id, metadata->>'outbox_message_id'
having count(*) > 1;

select count(*) as invalid_provider_ids
from public.brain_whatsapp_message_deliveries
where provider_message_id = '[object Object]' or btrim(provider_message_id) = '';
```

Expected: all three RLS flags true; no `anon`/`authenticated` grants; no duplicate assistant/outbox linkage; zero invalid provider IDs. Inspect composite foreign keys in Supabase before resuming PM2.

This release changes persistence contracts, not proactive features. Existing memo and accountability families remain the only registered families. No new API function or secret is required.

## Deploy Order: Database Change Required

1. Back up the database and record current project totals. Test this release on a staging database first.
2. Pause Oracle PM2 bridge polling (`pm2 stop lifeos-whatsapp-bridge`) and other outbox consumers. Close old LifeOS tabs/PWAs; do not allow project session edits during rollout.
3. Run `supabase/releases/reliability.sql` in the Supabase SQL editor. On an existing installation, use this targeted release rather than rerunning unrelated schema statements. For a fresh installation, `supabase/schema.sql` includes the same release SQL; a test enforces equivalence.
4. Deploy the application/backend together. Reload installed PWAs and all clients before allowing session edits: the old frontend increments project totals itself and would double-count against the new database trigger.
5. Verify the manual checks below, then resume the bridge (`pm2 restart lifeos-whatsapp-bridge`). No bridge restart is normally needed for backend-only deployments, but this rollout deliberately pauses delivery.

The release changes `brain_outbox_messages.source_id` from UUID to text without changing existing UUID values. It adds transactional attention and project-progress triggers. It does not rewrite historic project totals. Do not roll source IDs back to UUID once semantic accountability keys exist.

## Source Identity and Reply Lifecycle

- `(user_id, source_type, source_id)` identifies a logical target. Memo IDs remain UUID strings; accountability keys remain `habit:shower:YYYY-MM-DD`, `wake_time:YYYY-MM-DD`, or `sleep_start:YYYY-MM-DD`.
- Existing `(user_id, idempotency_key)` uniqueness protects enqueue. Window IDs identify deliveries, not separate health effects.
- BrainTurn creates one immutable interaction selection and passes its exact proactive target to runtime dispatch. Pending cancellation and independent commands keep priority; unresolved native quotes and ownerless old history cannot grant a Health/Memo write.
- Delivered outbox IDs are checked before default accountability actions. Resolution is persisted both on the outbox row and matching assistant messages. Resolved targets cannot silently fall back to another older prompt.
- Accountability means **ensure the requested target**, not increment blindly. `brainProactiveDelivery.js` uses user/date uniqueness plus compare-and-swap on `health_logs.updated_at`; retries reread the record. Habits reach the target count, and existing wake/sleep fields are not overwritten. Explicit manual habit logging still supports increments.
- `done`/time closes the logical source and cancels queued same-source fallbacks. `no` consumes this delivery but leaves future windows possible. `no_sleep` closes the source without inventing a sleep timestamp or zero-hour record.
- Snooze uses one key per original outbox ID. Repeated snooze requests reuse that row. Successful snooze consumes the original target and cancels other queued same-source rows, preserving the snoozed row. Admission failure gets an honest response, not a promise of a scheduled message.

## Delivery and Attention

`pollOutboxMessages()` revalidates the source before claiming. Closed/deleted/rescheduled memos and satisfied/resolved/malformed accountability targets are cancelled. Existing claimed rows are reclaimed with status, claim timestamp, and attempt checks. Priority queries fetch each rank separately so low-priority rows cannot exclude high-priority rows from the fetch limit.

Evaluation sorts candidates by priority and includes candidates already admitted in the current pass in its budget. The database adds a per-user/channel advisory lock for concurrent admission and claim transitions:

- Accountability defaults remain 20/day, 20-minute gap, quiet-hours bypass; ordinary memo defaults remain 6/day and 60-minute gap. Effective candidate profiles are persisted. Counts are shared across the channel, not separate independent allowances per family.
- Ordinary enqueue uses creation time for admission; ordinary claim uses recent claim/sent times to prevent an offline backlog from draining all at once.
- Exact due memos bypass the gap, not the daily cap. Snoozes bypass enqueue gap because they are future work, but still obey delivery gap and daily cap.
- A deferred insert is reported as `attention_deferred`; a deferred claim stays queued. Revalidation reasons are stored in metadata. Poll diagnostics include claimed/reclaimed/expired/revalidation-cancelled/deferred counts. A deferred count may also include a concurrent claimant winning the row.
- Poll responses add optional `delivery_attempt`; bridges should echo it in ACK. Older bridges remain compatible but cannot fence a delayed ACK from an older claim attempt.

## Health, Context, Projects, Dates, MCP

- Health notes are text only. Negations and mentions of creatine/shower/skincare never become habit mutations; structured fields remain authoritative.
- Missing/empty sleep remains unknown, actual numeric zero remains data. Workout recovery ignores old sleep observations instead of presenting stale sleep as current readiness.
- Open Loops reduce each pending ID to its latest snapshot before removing terminal/expired states. The read is bounded; it is not an unlimited thread audit.
- Database session triggers apply contribution differences for completed non-hour projects on create/edit/reopen/delete. Hour goals remain duration-derived. Manual project-total edits rebase the total; historic drift must be reconciled manually. A removal that would produce a negative total fails transactionally instead of silently clamping it.
- Home, Health, Calendar, Memos, and Workout observe the Europe/Rome date on a timer, focus, and visibility changes. Untouched today defaults roll forward; dirty Health/open Calendar forms are preserved. Project form dates are initialized when opened. This is not a redesign.
- MCP sanitizer computes truncation and returned counts from the final serialized workout arrays. Query limits and serializer limits are both meaningful; `sets_truncated` means possible/actual incompleteness, not a known total. Workout intelligence's input count describes analyzed sets, not an unlimited raw-data export. No MCP writes or auth changes.

## Automated Validation

- `npm run test:brain`: deterministic Brain/arbitration/state-machine regression harness.
- `npm run test:mcp`: MCP auth/shape, context, and intelligence regression harness.
- `npm run test:schema`: real in-memory PostgreSQL (PGlite), executing the relevant checked-in table definitions and exact release SQL. Covers UUID-to-text preservation, uniqueness, attention admission/delivery and project contribution transitions.
- `npm run test:reliability`: pure regressions plus actual generate/enqueue/claim/sent-ACK metadata/contract/reply/health-resolution journeys through a PostgREST-shaped SQL adapter. Also covers repeated snooze, no-sleep resolution, interleaved ensure replies, and pre-delivery cancellation after manual completion.
- `npm test`: all five suites, no live credentials/services. PGlite is a pinned development dependency.
- `npm run check:functions`: remains 7 functions; shared helpers are not routes.
- `npm run build`, syntax checks, and `git diff --check` complete local validation.

The database tests do not emulate production RLS roles, PostgREST transport, HTTP auth, Gemini, PM2, or physical WhatsApp delivery. PGlite has one connection: interleaving tests are not proof of multi-instance production concurrency.

## Safe Live Smoke

`npm run smoke:whatsapp:outbox` is skipped unless `LIFEOS_RUN_LIVE_OUTBOX_SMOKE=true`. With that opt-in alone it calls authenticated `action: preview`, which evaluates without enqueue/poll/ACK. No physical messages are sent by the script.

`LIFEOS_SMOKE_MUTATE=1` additionally enables real evaluate and poll. Use a dedicated allowlisted test recipient with the real bridge paused. Poll claims real rows; it is not a dry run. ACK additionally requires `LIFEOS_WHATSAPP_OUTBOX_SMOKE_ACK_ID` and uses the requested status (failed by default). The endpoint rejects `dry_run` ACK with 400 rather than pretending to simulate a mutation. Never include live smoke in `npm test`.

## Manual QA Before Resuming Delivery

1. Missing habit: evaluate/poll/send/ACK/reply `fatto`; verify count reaches one, source resolution persists, and repeating the reply does not append another time/count. Try both stale client history and refreshed history.
2. Queue two plausible check-ins; reply `fatto` and verify clarification with no write. With pending calendar action, `No. Cancella tutto` still cancels pending; a new explicit memo command still bypasses check-ins.
3. Queue a nudge, then complete the target in Health before poll; confirm cancellation instead of delivery. Repeat for memo done/reschedule/delete.
4. Wake `9.30` and previous-night sleep `2.30`: verify the correct date and canonical sleep recalculation. `non ho dormito` must not create fake sleep; later same-source prompts must stop.
5. Snooze twice; verify one delayed row. Complete the target before its due time; verify it is cancelled before delivery.
6. Simulate a bridge crash after claim; after timeout poll again. An ordinary backlog must obey the gap; exact due memos retain their exception. Verify stale ACK fencing with an upgraded bridge that echoes `delivery_attempt`.
7. Create/complete/edit/reopen/delete a non-hour project session and reload; confirm contribution deltas exactly once. Try manual totals and a negative-result removal. Hours goals must not be incremented twice.
8. Keep the app open through Rome midnight and DST boundaries. Verify untouched defaults roll forward, open edits stay intact, Home agenda shows four entries, and memo snooze times remain Rome-local even on a device in another zone.
9. Ask MCP for a workout exceeding the serializer array cap; returned counts must match arrays and truncation must be true. Test static token and OAuth separately after deployment.

## Remaining Limits / Next Session

Health mutation, resolution metadata, assistant persistence, and cancellation are separate transactions. Ensure-target retries prevent repeated health increments, but a failure between steps can delay cleanup; poll revalidation is a second defense. A concurrent manual clear or incompatible legacy read-modify-write can still race. Do not claim universal exactly-once semantics.

Physical WhatsApp sends remain at-least-once across send-before-ACK crashes. The new unique index prevents duplicate assistant/outbox links, but Health mutation, source resolution, response persistence, and receipt completion are still separate transactions; an unknown non-idempotent outcome becomes `uncertain` and requires reconciliation. Multi-connection behavior, production RLS, actual Oracle adapter behavior, and real PM2 delivery require staging/live QA. Old rows with no provider ID cannot be reconstructed.

Dependency audit at validation reported 8 existing advisories (6 high, 2 low), including Vite/PostCSS and transitive tooling. The lockfile only adds pinned PGlite; no existing dependency versions changed. Dependency upgrades are deferred to a separately tested toolchain patch, not silently treated as a clean audit.
