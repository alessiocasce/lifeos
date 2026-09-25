# Companion vNext Slice 2 Progress

## Status

Implementation and local validation complete. Production migration, Vercel deployment, connector re-link, and physical ChatGPT write QA remain manual. The execution brief is `docs/CODEX_COMPANION_VNEXT_SECOND_SLICE.md`.

## Architecture

Keep MCP reads on `lifeos.read`. A separately configured static write token or an OAuth token explicitly granted `lifeos.write` will authorize one narrow `sync_context` tool. The domain service will validate every semantic update and project reference before the first belief transition, then persist request audit and per-item idempotent transitions. The existing belief RPC remains the only current-state mutation path.

## Completed

- Fast-forwarded clean `main` to the latest origin, which supplied the Slice 2 execution brief.
- Scoped OAuth metadata now advertises `lifeos.read` and `lifeos.write`.
- Existing static read tokens remain read-only. A distinct `LIFEOS_MCP_WRITE_TOKEN` grants write scope to custom clients.
- OAuth write access requires separately configured link and signing secrets; neither may fall back to the existing static read token.
- OAuth token responses return the requested normalized scopes; authorization UI distinguishes write access.
- MCP requests carry validated scopes into dispatch. Read tool/resource calls require `lifeos.read`; only `sync_context` requires `lifeos.write`.
- A provider-independent semantic service validates the whole envelope and grounds existing projects before the first write.
- Routine, allowlisted preference, and grounded project-context changes use the atomic belief RPC with stable per-item idempotency keys.
- Durable request audit stores a digest, source, bounded summary, status, and per-item results; exact replay and payload conflict are distinguished.
- Current preferences and project semantic context are available in the shared Context Compiler.
- `sync_context` advertises a narrow semantic JSON schema and accurate mutating OAuth tool annotations. No other MCP tool gained write behavior.
- The full request rejects duplicate update IDs and multiple updates to the same current belief before any mutation.
- OAuth authorize/PKCE/token tests cover explicit write consent, read-only grant preservation, unsupported scopes, misconfigured shared secrets, and expiry.
- PGlite journeys cover routine deactivation/reactivation, preference supersession, project grounding, partial retry, readback, all-or-nothing validation, and operational side-effect isolation.

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
- `PROJECT_CONTEXT.md`
- `docs/MCP.md`
- `docs/LIFEOS_COMPANION_VNEXT.md`
- `docs/BRAIN_ARCHITECTURE.md`
- `docs/QA_DEPLOYMENT.md`
- this progress file

## Migrations

Added `20260925120000_companion_external_sync.sql`. Live read-only preflight found the Slice 1 table/RPC present, but SQL EXECUTE on the RPC remained granted to `anon`/`authenticated` through inherited/default grants. The new migration revokes those privileges, retains authenticated SELECT under RLS, adds `external_sync` provenance, and creates the audit table. No production mutation was performed.

## Tests

- Passing: `npm run test:mcp`, `test:mcp-write`, `test:schema`, `test:companion`, `test:brain`, `test:reliability`, `test:bridge`, `test:workout`, `npm test`, `check:functions` (7), `build`, backend `node --check`, and `git diff --check`.
- The first umbrella `npm test` hit a transient Vite SSR module-fetch timeout in the unchanged Workout render harness. An isolated `test:workout` and a complete second `npm test` both passed.
- No live MCP write or production migration test was run.

## Work In Progress / Remaining

- Apply the new migration in the intended Supabase environment after verifying the Slice 1 prerequisite; do not run fresh `schema.sql` over production.
- Deploy Vercel with distinct OAuth/write secrets, re-link the ChatGPT connector for `lifeos.write`, then run the manual authorized/read-only denial, replay/conflict, readback, and no-side-effect QA in `docs/QA_DEPLOYMENT.md`.
- No production mutation has been performed by this session.

## Risks / Decisions

- An existing read credential must never gain write authority through OAuth secret fallback or token scope inference.
- Validation/grounding must finish for all updates before any belief or audit mutation.
- Runtime failures can leave partial results; each belief transition needs a stable per-item key and the audit must record replay/conflict honestly.
- The semantic tool must never call Brain actions, project CRUD, Health writes, outbox, or WhatsApp.
- OAuth authorization codes are stateless during their five-minute TTL; a code may be exchanged more than once until expiry. This is inherited behavior and should be considered for a later OAuth hardening slice.
- Request audit and per-item transitions are separate transactions. Stable per-item keys and a partial-retry lease recover normal failures, but a complete atomic batch is not promised.
- Live Supabase security advisors reported pre-existing RLS-without-policy notices on service-only WhatsApp tables, mutable search paths on older functions, and disabled leaked-password protection. The new migration is not present in production yet, so advisors could not assess it there.

## Last Good Commit

`d1575e8` - `Add audited semantic context sync service` (pushed to `origin/main`). The MCP/tool/docs milestone is tested and ready for a final commit.

## Recommended Next Step

Commit the final MCP/tool/docs milestone, then verify the clean tree. The production operator must apply the migration before backend deploy, configure independent write credentials, re-link the connector, and perform the documented manual write/readback QA. Do not claim physical connector validation from local tests.
