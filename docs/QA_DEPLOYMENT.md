# LifeOS Deployment QA

## WhatsApp Interaction Reliability Migration

This is separate from the already-applied `supabase/releases/reliability.sql` source-id/project release. Before deploying this backend patch:

1. Pause inbound/poll processing with `pm2 stop lifeos-whatsapp-bridge` and note any uncertain in-flight sends without logging content.
2. Run only `supabase/migrations/20260908231937_whatsapp_interaction_reliability.sql` against staging/production. Its duplicate diagnostic intentionally stops if an outbox message already has multiple assistant rows; reconcile rather than deleting automatically.
3. Verify `brain_whatsapp_inbound_receipts`, `brain_whatsapp_message_deliveries`, and `brain_interaction_state`; RLS must be enabled and `anon`/`authenticated` grants revoked.
4. Deploy Vercel and confirm `npm run check:functions` reports 7. Existing inbound/outbox URLs are unchanged.
5. Deploy the checked-in `bridge/whatsapp/wts.js` and `bridge/whatsapp/providerMessageContract.cjs` together, following [WHATSAPP_BRIDGE_RELIABILITY_PATCH.md](WHATSAPP_BRIDGE_RELIABILITY_PATCH.md). This includes `$1`/`_serialized` quote compatibility, plural physical-bubble IDs, local send receipts, proactive `delivery_attempt`, and normal reply `record_reply_delivery`.
6. Restart, inspect sanitized logs, then `pm2 save`. Run the designated-chat matrix in [QA_AI_ASSISTANT.md](QA_AI_ASSISTANT.md).

Verification SQL should check duplicate receipt/provider identities, partial assistant/outbox uniqueness, ownership foreign keys, RLS flags, and invalid empty/`[object Object]` provider IDs. Do not fabricate historical provider IDs. Roll back application/bridge code first if needed; retain the additive tables as diagnostic evidence.

## Reliability Release: Required Migration

Use the exact staged procedure in [RELIABILITY_RELEASE.md](RELIABILITY_RELEASE.md). Back up first; pause Oracle PM2 bridge polling and project edits; close old tabs/PWAs; apply `supabase/releases/reliability.sql`; deploy/reload the new app; validate; resume polling. The SQL preserves memo UUID strings while making `source_id` text and adds attention/project triggers. Old frontend session increments must not run alongside the new trigger. No new server env vars or API functions; function count remains 7.

Run `npm test`, `npm run check:functions`, and `npm run build`. New `test:schema` and `test:reliability` execute embedded PostgreSQL locally, not Supabase RLS or physical WhatsApp. Smoke opt-in alone is preview-only; `LIFEOS_SMOKE_MUTATE=1` is required for real evaluate/poll/ACK and must use a dedicated recipient with the bridge paused. Verify live RLS, delayed ACK/claim attempts, backlog spacing, and PWA reload before calling this deployed.

Run this against the deployed URL after applying `supabase/schema.sql` to the target Supabase project and setting deployment environment variables.

