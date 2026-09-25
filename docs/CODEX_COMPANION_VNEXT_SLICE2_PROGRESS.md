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

## Files Changed

- `api/_utils/mcpOAuth.js`
- `api/mcp.js`
- `scripts/test-mcp.js`
- this progress file

## Migrations

None yet. The Slice 1 `brain_beliefs` migration remains a prerequisite. Slice 2 audit schema is still to be added.

## Tests

- Passing: `npm run test:mcp` after the auth foundation changes.
- Failing: none known.
- Full `npm test`, schema, function count, build, and diff checks remain for the completed slice.

## Work In Progress / Remaining

- Build the strict semantic envelope/update validator and project grounding.
- Add durable external-sync audit and request digest/conflict handling.
- Expose bounded preferences and project context through the Context Compiler.
- Wire `sync_context` into MCP with per-tool write authorization and accurate metadata.
- Add schema-backed journeys A-J and OAuth flow coverage, then run all gates.
- Document deployment order and connector re-linking. No production mutation has been performed.

## Risks / Decisions

- An existing read credential must never gain write authority through OAuth secret fallback or token scope inference.
- Validation/grounding must finish for all updates before any belief or audit mutation.
- Runtime failures can leave partial results; each belief transition needs a stable per-item key and the audit must record replay/conflict honestly.
- The semantic tool must never call Brain actions, project CRUD, Health writes, outbox, or WhatsApp.

## Last Good Commit

`25d962d` - current baseline before Slice 2 work. The auth foundation is tested and ready for a checkpoint commit.

## Recommended Next Step

Commit the tested auth foundation. Then implement and test a provider-independent semantic sync service with whole-request validation, grounded project identity, and bounded values before adding the MCP tool.
