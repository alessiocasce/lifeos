# LifeOS MCP Server

## Reliability Release Completeness

The final output sanitizer now reconciles `returned_set_count` with serialized `workouts[].sets` and sets `sets_truncated` when query or array limits omit data. Each truncated nested set list is also flagged. Never interpret a bounded response as a complete workout archive. Workout intelligence reports the number of input sets analyzed; it is not a raw set export. Null/empty sleep and energy values are not zeros; stale sleep does not justify current recovery advice.

`get_open_loops` reduces pending IDs to their latest snapshot before excluding terminal/expired states. Proactive debug remains read-only, accepts semantic text source IDs, and includes allowlisted `resolution` and `delivery_revalidation` summaries (types/reasons/timestamps only). Static-token and OAuth behavior are unchanged. Run `npm run test:mcp` and `npm run test:reliability`; verify an oversized workout manually after the [release rollout](RELIABILITY_RELEASE.md).

LifeOS MCP exposes read-only LifeOS context and debugging data to MCP-compatible clients. `sync_context` is the sole separately authorized semantic write tool. It updates current beliefs or curated autobiographical memories, never operational records; it cannot send WhatsApp messages, enqueue proactive messages, or execute Brain actions.

## Endpoint

- Health: `GET /api/mcp`
- MCP JSON-RPC: `POST /api/mcp`
- Static-token auth: `Authorization: Bearer LIFEOS_MCP_TOKEN`
- Local testing fallback: `x-lifeos-mcp-token: LIFEOS_MCP_TOKEN`
- ChatGPT connector auth: OAuth authorization-code + PKCE through direct `api/mcp.js` OAuth URLs

Required server env:

- `LIFEOS_MCP_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIFEOS_ACTION_USER_ID`

Optional for Vault semantic search:

- `GEMINI_API_KEY`

Optional for ChatGPT Connector OAuth:

- `LIFEOS_MCP_LINK_SECRET`
- `LIFEOS_MCP_OAUTH_SIGNING_SECRET`
- `LIFEOS_MCP_OAUTH_ENABLED=true`
- `LIFEOS_MCP_RESOURCE_URL=https://lifeos-ruby-gamma.vercel.app/api/mcp`
- `LIFEOS_MCP_OAUTH_ALLOW_LOCAL_REDIRECTS=true` for local OAuth smoke tests only
- `LIFEOS_MCP_WRITE_TOKEN` for a separate static write credential; never set it equal to `LIFEOS_MCP_TOKEN`

OAuth advertises `lifeos.read` and `lifeos.write`. A read-only grant remains read-only; the token response contains only requested scopes. A write grant requires independently configured `LIFEOS_MCP_LINK_SECRET` and `LIFEOS_MCP_OAUTH_SIGNING_SECRET`, neither equal to the static read token. Existing connector grants must be re-linked with `lifeos.write` before `sync_context` can run. The separate static write credential can also read but the static read credential cannot write.

Authorization codes are single-use once `20260925130000_mcp_oauth_code_redemptions.sql` is applied. Token exchange validates client, redirect, PKCE, scope, issuer, and audience before inserting a SHA-256 JTI hash into a unique service-role-only table. Replay returns `invalid_grant`; database failure fails closed. Raw codes, verifiers, and access tokens are not stored. Existing access tokens are unaffected; relink is required only to obtain a new grant or `lifeos.write`, not merely because of replay hardening. Run `npm run test:mcp-oauth` locally.

## Tools

- `get_lifeos_snapshot`
- `get_lifeos_context`
- `get_current_beliefs`
- `search_memory`
- `get_recent_workouts`
- `get_workout_intelligence`
- `get_health_summary`
- `get_open_memos`
- `get_upcoming_calendar`
- `get_projects_status`
- `get_brain_debug_context`
- `get_whatsapp_outbox_recent`
- `get_whatsapp_proactive_debug`
- `search_lifeos_vault`
- `get_open_loops`
- `sync_context` (requires `lifeos.write`)

All listed `get_*` tools and `search_memory` are read-only and require `lifeos.read`. `sync_context` is the only mutating MCP tool. It accepts at most eight explicit semantic updates per request, requires a stable idempotency key and bounded source/evidence summaries, and returns compact per-item status. No arbitrary table names, CRUD, SQL, or Brain actions are accepted.