Core Brain/automation env vars include:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIFEOS_ACTION_USER_ID`
- `LIFEOS_ACTION_TOKEN`
- `GEMINI_API_KEY`
- `LIFEOS_WHATSAPP_BRIDGE_SECRET`
- `LIFEOS_WHATSAPP_ALLOWED_SENDERS`
- optional `LIFEOS_WHATSAPP_SENDER_ALIASES`
- optional `LIFEOS_BRAIN_DEBUG`
- optional `LIFEOS_BRAIN_DEBUG_FULL`
- local bridge optional `WHATSAPP_OUTBOX_POLL_SECONDS=60`

The pure Brain regression harness does not require deployment env vars:

```bash
npm run test:brain
```

Run it locally before deployment when Brain, WhatsApp, pending-action, command-draft, working-context, Vault gate, or sleep/wake command behavior changed.

## Auth

1. Open the deployed URL while signed out.
2. Confirm the setup/config screen does not appear when env vars are set correctly.
3. Sign up with a test account.
4. If email confirmation is enabled, complete confirmation and sign in.
5. Refresh the page and confirm the session persists.

## Health

1. Open Health.
2. Create today's health log with sleep times, Coffee, ADC, notes, and time-aware Daily Habits.
3. Save, refresh, and confirm the values reload.
4. Update ADC and at least one Daily Habit.
5. Save again and confirm today's row updates instead of duplicating.

## Calendar

1. Open Calendar.
2. Create an event for today.
3. Edit the title, time, category, or status.
4. Delete the event.
5. Refresh and confirm deleted events do not return.

## Workout

1. Open Workout.
2. Start or select today's workout session.
3. Add a set with exercise, weight, reps, RPE, and date.
4. Refresh and confirm the session and set reload.

## Finances

1. Open Finances.
2. Create one expense dated today.
3. Confirm selected-month spend updates.
4. Refresh and confirm the expense reloads.

## Brain Persistence And Memory

1. Open Assistant.
2. Send a Brain message and refresh; confirm Brain opens a fresh New Chat draft while old messages remain persisted in Supabase/backend context.
3. Confirm old-thread selection remains hidden in the normal UI for now.
4. Add an explicit durable memory and confirm it can be recalled by asking Brain what it remembers or through diagnostics if exposed.
5. Archive/forget the memory through supported controls or commands and confirm it is no longer active AI context.
6. Verify RLS with a second user: threads, messages, memories, insights, Vault documents, and Vault chunks must remain user-scoped.
7. Confirm `/api/ai/chat` persists app messages without changing Shortcut/API action behavior.
8. Send `hello` and confirm `/api/ai/chat` returns selected skill `general_chat` and the assistant message shows a subtle skill badge.
9. Send `What should we build next in LifeOS?` and confirm selected skill `product_builder` is returned/persisted without any LifeOS CRUD write.
10. Send a workout-advice prompt and confirm selected skill `workout_coach` is returned while no calendar event is created.
11. Inspect the persisted assistant row in `ai_chat_messages` and confirm `metadata.selected_skill` is present for new assistant messages.
12. Ask a long eligible analysis and confirm an assistant response can auto-save to Brain Vault without a prominent manual save flow.
13. With `GEMINI_API_KEY` configured, confirm chunks are embedded with `embedding_model = 'gemini-embedding-2'` and a related future Brain question can retrieve the saved report.
14. If Gemini embedding fails or is rate-limited, confirm the Vault document still saves, chunks are marked failed/skipped, and Brain keeps working.

## Home

1. Open Home.
2. Confirm Home reflects persisted Health, Workout, Expense, Calendar-adjacent shell state, and recent AI actions where applicable.
3. Confirm empty states do not show for records just created.

## Direct Tab Routes

1. Directly visit `/calendar`, `/workout`, `/projects`, and `/memos` on the deployed URL.
2. Refresh each direct route and confirm the app loads without a Vercel 404 and keeps the matching tab active.
3. Directly visit `/money` and confirm Finances opens.
4. Directly visit `/ai` and confirm Assistant opens.
5. Confirm `/api/ai/chat` still returns API behavior and is not rewritten to the SPA.
6. Confirm `/api/ai/actions` still returns API behavior and is not rewritten to the SPA.
7. Confirm `/api/integrations/whatsapp/inbound` still returns API behavior and is not rewritten to the SPA.
8. Confirm `/api/actions?action=expense`, `/api/actions?action=health`, and `/api/actions?action=calendar` reach serverless API behavior.
9. Confirm legacy paths such as `/api/actions/expense`, `/api/actions/health`, and `/api/actions/calendar` rewrite to the consolidated action function and are not SPA routes.

## Sign Out / Sign In

1. Sign out.
2. Confirm the app returns to the global auth screen.
3. Sign back in with the same account.
4. Confirm persisted records reload.

## User Scope

1. Sign out.
2. Sign in with a second test account.
3. Confirm the first user's Health, Workout, Expense, Calendar, and Daily Review data does not appear.
4. Create one record as the second user.
5. Sign back in as the first user and confirm the second user's data is hidden.

## iPhone Safari

1. Open the deployed URL in iPhone Safari.
2. Confirm no horizontal scrolling on Home, Health, Workout, Finances, Calendar, or Assistant.
3. Confirm inputs do not zoom on focus.
4. Confirm the bottom navigation does not cover Health controls, Save Set, Create Event, Save Expense, or Save Review.
5. Confirm Health Coffee/ADC counters and time-aware Daily Habits are thumb-friendly.
6. Confirm Workout set logging is usable one-handed.

## PWA / Home Screen

1. Run `docs/QA_PWA.md` against the deployed HTTPS URL.
2. Confirm LifeOS can be added to the iPhone Home Screen.
3. Confirm the installed app opens standalone and keeps API/Supabase/Gemini responses uncached.
4. Confirm PWA start still opens normally after the tab-route rewrite deployment.
5. Change data on desktop, pull down from the top of the installed PWA, and confirm one refresh synchronizes data across multiple modules.
6. Deploy a new Vercel version, keep the installed PWA open, and pull to refresh.
7. With no meaningful unsaved work, confirm the waiting service worker activates and LifeOS reloads once without closing the PWA.
8. Repeat with a complete unsaved Workout set and confirm auto-reload is blocked with `Update ready - save current workout set first.`
9. Confirm incomplete half-written fields do not block the update.
10. Save the set, pull again, and confirm the update applies.
11. Confirm there is no repeated or infinite reload loop.
12. Confirm `/api/ai/chat`, `/api/ai/actions`, and `/api/actions?action=wake` still return API behavior after the update.
13. Confirm the installed iPhone PWA moves the main tab content with the pull gesture, holds it lowered during refresh, and smoothly returns it afterward.
14. Confirm the shell header and bottom navigation remain stable and no content remains stuck translated after success, failure, or an update-ready guard.
15. Pull to refresh on Brain and confirm threads, current messages, memories, insights, Vault documents, and Recent Actions update without wiping typed composer text.

## Brain Schema Deployment

1. Run the latest `supabase/schema.sql` before testing Brain persistence.
2. Confirm `ai_chat_threads`, `ai_chat_messages`, `ai_memories`, `ai_insights`, `ai_vault_documents`, and `ai_vault_chunks` exist.
3. Confirm authenticated users can only read/write their own rows.
4. Confirm the composite thread/message ownership foreign key rejects cross-user message insertion.
5. Confirm deploying Brain changes does not break consolidated Action API calls such as `/api/actions?action=health`, `/api/actions?action=wake`, `/api/actions?action=sleep-start`, `/api/actions?action=habit`, `/api/actions?action=calendar`, or `/api/actions?action=expense`.
6. Confirm the `vector` extension is enabled in the `extensions` schema.
7. Confirm `match_ai_vault_chunks` does not return another user's chunks.
8. Confirm `match_ai_vault_chunks_for_user` is usable by service-role calls and still filters to the configured target user.
9. Confirm server-only `GEMINI_API_KEY` is deployed for Brain and Brain Vault semantic retrieval.
10. Optionally set `GEMINI_EMBEDDING_MODEL=gemini-embedding-2`; do not add `OPENAI_API_KEY` for Vault embeddings.
11. Save a Vault report and confirm chunks are `ready` with `embedding_model = 'gemini-embedding-2'`.
12. Run the Vault `Re-embed` repair action for old skipped, failed, pending, null-model, or non-Gemini chunks.
13. Confirm Brain Skill Architecture still stores skill/route/Vault metadata in existing JSON metadata fields.
14. Confirm `brain_outbox_messages` and `brain_proactive_rules` exist.
15. Confirm `brain_outbox_messages` has user-scoped RLS, status/priority/channel checks, and unique `(user_id, idempotency_key)`.
16. Confirm `brain_proactive_rules` has user-scoped RLS and unique `(user_id, rule_key, channel)`.
17. Confirm `ai_action_logs.source` accepts `whatsapp` so WhatsApp-originated Brain writes can be logged.

## Brain Trace Debugging

1. Keep `LIFEOS_BRAIN_DEBUG` unset or false during normal production use.
2. For an active investigation, set `LIFEOS_BRAIN_DEBUG=true` and redeploy.
3. Confirm Vercel function logs print compact `BRAIN_TRACE` JSON lines for Brain-handled messages.
4. Keep `LIFEOS_BRAIN_DEBUG_FULL` unset or false unless actively debugging a hard issue.
5. If `LIFEOS_BRAIN_DEBUG_FULL=true` is enabled, confirm traces still cap text fields and never include secrets, API keys, auth headers, or chain-of-thought.
6. Call `/api/ai/chat` or `/api/integrations/whatsapp/inbound` with `x-lifeos-debug: true`.
7. Confirm the JSON response includes `debug.brain_trace`.
8. Inspect Supabase `ai_chat_messages.metadata.brain_trace` on assistant rows and confirm trace metadata is persisted even when the HTTP response is not in debug mode.
9. Turn debug env vars back off after investigation.

## WhatsApp Bridge Deployment

1. Set Vercel env vars:
   - `LIFEOS_WHATSAPP_BRIDGE_SECRET`
   - `LIFEOS_WHATSAPP_ALLOWED_SENDERS`
2. Redeploy after setting the env vars.
3. On the local bridge machine, set:
   - `LIFEOS_BASE_URL=https://lifeos-ruby-gamma.vercel.app`
   - `LIFEOS_WHATSAPP_BRIDGE_SECRET` to the same shared secret as Vercel.
   - `WHATSAPP_ALLOWED_SENDERS` to the sender id allowed locally.
