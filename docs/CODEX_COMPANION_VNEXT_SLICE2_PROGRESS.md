# Companion vNext Slice 2 Progress

## Status

In progress. The execution brief is `docs/CODEX_COMPANION_VNEXT_SECOND_SLICE.md`.

## Architecture

Keep MCP reads on `lifeos.read`. A separately configured static write token or an OAuth token explicitly granted `lifeos.write` will authorize one narrow `sync_context` tool. The domain service will validate every semantic update and project reference before the first belief transition, then persist request audit and per-item idempotent transitions. The existing belief RPC remains the only current-state mutation path.

## Completed

- Fast-forwarded clean `main` to the latest origin, which supplied the Slice 2 execution brief.
- Scoped OAuth metadata now advertises `lifeos.read` and `lifeos.write`.
- Existing static read tokens remain read-only. A distinct `LIFEOS_MCP_WRITE_TOKEN` grants write scope to custom clients.
- OAuth write access requires separately configured link and signing secrets; neither may fall back to the existing static read token.
- OAuth token responses return the requested normalized scopes; authorization UI distinguishes write access.
- MCP requests carry validated scopes into dispatch, and read tool/resource calls require `lifeos.read`.
- A provider-independent semantic service validates the whole envelope and grounds existing projects before the first write.
- Routine, allowlisted preference, and grounded project-context changes use the atomic belief RPC with stable per-item idempotency keys.
- Durable request audit stores a digest, source, bounded summary, status, and per-item results; exact replay and payload conflict are distinguished.
- Current preferences and project semantic context are available in the shared Context Compiler.

## Files Changed

- `api/_utils/mcpOAuth.js`
- `api/mcp.js`
- `api/_utils/brainExternalSync.js`
- `api/_utils/brainBeliefs.js`
- `api/_utils/lifeosContextCompiler.js`
- `supabase/schema.sql`
- `supabase/migrations/20260925120000_companion_external_sync.sql`
- `tests/brain/reliabilityDatabase.js`
- `scripts/test-schema-contracts.js`
- `scripts/test-mcp-write.js`
- `package.json`
- `scripts/test-mcp.js`
- this progress file

## Migrations

Added `20260925120000_companion_external_sync.sql`. Live read-only preflight found the Slice 1 table/RPC present, but SQL EXECUTE on the RPC remained granted to `anon`/`authenticated` through inherited/default grants. The new migration revokes those privileges, retains authenticated SELECT under RLS, adds `external_sync` provenance, and creates the audit table. No production mutation was performed.

## Tests

- Passing: `npm run test:mcp` after the auth foundation changes.
- Passing: `npm run test:mcp-write`, `npm run test:schema`, `npm run test:companion`, and `npm run test:reliability` after the domain/schema changes.
- Failing: none known.
- Full `npm test`, schema, function count, build, and diff checks remain for the completed slice.

## Work In Progress / Remaining

- Wire `sync_context` into MCP with per-tool write authorization and accurate metadata.
- Add schema-backed journeys A-J and OAuth flow coverage, then run all gates.
- Document deployment order and connector re-linking. No production mutation has been performed.

## Risks / Decisions

- An existing read credential must never gain write authority through OAuth secret fallback or token scope inference.
- Validation/grounding must finish for all updates before any belief or audit mutation.
- Runtime failures can leave partial results; each belief transition needs a stable per-item key and the audit must record replay/conflict honestly.
- The semantic tool must never call Brain actions, project CRUD, Health writes, outbox, or WhatsApp.

## Last Good Commit

`6285d33` - `Add explicit MCP write authorization scopes`. The domain/audit milestone is tested and ready for its own commit.

## Recommended Next Step

Commit the tested semantic domain/audit milestone. Then wire the MCP tool and expand HTTP/OAuth, partial-failure, and no-side-effect journeys before the full validation matrix.