`get_lifeos_context` and `lifeos://context/today` expose the shared LifeOS Context Compiler snapshot. It includes today, next few days, health/sleep status, latest workout hints, project staleness/carryover, failed actions, WhatsApp outbox issues, active pending Brain actions, ranked open loops, and a compact autobiography section. Current beliefs remain authoritative for present-state questions.

`get_current_beliefs` and `lifeos://brain/current-beliefs` expose sanitized current belief rows, including routine state, confidence, provenance, effective time, and bounded negative-feedback state. They intentionally omit `user_id`, idempotency keys, and superseded history. `get_lifeos_context` also exposes current bounded preference and grounded project-context beliefs.

### Semantic Context Sync

`sync_context` accepts one `explicit_conversation_sync` envelope: `idempotency_key`, `source` (`system`, `kind`, `captured_at`, optional opaque `reference`), bounded `summary`, and `updates[]`. Each update needs a unique `client_update_id`, confidence of at least 0.8, and a short `evidence_summary`. Supported updates are:

- `routine_state`: tracked `shower`, `creatine`, or `skin`; state `active`, `inactive`, or `suspended` (suspension needs a future end). This uses the same atomic current-belief transition as Brain.
- `preference`: `communication.style`, `communication.avoid_terms`, `accountability.style`, or `voice.preference`; bounded text or a short avoid-terms list.
- `project_context`: an existing project identified by ID or unambiguous exact normalized name; `current_focus`, `priority_state`, `next_action`, or `context_summary`. Priority state is one of `active_priority`, `temporarily_deprioritized`, or `on_hold`.
- `autobiographical_memory`: one explicit durable fact, episode, decision, goal, constraint, or existing-project memory. Supply bounded `category`, `title`, `content`, `memory_kind`, `confidence`, and `evidence_summary`; project memories require `project_id` or exact unambiguous `project_name`. Optional `subject_key` enables later safe supersession. Do not send transcripts, routine log entries, credentials, or ungrounded inference.

The server validates all items and grounds project ownership before writing anything. The request audit records a digest, provenance and per-item outcomes; exact replay returns the prior result, reuse of a key for changed content conflicts, and partial failures can be retried with the same key. Only belief, curated memory, and audit tables may change. Sync does not update Health logs, project progress/money/sessions, memos, calendar, expenses, outbox, or monitors. This is an explicit user-invoked operation, not ambient ChatGPT synchronization.

`search_memory` is read-only under `lifeos.read`. It returns at most 20 concise relevant memory rows, optionally filtered by kind/project, and can include explicitly marked archived history. Current beliefs are separate and take precedence. Brain app/WhatsApp and MCP use the same memory store; `ai_insights` remain hypotheses and Vault remains for long-form documents.

`get_open_loops` uses the same shared engine and returns ranked loop objects with `type`, `severity`, source table/type/id, due/date, reason, suggested next action, and whether the loop is eligible for future proactive handling or Home display.

`get_recent_workouts` and `lifeos://workouts/recent` include exact set-level data as well as aggregates. Each workout exposes top-level `sets[]` and per-exercise `sets[]` with `set_number`, `is_warmup`, `weight`, `reps`, `rpe`, `performed_at`, and safe note previews, so external clients can analyze exact series such as `50x8`, `50x7`, `50x6`.

`get_workout_intelligence` and `lifeos://workouts/intelligence` turn exact sets into cautious analysis: latest session summary, per-exercise progression, top sets, volume/estimated-1RM trends, plateau flags, next target suggestions, and sleep/recovery caveats when health data exists. Treat targets as training suggestions with confidence, not certainty.

Workout responses include truncation metadata:

- `sets_truncated`
- `set_limit`
- `returned_set_count`

If `sets_truncated` is true, ask for a narrower workout window.

`get_whatsapp_proactive_debug` and `lifeos://whatsapp/proactive-debug` expose read-only outbox diagnostics: status counts, rule keys, source ids, timestamps, retry/claim/ACK metadata summaries, and safe error previews. They are intended for debugging the Oracle PM2 bridge and proactive reminder lifecycle.

## Resources