4. Do not add Supabase service keys, Gemini keys, database credentials, or frontend-only env values to the local bridge.
5. Confirm `.env`, `.wwebjs_auth/`, and `.wwebjs_cache/` are not committed.
6. Run the local bridge, scan the QR code, and keep the PC awake.
7. If the PC sleeps or the process stops, confirm WhatsApp inbound stops until the bridge is restarted.
8. For 24/7 operation, the current production path is the Oracle VM bridge managed by PM2, not Docker:
   - `pm2 status`
   - `pm2 logs lifeos-whatsapp-bridge`
   - `pm2 restart lifeos-whatsapp-bridge`
   - `pm2 save`
9. Vercel backend deploys do not require a PM2 bridge restart unless bridge code or bridge env vars changed.
10. If WhatsApp exposes both `@lid` and `@c.us` ids, set `LIFEOS_WHATSAPP_SENDER_ALIASES` in Vercel, for example `39XXXXXXXXXX@c.us=111780936298528@lid`. Keep `LIFEOS_WHATSAPP_ALLOWED_SENDERS` on the canonical sender.
11. For this native-reply patch, deploy Vercel first. It rejects proactive sent ACKs without physical provider IDs and persists all mappings before returning the debug mapping summary. Then pull/copy both checked-in bridge files to Oracle and restart PM2; the bridge now falls back to the matching outgoing `message_create` event when `client.sendMessage()` returns no identity. No new SQL is required if the interaction reliability migration is already applied.
12. Run `npm run test:bridge` before copying. On Oracle, run `node --check wts.js` and `node --check providerMessageContract.cjs` from the deployed bridge directory without deleting session/cache directories.
13. With `WHATSAPP_DEBUG=true` and backend debug enabled for the designated test, send one proactive message and compare only the safe provider fingerprints: outgoing capture, ACK persisted mapping, and quoted inbound lookup must match. Confirm the ACK reports one received and one persisted mapping before using native Reply.
14. Manually test the deployed endpoint:

```bash
curl -X POST "https://lifeos-ruby-gamma.vercel.app/api/integrations/whatsapp/inbound" \
  -H "Content-Type: application/json" \
  -H "x-lifeos-whatsapp-secret: YOUR_SECRET" \
  -d '{
    "from": "111780936298528@lid",
    "message_id": "manual-test-1",
    "body": "come stai?",
    "type": "chat",
    "is_group": false,
    "source": "whatsapp"
  }'
```

Expected:

- `200`
- JSON includes `reply`, `thread_id`, `assistant_message_id`, and `source: whatsapp`
- Wrong secret returns `401`
- Unallowed sender returns `403`
- Non-text message types are rejected safely
- Brain app UI still opens fresh New Chat and does not show the WhatsApp backend thread selector

12. To debug the same endpoint, add `x-lifeos-debug: true`:

```bash
curl -X POST "https://lifeos-ruby-gamma.vercel.app/api/integrations/whatsapp/inbound" \
  -H "Content-Type: application/json" \
  -H "x-lifeos-whatsapp-secret: YOUR_SECRET" \
  -H "x-lifeos-debug: true" \
  -d '{
    "from": "111780936298528@lid",
    "message_id": "debug-test-1",
    "body": "Segna che sto andando a dormire ora alle 3.41am",
    "type": "chat",
    "is_group": false,
    "source": "whatsapp"
  }'
```

