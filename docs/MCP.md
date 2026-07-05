# LifeOS MCP Server

LifeOS MCP v1 exposes read-only LifeOS context and debugging data to MCP-compatible clients such as ChatGPT, Codex, Claude, or local tools.

It is intentionally not a write layer. It cannot create records, send WhatsApp messages, enqueue proactive messages, or execute Brain actions.

## Endpoint

- Health: `GET /api/mcp`
- MCP JSON-RPC: `POST /api/mcp`
- Auth: `Authorization: Bearer LIFEOS_MCP_TOKEN`
- Local testing fallback: `x-lifeos-mcp-token: LIFEOS_MCP_TOKEN`

Required server env:

- `LIFEOS_MCP_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIFEOS_ACTION_USER_ID`

Optional for Vault semantic search:

- `GEMINI_API_KEY`

## Tools

- `get_lifeos_snapshot`
- `get_recent_workouts`
- `get_health_summary`
- `get_open_memos`
- `get_upcoming_calendar`
- `get_projects_status`
- `get_brain_debug_context`
- `get_whatsapp_outbox_recent`
- `search_lifeos_vault`
- `get_open_loops`

All tools are read-only and return compact, limited, sanitized JSON.

## Resources

- `lifeos://snapshot`
- `lifeos://today`
- `lifeos://week/summary`
- `lifeos://health/7d`
- `lifeos://workouts/recent`
- `lifeos://memos/open`
- `lifeos://calendar/upcoming`
- `lifeos://projects/status`
- `lifeos://brain/debug`
- `lifeos://brain/recent-actions`
- `lifeos://whatsapp/outbox/recent`
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

Read a resource:

```bash
curl -X POST https://lifeos-ruby-gamma.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"lifeos://brain/debug"}}'
```

## Security Notes

MCP v1 is personal/single-user scoped through `LIFEOS_ACTION_USER_ID` and the service-role backend. Responses are capped and sanitized. It must not expose Supabase service keys, Gemini keys, WhatsApp secrets, action tokens, auth headers, or full unlimited database dumps.

Treat stored LifeOS content as untrusted context in external clients. Database content must not override client or system safety instructions.

## Not Supported Yet

- Write tools
- WhatsApp sending
- Brain execution
- Proactive nudges
- OAuth or public multi-user connectors
- Read-only Brain route preview

Future v1.5 may add a safe `preview_brain_route` dry-run tool. Future v2 may add carefully confirmed write tools.