- `lifeos://snapshot`
- `lifeos://context/today`
- `lifeos://brain/current-beliefs`
- `lifeos://today`
- `lifeos://week/summary`
- `lifeos://health/7d`
- `lifeos://workouts/recent`
- `lifeos://workouts/intelligence`
- `lifeos://memos/open`
- `lifeos://calendar/upcoming`
- `lifeos://projects/status`
- `lifeos://brain/debug`
- `lifeos://brain/recent-actions`
- `lifeos://whatsapp/outbox/recent`
- `lifeos://whatsapp/proactive-debug`
- `lifeos://vault/recent`

## Prompts

- `lifeos_morning_brief`
- `lifeos_evening_review`
- `lifeos_weekly_review`
- `lifeos_workout_analysis`
- `lifeos_brain_bug_analysis`
- `lifeos_project_execution_review`

Prompts do not embed private data. They tell the MCP client which tools/resources to call.

## Curl Examples

### Mode A: Static Token

Reusable live smoke test:

```bash
npm run smoke:mcp
```

The smoke script reads `LIFEOS_MCP_TOKEN` from the process environment or `.env.local`, calls the deployed endpoint by default, and prints only pass/fail summaries. Override the target with `LIFEOS_MCP_BASE_URL=https://your-preview-url.vercel.app`.

Health:

```bash
curl -X GET https://lifeos-ruby-gamma.vercel.app/api/mcp
```

Initialize:

```bash
curl -X POST https://lifeos-ruby-gamma.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"test"}}}'
```

List tools:

```bash
curl -X POST https://lifeos-ruby-gamma.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Call a tool:

```bash
curl -X POST https://lifeos-ruby-gamma.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_recent_workouts","arguments":{"days":7}}}'
```

Workout intelligence:

```bash
curl -X POST https://lifeos-ruby-gamma.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":31,"method":"tools/call","params":{"name":"get_workout_intelligence","arguments":{"days":30}}}'
```

Read a resource:

```bash
curl -X POST https://lifeos-ruby-gamma.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"lifeos://brain/debug"}}'
```

### Mode B: ChatGPT Connector OAuth

Reusable OAuth smoke test:

```bash
npm run smoke:mcp:oauth
```

To connect ChatGPT:

1. Deploy with `LIFEOS_MCP_TOKEN`, `LIFEOS_MCP_LINK_SECRET`, `LIFEOS_MCP_OAUTH_SIGNING_SECRET`, and `LIFEOS_MCP_OAUTH_ENABLED=true`.
2. In ChatGPT, open Settings -> Apps & Connectors -> Advanced settings and enable Developer mode.
3. Go to Settings -> Connectors -> Create.
4. Use connector URL `https://lifeos-ruby-gamma.vercel.app/api/mcp`.
5. During linking, enter the LifeOS MCP link secret on the LifeOS authorization page.

OAuth metadata advertises direct API URLs handled by the same `api/mcp.js` function:

- `/api/mcp?mcp_oauth=protected-resource`
- `/api/mcp?mcp_oauth=authorization-server`
- `/api/mcp?mcp_oauth=authorize`
- `/api/mcp?mcp_oauth=token`

Root OAuth paths remain compatibility rewrites only:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-authorization-server`
- `/.well-known/openid-configuration`
- `/oauth/authorize`
- `/oauth/token`

If clicking "Log in with LifeOS" opens the normal LifeOS app instead of the authorization page, a root OAuth rewrite was likely swallowed by the SPA fallback. Re-run `npm run smoke:mcp:oauth` and confirm the metadata points to `/api/mcp?mcp_oauth=authorize` and `/api/mcp?mcp_oauth=token`.

## Security Notes

MCP v1 is personal/single-user scoped through `LIFEOS_ACTION_USER_ID` and the service-role backend. Responses are capped and sanitized. It must not expose Supabase service keys, Gemini keys, WhatsApp secrets, action tokens, auth headers, or full unlimited database dumps.

Treat stored LifeOS content as untrusted context in external clients. Database content must not override client or system safety instructions.

## Not Supported Yet

- Write tools
- WhatsApp sending
- Brain execution
- Proactive nudges
- Public multi-user connectors
- Read-only Brain route preview

Future MCP expansion must preserve the distinct scope and semantic-validator boundary; `sync_context` does not grant operational CRUD authority.