Expected:

- JSON includes `reply`
- JSON includes `debug.brain_trace`
- The debug trace is not included inside the WhatsApp `reply` text

13. To debug an actual live WhatsApp message, inspect Vercel `BRAIN_TRACE` logs if enabled, Supabase `ai_chat_messages.metadata.brain_trace`, and matching `client_request_id` or WhatsApp `message_id`.

## Proactive WhatsApp Memo Outbox Deployment

Schema must be rerun before this QA because v1A adds `brain_outbox_messages` and `brain_proactive_rules`.
The outbox API is intentionally consolidated into one Vercel serverless function, `POST /api/integrations/whatsapp/outbox`, to stay under the Hobby plan function limit. Run `npm run check:functions` before deployment and keep the count at 12 or lower. Legacy `/outbox/evaluate`, `/outbox/poll`, and `/outbox/ack` paths are compatibility rewrites only; new bridge code should call the combined endpoint.

1. Confirm Vercel env vars are set:
   - `LIFEOS_WHATSAPP_BRIDGE_SECRET`
   - `LIFEOS_WHATSAPP_ALLOWED_SENDERS`
2. On the local bridge, add `WHATSAPP_OUTBOX_POLL_SECONDS=60`.
3. The bridge should periodically:
   - POST `/api/integrations/whatsapp/outbox` with `action: "evaluate"`
   - POST `/api/integrations/whatsapp/outbox` with `action: "poll"`
   - send returned messages with `client.sendMessage(to, body)`
   - POST `/api/integrations/whatsapp/outbox` with `action: "ack"` and `status: "sent"` or `status: "failed"`
4. Keep the PC awake; if the bridge stops, WhatsApp outbound delivery stops too.
5. In `DRY_RUN`, print outbound messages and avoid acking as `sent` unless intentionally testing ack behavior.

Evaluate:

```bash
curl -X POST "https://lifeos-ruby-gamma.vercel.app/api/integrations/whatsapp/outbox" \
  -H "Content-Type: application/json" \
  -H "x-lifeos-whatsapp-secret: YOUR_SECRET" \
  -H "x-lifeos-debug: true" \
  -d '{"action":"evaluate","recipient":"111780936298528@lid","bridge_id":"local-main"}'
```

Poll:

```bash
curl -X POST "https://lifeos-ruby-gamma.vercel.app/api/integrations/whatsapp/outbox" \
  -H "Content-Type: application/json" \
  -H "x-lifeos-whatsapp-secret: YOUR_SECRET" \
  -H "x-lifeos-debug: true" \
  -d '{"action":"poll","recipient":"111780936298528@lid","bridge_id":"local-main","limit":3}'
```

Ack:

```bash
curl -X POST "https://lifeos-ruby-gamma.vercel.app/api/integrations/whatsapp/outbox" \
  -H "Content-Type: application/json" \
  -H "x-lifeos-whatsapp-secret: YOUR_SECRET" \
  -H "x-lifeos-debug: true" \
  -d '{"action":"ack","recipient":"111780936298528@lid","message_id":"OUTBOX_ID","status":"sent","bridge_id":"local-main"}'
```

