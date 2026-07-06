# LifeOS MCP Server

LifeOS MCP v1 exposes read-only LifeOS context and debugging data to MCP-compatible clients such as ChatGPT, Codex, Claude, or local tools.

It is intentionally not a write layer. It cannot create records, send WhatsApp messages, enqueue proactive messages, or execute Brain actions.

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

Use a separate `LIFEOS_MCP_LINK_SECRET` and `LIFEOS_MCP_OAUTH_SIGNING_SECRET` in production. Development can fall back to `LIFEOS_MCP_TOKEN`, but that is not the recommended deployed setup.

## Tools

- `get_lifeos_snapshot`
- `get_lifeos_context`
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

All tools are read-only and return compact, limited, sanitized JSON.

`get_lifeos_context` and `lifeos://context/today` expose the shared LifeOS Context Compiler snapshot. It is the preferred context source for Morning Brief-style clients because it includes today, next few days, health/sleep status, latest workout hints, project staleness/carryover, failed actions, WhatsApp outbox issues, active pending Brain actions, and ranked open loops.

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

Future v1.5 may add a safe `preview_brain_route` dry-run tool. Future v2 may add carefully confirmed write tools.