Expected:

- Evaluate queues due timed memos and reports skipped duplicates/suppression in debug.
- Poll returns only due, unexpired, queued messages and marks them claimed.
- Poll sorts due messages by priority rank: `high`, then `normal`, then `low`.
- Ack `sent` marks the row sent and persists the proactive message into the dedicated WhatsApp Brain thread.
- Ack `failed` retries while attempts are below the v1 cap, then marks failed.
- Replies to the proactive WhatsApp message use the existing inbound endpoint and same WhatsApp sender id.
- Repeated sent ACKs must not create duplicate proactive assistant messages for the same outbox id.
- Short replies to recent proactive reminders should resolve the proactive reminder before unrelated old pending actions.

Opt-in backend smoke:

```bash
LIFEOS_RUN_LIVE_OUTBOX_SMOKE=true npm run smoke:whatsapp:outbox
```

This script requires `LIFEOS_BASE_URL`, `LIFEOS_WHATSAPP_BRIDGE_SECRET`, and `LIFEOS_WHATSAPP_TEST_RECIPIENT`. It is not part of default tests because it can claim live outbox rows.

Troubleshooting:

- If WhatsApp repeats the same pending-action confirmation after `Sì`, confirm the bridge sends the same stable `from` id on every message.
- Confirm `LIFEOS_WHATSAPP_ALLOWED_SENDERS` exactly matches that `from` value.
- Confirm the endpoint is reusing one WhatsApp Brain thread per sender instead of creating a new thread per message.
- Inspect the latest assistant message metadata and confirm `pending_action` exists after the confirmation prompt.
- Confirm a later assistant message stores the same `pending_action.id` with `status: completed` or `status: cancelled` after resolution.
- For sleep-start commands, confirm the action type is `log_sleep_start` and not a generic Health note.
- If a sleep-start confirmation still loops, inspect `metadata.brain_trace` and verify `pending_action.type`, `pending_action.missing_fields`, `pending_reply_intent`, `pending_resolution`, and `tools`.
- Dirty legacy pending shapes like `update_health_log` with `activity: sonno` or `health_field: inizio sonno` plus a time should normalize to `log_sleep_start` with no stale `health_field` missing field.

## LifeOS MCP Deployment

No schema rerun is required for MCP v1.1. The Action API is consolidated into one function before MCP OAuth is enabled, so `npm run check:functions` should remain below the Vercel Hobby limit.

1. Set Vercel env vars:
   - `LIFEOS_MCP_TOKEN`
   - `LIFEOS_MCP_LINK_SECRET`
   - `LIFEOS_MCP_OAUTH_SIGNING_SECRET`
   - `LIFEOS_MCP_OAUTH_ENABLED=true`
2. Confirm existing server env vars are still present:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `LIFEOS_ACTION_USER_ID`
3. Optional: keep `GEMINI_API_KEY` configured if `search_lifeos_vault` should use semantic Vault search.
4. Run before deployment:
   - `npm run test:mcp`
   - `npm run smoke:mcp` after deployment or against the deployed preview URL
   - `npm run smoke:mcp:oauth` after deployment or against the deployed preview URL
   - `npm run check:functions`
   - `npm run smoke:whatsapp:outbox` only with explicit live opt-in when testing outbox lifecycle
5. Confirm `npm run check:functions` reports 12 or fewer Vercel API route functions.
6. Confirm all legacy MCP tools/resources remain read-only. After Slice 3, `search_memory` is read-only and the separately authorized `sync_context` may update only current beliefs, curated autobiographical memories, and its audit; no tool sends WhatsApp, enqueues outbox rows, or calls Brain execution.
7. Confirm ChatGPT OAuth metadata advertises direct `api/mcp.js` URLs, not root OAuth paths, for authorize/token.

The smoke script reads `LIFEOS_MCP_TOKEN` from `.env.local` or the process env and does not print it. To test a preview deployment, run it with `LIFEOS_MCP_BASE_URL=https://your-preview-url.vercel.app`.
The OAuth smoke script reads `LIFEOS_MCP_LINK_SECRET` or the dev fallback from `.env.local` or process env and redacts authorization codes/access tokens from output.

Health:

```bash
curl -X GET "https://lifeos-ruby-gamma.vercel.app/api/mcp"
```

Initialize:

```bash
curl -X POST "https://lifeos-ruby-gamma.vercel.app/api/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"test"}}}'
```

Tools list:

```bash
curl -X POST "https://lifeos-ruby-gamma.vercel.app/api/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Tool call:

```bash
curl -X POST "https://lifeos-ruby-gamma.vercel.app/api/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_recent_workouts","arguments":{"days":7}}}'
```

Resource read:

```bash
curl -X POST "https://lifeos-ruby-gamma.vercel.app/api/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"lifeos://brain/debug"}}'
```

Direct OAuth protected resource metadata:

```bash
curl -X GET "https://lifeos-ruby-gamma.vercel.app/api/mcp?mcp_oauth=protected-resource"
```

Direct OAuth authorization server metadata:

```bash
curl -X GET "https://lifeos-ruby-gamma.vercel.app/api/mcp?mcp_oauth=authorization-server"
```

Direct OAuth authorize route:

```bash
curl -i -X GET "https://lifeos-ruby-gamma.vercel.app/api/mcp?mcp_oauth=authorize"
```

For ChatGPT Connector setup, paste `https://lifeos-ruby-gamma.vercel.app/api/mcp` as the connector URL and enter the LifeOS MCP link secret on the authorization page.

Expected:

- Invalid or missing token returns `401`.
- Missing auth includes a `WWW-Authenticate` header pointing to the OAuth protected resource metadata.
- Direct `GET /api/mcp?mcp_oauth=authorize` with missing params returns MCP authorization error HTML, not the SPA.
- Root `/oauth/authorize` is compatibility only; direct API OAuth URLs are the source of truth.
- Unknown methods/tools/resources return JSON-RPC errors.
- `tools/list` marks legacy read tools with `lifeos.read` and `sync_context` with `lifeos.write`.
- `tools/list` includes `get_whatsapp_proactive_debug`.
- `resources/list` includes `lifeos://whatsapp/proactive-debug`.
- `get_recent_workouts` includes exact set rows plus `sets_truncated`, `set_limit`, and `returned_set_count`.
- Responses include compact summaries only.
- No API keys, bearer tokens, Supabase service keys, Gemini keys, WhatsApp secrets, or auth headers appear in responses.

## Known Non-Failing Build Warning

The production build may warn that a JavaScript chunk is larger than 500 kB. This is expected for now and does not block deployment.

## Companion Belief Migration

The Companion first slice requires `supabase/migrations/20260919120000_companion_beliefs.sql`.

Deployment order:

1. Apply the migration in Supabase before the backend deploy. It is additive and does not rewrite `ai_memories`, Health logs, outbox rows, or interaction/provider mappings.
2. Verify `brain_beliefs` has RLS enabled, authenticated users have only the user-scoped read policy, and only `service_role` can execute `apply_brain_belief_transition`.
3. Deploy Vercel and run `npm run smoke:mcp` against the deployed endpoint; confirm `get_current_beliefs` and `lifeos://brain/current-beliefs` are listed.
4. The Oracle bridge source did not change for this slice, so no PM2 restart is required solely for Companion beliefs. Restart only if bridge code or bridge environment changes separately.
5. Run the manual WhatsApp journey in `docs/QA_AI_ASSISTANT.md`. Local suites do not prove Gemini semantics or physical Oracle/WhatsApp delivery.

Rollback order: deploy the previous backend first. Keep the additive table/function in place until no deployed backend references it; dropping belief history is intentionally not part of the normal rollback.

## Companion Slice 2 Semantic Sync Deployment

This is a separate migration and backend release. Local tests do not apply it to production.

1. Confirm the Slice 1 belief migration is applied. Apply `supabase/migrations/20260925120000_companion_external_sync.sql` before deploying the Slice 2 backend. It adds the request-audit table and `external_sync` provenance, refreshes belief RPC idempotency, and explicitly revokes `anon`/`authenticated` RPC execution and table writes. Verify RLS and privileges after applying; do not rerun `supabase/schema.sql` against production.
2. Configure a distinct `LIFEOS_MCP_WRITE_TOKEN` only for a trusted custom write client, or configure independent `LIFEOS_MCP_LINK_SECRET` and `LIFEOS_MCP_OAUTH_SIGNING_SECRET` for OAuth. Never reuse `LIFEOS_MCP_TOKEN` as a write/link/signing secret. Keep `LIFEOS_MCP_OAUTH_ENABLED` consistent with the existing connector deployment.
3. Deploy Vercel. No Oracle bridge code or environment changes are required for this slice; no PM2 restart is required. Confirm `npm run check:functions` still reports seven functions.
4. Re-link a ChatGPT connector that needs sync and explicitly grant `lifeos.write` (and `lifeos.read` for readback). Previously issued read-only OAuth tokens remain read-only. Verify a read token cannot call `sync_context`, an authorized token can sync one explicit tracked-routine change, and `get_current_beliefs` / `get_lifeos_context` show it. Do not test with a real private transcript or a destructive operational action.
5. Replay the same idempotency key and verify no second belief row; reuse that key with changed content and verify conflict. Confirm no Health/project operational/outbox rows changed. Inspect `brain_external_sync_requests` for the bounded request audit. Run `npm run test:mcp-write` locally before this manual QA.

The tool does not run ambient sync, send WhatsApp, or write operational LifeOS records. Roll back the backend before considering migration removal; retain audit/belief history unless a separate data-retention decision authorizes deletion.

## Companion Slice 2.5 and Slice 3 Deployment

Do not deploy the backend before applying its migrations. On 2026-09-25, both Slice 2.5 and Slice 3 migrations were applied to production and their table/column, RLS, constraint, index, and RPC privilege contracts were verified read-only. The backend commits `dd83153` and `81c592b` were pushed to `main`; Vercel deployment and physical connector/WhatsApp behavior still require verification.

1. Confirm `20260919120000_companion_beliefs.sql` and `20260925120000_companion_external_sync.sql` are present. For a new environment only, apply `supabase/migrations/20260925130000_mcp_oauth_code_redemptions.sql`, then `supabase/migrations/20260925215527_companion_autobiographical_memory.sql`. Production has both already; do not reapply them or rerun the whole `schema.sql`. The migrations preserve legacy `ai_memories` rows.
2. Verify OAuth redemption table RLS and unique hash key; only `service_role` may insert. Verify `ai_memories` RLS/user scoping, composite project owner FK, and that only `service_role` may execute `curate_autobiographical_memory`. Do not inspect or log raw codes/tokens/private memory content during verification.
3. Run `npm run test:mcp-oauth`, `npm run test:memory`, `npm run test:mcp-write`, `npm run test:schema`, `npm test`, `npm run check:functions`, and `npm run build` locally. Function count should remain seven. Then deploy Vercel. No Oracle PM2 restart is required because bridge code is unchanged.
4. Relink a connector only if it needs a new OAuth grant or `lifeos.write`. Existing access tokens keep their issued scopes. Test one new code exchange, then a replay returning `invalid_grant`; a wrong PKCE/client/redirect attempt must not consume the code. Local PGlite concurrency is not a multi-instance Vercel proof, so verify safely in a test connector/environment if available.
5. Follow the `Companion Autobiographical Memory Journey` in `docs/QA_AI_ASSISTANT.md`. MCP read-only search and explicit sync share the app/WhatsApp memory store; neither invokes operational LifeOS actions. Production Gemini curation and physical WhatsApp QA remain manual.

Rollback: deploy the previous backend before removing either additive migration. Do not drop redemption or memory history during an ordinary rollback. If OAuth redemption storage fails, code exchange fails closed; use `LIFEOS_MCP_OAUTH_ENABLED=false` only as a temporary OAuth rollback, not as replay protection.
